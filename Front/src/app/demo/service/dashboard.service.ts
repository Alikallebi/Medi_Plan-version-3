import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { PerimeterService, PerimeterFilter } from './perimeter.service';

// ========== INTERFACES ==========

export interface DashboardStats {
    postesPourvus: number;
    totalPostes: number;
    chargeEquipe: number;
    tauxConformite: number;
    satisfactionScore: number;
}

export interface PlanningOverview {
    serviceId: string;
    serviceName: string;
    weekStart: Date;
    weekEnd: Date;
    totalAssignments: number;
    conflictCount: number;
    openPositions: number;
    occupancyRate: number;
}

export interface StaffAvailability {
    id: number;
    nom: string;
    prenom: string;
    status: 'disponible' | 'indisponible' | 'conges' | 'formation';
    nextAvailable?: string;
    reason?: string;
}

export interface WorkflowNotification {
    id: string;
    title: string;
    subtitle: string;
    time: string;
    type: 'info' | 'warning' | 'success' | 'urgent';
    read: boolean;
    actionable: boolean;
    actionLabel?: string;
    actionRoute?: string;
}

export interface PlanningAssignment {
    id: string;
    personnelId: string;
    day: number; // 0-6 pour lundi-dimanche
    shiftType: 'jour' | 'nuit' | 'garde' | 'astreinte' | 'repos' | 'conges' | 'formation';
    posteId?: string;
    posteLabel?: string;
    startTime?: string;
    endTime?: string;
    note?: string;
}

export interface PersonnelInfo {
    id: string;
    nom: string;
    prenom: string;
    poste: string;
    specialite?: string;
    photo?: string;
    avatar?: string;
    photoUrl?: string;
    email?: string;
}

export interface PlanningDataResponse {
    id: string;
    serviceId: string;
    serviceName: string;
    weekStart: string;
    weekEnd: string;
    workflowStatus?: string;
    workflowId?: number;
    weekWorkflowId?: number;
    assignments: PlanningAssignment[];
    personnel: PersonnelInfo[];
    rules?: any[];
    conflicts?: any[];
    history?: any[];
}

export interface DashboardData {
    stats: DashboardStats;
    planningOverview: PlanningOverview | null;
    staffAvailabilities: StaffAvailability[];
    notifications: WorkflowNotification[];
    quickStats: {
        pendingValidations: number;
        conflictCount: number;
        openPositions: number;
    };
}

export interface StructureStatistiques {
    totalPoles: number;
    totalServices: number;
    totalEquipes: number;
    totalUtilisateurs: number;
    servicesActifs: number;
    servicesInactifs: number;
    utilisateursActifs: number;
    utilisateursInactifs: number;
}

// ========== SERVICE ==========

@Injectable({
    providedIn: 'root'
})
export class DashboardService {
    private readonly apiUrl = environment.apiBaseUrl;

    constructor(
        private readonly http: HttpClient,
        private readonly perimeterService: PerimeterService
    ) {}

    /**
     * Charge toutes les données du dashboard avec filtrage par périmètre
     * @param filter Filtre de périmètre calculé selon le contexte utilisateur
     * @param serviceId ID de service optionnel pour override manuel
     */
    getDashboardDataWithPerimeter(filter: PerimeterFilter, serviceId?: string): Observable<DashboardData> {
        console.log('🔵 DashboardService.getDashboardDataWithPerimeter() - Filtre:', filter);
        
        const statsRequest = this.getStructureStatistics();
        const overviewRequest = this.getPlanningOverviewWithPerimeter(filter, serviceId);
        const staffRequest = this.getStaffWithPerimeter(filter, serviceId);

        return forkJoin({
            structureStats: statsRequest,
            planningOverview: overviewRequest,
            staff: staffRequest
        }).pipe(
            map(result => {
                console.log('✅ Données reçues (avec périmètre):', result);
                return this.transformToDashboardData(result, serviceId);
            }),
            catchError(error => {
                console.error('❌ Erreur dans getDashboardDataWithPerimeter:', error);
                return of(this.getEmptyDashboardData());
            })
        );
    }

    /**
     * Charge toutes les données du dashboard en une seule fois
     * @deprecated Utiliser getDashboardDataWithPerimeter() pour le filtrage par rôle
     */
    getDashboardData(serviceId?: string): Observable<DashboardData> {
        console.log('🔵 DashboardService.getDashboardData() appelé avec serviceId:', serviceId);
        console.log('🔵 API Base URL:', this.apiUrl);
        
        const statsRequest = this.getStructureStatistics();
        const overviewRequest = serviceId 
            ? this.getPlanningOverview(serviceId)
            : of(null);
        const staffRequest = serviceId 
            ? this.getStaffByService(Number(serviceId))
            : this.getAllStaff();

        return forkJoin({
            structureStats: statsRequest,
            planningOverview: overviewRequest,
            staff: staffRequest
        }).pipe(
            map(result => {
                console.log('✅ Données reçues du backend:', result);
                return this.transformToDashboardData(result, serviceId);
            }),
            catchError(error => {
                console.error('❌ Erreur dans getDashboardData:', error);
                return of(this.getEmptyDashboardData());
            })
        );
    }

    /**
     * Récupère les statistiques de structure depuis l'API
     */
    getStructureStatistics(): Observable<StructureStatistiques> {
        console.log('🔵 Appel API: GET /api/structure/statistiques');
        return this.http.get<StructureStatistiques>(`${this.apiUrl}/api/structure/statistiques`)
            .pipe(
                map(data => {
                    console.log('✅ Statistiques reçues:', data);
                    return data;
                }),
                catchError(error => {
                    console.error('❌ Erreur chargement statistiques:', error);
                    return of({
                        totalPoles: 0,
                        totalServices: 0,
                        totalEquipes: 0,
                        totalUtilisateurs: 0,
                        servicesActifs: 0,
                        servicesInactifs: 0,
                        utilisateursActifs: 0,
                        utilisateursInactifs: 0
                    });
                })
            );
    }

    /**
     * Récupère l'aperçu d'un planning
     */
    getPlanningOverview(serviceId: string, weekStart?: Date): Observable<PlanningOverview | null> {
        let params = new HttpParams();
        
        if (serviceId && serviceId !== 'all') {
            params = params.set('serviceId', serviceId);
        }
        
        if (weekStart) {
            params = params.set('weekStart', this.toIsoDate(weekStart));
        }

        params = params.set('onlyValidated', 'true');

        return this.http.get<any[]>(`${this.apiUrl}/api/planning/overview`, { params })
            .pipe(
                map(rows => this.buildTemporalOverview(rows, serviceId)),
                catchError(error => {
                    console.error('Erreur chargement planning overview:', error);
                    return of(null);
                })
            );
    }

    /**
     * Récupère l'aperçu d'un planning avec filtrage par périmètre
     * @param filter Filtre de périmètre
     * @param serviceIdOverride ID de service pour override manuel (optionnel)
     */
    getPlanningOverviewWithPerimeter(
        filter: PerimeterFilter, 
        serviceIdOverride?: string, 
        weekStart?: Date
    ): Observable<PlanningOverview | null> {
        let params = this.perimeterService.buildHttpParams(filter);
        
        // Si un serviceId manuel est fourni, il override le filtre
        if (serviceIdOverride && serviceIdOverride !== 'all') {
            params = params.set('serviceId', serviceIdOverride);
        }
        
        if (weekStart) {
            params = params.set('weekStart', this.toIsoDate(weekStart));
        }

        params = params.set('onlyValidated', 'true');

        console.log('🔵 getPlanningOverviewWithPerimeter - params:', params.toString());

        return this.http.get<any[]>(`${this.apiUrl}/api/planning/overview`, { params })
            .pipe(
                map(rows => this.buildTemporalOverview(rows, serviceIdOverride)),
                catchError(error => {
                    console.error('Erreur chargement planning overview (avec périmètre):', error);
                    return of(null);
                })
            );
    }

    /**
     * Récupère les lignes brutes de planning_overview pour pouvoir sélectionner
     * une semaine cible (ex: dernière semaine validée) côté composant.
     */
    getPlanningOverviewRowsWithPerimeter(
        filter: PerimeterFilter,
        serviceIdOverride?: string,
        weekStart?: Date
    ): Observable<any[]> {
        let params = this.perimeterService.buildHttpParams(filter);

        if (serviceIdOverride && serviceIdOverride !== 'all') {
            params = params.set('serviceId', serviceIdOverride);
        }

        if (weekStart) {
            params = params.set('weekStart', this.toIsoDate(weekStart));
        }

        params = params.set('onlyValidated', 'true');

        return this.http.get<any[]>(`${this.apiUrl}/api/planning/overview`, { params })
            .pipe(
                map(rows => Array.isArray(rows) ? rows : []),
                catchError(error => {
                    console.error('Erreur chargement planning overview rows (avec périmètre):', error);
                    return of([]);
                })
            );
    }

    /**
     * Récupère tout le personnel
     */
    getAllStaff(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/api/staff`)
            .pipe(
                catchError(error => {
                    console.error('Erreur chargement staff:', error);
                    return of([]);
                })
            );
    }

    /**
     * Récupère le personnel d'un service spécifique
     */
    getStaffByService(serviceId: number): Observable<any[]> {
        const params = new HttpParams().set('serviceId', serviceId.toString());
        return this.http.get<any[]>(`${this.apiUrl}/api/staff`, { params })
            .pipe(
                catchError(error => {
                    console.error('Erreur chargement staff par service:', error);
                    return of([]);
                })
            );
    }

    /**
     * Récupère le personnel avec filtrage par périmètre
     * @param filter Filtre de périmètre
     * @param serviceIdOverride ID de service pour override manuel (optionnel)
     */
    getStaffWithPerimeter(filter: PerimeterFilter, serviceIdOverride?: string): Observable<any[]> {
        let params = this.perimeterService.buildHttpParams(filter);
        
        // Si un serviceId manuel est fourni, il override le filtre
        if (serviceIdOverride && serviceIdOverride !== 'all') {
            params = params.set('serviceId', serviceIdOverride);
        }

        console.log('🔵 getStaffWithPerimeter - params:', params.toString());

        return this.http.get<any[]>(`${this.apiUrl}/api/staff`, { params })
            .pipe(
                map(response => {
                    // L'API retourne { value: [...] } si c'est OData, sinon un tableau direct
                    const staff = Array.isArray(response) ? response : (response as any).value || [];
                    console.log(`✅ Personnel reçu (périmètre): ${staff.length} personnes`);
                    return staff;
                }),
                catchError(error => {
                    console.error('Erreur chargement staff avec périmètre:', error);
                    return of([]);
                })
            );
    }

    /**
     * Récupère les données complètes du planning (avec affectations détaillées)
     */
    getPlanningData(serviceId: string, serviceName: string, weekStart: Date, weekEnd?: Date): Observable<PlanningDataResponse | null> {
        console.log('🔵 Appel API: GET /api/planning', { serviceId, weekStart });
        
        let params = new HttpParams()
            .set('serviceId', serviceId)
            .set('serviceName', serviceName)
            .set('weekStart', this.toIsoDate(weekStart));
        
        if (weekEnd) {
            params = params.set('weekEnd', this.toIsoDate(weekEnd));
        }

        return this.http.get<PlanningDataResponse>(`${this.apiUrl}/api/planning`, { params })
            .pipe(
                map(data => {
                    console.log('✅ Planning détaillé reçu:', data);
                    return data;
                }),
                catchError(error => {
                    console.error('❌ Erreur chargement planning détaillé:', error);
                    return of(null);
                })
            );
    }

    /**
     * Récupère les données de planning avec filtrage par périmètre
     * @param filter Filtre de périmètre
     * @param serviceId ID du service (obligatoire pour l'API planning)
     * @param serviceName Nom du service
     * @param weekStart Date de début de semaine
     * @param weekEnd Date de fin de semaine (optionnel)
     */
    getPlanningDataWithPerimeter(
        filter: PerimeterFilter,
        serviceId: string,
        serviceName: string,
        weekStart: Date,
        weekEnd?: Date
    ): Observable<PlanningDataResponse | null> {
        console.log('🔵 getPlanningDataWithPerimeter', { filter, serviceId, weekStart });

        // Construire les paramètres de base avec le périmètre
        let params = this.perimeterService.buildHttpParams(filter);

        // L'API planning nécessite toujours serviceId et serviceName
        params = params.set('serviceId', serviceId);
        params = params.set('serviceName', serviceName);
        params = params.set('weekStart', this.toIsoDate(weekStart));

        if (weekEnd) {
            params = params.set('weekEnd', this.toIsoDate(weekEnd));
        }

        console.log('🔵 getPlanningDataWithPerimeter - params:', params.toString());

        return this.http.get<PlanningDataResponse>(`${this.apiUrl}/api/planning`, { params })
            .pipe(
                map(data => {
                    console.log('✅ Planning détaillé reçu (périmètre):', data);
                    // Le filtrage est déjà fait côté backend via les paramètres de requête
                    return data;
                }),
                catchError(error => {
                    console.error('❌ Erreur chargement planning avec périmètre:', error);
                    return of(null);
                })
            );
    }

    /**
     * Récupère les détails complets d'un planning dans le workflow (étapes, historique)
     */
    getWorkflowPlanningDetails(planningId: number): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/api/workflow/plannings/${planningId}`)
            .pipe(
                catchError(error => {
                    console.error('❌ Erreur chargement détails workflow:', error);
                    return of(null);
                })
            );
    }

    /**
     * Transforme les données brutes en format Dashboard
     */
    private transformToDashboardData(
        result: {
            structureStats: StructureStatistiques;
            planningOverview: PlanningOverview | null;
            staff: any[];
        },
        serviceId?: string
    ): DashboardData {
        const { structureStats, planningOverview, staff } = result;

        // Calcul des statistiques
        const totalStaff = staff.length;
        const isActive = (s: any) => s.actif === true || s.actif === 1 || s.statut === 'ACTIF' || s.status === 'ACTIF';
        const activeStaff = staff.filter(isActive).length;
        const availableStaff = staff.filter(s => isActive(s) && !s.enConges).length;

        // Statistiques du dashboard
        const stats: DashboardStats = {
            postesPourvus: planningOverview?.totalAssignments || 0,
            totalPostes: planningOverview?.totalAssignments 
                ? Math.round(planningOverview.totalAssignments * 1.18) 
                : structureStats.totalUtilisateurs * 7, // 7 jours par semaine
            chargeEquipe: planningOverview?.occupancyRate || 
                (totalStaff > 0 ? Math.round((activeStaff / totalStaff) * 100) : 0),
            tauxConformite: planningOverview?.conflictCount 
                ? Math.max(0, 100 - (planningOverview.conflictCount * 5))
                : 92,
            satisfactionScore: 88 // À implémenter avec une vraie source de données
        };

        // Disponibilités du personnel
        const staffAvailabilities: StaffAvailability[] = staff.slice(0, 10).map(s => ({
            id: s.id,
            nom: s.nom || 'Inconnu',
            prenom: s.prenom || '',
            status: this.mapStaffStatus(s),
            nextAvailable: this.calculateNextAvailable(s),
            reason: s.enConges ? 'Congés' : undefined
        }));

        // Notifications (à enrichir avec de vraies données workflow)
        const notifications: WorkflowNotification[] = this.generateNotifications(planningOverview);

        // Stats rapides
        const quickStats = {
            pendingValidations: 0, // À lier avec l'API workflow
            conflictCount: planningOverview?.conflictCount || 0,
            openPositions: planningOverview?.openPositions || 0
        };

        return {
            stats,
            planningOverview,
            staffAvailabilities,
            notifications,
            quickStats
        };
    }

    private buildTemporalOverview(rows: any[] | null | undefined, fallbackServiceId?: string): PlanningOverview | null {
        if (!rows || rows.length === 0) {
            return null;
        }

        const weekRowsByStart = new Map<string, any[]>();
        for (const row of rows) {
            const key = String(row?.weekStart ?? '');
            if (!weekRowsByStart.has(key)) {
                weekRowsByStart.set(key, []);
            }
            weekRowsByStart.get(key)!.push(row);
        }

        const orderedWeeks = Array.from(weekRowsByStart.entries())
            .map(([weekStartKey, weekRows]) => ({
                weekStartKey,
                weekRows,
                hasAssignments: weekRows.some(r => !!r?.assignmentId),
                weekStartDate: new Date(weekRows[0]?.weekStart ?? weekStartKey)
            }))
            .sort((a, b) => b.weekStartDate.getTime() - a.weekStartDate.getTime());

        const selectedWeek = orderedWeeks.find(w => w.hasAssignments) ?? orderedWeeks[0];
        const scopedRows = selectedWeek?.weekRows ?? rows;
        const firstRow = scopedRows[0];
        const uniqueAssignments = new Set(scopedRows.map(r => r.assignmentId).filter((id: any) => !!id));

        return {
            serviceId: firstRow?.serviceId || fallbackServiceId || '',
            serviceName: firstRow?.serviceName || 'Service',
            weekStart: firstRow?.weekStart ? new Date(firstRow.weekStart) : new Date(),
            weekEnd: firstRow?.weekEnd ? new Date(firstRow.weekEnd) : new Date(),
            totalAssignments: uniqueAssignments.size,
            conflictCount: 0,
            openPositions: 0,
            occupancyRate: uniqueAssignments.size > 0
                ? Math.round((uniqueAssignments.size / Math.max(scopedRows.length, 1)) * 100)
                : 0
        };
    }

    private toIsoDate(date: Date): string {
        // Utiliser les composantes locales pour éviter le décalage UTC
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Mappe le statut du personnel
     */
    private mapStaffStatus(staff: any): 'disponible' | 'indisponible' | 'conges' | 'formation' {
        if (staff.enConges) return 'conges';
        if (staff.enFormation) return 'formation';
        if (staff.actif === true || staff.actif === 1 || staff.statut === 'ACTIF' || staff.status === 'ACTIF') return 'disponible';
        return 'indisponible';
    }

    /**
     * Calcule la prochaine disponibilité
     */
    private calculateNextAvailable(staff: any): string {
        if (staff.enConges && staff.dateFinConges) {
            const date = new Date(staff.dateFinConges);
            return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        }
        if (staff.actif === true || staff.actif === 1 || staff.statut === 'ACTIF' || staff.status === 'ACTIF') {
            return 'Maintenant';
        }
        return '—';
    }

    /**
     * Génère des notifications basées sur les données
     */
    private generateNotifications(overview: PlanningOverview | null): WorkflowNotification[] {
        const notifications: WorkflowNotification[] = [];

        if (overview && overview.conflictCount > 0) {
            notifications.push({
                id: 'conflict-1',
                title: `${overview.conflictCount} conflit${overview.conflictCount > 1 ? 's' : ''} détecté${overview.conflictCount > 1 ? 's' : ''}`,
                subtitle: `Planning ${overview.serviceName}`,
                time: 'Il y a 30min',
                type: 'urgent',
                read: false,
                actionable: true,
                actionLabel: 'Résoudre',
                actionRoute: '/pages/planning'
            });
        }

        if (overview && overview.openPositions > 0) {
            notifications.push({
                id: 'open-positions-1',
                title: `${overview.openPositions} poste${overview.openPositions > 1 ? 's' : ''} à pourvoir`,
                subtitle: `${overview.serviceName}`,
                time: 'Il y a 1h',
                type: 'warning',
                read: false,
                actionable: true,
                actionLabel: 'Voir les postes',
                actionRoute: '/pages/planning'
            });
        }

        return notifications;
    }

    /**
     * Retourne des données vides en cas d'erreur
     */
    private getEmptyDashboardData(): DashboardData {
        return {
            stats: {
                postesPourvus: 0,
                totalPostes: 0,
                chargeEquipe: 0,
                tauxConformite: 0,
                satisfactionScore: 0
            },
            planningOverview: null,
            staffAvailabilities: [],
            notifications: [],
            quickStats: {
                pendingValidations: 0,
                conflictCount: 0,
                openPositions: 0
            }
        };
    }
}
