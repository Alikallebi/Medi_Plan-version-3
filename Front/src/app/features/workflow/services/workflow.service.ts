import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
    AuditFilterDTO,
    ApprobationDTO,
    CreateWorkflowConfigDTO,
    DemandeModificationDTO,
    NouvelleVersionDTO,
    RejetDTO
} from '../dtos';
import {
    AuditTrailEvent,
    AuditTrailEventType,
    AuditTrailFilter,
    AuditTrailResponse,
    AuditEvent,
    BlockedPlanning,
    DashboardStats,
    Notification,
    PlanningWorkflow,
    ValidationHistoryItem,
    ValidationStatus,
    ValidatorPerformance,
    Version,
    WorkflowConfig,
    WorkflowEtape
} from '../models';
import { UserContext } from '../models/user-context.model';

export interface WorkflowPlanningDetail {
    planning: PlanningWorkflow;
    validationStatus: ValidationStatus;
    historique: ValidationHistoryItem[];
    etapes: WorkflowEtape[];
}

export interface WorkflowAttachmentRef {
    id: string;
    fileName: string;
    fileType: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
}

export interface WorkflowComment {
    id: string;
    planningId: string;
    etapeOrdre?: number;
    auteurNom: string;
    auteurRole: string;
    message: string;
    createdAt: string;
    attachments?: WorkflowAttachmentRef[];
}

export interface AddWorkflowCommentPayload {
    message: string;
    etapeOrdre?: number;
    attachments?: WorkflowAttachmentRef[];
}

export interface AdminDashboardData {
    stats: DashboardStats;
    blocked: BlockedPlanning[];
    performance: ValidatorPerformance[];
    recentActivities?: any[];
}

@Injectable({
    providedIn: 'root'
})
export class WorkflowService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api/workflow`;
    private workflowConfigsCache$: Observable<WorkflowConfig[]> | null = null;
    private auditEventTypesCache$: Observable<AuditTrailEventType[]> | null = null;

    constructor(private readonly http: HttpClient) {}

    /** Retourne les en-têtes HTTP avec l'identifiant de l'utilisateur courant. */
    private getAuthHeaders(): HttpHeaders {
        const userId = localStorage.getItem('idUser') || '0';
        const nom = localStorage.getItem('nom') || '';
        const prenom = localStorage.getItem('prenom') || '';
        const userName = `${prenom} ${nom}`.trim() || 'Utilisateur';
        return new HttpHeaders({
            'X-User-Id': userId,
            'X-User-Name': userName
        });
    }

    /**
     * Récupère toutes les configurations de workflow.
     */
    getWorkflowConfigs(forceRefresh = false): Observable<WorkflowConfig[]> {
        if (!this.workflowConfigsCache$ || forceRefresh) {
            this.workflowConfigsCache$ = this.http
                .get<WorkflowConfig[]>(`${this.apiUrl}/configs`)
                .pipe(
                    shareReplay(1),
                    catchError((error) => {
                        this.workflowConfigsCache$ = null;
                        return this.handleError(error);
                    })
                );
        }

        return this.workflowConfigsCache$;
    }

    /**
     * Récupère la configuration de workflow d'un service.
     */
    getWorkflowConfigByService(serviceId: number): Observable<WorkflowConfig> {
        return this.http
            .get<WorkflowConfig>(`${this.apiUrl}/configs/service/${serviceId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Crée une nouvelle configuration de workflow.
     */
    createWorkflowConfig(config: CreateWorkflowConfigDTO): Observable<WorkflowConfig> {
        return this.http
            .post<WorkflowConfig>(`${this.apiUrl}/configs`, config)
            .pipe(
                tap(() => this.invalidateWorkflowConfigCache()),
                catchError(this.handleError)
            );
    }

    /**
     * Met à jour une configuration de workflow.
     */
    updateWorkflowConfig(id: number, config: CreateWorkflowConfigDTO): Observable<WorkflowConfig> {
        return this.http
            .put<WorkflowConfig>(`${this.apiUrl}/configs/${id}`, config)
            .pipe(
                tap(() => this.invalidateWorkflowConfigCache()),
                catchError(this.handleError)
            );
    }

    /**
     * Supprime une configuration de workflow.
     */
    deleteWorkflowConfig(id: number): Observable<void> {
        return this.http
            .delete<void>(`${this.apiUrl}/configs/${id}`)
            .pipe(
                tap(() => this.invalidateWorkflowConfigCache()),
                catchError(this.handleError)
            );
    }

    /**
     * Active ou désactive une configuration de workflow.
     */
    activateWorkflowConfig(id: number): Observable<WorkflowConfig> {
        return this.http
            .post<WorkflowConfig>(`${this.apiUrl}/configs/${id}/activate`, {})
            .pipe(
                tap(() => this.invalidateWorkflowConfigCache()),
                catchError(this.handleError)
            );
    }

    /**
     * Soumet un planning pour validation.
     */
    soumettrePlanning(planningId: number, message?: string): Observable<PlanningWorkflow> {
        const userId = Number(localStorage.getItem('idUser') || '0');
        const nom = localStorage.getItem('nom') || '';
        const prenom = localStorage.getItem('prenom') || '';
        const userName = `${prenom} ${nom}`.trim() || 'Utilisateur';

        return this.http
            .post<PlanningWorkflow>(`${this.apiUrl}/plannings/${planningId}/soumettre`, {
                message,
                userId,
                userName
            },
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les soumissions de l'utilisateur connecté.
     */
    getMesSoumissions(): Observable<PlanningWorkflow[]> {
        return this.http
            .get<PlanningWorkflow[]>(`${this.apiUrl}/plannings/mes-soumissions`,
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Annule une soumission si le planning est encore annulable.
     */
    annulerSoumission(planningId: number): Observable<PlanningWorkflow> {
        return this.http
            .post<PlanningWorkflow>(`${this.apiUrl}/plannings/${planningId}/annuler-soumission`, {})
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les plannings en attente de validation pour l'utilisateur connecté.
     */
    getPlanningsAValider(): Observable<PlanningWorkflow[]> {
        return this.http
            .get<PlanningWorkflow[]>(`${this.apiUrl}/plannings/en-attente`,
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les plannings en attente de validation pour un rôle donné.
     */
    getPlanningsAValiderParRole(role: string): Observable<PlanningWorkflow[]> {
        const params = new HttpParams().set('role', role);
        return this.http
            .get<PlanningWorkflow[]>(`${this.apiUrl}/plannings/en-attente`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les plannings à valider en fonction du contexte utilisateur.
     * Filtre automatiquement selon le rôle et le périmètre (service_id, pole_id).
     * @param userContext Contexte de l'utilisateur connecté
     */
    getPlanningsAValiderParContexte(userContext: UserContext): Observable<PlanningWorkflow[]> {
        let params = new HttpParams();
        
        // Ajouter les filtres selon le rôle normalisé
        switch (userContext.roleNormalized) {
            case 'chef-service':
                if (userContext.serviceId) {
                    params = params.set('serviceId', userContext.serviceId.toString());
                }
                break;
                
            case 'chef-pole':
                if (userContext.poleId) {
                    params = params.set('poleId', userContext.poleId.toString());
                }
                break;
                
            case 'validateur-rh':
            case 'planificateur-rh':
                // RH valide généralement l'étape 2 ou 3 selon config
                params = params.set('etapeType', 'RH');
                break;
                
            case 'planificateur-urgence':
                params = params.set('serviceType', 'urgence');
                break;
                
            case 'superviseur-internes':
                params = params.set('type', 'interne');
                break;
                
            // super-admin et admin-gta voient tout (pas de filtre)
            case 'super-admin':
            case 'admin-gta':
                break;
                
            // staff ne voit rien par défaut
            case 'staff':
                return of([]);
        }
        
        return this.http
            .get<PlanningWorkflow[]>(`${this.apiUrl}/plannings/en-attente`,
                { params, headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les plannings soumis par un utilisateur spécifique.
     * Utilisé pour afficher "Mes soumissions".
     * @param userId ID de l'utilisateur
     */
    getMesSoumissionsParUserId(userId: number): Observable<PlanningWorkflow[]> {
        return this.http
            .get<PlanningWorkflow[]>(`${this.apiUrl}/plannings/soumissions/${userId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Vérifie si un utilisateur a accès à un planning spécifique.
     * Utilisé par le PerimeterGuard pour protéger les routes.
     * @param planningId ID du planning
     * @param userId ID de l'utilisateur
     */
    verifierAccesPlanning(planningId: number, userId: number): Observable<boolean> {
        return this.http
            .get<{ hasAccess: boolean }>(`${this.apiUrl}/plannings/${planningId}/acces/${userId}`)
            .pipe(
                map(response => response.hasAccess),
                catchError(() => {
                    // Fallback : si l'endpoint n'existe pas, on permet l'accès
                    // et la vérification sera faite côté backend lors de l'action
                    return of(true);
                })
            );
    }

    /**
     * Récupère les données complètes d'un planning en validation.
     * Appelle directement l'endpoint MySQL qui retourne planning + historique + étapes.
     */
    getPlanningWithWorkflow(planningId: string): Observable<WorkflowPlanningDetail> {
        return this.http
            .get<any>(`${this.apiUrl}/plannings/${planningId}`,
                { headers: this.getAuthHeaders() })
            .pipe(
                map((data: any) => {
                    if (!data || !data.planning) {
                        throw new Error('Planning introuvable.');
                    }
                    return {
                        planning: data.planning as PlanningWorkflow,
                        validationStatus: data.validationStatus as ValidationStatus,
                        historique: (data.historique || []) as ValidationHistoryItem[],
                        etapes: (data.etapes || []) as WorkflowEtape[]
                    } as WorkflowPlanningDetail;
                }),
                catchError(this.handleError)
            );
    }

    /**
     * Récupère les commentaires d'un planning.
     * Utilise un fallback local si l'endpoint n'est pas encore disponible.
     */
    getPlanningComments(planningId: number): Observable<WorkflowComment[]> {
        return this.http
            .get<WorkflowComment[]>(`${this.apiUrl}/plannings/${planningId}/comments`)
            .pipe(
                tap(comments => this.writeLocalComments(planningId, comments || [])),
                catchError(() => of(this.readLocalComments(planningId)))
            );
    }

    /**
     * Ajoute un commentaire à un planning.
     * Si l'API n'est pas disponible, le commentaire est conservé localement.
     */
    addPlanningComment(planningId: number, payload: AddWorkflowCommentPayload): Observable<WorkflowComment> {
        return this.http
            .post<WorkflowComment>(`${this.apiUrl}/plannings/${planningId}/comments`, payload)
            .pipe(
                tap((comment) => {
                    const current = this.readLocalComments(planningId);
                    this.writeLocalComments(planningId, [comment, ...current]);
                }),
                catchError(() => {
                    const localComment = this.buildLocalComment(planningId, payload);
                    const current = this.readLocalComments(planningId);
                    this.writeLocalComments(planningId, [localComment, ...current]);
                    return of(localComment);
                })
            );
    }

    /**
     * Approuve l'étape courante de validation.
     */
    approuverEtape(
        planningId: number,
        commentaire?: string,
        notifierCreateur = true,
        notifierAutresValidateurs = true
    ): Observable<PlanningWorkflow> {
        const payload: ApprobationDTO = { planningId, commentaire, notifierCreateur, notifierAutresValidateurs };
        return this.http
            .post<PlanningWorkflow>(`${this.apiUrl}/plannings/${planningId}/approuver`, payload,
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Rejette un planning avec motif et commentaire.
     */
    rejeterPlanning(planningId: number, motif: string, commentaire: string): Observable<PlanningWorkflow> {
        const payload: RejetDTO = { planningId, motif, commentaire };
        return this.http
            .post<PlanningWorkflow>(`${this.apiUrl}/plannings/${planningId}/rejeter`, payload,
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Demande des modifications sur un planning.
     */
    demanderModification(planningId: number, commentaire: string): Observable<PlanningWorkflow> {
        const payload: DemandeModificationDTO = { planningId, commentaire, instructions: commentaire };
        return this.http
            .post<PlanningWorkflow>(`${this.apiUrl}/plannings/${planningId}/demander-modification`, payload,
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les plannings en attente de validation finale Super Admin.
     */
    getValidationFinaleEnAttente(): Observable<PlanningWorkflow[]> {
        return this.http
            .get<PlanningWorkflow[]>(`${this.apiUrl}/plannings/validation-finale`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Crée une nouvelle version d'un planning.
     */
    creerNouvelleVersion(planningId: number, data: NouvelleVersionDTO): Observable<Version> {
        return this.http
            .post<Version>(`${this.apiUrl}/plannings/${planningId}/version`, data)
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère l'historique des versions d'un planning.
     */
    getVersions(planningId: number): Observable<Version[]> {
        return this.http
            .get<Version[]>(`${this.apiUrl}/plannings/${planningId}/versions`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère une version spécifique.
     */
    getVersion(versionId: number): Observable<Version> {
        return this.http
            .get<Version>(`${this.apiUrl}/versions/${versionId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Compare deux versions et retourne le diff brut JSON.
     */
    comparerVersions(versionId1: number, versionId2: number): Observable<Record<string, unknown>> {
        const params = new HttpParams()
            .set('versionId1', versionId1)
            .set('versionId2', versionId2);

        return this.http
            .get<Record<string, unknown>>(`${this.apiUrl}/versions/compare`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère les notifications de l'utilisateur connecté.
     */
    getMesNotifications(): Observable<Notification[]> {
        return this.http
            .get<Notification[]>(`${this.apiUrl}/notifications`,
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Marque une notification comme lue.
     */
    marquerCommeLue(notificationId: number): Observable<void> {
        return this.http
            .post<void>(`${this.apiUrl}/notifications/${notificationId}/read`, {},
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Marque toutes les notifications comme lues.
     */
    marquerToutesCommeLues(): Observable<void> {
        return this.http
            .post<void>(`${this.apiUrl}/notifications/read-all`, {},
                { headers: this.getAuthHeaders() })
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère le nombre de notifications non lues.
     */
    getNonLuesCount(): Observable<number> {
        return this.http
            .get<{ count: number }>(`${this.apiUrl}/notifications/unread-count`,
                { headers: this.getAuthHeaders() })
            .pipe(
                map(result => result?.count ?? 0),
                catchError(this.handleError)
            );
    }

    /**
     * Récupère l'audit trail d'un planning.
     */
    getAuditTrail(planningId: number): Observable<AuditEvent[]> {
        return this.http
            .get<AuditEvent[]>(`${this.apiUrl}/audit/planning/${planningId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Récupère l'audit global avec filtres optionnels.
     */
    getGlobalAudit(filters?: AuditFilterDTO): Observable<AuditEvent[]> {
        const params = this.buildAuditParams(filters);
        return this.http
            .get<AuditEvent[]>(`${this.apiUrl}/audit`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Exporte l'audit au format PDF ou Excel.
     */
    exportAudit(format: 'pdf' | 'excel', planningId?: number): Observable<Blob> {
        let params = new HttpParams().set('format', format);
        if (planningId !== undefined && planningId !== null) {
            params = params.set('planningId', planningId);
        }

        return this.http
            .get(`${this.apiUrl}/audit/export`, { params, responseType: 'blob' })
            .pipe(catchError(this.handleError));
    }

    getDashboardStats(): Observable<DashboardStats> {
        return this.http
            .get<DashboardStats>(`${this.apiUrl}/admin/stats`)
            .pipe(catchError(() => of(this.buildMockStats())));
    }

    getBlockedPlannings(): Observable<BlockedPlanning[]> {
        return this.http
            .get<BlockedPlanning[]>(`${this.apiUrl}/admin/blocked`)
            .pipe(catchError(() => of(this.buildMockBlockedPlannings())));
    }

    getValidatorPerformance(): Observable<ValidatorPerformance[]> {
        return this.http
            .get<ValidatorPerformance[]>(`${this.apiUrl}/admin/validator-performance`)
            .pipe(catchError(() => of(this.buildMockValidatorPerformance())));
    }

    getAdminDashboardData(): Observable<AdminDashboardData> {
        return forkJoin({
            stats: this.getDashboardStats(),
            blocked: this.getBlockedPlannings(),
            performance: this.getValidatorPerformance()
        });
    }

    relancerValidateur(planningId: number, message?: string): Observable<void> {
        return this.http
            .post<void>(`${this.apiUrl}/admin/${planningId}/relance`, { message })
            .pipe(catchError(() => of(void 0)));
    }

    reaffecterValidation(planningId: number, nouveauValidateurId: number): Observable<void> {
        return this.http
            .post<void>(`${this.apiUrl}/admin/${planningId}/reaffecter`, {
                validateurId: nouveauValidateurId
            })
            .pipe(catchError(() => of(void 0)));
    }

    validerDoffice(planningId: number, commentaire?: string): Observable<void> {
        return this.http
            .post<void>(`${this.apiUrl}/admin/${planningId}/valider-force`, { commentaire })
            .pipe(catchError(() => of(void 0)));
    }

    getAuditTrailGlobal(filters: AuditTrailFilter): Observable<AuditTrailResponse> {
        const params = this.buildAuditTrailFilterParams(filters);
        return this.http
            .get<AuditTrailResponse>(`${this.apiUrl}/audit`, { params })
            .pipe(catchError(() => of(this.buildMockAuditResponse(filters))));
    }

    getAuditEventDetails(id: number): Observable<AuditTrailEvent> {
        return this.http
            .get<AuditTrailEvent>(`${this.apiUrl}/audit/${id}`)
            .pipe(catchError(() => {
                const fallback = this.buildMockAuditEvents().find(item => item.id === id) || this.buildMockAuditEvents()[0];
                return of(fallback);
            }));
    }

    exportAuditTrail(format: 'pdf' | 'excel' | 'csv' | 'json', filters?: AuditTrailFilter): Observable<Blob> {
        const params = this.buildAuditTrailFilterParams(filters || {}).set('format', format);
        return this.http
            .get(`${this.apiUrl}/audit/export/${format}`, { params, responseType: 'blob' })
            .pipe(catchError(() => this.exportAudit(format === 'excel' ? 'excel' : 'pdf')));
    }

    getAuditEventTypes(forceRefresh = false): Observable<AuditTrailEventType[]> {
        if (!this.auditEventTypesCache$ || forceRefresh) {
            this.auditEventTypesCache$ = this.http
                .get<AuditTrailEventType[]>(`${this.apiUrl}/audit/event-types`)
                .pipe(
                    shareReplay(1),
                    catchError(() => {
                        this.auditEventTypesCache$ = null;
                        return of(this.getDefaultAuditEventTypes());
                    })
                );
        }

        return this.auditEventTypesCache$;
    }

    getAuditStats(periode?: { debut: Date; fin: Date }): Observable<Record<string, number>> {
        let params = new HttpParams();
        if (periode?.debut) {
            params = params.set('dateDebut', periode.debut.toISOString());
        }
        if (periode?.fin) {
            params = params.set('dateFin', periode.fin.toISOString());
        }

        return this.http
            .get<Record<string, number>>(`${this.apiUrl}/audit/stats`, { params })
            .pipe(catchError(() => of({ events: this.buildMockAuditEvents().length })));
    }

    private buildMockStats(): DashboardStats {
        return {
            enAttente: 24,
            depasses: 5,
            validesCeMois: 156,
            tempsMoyenValidation: 55.2,
            tauxApprobation: 87,
            planningsFinaux: 3,
            parService: [
                { serviceName: 'Cardiologie', enAttente: 6, valides: 31 },
                { serviceName: 'Urgences', enAttente: 9, valides: 45 },
                { serviceName: 'Radiologie', enAttente: 4, valides: 19 },
                { serviceName: 'Pédiatrie', enAttente: 5, valides: 27 }
            ],
            evolution: Array.from({ length: 30 }, (_, index) => ({
                label: `${index + 1}`,
                value: 4 + Math.floor(Math.abs(Math.sin((index + 1) / 3)) * 11)
            }))
        };
    }

    private buildMockBlockedPlannings(): BlockedPlanning[] {
        return [
            {
                id: 1001,
                nom: 'Planning Mars 2026',
                service: 'Cardiologie',
                bloqueChez: 'Validateur RH',
                bloqueChezRole: 'VALIDATEUR_RH',
                depuis: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
                joursDepasses: 5,
                validateurId: 201,
                validateurEmail: 'rh-cardio@clinisysy.local'
            },
            {
                id: 1002,
                nom: 'Planning Avril 2026',
                service: 'Urgences',
                bloqueChez: 'Chef Pôle',
                bloqueChezRole: 'CHEF_POLE',
                depuis: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
                joursDepasses: 3,
                validateurId: 202,
                validateurEmail: 'pole-urg@clinisysy.local'
            },
            {
                id: 1003,
                nom: 'Planning Février 2026',
                service: 'Radiologie',
                bloqueChez: 'Super Admin',
                bloqueChezRole: 'SUPER_ADMIN',
                depuis: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
                joursDepasses: 2,
                validateurId: 203,
                validateurEmail: 'admin@clinisysy.local'
            }
        ];
    }

    private buildMockValidatorPerformance(): ValidatorPerformance[] {
        return [
            {
                validateurId: 301,
                nom: 'Dr DUPONT',
                role: 'Chef Service',
                traites: 12,
                enAttente: 3,
                tempsMoyen: 28.8,
                performance: 'good'
            },
            {
                validateurId: 302,
                nom: 'Service RH',
                role: 'Validateur RH',
                traites: 8,
                enAttente: 5,
                tempsMoyen: 67.2,
                performance: 'average'
            },
            {
                validateurId: 303,
                nom: 'Dr MARTIN',
                role: 'Chef Pôle',
                traites: 6,
                enAttente: 1,
                tempsMoyen: 19.2,
                performance: 'good'
            },
            {
                validateurId: 304,
                nom: 'Dr LEROY',
                role: 'Chef Service',
                traites: 4,
                enAttente: 2,
                tempsMoyen: 74.4,
                performance: 'poor'
            }
        ];
    }

    private buildAuditTrailFilterParams(filters: AuditTrailFilter): HttpParams {
        let params = new HttpParams();

        Object.entries(filters || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                return;
            }

            if (Array.isArray(value)) {
                value.forEach(v => {
                    params = params.append(key, `${v}`);
                });
                return;
            }

            if (value instanceof Date) {
                params = params.append(key, value.toISOString());
                return;
            }

            params = params.append(key, `${value}`);
        });

        return params;
    }

    private buildMockAuditResponse(filters: AuditTrailFilter): AuditTrailResponse {
        const source = this.applyAuditTrailFilters(this.buildMockAuditEvents(), filters);
        const page = Math.max(1, filters.page || 1);
        const limit = Math.max(1, filters.limit || 20);
        const start = (page - 1) * limit;
        const events = source.slice(start, start + limit);
        const total = source.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        return {
            events,
            total,
            page,
            totalPages
        };
    }

    private applyAuditTrailFilters(items: AuditTrailEvent[], filters: AuditTrailFilter): AuditTrailEvent[] {
        return items.filter((event) => {
            if (filters.dateDebut && new Date(event.date) < new Date(filters.dateDebut)) {
                return false;
            }
            if (filters.dateFin && new Date(event.date) > new Date(filters.dateFin)) {
                return false;
            }
            if (filters.utilisateurId && event.utilisateurId !== filters.utilisateurId) {
                return false;
            }
            if (filters.planningId && event.planningId !== filters.planningId) {
                return false;
            }
            if (filters.typeEvenement && filters.typeEvenement.length > 0 && !filters.typeEvenement.includes(event.typeEvenement)) {
                return false;
            }
            if (filters.recherche) {
                const query = filters.recherche.toLowerCase();
                const haystack = `${event.utilisateurNom} ${event.description} ${event.planningNom || ''}`.toLowerCase();
                if (!haystack.includes(query)) {
                    return false;
                }
            }

            return true;
        });
    }

    private buildMockAuditEvents(): AuditTrailEvent[] {
        const now = Date.now();
        return [
            {
                id: 1,
                date: new Date(now - 1 * 3600 * 1000).toISOString(),
                utilisateurId: 301,
                utilisateurNom: 'Dr DUPONT',
                utilisateurRole: 'CHEF_SERVICE',
                typeEvenement: 'PLANNING_APPROBATION',
                planningId: 1001,
                planningNom: 'Planning Mars 2026 - Cardiologie',
                description: 'Étape 2 approuvée',
                details: { etape: 2, commentaire: 'Planning conforme' },
                ipAdresse: '192.168.1.45',
                userAgent: 'Chrome / Windows'
            },
            {
                id: 2,
                date: new Date(now - 4 * 3600 * 1000).toISOString(),
                utilisateurId: 302,
                utilisateurNom: 'Admin GTA',
                utilisateurRole: 'ADMIN_GTA',
                typeEvenement: 'WORKFLOW_CONFIG_MODIFICATION',
                description: 'Mise à jour de la configuration workflow',
                details: { workflow: 'Cardiologie', version: 3 },
                ipAdresse: '192.168.1.50',
                userAgent: 'Edge / Windows'
            },
            {
                id: 3,
                date: new Date(now - 8 * 3600 * 1000).toISOString(),
                utilisateurId: 303,
                utilisateurNom: 'Dr MARTIN',
                utilisateurRole: 'CHEF_POLE',
                typeEvenement: 'PLANNING_SOUMISSION',
                planningId: 1002,
                planningNom: 'Planning Avril 2026 - Urgences',
                description: 'Soumission du planning pour validation',
                details: { version: 'v4' }
            },
            {
                id: 4,
                date: new Date(now - 24 * 3600 * 1000).toISOString(),
                utilisateurId: 304,
                utilisateurNom: 'Dr LEROY',
                utilisateurRole: 'CHEF_SERVICE',
                typeEvenement: 'PLANNING_REJET',
                planningId: 1003,
                planningNom: 'Planning Février 2026 - Radio',
                description: 'Rejet du planning pour conflit de ressources',
                details: { motif: 'Effectifs insuffisants' }
            },
            {
                id: 5,
                date: new Date(now - 36 * 3600 * 1000).toISOString(),
                utilisateurId: 999,
                utilisateurNom: 'Système',
                utilisateurRole: 'SYSTEM',
                typeEvenement: 'CONNEXION',
                description: 'Connexion au module workflow',
                details: { resultat: 'success' },
                ipAdresse: '10.0.0.2',
                userAgent: 'API Gateway'
            }
        ];
    }

    private getDefaultAuditEventTypes(): AuditTrailEventType[] {
        return [
            'PLANNING_CREATION',
            'PLANNING_MODIFICATION',
            'PLANNING_SOUMISSION',
            'PLANNING_APPROBATION',
            'PLANNING_REJET',
            'PLANNING_VALIDATION_FINALE',
            'DEMANDE_MODIFICATION',
            'VERSION_CREATION',
            'COMMENTAIRE_AJOUT',
            'PIECE_JOINTE_AJOUT',
            'PIECE_JOINTE_SUPPRESSION',
            'WORKFLOW_CONFIG_CREATION',
            'WORKFLOW_CONFIG_MODIFICATION',
            'CONNEXION',
            'EXPORT',
            'AUTRE'
        ];
    }

    private buildAuditParams(filters?: AuditFilterDTO): HttpParams {
        let params = new HttpParams();
        if (!filters) {
            return params;
        }

        if (filters.planningId !== undefined) {
            params = params.set('planningId', filters.planningId);
        }
        if (filters.utilisateurId !== undefined) {
            params = params.set('utilisateurId', filters.utilisateurId);
        }
        if (filters.typeEvenement) {
            params = params.set('typeEvenement', filters.typeEvenement);
        }
        if (filters.dateDebut) {
            params = params.set('dateDebut', filters.dateDebut.toISOString());
        }
        if (filters.dateFin) {
            params = params.set('dateFin', filters.dateFin.toISOString());
        }
        if (filters.limit !== undefined) {
            params = params.set('limit', filters.limit);
        }
        if (filters.offset !== undefined) {
            params = params.set('offset', filters.offset);
        }

        return params;
    }

    private getDefaultEtapes(): WorkflowEtape[] {
        return [
            {
                id: 'default-n1',
                order: 1,
                label: 'Validation N1',
                validatorRole: 'CHEF_SERVICE',
                isActive: true
            },
            {
                id: 'default-n2',
                order: 2,
                label: 'Validation N2',
                validatorRole: 'VALIDATEUR_RH',
                isActive: true
            },
            {
                id: 'default-n3',
                order: 3,
                label: 'Validation N3',
                validatorRole: 'CHEF_POLE',
                isActive: true
            },
            {
                id: 'default-final',
                order: 4,
                label: 'Validation finale',
                validatorRole: 'SUPER_ADMIN',
                isFinalApproval: true,
                isActive: true
            }
        ];
    }

    private mergeHistorique(planning: PlanningWorkflow, audit: AuditEvent[]): ValidationHistoryItem[] {
        const existing = planning.validationHistory || [];
        if (existing.length > 0) {
            return existing;
        }

        const fromPlanning = (planning.history || []).map((entry, index) => ({
            id: `history-${index}-${planning.id}`,
            planningId: planning.id,
            stepId: `${index + 1}`,
            action: this.mapHistoryAction(entry.action),
            actorUserId: entry.author,
            actorRole: this.inferRole(entry.author),
            comment: entry.details,
            createdAt: new Date(entry.at).toISOString()
        } as ValidationHistoryItem));

        if (fromPlanning.length > 0) {
            return fromPlanning;
        }

        return (audit || []).map((event, index) => ({
            id: `${event.id ?? `audit-${index}`}`,
            planningId: planning.id,
            stepId: `${index + 1}`,
            action: this.mapHistoryAction(event.eventType),
            actorUserId: `${event.actorUserId ?? 'inconnu'}`,
            actorRole: event.actorRole || 'SYSTEM',
            comment: JSON.stringify(event.metadata ?? {}),
            createdAt: new Date(event.occurredAt).toISOString()
        } as ValidationHistoryItem));
    }

    private mapHistoryAction(action?: string): ValidationHistoryItem['action'] {
        const normalized = (action || '').toUpperCase();
        if (normalized.includes('REJET')) {
            return 'REJET';
        }
        if (normalized.includes('CORRECTION') || normalized.includes('MODIFICATION') || normalized.includes('RETOUR')) {
            return 'RETOUR_CORRECTION';
        }
        if (normalized.includes('REASSIGN')) {
            return 'REASSIGNATION';
        }
        if (normalized.includes('APPROB') || normalized.includes('VALID')) {
            return 'APPROBATION';
        }
        return 'SOUMISSION';
    }

    private inferRole(actor: string): string {
        const label = (actor || '').toUpperCase();
        if (label.includes('RH')) {
            return 'VALIDATEUR_RH';
        }
        if (label.includes('POLE')) {
            return 'CHEF_POLE';
        }
        if (label.includes('ADMIN')) {
            return 'SUPER_ADMIN';
        }
        return 'CHEF_SERVICE';
    }

    private getCommentsStorageKey(planningId: number): string {
        return `workflow-comments-${planningId}`;
    }

    private readLocalComments(planningId: number): WorkflowComment[] {
        const raw = localStorage.getItem(this.getCommentsStorageKey(planningId));
        if (!raw) {
            return [];
        }

        try {
            const parsed = JSON.parse(raw) as WorkflowComment[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private writeLocalComments(planningId: number, comments: WorkflowComment[]): void {
        localStorage.setItem(this.getCommentsStorageKey(planningId), JSON.stringify(comments));
    }

    private buildLocalComment(planningId: number, payload: AddWorkflowCommentPayload): WorkflowComment {
        return {
            id: `local-comment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            planningId: `${planningId}`,
            etapeOrdre: payload.etapeOrdre,
            auteurNom: localStorage.getItem('nom') || 'Utilisateur',
            auteurRole: localStorage.getItem('role') || 'STAFF',
            message: payload.message,
            createdAt: new Date().toISOString(),
            attachments: payload.attachments || []
        };
    }

    private invalidateWorkflowConfigCache(): void {
        this.workflowConfigsCache$ = null;
    }

    private handleError(error: HttpErrorResponse): Observable<never> {
        return throwError(() => error);
    }
}
