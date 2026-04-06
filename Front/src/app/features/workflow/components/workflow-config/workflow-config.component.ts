import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { WorkflowService } from '../../services/workflow.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../../../demo/service/auth.service';
import { WorkflowConfig } from '../../models';
import { WorkflowRole } from '../../../../demo/models/workflow/workflow-etape.model';
import { CreateWorkflowConfigDTO } from '../../dtos';
import { Service } from '../../../../demo/api/service';

// ──────────────────────────────────────────────
// Types locaux
// ──────────────────────────────────────────────

export interface EtapeLocale {
    /** UUID temporaire (préfixé "tmp-") ou ID réel */
    _id: string;
    ordre: number;
    label: string;
    roleValidateur: WorkflowRole;
    validateurSpecifiqueId?: number;
    validateurSpecifiqueNom?: string;
    delaiMaxHeures?: number;
    isFinalApproval: boolean;
    isActive: boolean;
    /** true si l'étape a été modifiée localement */
    dirty?: boolean;
}

export interface StaffOption {
    id: number;
    nomComplet: string;
    role: string;
    serviceId?: number | null;
    photo?: string; // champ photo provenant de la table staff_users
}

type ModalMode = 'ajouter' | 'modifier';

export interface EtapeFormState {
    visible: boolean;
    mode: ModalMode;
    position: number;           // ordre cible (0 = au début)
    roleValidateur: WorkflowRole;
    validateurSpecifiqueActif: boolean;
    validateurSpecifiqueId?: number;
    delaiSpecifiqueActif: boolean;
    delaiMaxHeures?: number;
    /** Index de l'étape en cours de modification */
    editIndex?: number;
}

export const ROLES_DISPONIBLES: { value: WorkflowRole; label: string }[] = [
    { value: 'CHEF_SERVICE',           label: 'Chef de Service' },
    { value: 'CHEF_POLE',              label: 'Chef de Pôle' },
    { value: 'VALIDATEUR_RH',          label: 'Validateur RH' },
    { value: 'PLANIFICATEUR_URGENCE',  label: 'Planificateur urgence' },
    { value: 'SUPERVISEUR_INTERNES',   label: 'Superviseur internes' },
    { value: 'ADMIN_GTA',             label: 'Administrateur GTA' },
    { value: 'SUPER_ADMIN',           label: 'Super Administrateur' },
];

const ROLE_LABELS: Partial<Record<WorkflowRole, string>> = {
    CHEF_SERVICE:          'Chef de Service',
    CHEF_POLE:             'Chef de Pôle',
    VALIDATEUR_RH:         'Validateur RH',
    PLANIFICATEUR_URGENCE: 'Planificateur urgence',
    SUPERVISEUR_INTERNES:  'Superviseur internes',
    ADMIN_GTA:             'Administrateur GTA',
    SUPER_ADMIN:           'Super Administrateur',
};

@Component({
    selector: 'app-workflow-config',
    templateUrl: './workflow-config.component.html',
    styleUrls: ['./workflow-config.component.scss']
})
export class WorkflowConfigComponent implements OnInit, OnDestroy {
    // ── données globales ──────────────────────────────────────────
    services: Service[] = [];
    selectedServiceId: number | null = null;

    isLoadingServices = false;
    isLoadingConfig   = false;
    isSaving          = false;

    hasError      = false;
    errorMessage  = '';

    // ── données de la config courante ─────────────────────────────
    existingConfigId: number | null = null;
    etapes: EtapeLocale[] = [];

    // paramètres workflow
    workflowActif              = true;
    delaiParDefautHeures       = 48;
    revalidationComplete       = true;
    revalidationPartielle      = false;

    isDirty = false;      // modifications non sauvegardées

    // ── modal ajout / modification ────────────────────────────────
    etapeForm: EtapeFormState = this.resetEtapeForm();

    // ── modal suppression ─────────────────────────────────────────
    suppressionVisible  = false;
    suppressionIndex    = -1;
    suppressionLabel    = '';

    // ── personnel disponible pour validateur spécifique ───────────
    staffOptions: StaffOption[] = [];
    isLoadingStaff = false;

    // ── référence aux constantes pour le template ─────────────────
    readonly ROLES = ROLES_DISPONIBLES;
    readonly ROLE_LABELS = ROLE_LABELS;

    // ── liste des configs enregistrées en base ─────────────────────
    allConfigs: WorkflowConfig[] = [];
    loadingAllConfigs = false;

    private destroy$ = new Subject<void>();

    constructor(
        private readonly workflowService: WorkflowService,
        private readonly notification: NotificationService,
        private readonly authService: AuthService,
        private readonly router: Router,
        private readonly http: HttpClient
    ) {}

    // ─────────────────────────────────────────────────────────────
    // Cycle de vie
    // ─────────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.loadServices();
        this.loadAllConfigs();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ─────────────────────────────────────────────────────────────
    // Chargement des services
    // ─────────────────────────────────────────────────────────────
    loadServices(): void {
        this.isLoadingServices = true;
        this.http.get<Service[]>(`${environment.apiBaseUrl}/api/services`)
            .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingServices = false))
            .subscribe({
                next: (data) => {
                    this.services = data || [];
                },
                error: () => {
                    this.hasError = true;
                    this.errorMessage = 'Impossible de charger la liste des services.';
                }
            });
    }

    // ─────────────────────────────────────────────────────────────
    // Chargement de tous les workflows enregistrés
    // ─────────────────────────────────────────────────────────────
    loadAllConfigs(): void {
        this.loadingAllConfigs = true;
        this.workflowService.getWorkflowConfigs(true)
            .pipe(takeUntil(this.destroy$), finalize(() => this.loadingAllConfigs = false))
            .subscribe({
                next: (configs) => { this.allConfigs = (configs || []).map(c => ({ ...c, steps: c.steps ?? [] })); },
                error: () => { this.allConfigs = []; }
            });
    }

    selectConfig(config: WorkflowConfig): void {
        if (this.isDirty) {
            const ok = window.confirm('Des modifications non sauvegardées seront perdues. Continuer ?');
            if (!ok) { return; }
        }
        this.resetConfigState();
        this.loadStaff();
        this.selectedServiceId = Number(config.serviceId);
        this.applyConfig(config);
    }

    getServiceNameById(serviceId: string): string {
        if (!serviceId) { return 'Service inconnu'; }
        const svc = this.services.find(s => s.id === Number(serviceId));
        return svc?.nom || `Service ${serviceId}`;
    }

    deleteConfig(config: WorkflowConfig, event: MouseEvent): void {
        event.stopPropagation();
        const nom = this.getServiceNameById(config.serviceId);
        const ok = window.confirm(
            `Supprimer le workflow du service « ${nom} » (v${config.version}) ?\nCette action est irréversible.`
        );
        if (!ok) { return; }

        this.workflowService.deleteWorkflowConfig(Number(config.id))
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.notification.success('Workflow supprimé avec succès.');
                    // Si la config supprimée est celle en cours, réinitialiser
                    if (Number(config.serviceId) === this.selectedServiceId) {
                        this.resetConfigState();
                        this.selectedServiceId = null;
                    }
                    this.loadAllConfigs();
                },
                error: () => {
                    this.notification.error('Impossible de supprimer ce workflow.');
                }
            });
    }

    /**
     * Active ou désactive un workflow.
     * Utilise updateWorkflowConfig avec un cast any car le DTO n'accepte pas isActive.
     */
    toggleActivate(config: WorkflowConfig, event: MouseEvent): void {
        event.stopPropagation();
        const id = Number(config.id);

        if (config.isActive) {
            // Désactiver
            this.workflowService.updateWorkflowConfig(id, { isActive: false } as any)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.notification.success('Workflow désactivé.');
                        this.loadAllConfigs();
                    },
                    error: () => this.notification.error('Impossible de désactiver le workflow.')
                });
        } else {
            // Activer
            this.workflowService.activateWorkflowConfig(id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.notification.success('Workflow activé.');
                        this.loadAllConfigs();
                    },
                    error: () => this.notification.error('Impossible d\'activer le workflow.')
                });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Chargement config par service
    // ─────────────────────────────────────────────────────────────

    onServiceChange(): void {
        if (this.isDirty) {
            const confirm = window.confirm(
                'Des modifications non sauvegardées seront perdues. Continuer ?'
            );
            if (!confirm) {
                return;
            }
        }
        this.resetConfigState();
        if (this.selectedServiceId) {
            this.loadConfig(this.selectedServiceId);
        }
    }

    private loadConfig(serviceId: number): void {
        this.isLoadingConfig = true;
        this.hasError        = false;
        this.loadStaff();

        this.workflowService.getWorkflowConfigByService(serviceId)
            .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingConfig = false))
            .subscribe({
                next: (config) => {
                    this.applyConfig(config);
                },
                error: (err) => {
                    // 404 → aucune config pour ce service (état normal)
                    if (err?.status === 404) {
                        this.existingConfigId = null;
                        this.etapes           = [];
                    } else {
                        this.hasError     = true;
                        this.errorMessage = 'Impossible de charger la configuration du workflow.';
                    }
                }
            });
    }

    private applyConfig(config: WorkflowConfig): void {
        this.existingConfigId = Number(config.id);
        this.workflowActif    = config.isActive;

        this.etapes = (config.steps || []).map((e, i) => ({
            _id:                     e.id || `real-${i}`,
            ordre:                   e.order,
            label:                   e.label,
            roleValidateur:          e.validatorRole,
            validateurSpecifiqueId:  e.validatorUserId ? Number(e.validatorUserId) : undefined,
            delaiMaxHeures:          e.maxDelayHours,
            isFinalApproval:         !!e.isFinalApproval,
            isActive:                e.isActive,
        }));

        this.isDirty = false;
    }

    private resetConfigState(): void {
        this.existingConfigId      = null;
        this.etapes                = [];
        this.workflowActif         = true;
        this.delaiParDefautHeures  = 48;
        this.revalidationComplete  = true;
        this.revalidationPartielle = false;
        this.isDirty               = false;
        this.hasError              = false;
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers template
    // ─────────────────────────────────────────────────────────────

    get serviceSelectionnee(): Service | undefined {
        return this.services.find(s => s.id === this.selectedServiceId);
    }

    get serviceLabel(): string {
        return this.serviceSelectionnee?.nom || '';
    }

    getRoleLabel(role: WorkflowRole): string {
        return ROLE_LABELS[role] || role;
    }

    getStaffName(staffId: number): string {
        const staff = this.staffOptions.find(s => s.id === staffId);
        return staff ? staff.nomComplet : '—';
    }

    private normalizeRole(role?: string): string {
        return (role || '')
            .trim()
            .toUpperCase()
            .replace(/[-\s]+/g, '_');
    }

    private getStepResponsibleStaff(etape: EtapeLocale): StaffOption | undefined {
        if (etape.validateurSpecifiqueId) {
            return this.staffOptions.find(s => s.id === etape.validateurSpecifiqueId);
        }

        const role = this.normalizeRole(etape.roleValidateur);
        const selectedServiceId = this.selectedServiceId;

        if (selectedServiceId != null) {
            const serviceScopedMatch = this.staffOptions.find(s => {
                const staffRole = this.normalizeRole(s.role);
                const staffServiceId = s.serviceId != null ? Number(s.serviceId) : null;
                return staffRole === role && staffServiceId === selectedServiceId;
            });

            if (serviceScopedMatch) {
                return serviceScopedMatch;
            }
        }

        return this.staffOptions.find(s => this.normalizeRole(s.role) === role);
    }

    getStepResponsibleName(etape: EtapeLocale): string {
        const staff = this.getStepResponsibleStaff(etape);
        if (staff) {
            return staff.nomComplet;
        }
        return this.getRoleLabel(etape.roleValidateur);
    }

    getStepPhotoUrl(etape: EtapeLocale): string {
        const staff = this.getStepResponsibleStaff(etape);
        return this.buildPhotoUrl(staff?.photo);
    }

    hasStepPhoto(etape: EtapeLocale): boolean {
        return !!this.getStepResponsibleStaff(etape)?.photo;
    }

    /** Construit l'URL complète pour une photo de profil */
    private buildPhotoUrl(photoPath?: string): string {
        if (!photoPath) return 'assets/images/default-avatar.png';

        if (photoPath.startsWith('data:')) {
            return photoPath;
        }
        
        // Si c'est déjà une URL complète, la retourner telle quelle
        if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
            return photoPath;
        }
        
        // Si c'est un chemin local, le transformer en URL API
        if (photoPath.startsWith('/')) {
            return `${environment.apiBaseUrl}${photoPath}`;
        }
        
        // Sinon, le préfixer avec le chemin API par défaut pour les uploads
        return `${environment.apiBaseUrl}/uploads/photos/${photoPath}`;
    }

    /** Retourne l'URL de la photo d'un membre du personnel */
    getStaffPhotoUrl(staffId: number): string {
        const staff = this.staffOptions.find(s => s.id === staffId);
        return this.buildPhotoUrl(staff?.photo);
    }

    get positionOptions(): { value: number; label: string }[] {
        const opts: { value: number; label: string }[] = [
            { value: 0, label: 'Au début' }
        ];
        this.etapes.forEach((e, i) => {
            opts.push({ value: i + 1, label: `Après l'étape ${i + 1} (${e.label})` });
        });
        opts.push({ value: this.etapes.length + 1, label: 'À la fin (avant Super Admin)' });
        return opts;
    }

    get staffFiltres(): StaffOption[] {
        if (!this.etapeForm.roleValidateur) {
            return this.staffOptions;
        }
        return this.staffOptions.filter(
            s => this.normalizeRole(s.role) === this.normalizeRole(this.etapeForm.roleValidateur)
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Glisser-déposer (drag & drop)
    // ─────────────────────────────────────────────────────────────

    private dragIndex: number | null = null;

    onDragStart(event: DragEvent, index: number): void {
        this.dragIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    }

    onDragOver(event: DragEvent, index: number): void {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
    }

    onDrop(event: DragEvent, targetIndex: number): void {
        event.preventDefault();
        if (this.dragIndex === null || this.dragIndex === targetIndex) {
            this.dragIndex = null;
            return;
        }
        const moved = this.etapes.splice(this.dragIndex, 1)[0];
        this.etapes.splice(targetIndex, 0, moved);
        this.renumeroterEtapes();
        this.dragIndex = null;
        this.isDirty = true;
    }

    onDragEnd(): void {
        this.dragIndex = null;
    }

    trackByEtape(index: number, etape: EtapeLocale): string {
        return etape._id;
    }

    private renumeroterEtapes(): void {
        this.etapes.forEach((e, i) => {
            e.ordre = i + 1;
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Modal ajout / modification
    // ─────────────────────────────────────────────────────────────

    openAjouter(): void {
        this.etapeForm = this.resetEtapeForm();
        this.etapeForm.visible  = true;
        this.etapeForm.mode     = 'ajouter';
        this.etapeForm.position = this.etapes.length; // par défaut : à la fin
        this.loadStaff();
    }

    openModifier(index: number): void {
        const etape = this.etapes[index];
        this.etapeForm = {
            visible:                  true,
            mode:                     'modifier',
            position:                 index,
            roleValidateur:           etape.roleValidateur,
            validateurSpecifiqueActif: !!etape.validateurSpecifiqueId,
            validateurSpecifiqueId:   etape.validateurSpecifiqueId,
            delaiSpecifiqueActif:     !!etape.delaiMaxHeures,
            delaiMaxHeures:           etape.delaiMaxHeures,
            editIndex:                index,
        };
        this.loadStaff();
    }

    fermerModal(): void {
        this.etapeForm = this.resetEtapeForm();
    }

    onRoleChange(): void {
        this.etapeForm.validateurSpecifiqueId = undefined;
    }

    confirmerEtapeForm(): void {
        if (!this.etapeForm.roleValidateur) {
            return;
        }

        const label = this.getRoleLabel(this.etapeForm.roleValidateur);

        if (this.etapeForm.mode === 'ajouter') {
            const nouvelleEtape: EtapeLocale = {
                _id:                    `tmp-${Date.now()}`,
                ordre:                  0, // renumeroté après insertion
                label,
                roleValidateur:         this.etapeForm.roleValidateur,
                validateurSpecifiqueId: this.etapeForm.validateurSpecifiqueActif
                    ? this.etapeForm.validateurSpecifiqueId
                    : undefined,
                delaiMaxHeures: this.etapeForm.delaiSpecifiqueActif
                    ? this.etapeForm.delaiMaxHeures
                    : undefined,
                isFinalApproval: false,
                isActive:        true,
                dirty:           true,
            };

            const pos = this.etapeForm.position;
            this.etapes.splice(pos, 0, nouvelleEtape);

        } else if (this.etapeForm.mode === 'modifier' && this.etapeForm.editIndex !== undefined) {
            const idx = this.etapeForm.editIndex;
            this.etapes[idx] = {
                ...this.etapes[idx],
                label,
                roleValidateur:         this.etapeForm.roleValidateur,
                validateurSpecifiqueId: this.etapeForm.validateurSpecifiqueActif
                    ? this.etapeForm.validateurSpecifiqueId
                    : undefined,
                delaiMaxHeures: this.etapeForm.delaiSpecifiqueActif
                    ? this.etapeForm.delaiMaxHeures
                    : undefined,
                dirty: true,
            };
        }

        this.renumeroterEtapes();
        this.isDirty = true;
        this.fermerModal();
    }

    // ─────────────────────────────────────────────────────────────
    // Suppression
    // ─────────────────────────────────────────────────────────────

    demanderSuppression(index: number): void {
        this.suppressionIndex   = index;
        this.suppressionLabel   = this.etapes[index].label;
        this.suppressionVisible = true;
    }

    annulerSuppression(): void {
        this.suppressionVisible = false;
        this.suppressionIndex   = -1;
        this.suppressionLabel   = '';
    }

    confirmerSuppression(): void {
        if (this.suppressionIndex >= 0) {
            this.etapes.splice(this.suppressionIndex, 1);
            this.renumeroterEtapes();
            this.isDirty = true;
        }
        this.annulerSuppression();
        // Sauvegarde automatique immédiate après suppression
        this.enregistrer();
    }

    // ─────────────────────────────────────────────────────────────
    // Chargement du personnel (validateur spécifique)
    // ─────────────────────────────────────────────────────────────

    private loadStaff(): void {
        if (this.staffOptions.length > 0) {
            return;
        }
        this.isLoadingStaff = true;
        this.http.get<any[]>(`${environment.apiBaseUrl}/api/staff`)
            .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingStaff = false))
            .subscribe({
                next: (data) => {
                    const arr = Array.isArray(data) ? data : (data as any)?.value || [];
                    this.staffOptions = arr.map((s: any) => ({
                        id:        s.id || s.Id,
                        nomComplet: `${s.prenom || s.Prenom || ''} ${s.nom || s.Nom || ''}`.trim(),
                        role:      s.role || s.Role || '',
                        serviceId: s.serviceId ?? s.service_id ?? s.ServiceId ?? null,
                        photo:     s.photo || s.Photo || null,
                    }));
                },
                error: () => {
                    // non bloquant : le sélecteur sera vide
                }
            });
    }

    // ─────────────────────────────────────────────────────────────
    // Sauvegarde
    // ─────────────────────────────────────────────────────────────

    enregistrer(): void {
        if (!this.selectedServiceId) {
            this.notification.error('Veuillez sélectionner un service.');
            return;
        }
        if (this.etapes.length === 0) {
            this.notification.error('Le circuit doit avoir au moins une étape de validation.');
            return;
        }

        // Vérifier doublons de rôles (hors validateur spécifique)
        const rolesNonSpecifiques = this.etapes
            .filter(e => !e.validateurSpecifiqueId)
            .map(e => e.roleValidateur);
        const doublons = rolesNonSpecifiques.filter(
            (r, i, arr) => arr.indexOf(r) !== i
        );
        if (doublons.length > 0) {
            const labels = doublons.map(r => ROLE_LABELS[r] || r).join(', ');
            this.notification.error(
                `Rôles en doublon détectés : ${labels}. Désignez un validateur spécifique pour différencier.`
            );
            return;
        }

        const payload: CreateWorkflowConfigDTO = {
            serviceId: this.selectedServiceId,
            serviceName: this.serviceLabel,
            etapes: this.etapes.map(e => ({
                ordre:                  e.ordre,
                label:                  e.label,
                roleValidateur:         e.roleValidateur,
                delaiMaxHeures:         e.delaiMaxHeures,
                validateurSpecifiqueId: e.validateurSpecifiqueId || undefined,
            })),
        };

        this.isSaving = true;

        const obs$ = this.existingConfigId
            ? this.workflowService.updateWorkflowConfig(this.existingConfigId, payload)
            : this.workflowService.createWorkflowConfig(payload);

        obs$.pipe(takeUntil(this.destroy$), finalize(() => this.isSaving = false))
            .subscribe({
                next: (saved) => {
                    this.notification.success('Configuration du workflow enregistrée avec succès.');
                    this.applyConfig(saved);
                    this.isDirty = false;
                    this.loadAllConfigs(); // rafraîchir la liste
                },
                error: () => {
                    this.notification.error('Échec de l\'enregistrement. Veuillez réessayer.');
                }
            });
    }

    annuler(): void {
        if (this.isDirty) {
            const confirm = window.confirm(
                'Des modifications non sauvegardées seront perdues. Continuer ?'
            );
            if (!confirm) {
                return;
            }
        }
        if (this.existingConfigId && this.selectedServiceId) {
            this.loadConfig(this.selectedServiceId);
        } else {
            this.resetConfigState();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers privés
    // ─────────────────────────────────────────────────────────────

    private resetEtapeForm(): EtapeFormState {
        return {
            visible:                   false,
            mode:                      'ajouter',
            position:                  0,
            roleValidateur:            'CHEF_SERVICE',
            validateurSpecifiqueActif: false,
            validateurSpecifiqueId:    undefined,
            delaiSpecifiqueActif:      false,
            delaiMaxHeures:            undefined,
            editIndex:                 undefined,
        };
    }

    /** Retourne le nom du validateur principal (première étape) */
    getValidatorName(): string {
        if (!this.etapes.length) return '';
        return this.getStepResponsibleName(this.etapes[0]);
    }

    /** Retourne l'URL de la photo du validateur principal */
    getValidatorPhotoUrl(): string {
        if (!this.etapes.length) return 'assets/images/default-avatar.png';
        return this.buildPhotoUrl(this.getStepResponsibleStaff(this.etapes[0])?.photo);
    }

    hasValidatorPhoto(): boolean {
        if (!this.etapes.length) return false;
        return !!this.getStepResponsibleStaff(this.etapes[0])?.photo;
    }
}