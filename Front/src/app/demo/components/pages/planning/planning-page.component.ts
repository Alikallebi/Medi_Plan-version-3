import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, concatMap, forkJoin, from, map, of, takeUntil, toArray } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Assignment, Conflict, DragPlanningItem, DropTargetCell, Personnel, PlanningData, PlanningPoste, PlanningStats, PlanningVersion, ShiftType } from 'src/app/demo/api/planning.models';
import { CurrentServiceService, MedicalService } from 'src/app/demo/service/current-service.service';
import { DragDropService } from 'src/app/demo/service/drag-drop.service';
import { PlanningNotificationService, PlanningToast } from 'src/app/demo/service/planning-notification.service';
import { PlanningOverviewRow, PlanningService } from 'src/app/demo/service/planning.service';
import { Poste, PosteService, ServiceOption } from 'src/app/demo/service/poste.service';
import { RuleValidationService } from 'src/app/demo/service/rule-validation.service';
import { StaffService } from 'src/app/demo/service/staff.service';
import { AuthService } from 'src/app/demo/service/auth.service';
import { PerimeterService } from 'src/app/demo/service/perimeter.service';
import { ServiceSelectionService } from 'src/app/demo/service/service-selection.service';
import { WorkflowConfig } from 'src/app/features/workflow/models';
import { WorkflowService } from 'src/app/features/workflow/services/workflow.service';
import { normalizeRole, RoleNormalized } from 'src/app/features/workflow/models/user-context.model';

@Component({
    selector: 'app-planning-page',
    templateUrl: './planning-page.component.html',
    styleUrls: ['./planning-page.component.css']
})
export class PlanningPageComponent implements OnInit, OnDestroy {
    private static readonly POSTE_CATALOG_STORAGE_KEY = 'planning_postes_catalogue';

    currentService: MedicalService | null = null;
    availableServices: MedicalService[] = [];
    planningData: PlanningData | null = null;
    allDaysPlanning: Assignment[] = [];
    loading = false;
    postesCatalog: PlanningPoste[] = [];
    planningOverviewRows: PlanningOverviewRow[] = [];
    loadingOverview = false;

    weekStart = this.toMonday(new Date());
    weekEnd = this.toSunday(this.weekStart);
    periodStart = new Date(this.weekStart);
    periodEnd = new Date(this.weekEnd);
    weekLabel = '';
    weekDays: string[] = [];
    dayDates: Date[] = [];

    periodMode: 'semaine' | 'mois' | 'personnalisee' = 'semaine';
    periodStartInput = this.toInputDate(this.weekStart);
    monthInput = this.toInputMonth(new Date());
    customStartInput = this.toInputDate(this.weekStart);
    customEndInput = this.toInputDate(this.weekEnd);

    currentView: 'hebdomadaire' | 'journaliere' | 'mensuelle' = 'hebdomadaire';
    currentFilter: 'all' | 'medecin' | 'infirmier' | 'vacant' = 'all';
    selectedTeam = 'all';
    memberSearch = '';
    selectedPosteType: 'all' | ShiftType = 'all';
    showMembersOnLeave = true;
    filterAssignmentStatus: 'all' | 'avec' | 'sans' = 'all';
    servicesFallbackActive = false;
    postesFallbackActive = false;

    selectionMode = false;
    selectedCellKeys = new Set<string>();
    private isSelecting = false;
    showPersonnelPanel = true;

    contextMenuVisible = false;
    contextMenuX = 0;
    contextMenuY = 0;
    contextCell: { personnelId: string; day: number } | null = null;

    assignmentDialogOpen = false;
    assignmentDialogCell: { personnelId: string; day: number } | null = null;
    assignmentDialogPosteId = '';
    selectedPosteForQuickFill: PlanningPoste | null = null;
    compatiblePersonnelIds: Set<string> | null = null;
    noCompatiblePersonnelMessage = '';
    private readonly compatibilityByPosteId = new Map<number, Set<string>>();
    cursorPreviewX = 0;
    cursorPreviewY = 0;
    hasUnsavedChanges = false;

    versionHistory: PlanningVersion[] = [];
    currentVersion = 'v1';
    lastSavedAt: Date | null = null;

    toasts: PlanningToast[] = [];
    stats: PlanningStats = { occupancyRate: 0, coveredPosts: 0, totalPosts: 0, conflicts: 0 };
    rulesPanelCollapsed = false;

    /** Configurations workflow créées dans la page workflow-config */
    configuredWorkflows: WorkflowConfig[] = [];
    loadingWorkflows = false;
    workflowPanelExpanded = true;

    private undoStack: Assignment[][] = [];
    private redoStack: Assignment[][] = [];
    private hasShownPostesFallbackToast = false;
    private hasShownServicesFallbackToast = false;
    private readonly destroy$ = new Subject<void>();

    constructor(
        private readonly router: Router,
        private readonly route: ActivatedRoute,
        private readonly currentServiceService: CurrentServiceService,
        private readonly planningService: PlanningService,
        private readonly dragDropService: DragDropService,
        private readonly ruleValidationService: RuleValidationService,
        private readonly planningNotificationService: PlanningNotificationService,
        private readonly posteService: PosteService,
        private readonly staffService: StaffService,
        private readonly authService: AuthService,
        private readonly perimeterService: PerimeterService,
        private readonly serviceSelectionService: ServiceSelectionService,
        private readonly workflowConfigService: WorkflowService
    ) {}

    canAccessServiceDropdown(): boolean {
        const role = this.getEffectiveRole();
        if (!role) return false;
        
        // super-admin, admin-gta, validateur-rh, planificateur-rh : tous les services
        // chef-pole : les services de son pôle
        const allowedRoles = ['super-admin', 'admin-gta', 'validateur-rh', 'planificateur-rh', 'chef-pole'];
        return allowedRoles.includes(role);
    }

    getConnectedUserService(): string {
        const userContext = this.authService.getCurrentUser();
        return userContext?.serviceNom || 'Non assigné';
    }

    getConnectedUserName(): string {
        const userContext = this.authService.getCurrentUser();
        return userContext?.nomComplet || 'Utilisateur';
    }

    // ─── Helpers rôles ──────────────────────────────────────────────────────────

    /** Super Admin ou Admin GTA */
    isAdmin(): boolean {
        const r = this.getEffectiveRole();
        return r === 'super-admin' || r === 'admin-gta';
    }

    /** Chef de Service */
    isChefService(): boolean {
        return this.getEffectiveRole() === 'chef-service';
    }

    /** Chef de Pôle */
    isChefPole(): boolean {
        return this.getEffectiveRole() === 'chef-pole';
    }

    /** Validateur RH */
    isValidateurRH(): boolean {
        return this.getEffectiveRole() === 'validateur-rh';
    }

    /** Planificateur RH */
    isPlanificateurRH(): boolean {
        return this.getEffectiveRole() === 'planificateur-rh';
    }

    private getEffectiveRole(): RoleNormalized | null {
        const userContext = this.authService.getCurrentUser();
        if (userContext?.roleNormalized) {
            return userContext.roleNormalized;
        }

        const rawRole = userContext?.role || localStorage.getItem('role') || '';
        return rawRole ? normalizeRole(rawRole) : null;
    }

    /** Peut créer/modifier/sauvegarder un planning */
    canEditPlanning(): boolean {
        return this.isChefService() || this.isAdmin() || this.isChefPole();
    }

    /** Peut soumettre un planning au workflow */
    canSubmitWorkflow(): boolean {
        return this.isChefService() || this.isAdmin() || this.isChefPole();
    }

    /** Peut valider (approuver/rejeter) un planning */
    canValidatePlanning(): boolean {
        return this.isChefPole() || this.isValidateurRH() || this.isPlanificateurRH() || this.isAdmin();
    }

    get canSubmitCurrentWorkflow(): boolean {
        const workflowStatus = this.planningData?.workflowStatus;
        return !this.loading && (
            !workflowStatus ||
            workflowStatus === 'BROUILLON' ||
            workflowStatus === 'REJETE'
        );
    }

    /** Peut gérer les configurations workflow */
    canManageWorkflows(): boolean {
        return this.isAdmin();
    }

    // ────────────────────────────────────────────────────────────────────────────

    ngOnInit(): void {
        // Recharger les services avec le rôle de l'utilisateur connecté
        // (nécessaire si le singleton CurrentServiceService a été créé avant login)
        this.currentServiceService.reloadServices();

        // Si l'URL contient weekStart=YYYY-MM-DD, naviguer vers cette semaine
        const weekStartParam = this.route.snapshot.queryParamMap.get('weekStart');
        if (weekStartParam) {
            const parsed = new Date(weekStartParam);
            if (!isNaN(parsed.getTime())) {
                this.weekStart = this.toMonday(parsed);
                this.periodStart = new Date(this.weekStart);
                this.periodEnd = this.toSunday(this.weekStart);
            }
        }

        // Si l'URL contient serviceId, sélectionner ce service
        const serviceIdParam = this.route.snapshot.queryParamMap.get('serviceId');
        if (serviceIdParam) {
            this.currentServiceService.setCurrentService(serviceIdParam);
            const numericId = Number(serviceIdParam);
            if (!isNaN(numericId) && numericId > 0) {
                this.serviceSelectionService.setCurrentService(numericId);
            }
        }

        this.refreshWeekLabels();

        this.currentServiceService.services$
            .pipe(takeUntil(this.destroy$))
            .subscribe(services => {
                this.availableServices = services.filter(service => service.id !== 'all');
            });

        this.currentServiceService.servicesFromApi$
            .pipe(takeUntil(this.destroy$))
            .subscribe(fromApi => {
                this.servicesFallbackActive = !fromApi;
                if (!fromApi && !this.hasShownServicesFallbackToast) {
                    this.hasShownServicesFallbackToast = true;
                    this.planningNotificationService.showWarning('Services chargés en mode local (API indisponible).');
                }
                if (fromApi) {
                    this.hasShownServicesFallbackToast = false;
                }
            });

        this.currentServiceService.currentService$
            .pipe(takeUntil(this.destroy$))
            .subscribe(service => {
                this.currentService = service;
                this.syncDashboardServiceSelection(service);
                this.loadPlanning();
            });

        this.planningService.currentPlanning$
            .pipe(takeUntil(this.destroy$))
            .subscribe(planning => {
                if (!planning) {
                    return;
                }
                this.allDaysPlanning = planning.assignments.map(item => ({ ...item }));
                this.planningData = planning;
                this.stats = this.planningService.getStats(planning);
                this.lastSavedAt = new Date();
                this.hasUnsavedChanges = false;
                this.refreshCompetenceConflicts();
            });

        this.planningNotificationService.toasts$
            .pipe(takeUntil(this.destroy$))
            .subscribe(toasts => {
                this.toasts = toasts;
            });
    }

    loadPlanning(): void {
        if (!this.currentService) {
            return;
        }

        // Ne pas charger de planning pour l'option virtuelle "Tous les services"
        // (service_id='all' est une option de navigation, pas un vrai service)
        if (this.currentService.id === 'all') {
            this.loading = false;
            this.planningData = null;
            return;
        }

        this.loading = true;

        // Obtenir le contexte utilisateur et calculer le filtre de périmètre
        const userContext = this.authService.getCurrentUser();
        const filter = this.perimeterService.getPerimeterFilter(userContext);
        console.log('🔐 Planning - Filtre de périmètre appliqué:', filter);

        // En mode mois/période, on charge TOUJOURS la semaine courante (weekStart) pour rester
        // cohérent avec le modèle par semaine de la base de données.
        const loadEnd = (this.periodMode === 'mois' || this.periodMode === 'personnalisee')
            ? this.getEffectiveWeekEnd(this.weekStart, this.periodEnd)
            : this.periodEnd;
        this.planningService.getPlanningWithPerimeter(filter, this.currentService.id, this.currentService.name, this.weekStart, loadEnd)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.loadPersonnelFromService();
                    this.loadPostesCatalog();
                    this.loadPlanningOverview();
                    this.loadVersionHistory();
                    this.loadConfiguredWorkflows();
                    this.updateCompatiblePersonnelFilter(this.selectedPosteForQuickFill?.id);
                    this.refreshCompetenceConflicts();
                    this.selectionMode = false;
                    this.selectedCellKeys.clear();
                    this.loading = false;
                },
                error: () => {
                    this.loading = false;
                    this.planningNotificationService.showError('Impossible de charger le planning du service.');
                }
            });
    }

    // ─── Configurations workflow ─────────────────────────────────────────────────

    /** Charge toutes les configurations workflow créées dans la page workflow-config. */
    loadConfiguredWorkflows(): void {
        this.loadingWorkflows = true;
        this.workflowConfigService.getWorkflowConfigs()
            .pipe(
                takeUntil(this.destroy$),
                catchError(() => of([]))
            )
            .subscribe((configs: WorkflowConfig[]) => {
                this.loadingWorkflows = false;
                this.configuredWorkflows = configs;
            });
    }

    /** Classe CSS selon l'état actif/inactif du workflow. */
    getWfConfigClass(wf: WorkflowConfig): string {
        return wf.isActive ? 'wf-active' : 'wf-inactive';
    }

    /** Retourne le nom du service associé à un workflow config. */
    getWfServiceName(wf: WorkflowConfig): string {
        const svc = this.availableServices.find(s => s.id === wf.serviceId);
        return svc ? svc.name : `Svc ${wf.serviceId}`;
    }

    /** Libellé du rôle principal (1ère étape). */
    formatRole(wf: WorkflowConfig): string {
        const labels: Record<string, string> = {
            SUPER_ADMIN:             'Super Admin',
            ADMIN_GTA:               'Admin GTA',
            CHEF_SERVICE:            'Chef de service',
            CHEF_POLE:               'Chef de pôle',
            VALIDATEUR_RH:           'Validateur RH',
            PLANIFICATEUR_URGENCE:   'Planif. urgence',
            SUPERVISEUR_INTERNES:    'Superviseur'
        };
        const firstStep = wf.steps?.[0];
        if (!firstStep) return '-';
        return labels[firstStep.validatorRole] ?? firstStep.validatorRole;
    }

    /** Navigue vers la page workflow-config. */
    goToWorkflowConfig(): void {
        this.router.navigate(['/workflow/workflow-config']);
    }

    // ────────────────────────────────────────────────────────────────────────────

    get filteredPersonnel() {
        if (!this.planningData) {
            return [];
        }

        const realUsers = this.planningData.personnel.filter(person => person.category !== 'vacant');
        const searchValue = this.memberSearch.trim().toLowerCase();

        return realUsers.filter(person => {
            const matchCompatibility = !this.compatiblePersonnelIds || this.compatiblePersonnelIds.has(person.id.toString());
            const matchFilter = this.currentFilter === 'all' || person.category === this.currentFilter;
            const matchLeave = this.showMembersOnLeave || person.status !== 'conges';
            const matchTeam = this.selectedTeam === 'all' || person.specialty.toLowerCase() === this.selectedTeam.toLowerCase();
            const matchSearch = !searchValue || `${person.prenom} ${person.nom} ${person.role} ${person.specialty}`.toLowerCase().includes(searchValue);
            const hasAssignment = (this.planningData?.assignments ?? []).some(a => a.personnelId === person.id);
            const matchAssignment = this.filterAssignmentStatus === 'all'
                || (this.filterAssignmentStatus === 'avec' && hasAssignment)
                || (this.filterAssignmentStatus === 'sans' && !hasAssignment);
            return matchCompatibility && matchFilter && matchLeave && matchTeam && matchSearch && matchAssignment;
        });
    }

    get teamOptions(): string[] {
        if (!this.planningData) {
            return [];
        }

        return Array.from(new Set(this.planningData.personnel.map(item => item.specialty).filter(Boolean))).sort();
    }

    get filteredPostesCatalog(): PlanningPoste[] {
        if (this.selectedPosteType === 'all') {
            return this.postesCatalog;
        }
        return this.postesCatalog.filter(item => item.type === this.selectedPosteType);
    }

    get selectedCellsCount(): number {
        return this.selectedCellKeys.size;
    }

    get totalAssignments(): number {
        return this.allDaysPlanning.length;
    }

    get totalSlots(): number {
        return this.filteredPersonnel.length * this.weekDays.length;
    }

    get unfilledPosts(): number {
        return Math.max(this.totalSlots - this.visibleAssignments.length, 0);
    }

    get completionRate(): number {
        if (this.totalSlots === 0) {
            return 0;
        }
        return Math.round((this.visibleAssignments.length / this.totalSlots) * 100);
    }

    get visibleAssignments(): Assignment[] {
        return this.allDaysPlanning;
    }

    get visibleConflicts(): Conflict[] {
        return this.planningData?.conflicts || [];
    }

    get currentVersionDateLabel(): string {
        if (!this.versionHistory.length) {
            return '-';
        }
        return this.versionHistory[0].createdAt.toLocaleString('fr-FR');
    }

    onCellDropped(event: { dragData: DragPlanningItem; targetData: DropTargetCell }): void {
        if (!this.canEditPlanning()) {
            this.planningNotificationService.showWarning('Accès refusé : vous n\'avez pas les droits pour modifier ce planning.');
            return;
        }
        if (!this.planningData) {
            return;
        }

        const numericPosteId = Number(event.dragData.posteId);
        if (Number.isFinite(numericPosteId) && numericPosteId > 0) {
            this.getCompatiblePersonnelIdsForPoste(numericPosteId)
                .pipe(takeUntil(this.destroy$))
                .subscribe(ids => {
                    // Si l'API est indisponible, on n'empêche pas l'affectation.
                    if (!ids) {
                        this.planningNotificationService.showWarning('Contrôle des compétences indisponible, affectation autorisée.');
                        this.executeDrop(event);
                        return;
                    }

                    const personnelId = String(event.targetData.personnelId);
                    if (!ids.has(personnelId)) {
                        this.planningNotificationService.showError('Ce personnel ne possède pas les compétences requises pour ce poste.');
                        return;
                    }

                    this.executeDrop(event);
                });
            return;
        }

        this.executeDrop(event);
    }

    private executeDrop(event: { dragData: DragPlanningItem; targetData: DropTargetCell }): void {
        if (!this.planningData) {
            return;
        }

        const absoluteDay = this.toAbsoluteDay(event.targetData.day);

        const existingTargetAssignment = this.getAssignmentAtCell(event.targetData.personnelId, event.targetData.day);
        const candidateAssignmentId = existingTargetAssignment?.id || event.dragData.assignmentId || `${event.targetData.personnelId}-${absoluteDay}`;

        const validation = this.ruleValidationService.validateAssignment(
            {
                id: candidateAssignmentId,
                personnelId: event.targetData.personnelId,
                day: absoluteDay,
                shiftType: event.dragData.shiftType
            },
            { ...this.planningData, assignments: this.allDaysPlanning }
        );

        if (!validation.valid) {
            this.planningNotificationService.showError(validation.violations[0]);
            return;
        }

        this.pushUndoState();
        const shiftType: ShiftType = event.dragData.shiftType;
        const isNonWorkingType = shiftType === 'repos' || shiftType === 'conges';
        const assignment: Assignment = {
            id: candidateAssignmentId,
            personnelId: event.targetData.personnelId,
            day: absoluteDay,
            shiftType,
            posteId: event.dragData.posteId,
            posteLabel: event.dragData.posteLabel,
            startTime: isNonWorkingType ? undefined : event.dragData.startTime,
            endTime: isNonWorkingType ? undefined : event.dragData.endTime,
            note: undefined
        };

        this.applyLocalAssignment(assignment, event.dragData.assignmentId);
        this.redoStack = [];
        const replaced = !!existingTargetAssignment && existingTargetAssignment.id !== event.dragData.assignmentId;
        this.planningNotificationService.showSuccess(
            `${replaced ? 'Affectation remplacée' : 'Affectation mise à jour'} localement (${assignment.posteLabel || assignment.shiftType} - J${assignment.day + 1}).`
        );

        if (assignment.shiftType === 'garde') {
            this.applyAutomaticRestAfterGuard(assignment);
        }
    }

    applyPeriod(): void {
        // En mode mois/période, l'affichage reste toujours hebdomadaire (7 jours).
        if (this.periodMode === 'mois' || this.periodMode === 'personnalisee') {
            this.currentView = 'hebdomadaire';
        }

        if (this.periodMode === 'semaine') {
            const selected = this.periodStartInput ? new Date(this.periodStartInput) : new Date();
            this.periodStart = this.toMonday(selected);
            this.periodEnd = this.toSunday(this.periodStart);
            this.weekStart = new Date(this.periodStart);
        } else if (this.periodMode === 'mois') {
            const monthDate = this.monthInput ? new Date(this.monthInput) : new Date();
            const source = Number.isNaN(monthDate.getTime()) ? new Date() : monthDate;
            this.periodStart = new Date(source.getFullYear(), source.getMonth(), 1);
            this.periodEnd = new Date(source.getFullYear(), source.getMonth() + 1, 0);
            this.weekStart = this.pickWeekStartInPeriod();
        } else {
            const start = this.customStartInput ? new Date(this.customStartInput) : new Date();
            const end = this.customEndInput ? new Date(this.customEndInput) : start;
            this.periodStart = new Date(start);
            this.periodEnd = end < start ? new Date(start) : new Date(end);
            this.weekStart = this.pickWeekStartInPeriod();
        }

        this.refreshWeekLabels();
        this.loadPlanning();
    }

    resetAdvancedFilters(): void {
        this.currentFilter = 'all';
        this.selectedTeam = 'all';
        this.memberSearch = '';
        this.selectedPosteType = 'all';
        this.showMembersOnLeave = true;
        this.filterAssignmentStatus = 'all';
    }

    onMemberSearchChanged(value: string): void {
        this.memberSearch = value || '';
    }

    onCellClicked(event: { personnelId: string; day: number }): void {
        if (!this.canEditPlanning()) {
            return;
        }
        // If a poste is selected, apply it directly to the empty cell
        if (this.selectedPosteForQuickFill) {
            const isNonWorkingType = this.selectedPosteForQuickFill.type === 'repos' || this.selectedPosteForQuickFill.type === 'conges';
            const dragData: DragPlanningItem = {
                source: 'list',
                posteId: this.selectedPosteForQuickFill.id,
                posteLabel: isNonWorkingType
                    ? this.selectedPosteForQuickFill.nom
                    : `${this.selectedPosteForQuickFill.nom} (${this.selectedPosteForQuickFill.heureDebut} - ${this.selectedPosteForQuickFill.heureFin})`,
                shiftType: this.selectedPosteForQuickFill.type,
                startTime: isNonWorkingType ? undefined : this.selectedPosteForQuickFill.heureDebut,
                endTime: isNonWorkingType ? undefined : this.selectedPosteForQuickFill.heureFin
            };

            this.onCellDropped({
                dragData,
                targetData: event
            });
            return;
        }

        // Otherwise, open the assignment dialog for manual selection
        this.assignmentDialogCell = event;
        this.assignmentDialogPosteId = '';
        this.assignmentDialogOpen = true;
        this.hideContextMenu();
    }

    onPosteSelectionChanged(poste: PlanningPoste | null): void {
        this.selectedPosteForQuickFill = poste;
        this.updateCompatiblePersonnelFilter(poste?.id);
    }

    onCellContextMenu(event: { personnelId: string; day: number; event: MouseEvent }): void {
        if (!this.canEditPlanning()) {
            return;
        }
        this.contextCell = { personnelId: event.personnelId, day: event.day };
        this.contextMenuX = event.event.clientX;
        this.contextMenuY = event.event.clientY;
        this.contextMenuVisible = true;
    }

    hideContextMenu(): void {
        this.contextMenuVisible = false;
        this.contextCell = null;
    }

    onSelectionStart(event: { personnelId: string; day: number }): void {
        if (!this.selectionMode) {
            return;
        }

        this.isSelecting = true;
        this.selectedCellKeys.add(this.toCellKey(event.personnelId, event.day));
    }

    onSelectionEnter(event: { personnelId: string; day: number }): void {
        if (!this.selectionMode || !this.isSelecting) {
            return;
        }

        this.selectedCellKeys.add(this.toCellKey(event.personnelId, event.day));
    }

    onSelectionEnd(): void {
        this.isSelecting = false;
    }

    clearSelection(): void {
        this.selectedCellKeys.clear();
        this.selectionMode = false;
    }

    applyPosteToSelectedCells(posteId: string): void {
        if (!this.planningData || !posteId || this.selectedCellKeys.size === 0) {
            return;
        }

        const poste = this.postesCatalog.find(item => item.id === posteId);
        if (!poste) {
            return;
        }

        const dragData: DragPlanningItem = {
            source: 'list',
            posteId: poste.id,
            posteLabel: poste.type === 'repos' || poste.type === 'conges'
                ? poste.nom
                : `${poste.nom} (${poste.heureDebut} - ${poste.heureFin})`,
            shiftType: poste.type,
            startTime: poste.type === 'repos' || poste.type === 'conges' ? undefined : poste.heureDebut,
            endTime: poste.type === 'repos' || poste.type === 'conges' ? undefined : poste.heureFin
        };

        for (const key of this.selectedCellKeys) {
            const [personnelId, dayRaw] = key.split('::');
            const day = Number(dayRaw);
            this.onCellDropped({
                dragData,
                targetData: { personnelId, day }
            });
        }

        this.planningNotificationService.showSuccess(`Affectation multiple effectuée (${this.selectedCellKeys.size} cellule(s)).`);
    }

    applyDialogAssignment(): void {
        if (!this.assignmentDialogCell || !this.assignmentDialogPosteId) {
            return;
        }

        const poste = this.postesCatalog.find(item => item.id === this.assignmentDialogPosteId);
        if (!poste) {
            return;
        }

        this.onCellDropped({
            dragData: {
                source: 'list',
                posteId: poste.id,
                posteLabel: poste.type === 'repos' || poste.type === 'conges'
                    ? poste.nom
                    : `${poste.nom} (${poste.heureDebut} - ${poste.heureFin})`,
                shiftType: poste.type,
                startTime: poste.type === 'repos' || poste.type === 'conges' ? undefined : poste.heureDebut,
                endTime: poste.type === 'repos' || poste.type === 'conges' ? undefined : poste.heureFin
            },
            targetData: { ...this.assignmentDialogCell }
        });

        this.assignmentDialogOpen = false;
    }

    closeAssignmentDialog(): void {
        this.assignmentDialogOpen = false;
        this.assignmentDialogCell = null;
        this.assignmentDialogPosteId = '';
    }

    editContextAssignment(): void {
        if (!this.contextCell) {
            return;
        }

        this.assignmentDialogCell = { ...this.contextCell };
        this.assignmentDialogOpen = true;
        this.hideContextMenu();
    }

    clearContextAssignment(): void {
        if (!this.planningData || !this.contextCell) {
            return;
        }

        const assignment = this.getAssignmentAtCell(this.contextCell.personnelId, this.contextCell.day);
        if (!assignment) {
            this.hideContextMenu();
            return;
        }

        this.pushUndoState();
        this.allDaysPlanning = this.allDaysPlanning.filter(item => item.id !== assignment.id);
        this.syncLocalPlanningState();
        this.redoStack = [];
        this.planningNotificationService.showInfo('Affectation supprimée localement.');
        this.hideContextMenu();
    }

    validateDrop = (drag: DragPlanningItem, target: DropTargetCell): boolean => {
        if (!this.planningData) {
            return false;
        }

        const absoluteDay = this.toAbsoluteDay(target.day);

        const existingTargetAssignment = this.getAssignmentAtCell(target.personnelId, target.day);
        const candidateAssignmentId = existingTargetAssignment?.id || drag.assignmentId || `${target.personnelId}-${absoluteDay}`;

        const result = this.ruleValidationService.validateAssignment(
            {
                id: candidateAssignmentId,
                personnelId: target.personnelId,
                day: absoluteDay,
                shiftType: drag.shiftType
            },
            { ...this.planningData, assignments: this.allDaysPlanning }
        );

        return result.valid;
    };

    validatePlanning(): void {
        if (!this.planningData || !this.currentService) {
            return;
        }

        this.loading = true;

        // ─── Mode Semaine : validation simple d'une seule semaine ───────────────
        if (this.periodMode === 'semaine') {
            this.planningService.validatePlanning(this.planningData.id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: result => {
                        this.loading = false;
                        if (result.valid) {
                            localStorage.setItem('currentServiceId', this.currentService!.id);
                            localStorage.setItem('dashboardWeekStart', this.periodStart.toISOString());
                            localStorage.setItem('dashboardWeekEnd', this.periodEnd.toISOString());
                            this.createVersion('Validation planning');
                            this.planningNotificationService.showSuccess('Planning validé, enregistré et prêt pour affichage dashboard.');
                            this.loadPlanning();
                        } else {
                            this.planningNotificationService.showWarning(`Validation avec ${result.conflicts.length} conflit(s).`);
                        }
                    },
                    error: () => {
                        this.loading = false;
                        this.planningNotificationService.showError('Impossible de valider le planning.');
                    }
                });
            return;
        }

        // ─── Mode Mois / Période personnalisée : valider TOUTES les semaines ───
        // Collecte tous les lundis de la période
        const sourceAssignments = this.allDaysPlanning;
        const bounds = this.getActionPeriodBounds();
        const firstMonday = this.getFirstMondayAtOrAfter(bounds.start);
        const allMondays: Date[] = [];
        const cursor = new Date(firstMonday);
        while (cursor <= bounds.end) {
            allMondays.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 7);
        }

        if (allMondays.length === 0 || sourceAssignments.length === 0) {
            this.loading = false;
            this.planningNotificationService.showWarning('Aucune affectation à valider.');
            return;
        }

        // Exécuter les validations semaine par semaine (séquentiel) pour éviter les deadlocks MySQL
        from(allMondays)
            .pipe(
                concatMap(monday => {
                    const sunday = this.getEffectiveWeekEnd(monday, bounds.end);
                    const cloned = this.cloneAssignmentsForPeriodWeek(sourceAssignments, monday, sunday);
                    return this.planningService.validateWeekRaw(
                        this.currentService!.id,
                        this.currentService!.name,
                        monday,
                        sunday,
                        cloned
                    ).pipe(catchError(() => of({ valid: false, conflicts: [] as Conflict[] })));
                }),
                toArray(),
                takeUntil(this.destroy$)
            )
            .subscribe({
                next: results => {
                    this.loading = false;
                    const totalConflicts = results.reduce((acc, r) => acc + (r.conflicts?.length ?? 0), 0);
                    const allValid = results.every(r => r.valid);

                    localStorage.setItem('currentServiceId', this.currentService!.id);
                    localStorage.setItem('dashboardWeekStart', bounds.start.toISOString());
                    localStorage.setItem('dashboardWeekEnd', bounds.end.toISOString());
                    this.createVersion('Validation planning');

                    if (allValid) {
                        this.planningNotificationService.showSuccess(
                            `Planning validé et enregistré pour ${allMondays.length} semaine(s) du mois.`
                        );
                    } else {
                        this.planningNotificationService.showWarning(
                            `Validation avec ${totalConflicts} conflit(s) sur ${allMondays.length} semaine(s).`
                        );
                    }
                    this.loadPlanning();
                },
                error: () => {
                    this.loading = false;
                    this.planningNotificationService.showError('Impossible de valider les plannings du mois.');
                }
            });
    }

    export(format: 'pdf' | 'excel' | 'csv'): void {
        if (!this.planningData) {
            return;
        }

        this.loading = true;
        this.planningService.exportPlanning(this.planningData, format)
            .pipe(takeUntil(this.destroy$))
            .subscribe(message => {
                this.loading = false;
                this.planningNotificationService.showInfo(message);
                this.lastSavedAt = new Date();
            });
    }

    saveDraft(): void {
        if (!this.planningData || !this.currentService) {
            return;
        }

        this.syncLocalPlanningState();

        // ─── Mode Semaine : sauvegarde simple ────────────────────────────────────
        if (this.periodMode === 'semaine') {
            this.loading = true;
            this.planningService.replaceAssignments(
                this.planningData.id,
                this.allDaysPlanning.map(item => ({ ...item })),
                'Brouillon sauvegardé'
            )
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.loading = false;
                        this.hasUnsavedChanges = false;
                        this.createVersion('Brouillon sauvegardé');
                    },
                    error: () => {
                        this.loading = false;
                        this.planningNotificationService.showError('Impossible de sauvegarder le brouillon.');
                    }
                });
            return;
        }

        // ─── Mode Mois / Période : enregistrer TOUTES les semaines ───────────────
        const sourceAssignments = this.allDaysPlanning;
        if (sourceAssignments.length === 0) {
            this.planningNotificationService.showWarning('Aucune affectation à sauvegarder.');
            return;
        }

        // Collecter tous les lundis de la période (premier lundi jusqu'à periodEnd)
        const bounds = this.getActionPeriodBounds();
        const periodSummary = this.getPeriodSplitSummary(bounds.start, bounds.end);
        const firstMonday = this.getFirstMondayAtOrAfter(bounds.start);
        const allMondays: Date[] = [];
        const cursor = new Date(firstMonday);
        while (cursor <= bounds.end) {
            allMondays.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 7);
        }

        this.loading = true;
        // Enregistrer semaine par semaine (séquentiel) pour éviter les deadlocks MySQL
        from(allMondays)
            .pipe(
                concatMap(monday => {
                    const sunday = this.getEffectiveWeekEnd(monday, bounds.end);
                    const cloned = this.cloneAssignmentsForPeriodWeek(sourceAssignments, monday, sunday);
                    return this.planningService.replaceAssignmentsRaw(
                        this.currentService!.id,
                        this.currentService!.name,
                        monday,
                        sunday,
                        cloned
                    ).pipe(catchError(() => of(void 0 as void)));
                }),
                toArray(),
                takeUntil(this.destroy$)
            )
            .subscribe({
                next: () => {
                    this.loading = false;
                    this.hasUnsavedChanges = false;
                    this.planningNotificationService.showInfo(
                        `Planning brouillon enregistré pour ${periodSummary.totalLabel}.`
                    );
                    this.createVersion('Brouillon sauvegardé');
                },
                error: () => {
                    this.loading = false;
                    this.createVersion('Brouillon sauvegardé');
                }
            });
    }

    submitForValidation(): void {

        if (!this.planningData) {
            this.planningNotificationService.showError('Aucun planning sélectionné.');
            return;
        }

        this.syncLocalPlanningState();

        // Vérification côté front : planning vide ou conflits
        if (!this.planningData.assignments || this.planningData.assignments.length === 0) {
            this.planningNotificationService.showError('Le planning est vide. Ajoutez des affectations avant de soumettre.');
            return;
        }
        if (this.planningData.conflicts && this.planningData.conflicts.length > 0) {
            this.planningNotificationService.showError('Le planning contient des conflits. Résolvez-les avant de soumettre.');
            return;
        }

        const missingCells = this.getMissingAssignmentsCount();
        if (missingCells > 0) {
            this.planningNotificationService.showError(
                `Soumission bloquée: ${missingCells} case(s) non renseignée(s). Le planning doit être rempli à 100%.`
            );
            return;
        }

        // Vérifier si le planning peut être soumis
        // Si le statut vient du backend MySQL (workflowStatus), on lui fait confiance :
        // BROUILLON et REJETE sont autorisés à (re-)soumettre.
        const backendStatus = this.planningData.workflowStatus;
        const blockedByBackend = backendStatus &&
            ['EN_ATTENTE_VALIDATION', 'EN_ATTENTE_VALIDATION_RH', 'VALIDE'].includes(backendStatus);
        if (blockedByBackend) {
            this.planningNotificationService.showError(
                `Ce planning ne peut pas être soumis (statut : ${backendStatus}).`
            );
            return;
        }
        // Vérification locale supplémentaire uniquement si pas de statut backend connu
        if (!backendStatus) {
            const submissionCheck = this.planningService.canSubmitPlanning(this.planningData.id);
            if (!submissionCheck.canSubmit) {
                this.planningNotificationService.showError(
                    submissionCheck.reason || 'Impossible de soumettre le planning'
                );
                return;
            }
        }

        // Récupérer les informations utilisateur
        const userContext = this.authService.getCurrentUser();
        if (!userContext) {
            this.planningNotificationService.showError('Utilisateur non authentifié');
            return;
        }

        const createdBy = userContext.nomComplet || 'Utilisateur';
        const createdById = userContext.id?.toString() || 'USER_001';

        if (this.periodMode !== 'semaine') {
            const bounds = this.getActionPeriodBounds();
            const sourceAssignments = this.allDaysPlanning;
            const firstMonday = this.getFirstMondayAtOrAfter(bounds.start);
            const allMondays: Date[] = [];
            const cursor = new Date(firstMonday);
            while (cursor <= bounds.end) {
                allMondays.push(new Date(cursor));
                cursor.setDate(cursor.getDate() + 7);
            }

            if (allMondays.length === 0) {
                this.planningNotificationService.showError('Aucune semaine à soumettre dans la période sélectionnée.');
                return;
            }

            const operationContext = this.periodMode === 'mois'
                ? `Opération mensuelle : période du ${bounds.start.toLocaleDateString('fr-FR')} au ${bounds.end.toLocaleDateString('fr-FR')}.`
                : `Opération sur période : du ${bounds.start.toLocaleDateString('fr-FR')} au ${bounds.end.toLocaleDateString('fr-FR')}.`;
            const periodSummary = this.getPeriodSplitSummary(bounds.start, bounds.end);

            this.loading = true;
            from(allMondays)
                .pipe(
                    concatMap(monday => {
                        const sunday = this.getEffectiveWeekEnd(monday, bounds.end);
                        const cloned = this.cloneAssignmentsForPeriodWeek(sourceAssignments, monday, sunday);

                        return this.planningService.submitPlanningToWorkflowRaw(
                            this.currentService!.id,
                            this.currentService!.name,
                            monday,
                            sunday,
                            createdBy,
                            createdById,
                            cloned,
                            operationContext
                        ).pipe(
                            concatMap(response => {
                                if (!response?.success) {
                                    return of({ success: false, message: response?.message || 'Erreur lors de la soumission.' });
                                }

                                const weekId = response.weekId ? parseInt(response.weekId, 10) : 0;
                                if (weekId > 0) {
                                    return this.workflowConfigService.soumettrePlanning(weekId, operationContext).pipe(
                                        map(() => ({ success: true, weekId })) ,
                                        catchError(err => of({ success: false, message: err?.error?.message || 'Circuit de validation inaccessible.' }))
                                    );
                                }

                                return of({ success: true, weekId: 0 });
                            }),
                            catchError(err => of({ success: false, message: err?.error?.message || err?.message || 'Erreur lors de la soumission.' }))
                        );
                    }),
                    toArray(),
                    takeUntil(this.destroy$)
                )
                .subscribe({
                    next: results => {
                        this.loading = false;
                        const failures = results.filter(r => !r.success);
                        if (failures.length > 0) {
                            const firstFailureMessage = 'message' in failures[0] ? failures[0].message : '';
                            this.planningNotificationService.showWarning(
                                `${periodSummary.submittedLabel(allMondays.length - failures.length, allMondays.length)}. ${firstFailureMessage || ''}`.trim()
                            );
                            return;
                        }

                        this.planningNotificationService.showSuccess(
                            `Plannings soumis pour ${periodSummary.totalLabel}. Les validateurs et utilisateurs concernés ont été informés.`
                        );
                        this.createVersion('Soumission pour validation');
                        setTimeout(() => {
                            this.router.navigate(['/workflow/mes-soumissions']);
                        }, 1500);
                    },
                    error: () => {
                        this.loading = false;
                        this.planningNotificationService.showError('Impossible de soumettre les plannings de la période.');
                    }
                });
            return;
        }

        // Propager les affectations si nécessaire
        this.loading = true;
        this.propagateCurrentWeekAcrossSelectedPeriodIfNeeded()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: generatedCount => {
                    if (generatedCount > 0) {
                        this.planningNotificationService.showInfo(`Propagation effectuée sur ${generatedCount} cellule(s).`);
                    }

                    // Soumettre le planning au workflow
                    this.planningService.submitPlanningToWorkflow(
                        this.planningData!.id,
                        createdBy,
                        createdById
                    )
                    .pipe(takeUntil(this.destroy$))
                    .subscribe({
                        next: response => {
                            if (!response.success) {
                                this.loading = false;
                                this.planningNotificationService.showError(
                                    response.message || 'Erreur lors de la soumission'
                                );
                                return;
                            }

                            // Déclencher le circuit de validation MySQL via l'endpoint dédié
                            const weekId = response.weekId ? parseInt(response.weekId, 10) : 0;
                            if (weekId > 0) {
                                this.workflowConfigService.soumettrePlanning(weekId)
                                    .pipe(takeUntil(this.destroy$))
                                    .subscribe({
                                        next: () => {
                                            this.loading = false;
                                            this.hasUnsavedChanges = false;
                                            this.planningNotificationService.showSuccess(
                                                'Planning soumis avec succès ! Les validateurs ont été notifiés.'
                                            );
                                            this.createVersion('Soumission pour validation');
                                            setTimeout(() => {
                                                this.router.navigate(['/workflow/mes-soumissions']);
                                            }, 1500);
                                        },
                                        error: (wfErr) => {
                                            this.loading = false;
                                            const msg = wfErr?.error?.message
                                                || 'Planning soumis, mais le circuit de validation est inaccessible.';
                                            this.planningNotificationService.showWarning(msg);
                                            this.createVersion('Soumission pour validation');
                                            setTimeout(() => {
                                                this.router.navigate(['/workflow/mes-soumissions']);
                                            }, 2000);
                                        }
                                    });
                            } else {
                                this.loading = false;
                                this.hasUnsavedChanges = false;
                                this.planningNotificationService.showSuccess('Planning soumis avec succès !');
                                this.createVersion('Soumission pour validation');
                                setTimeout(() => {
                                    this.router.navigate(['/workflow/mes-soumissions']);
                                }, 1500);
                            }
                        },
                        error: (err) => {
                            this.loading = false;
                            const errorMsg = err?.error?.message || err?.message || 'Erreur lors de la soumission';
                            this.planningNotificationService.showError(errorMsg);
                        }
                    });
                },
                error: () => {
                    this.loading = false;
                    this.planningNotificationService.showError('Impossible de préparer le planning avant soumission.');
                }
            });
    }

    openVersionHistory(): void {
        this.loadVersionHistory(true);
    }

    togglePersonnelPanel(): void {
        this.showPersonnelPanel = !this.showPersonnelPanel;
    }

    selectInlinePoste(poste: PlanningPoste): void {
        if (this.selectedPosteForQuickFill?.id === poste.id) {
            this.selectedPosteForQuickFill = null;
            this.updateCompatiblePersonnelFilter(undefined);
            return;
        }
        this.selectedPosteForQuickFill = poste;
        this.updateCompatiblePersonnelFilter(poste.id);
    }

    private updateCompatiblePersonnelFilter(posteId?: string): void {
        if (!posteId) {
            this.compatiblePersonnelIds = null;
            this.noCompatiblePersonnelMessage = '';
            return;
        }

        const numericPosteId = Number(posteId);
        if (!Number.isFinite(numericPosteId) || numericPosteId <= 0) {
            this.compatiblePersonnelIds = null;
            this.noCompatiblePersonnelMessage = '';
            return;
        }

        this.getCompatiblePersonnelIdsForPoste(numericPosteId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(ids => {
                if (!ids) {
                    this.compatiblePersonnelIds = null;
                    this.noCompatiblePersonnelMessage = '';
                    this.planningNotificationService.showWarning('Filtrage compétences indisponible pour ce poste.');
                    return;
                }

                this.compatiblePersonnelIds = ids;
                this.noCompatiblePersonnelMessage = ids.size === 0
                    ? 'Aucun personnel disponible avec les compétences requises'
                    : '';
            });
    }

    private refreshCompetenceConflicts(): void {
        if (!this.planningData) {
            return;
        }

        const posteIds = Array.from(new Set(
            this.planningData.assignments
                .map(item => Number(item.posteId))
                .filter(item => Number.isFinite(item) && item > 0)
        ));

        if (posteIds.length === 0) {
            this.removeCompetenceConflicts();
            return;
        }

        from(posteIds)
            .pipe(
                concatMap(posteId => this.getCompatiblePersonnelIdsForPoste(posteId).pipe(
                    map(ids => ({ posteId, ids }))
                )),
                toArray(),
                takeUntil(this.destroy$)
            )
            .subscribe(results => {
                const competenceConflicts: Conflict[] = [];

                for (const result of results) {
                    const compatibleIds = result.ids;
                    if (!compatibleIds) {
                        continue;
                    }

                    const badAssignments = this.planningData?.assignments.filter(assignment => {
                        if (Number(assignment.posteId) !== result.posteId) {
                            return false;
                        }

                        return !compatibleIds.has(String(assignment.personnelId));
                    }) ?? [];

                    for (const assignment of badAssignments) {
                        competenceConflicts.push({
                            id: `competence-${assignment.personnelId}-${assignment.day}-${assignment.id}`,
                            type: 'competence_manquante',
                            description: 'Ce personnel ne possède pas la compétence requise pour ce poste.',
                            severity: 'critical',
                            assignments: [assignment.id],
                            personnelId: assignment.personnelId,
                            day: assignment.day,
                            details: assignment.posteLabel || assignment.posteId || 'Poste incompatible',
                            suggestedFix: 'Réaffecter cette cellule à un personnel habilité.'
                        });
                    }
                }

                const baseConflicts = (this.planningData?.conflicts || []).filter(conflict => conflict.type !== 'competence_manquante');
                if (this.planningData) {
                    this.planningData.conflicts = [...baseConflicts, ...competenceConflicts];
                    this.stats = this.planningService.getStats(this.planningData);
                }
            });
    }

    private removeCompetenceConflicts(): void {
        if (!this.planningData) {
            return;
        }

        this.planningData.conflicts = (this.planningData.conflicts || []).filter(conflict => conflict.type !== 'competence_manquante');
        this.stats = this.planningService.getStats(this.planningData);
    }

    private getCompatiblePersonnelIdsForPoste(posteId: number): Observable<Set<string> | null> {
        const cached = this.compatibilityByPosteId.get(posteId);
        if (cached) {
            return of(new Set(cached));
        }

        return this.staffService.getUtilisateursDisponiblesPourPoste(posteId).pipe(
            map(users => {
                const ids = new Set((users || []).map((user: any) => String(user?.id)).filter((id: string) => id.length > 0));
                this.compatibilityByPosteId.set(posteId, ids);
                return new Set(ids);
            }),
            catchError(() => of(null))
        );
    }

    resolveConflict(conflictId: string): void {
        const target = this.planningData?.conflicts.find(item => item.id === conflictId);
        if (!target) {
            this.planningNotificationService.showInfo(`Conflit ${conflictId} sélectionné pour résolution.`);
            return;
        }

        const suggestion = target.suggestedFix || 'Réviser les affectations concernées.';
        this.planningNotificationService.showInfo(`Suggestion: ${suggestion}`);
    }

    previousWeek(): void {
        if (this.periodMode === 'mois' || this.periodMode === 'personnalisee') {
            if (this.periodMode === 'mois' && this.currentView === 'mensuelle') {
                this.periodStart = new Date(this.periodStart.getFullYear(), this.periodStart.getMonth() - 1, 1);
                this.periodEnd = new Date(this.periodStart.getFullYear(), this.periodStart.getMonth() + 1, 0);
                this.weekStart = this.pickWeekStartInPeriod();
                this.refreshWeekLabels();
                this.loadPlanning();
                return;
            }

            // Navigation semaine par semaine à l'intérieur de la période
            const firstMonday = this.getFirstMondayInPeriod();
            const prev = new Date(this.weekStart);
            prev.setDate(prev.getDate() - 7);
            this.weekStart = prev < firstMonday ? firstMonday : prev;
            this.refreshWeekLabels();
            this.loadPlanning();
            return;
        }

        const delta = this.currentView === 'journaliere' ? 1 : 7;
        const next = new Date(this.weekStart);
        next.setDate(next.getDate() - delta);
        this.weekStart = next;
        this.periodStart = new Date(this.weekStart);
        this.periodEnd = this.currentView === 'journaliere' ? new Date(this.weekStart) : this.toSunday(this.weekStart);
        this.refreshWeekLabels();
        this.loadPlanning();
    }

    nextWeek(): void {
        if (this.periodMode === 'mois' || this.periodMode === 'personnalisee') {
            if (this.periodMode === 'mois' && this.currentView === 'mensuelle') {
                this.periodStart = new Date(this.periodStart.getFullYear(), this.periodStart.getMonth() + 1, 1);
                this.periodEnd = new Date(this.periodStart.getFullYear(), this.periodStart.getMonth() + 1, 0);
                this.weekStart = this.pickWeekStartInPeriod();
                this.refreshWeekLabels();
                this.loadPlanning();
                return;
            }

            // Navigation semaine par semaine à l'intérieur de la période
            const next = new Date(this.weekStart);
            next.setDate(next.getDate() + 7);
            if (next <= this.periodEnd) {
                this.weekStart = next;
            }
            this.refreshWeekLabels();
            this.loadPlanning();
            return;
        }

        const delta = this.currentView === 'journaliere' ? 1 : 7;
        const next = new Date(this.weekStart);
        next.setDate(next.getDate() + delta);
        this.weekStart = next;
        this.periodStart = new Date(this.weekStart);
        this.periodEnd = this.currentView === 'journaliere' ? new Date(this.weekStart) : this.toSunday(this.weekStart);
        this.refreshWeekLabels();
        this.loadPlanning();
    }

    goToday(): void {
        const now = new Date();
        if (this.periodMode === 'mois') {
            if (now >= this.periodStart && now <= this.periodEnd) {
                this.weekStart = this.currentView === 'hebdomadaire' ? this.toMonday(now) : new Date(now);
            } else {
                this.weekStart = new Date(this.periodStart);
            }

            if (this.weekStart < this.periodStart) {
                this.weekStart = new Date(this.periodStart);
            }
            this.refreshWeekLabels();
            return;
        }

        this.weekStart = this.currentView === 'hebdomadaire' ? this.toMonday(now) : new Date(now);
        this.periodStart = new Date(this.weekStart);
        this.periodEnd = this.currentView === 'journaliere' ? new Date(this.weekStart) : this.toSunday(this.weekStart);
        this.refreshWeekLabels();
        this.loadPlanning();
    }

    onViewChanged(view: 'hebdomadaire' | 'journaliere' | 'mensuelle'): void {
        if (this.periodMode === 'mois' || this.periodMode === 'personnalisee') {
            this.currentView = 'hebdomadaire';
        } else {
            this.currentView = view;
        }

        if (this.periodMode === 'mois') {
            this.weekStart = new Date(this.periodStart);
        }
        this.refreshWeekLabels();
    }

    onFilterChanged(filter: 'all' | 'medecin' | 'infirmier' | 'vacant'): void {
        this.currentFilter = filter;
    }

    onPeriodModeChanged(mode: 'semaine' | 'mois' | 'personnalisee'): void {
        if (this.periodMode === mode) {
            return;
        }

        this.periodMode = mode;
        // Appliquer immédiatement la période sélectionnée pour éviter une validation
        // avec des bornes obsolètes (ex: rester sur une seule semaine).
        this.applyPeriod();
    }

    onServiceChanged(serviceId: string): void {
        if (!serviceId || serviceId === this.currentService?.id) {
            return;
        }

        // Toujours naviguer vers la semaine courante (lundi-dimanche de cette semaine)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const newWeekStart = new Date(today);
        newWeekStart.setDate(today.getDate() + mondayDiff);
        newWeekStart.setHours(0, 0, 0, 0);
        const newWeekEnd = this.toSunday(newWeekStart);

        const y = newWeekStart.getFullYear();
        const m = String(newWeekStart.getMonth() + 1).padStart(2, '0');
        const d = String(newWeekStart.getDate()).padStart(2, '0');
        const weekStartStr = `${y}-${m}-${d}`;

        this.weekStart = newWeekStart;
        this.weekEnd = newWeekEnd;
        this.periodStart = new Date(newWeekStart);
        this.periodEnd = new Date(newWeekEnd);
        this.periodStartInput = weekStartStr;
        this.refreshWeekLabels();
        console.log('📅 Navigation vers semaine courante:', weekStartStr);

        // Déclencher le changement de service (loadPlanning utilisera la semaine courante)
        this.currentServiceService.setCurrentService(serviceId);
        const numericServiceId = Number(serviceId);
        if (Number.isFinite(numericServiceId) && numericServiceId > 0) {
            this.serviceSelectionService.setCurrentService(numericServiceId);
        }
    }

    dismissToast(id: string): void {
        this.planningNotificationService.dismiss(id);
    }

    @HostListener('window:keydown.control.z', ['$event'])
    onUndoShortcut(event: Event): void {
        const keyboardEvent = event as KeyboardEvent;
        keyboardEvent.preventDefault();
        this.undo();
    }

    @HostListener('window:keydown.control.y', ['$event'])
    onRedoShortcut(event: Event): void {
        const keyboardEvent = event as KeyboardEvent;
        keyboardEvent.preventDefault();
        this.redo();
    }

    @HostListener('window:click')
    onWindowClick(): void {
        this.hideContextMenu();
    }

    @HostListener('window:mouseup')
    onWindowMouseUp(): void {
        this.isSelecting = false;
    }

    @HostListener('window:mousemove', ['$event'])
    onWindowMouseMove(event: MouseEvent): void {
        this.cursorPreviewX = event.clientX + 14;
        this.cursorPreviewY = event.clientY + 14;
    }

    undo(): void {
        if (!this.planningData || this.undoStack.length === 0) {
            return;
        }

        const previous = this.undoStack.pop()!;
        this.redoStack.push(this.allDaysPlanning.map(item => ({ ...item })));
        this.allDaysPlanning = previous.map(item => ({ ...item }));
        this.syncLocalPlanningState();
        this.planningNotificationService.showInfo('Dernière action annulée.');
    }

    redo(): void {
        if (!this.planningData || this.redoStack.length === 0) {
            return;
        }

        const next = this.redoStack.pop()!;
        this.undoStack.push(this.allDaysPlanning.map(item => ({ ...item })));
        this.allDaysPlanning = next.map(item => ({ ...item }));
        this.syncLocalPlanningState();
        this.planningNotificationService.showInfo('Action rétablie.');
    }

    trackByToast(_: number, toast: PlanningToast): string {
        return toast.id;
    }

    private pushUndoState(): void {
        if (!this.planningData) {
            return;
        }
        this.undoStack.push(this.allDaysPlanning.map(item => ({ ...item })));
        if (this.undoStack.length > 30) {
            this.undoStack.shift();
        }
    }

    private refreshWeekLabels(): void {
        const daysCount = this.getPeriodLength();
        let periodEnd = new Date(this.weekStart);
        periodEnd.setDate(periodEnd.getDate() + daysCount - 1);
        if ((this.periodMode === 'mois' || this.periodMode === 'personnalisee') && periodEnd > this.periodEnd) {
            periodEnd = new Date(this.periodEnd);
        }
        this.weekEnd = periodEnd;

        this.weekLabel = `Période: ${this.weekStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - ${periodEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`;

        this.dayDates = Array.from({ length: daysCount }).map((_, day) => {
            const current = new Date(this.weekStart);
            current.setDate(current.getDate() + day);
            return current;
        });

        this.weekDays = this.dayDates.map(current => {
            const dayName = current.toLocaleDateString('fr-FR', { weekday: 'short' });
            const dayNumber = current.toLocaleDateString('fr-FR', { day: '2-digit' });
            return `${dayName} ${dayNumber}`;
        });

        this.periodStartInput = this.toInputDate(this.periodStart);
        this.customStartInput = this.toInputDate(this.periodStart);
        this.customEndInput = this.toInputDate(this.periodEnd);
        this.monthInput = this.toInputMonth(this.periodStart);
    }

    private getAssignmentAtCell(personnelId: string, day: number): Assignment | undefined {
        return this.visibleAssignments.find(item => item.personnelId === personnelId && item.day === day);
    }

    private propagateCurrentWeekAcrossSelectedPeriodIfNeeded(): Observable<number> {
        if (!this.planningData || !this.currentService) {
            return of(0);
        }

        if (this.periodMode === 'semaine') {
            return of(0);
        }

        const sourceAssignments = this.allDaysPlanning;
        if (sourceAssignments.length === 0) {
            return of(0);
        }

        // Trouver toutes les semaines (lundis) dans la période
        const bounds = this.getActionPeriodBounds();
        const targetWeeks: Date[] = [];
        const firstMonday = this.getFirstMondayAtOrAfter(bounds.start);
        const d = new Date(firstMonday);
        while (d <= bounds.end) {
            targetWeeks.push(new Date(d));
            d.setDate(d.getDate() + 7);
        }

        if (targetWeeks.length === 0) {
            return of(0);
        }

        // Sauvegarder les affectations de la semaine source sur chaque semaine cible
        // en séquentiel pour éviter les deadlocks MySQL.
        return from(targetWeeks).pipe(
            concatMap(targetWeek => {
                const targetEnd = this.getEffectiveWeekEnd(targetWeek, bounds.end);
                const cloned = this.cloneAssignmentsForPeriodWeek(sourceAssignments, targetWeek, targetEnd, true);

                return this.planningService.replaceAssignmentsRaw(
                    this.currentService!.id,
                    this.currentService!.name,
                    targetWeek,
                    targetEnd,
                    cloned
                ).pipe(
                    map(() => cloned.length),
                    catchError(() => of(0))
                );
            }),
            toArray(),
            map(counts => counts.reduce((sum, current) => sum + current, 0)),
            catchError(() => of(0))
        );
    }

    private loadPersonnelFromService(): void {
        if (!this.currentService || !this.planningData) {
            return;
        }

        // Get user context and calculate perimeter filter
        const userContext = this.authService.getCurrentUser();
        const filter = this.perimeterService.getPerimeterFilter(userContext);
        console.log('🔐 Planning - loadPersonnelFromService - Filtre appliqué:', filter);

        // Use perimeter-filtered staff loading
        this.staffService.getAllWithPerimeter(filter)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (users) => {
                    const mapped = this.mapStaffToPersonnel(users || []);
                    let personnelToUse: Personnel[];

                    if (filter.filterType === 'service' && filter.serviceId) {
                        // Chef de service : uniquement SON propre service (userContext.serviceId)
                        // Pas le service sélectionné dans le dropdown
                        const ownServiceId = filter.serviceId;
                        personnelToUse = (mapped as any[]).filter(user => {
                            const uid = Number(
                                user.serviceId
                                ?? user.service_id
                                ?? user.service?.id
                                ?? null
                            );
                            return Number.isFinite(uid) && uid === ownServiceId;
                        }) as Personnel[];
                        console.log(`🔒 Chef de service: filtrage par serviceId=${ownServiceId} → ${personnelToUse.length} personnel(s)`);

                    } else if (filter.filterType === 'pole' && filter.poleId) {
                        // Chef de pôle : filtrer par le SERVICE sélectionné dans le dropdown
                        // (les services disponibles sont déjà restreints à son pôle)
                        personnelToUse = this.filterPersonnelByService(mapped, this.currentService!);
                        console.log(`🔒 Chef de pôle: filtrage par service sélectionné "${this.currentService!.name}" → ${personnelToUse.length} personnel(s)`);

                    } else {
                        // Super-admin, admin-gta, validateur-rh : filtrer par service sélectionné dans le dropdown
                        personnelToUse = this.filterPersonnelByService(mapped, this.currentService!);
                        console.log(`🌐 Filtre global: service="${this.currentService!.name}" → ${personnelToUse.length} personnel(s)`);
                    }

                    this.planningService.replacePersonnel(
                        this.planningData!.id,
                        personnelToUse,
                        `Synchronisation personnel du service ${this.currentService!.name}`
                    ).subscribe();
                },
                error: () => {
                    this.planningNotificationService.showWarning('Impossible de charger les employés API, fallback utilisé.');
                }
            });
    }

    private applyAutomaticRestAfterGuard(guardAssignment: Assignment): void {
        if (!this.planningData) {
            return;
        }

        const nextDay = guardAssignment.day + 1;
        if (nextDay >= this.getTotalPeriodLength()) {
            return;
        }

        const alreadyAssigned = this.getAssignmentAtCell(guardAssignment.personnelId, nextDay);
        if (alreadyAssigned) {
            return;
        }

        const restAssignment: Assignment = {
            id: `${guardAssignment.personnelId}-${nextDay}-repos`,
            personnelId: guardAssignment.personnelId,
            day: nextDay,
            shiftType: 'conges',
            posteLabel: 'Repos'
        };

        this.applyLocalAssignment(restAssignment);
        this.planningNotificationService.showInfo(`Repos ajouté automatiquement pour J${nextDay + 1} (brouillon local).`);
    }

    private applyLocalAssignment(assignment: Assignment, previousAssignmentId?: string): void {
        const shouldRemovePrevious = !!previousAssignmentId && previousAssignmentId !== assignment.id;
        if (shouldRemovePrevious) {
            this.allDaysPlanning = this.allDaysPlanning.filter(item => item.id !== previousAssignmentId);
        }

        const index = this.allDaysPlanning.findIndex(item => item.id === assignment.id);
        const nextAssignment = {
            ...assignment,
            createdAt: assignment.createdAt || new Date(),
            updatedAt: new Date()
        };

        if (index >= 0) {
            this.allDaysPlanning[index] = nextAssignment;
        } else {
            this.allDaysPlanning.push(nextAssignment);
        }

        this.syncLocalPlanningState();
    }

    private syncLocalPlanningState(): void {
        if (!this.planningData) {
            return;
        }

        this.planningData.assignments = this.allDaysPlanning.map(item => ({ ...item }));
        this.stats = this.planningService.getStats(this.planningData);
        this.lastSavedAt = new Date();
        this.hasUnsavedChanges = true;
        this.refreshCompetenceConflicts();
    }

    private filterUsersByServiceId(users: any[], serviceId: number): any[] {
        return users.filter(user => {
            const primaryServiceId = Number(
                user?.serviceId
                ?? user?.service?.id
                ?? user?.service_id
                ?? null
            );

            if (Number.isFinite(primaryServiceId) && primaryServiceId === serviceId) {
                return true;
            }

            const affectations = Array.isArray(user?.affectations) ? user.affectations : [];
            return affectations.some((aff: any) => {
                const affectationServiceId = Number(
                    aff?.serviceId
                    ?? aff?.service?.id
                    ?? aff?.service_id
                    ?? null
                );
                return Number.isFinite(affectationServiceId) && affectationServiceId === serviceId;
            });
        });
    }

    private loadPostesCatalog(): void {
        forkJoin({
            postes: this.posteService.getPostes(),
            services: this.posteService.getServices()
        })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: ({ postes, services }) => {
                    const mapped = this.mapApiPostesToCatalog(postes || [], services || []);
                    this.postesCatalog = this.filterPostesForCurrentService(mapped);
                    this.postesFallbackActive = false;
                    this.hasShownPostesFallbackToast = false;
                },
                error: () => {
                    this.postesFallbackActive = true;
                    this.postesCatalog = this.loadPostesCatalogFromLocal();
                    if (!this.hasShownPostesFallbackToast) {
                        this.hasShownPostesFallbackToast = true;
                        this.planningNotificationService.showWarning('Postes chargés en mode local (API indisponible).');
                    }
                }
            });
    }

    private mapApiPostesToCatalog(postes: Poste[], services: ServiceOption[]): PlanningPoste[] {
        const serviceNameById = new Map<number, string>(services.map(service => [service.id, service.nom]));

        return postes
            .filter(poste => poste?.actif !== false)
            .map(poste => {
                const names = (poste.servicesAutorises || [])
                    .map(id => serviceNameById.get(id))
                    .filter((name): name is string => !!name);

                return {
                    id: String(poste.id ?? poste.code ?? poste.nom),
                    code: String(poste.code ?? poste.nom ?? 'POSTE'),
                    nom: String(poste.nom ?? 'Poste'),
                    type: this.normalizeShiftType(poste.type),
                    heureDebut: String(poste.heureDebut ?? '08:00'),
                    heureFin: String(poste.heureFin ?? '16:00'),
                    actif: poste.actif !== false,
                    serviceName: names.length > 0 ? names.join(', ') : undefined
                } as PlanningPoste;
            });
    }

    private filterPostesForCurrentService(postes: PlanningPoste[]): PlanningPoste[] {
        if (!this.currentService || this.currentService.id === 'all') {
            return this.deduplicatePostes(postes);
        }

        const selectedName = this.currentService.name.toLowerCase();
        const filtered = postes.filter(item => !item.serviceName || item.serviceName.toLowerCase().includes(selectedName));
        return this.deduplicatePostes(filtered.length > 0 ? filtered : postes);
    }

    private deduplicatePostes(postes: PlanningPoste[]): PlanningPoste[] {
        const seen = new Set<string>();
        return postes.filter(poste => {
            const key = [
                (poste.nom || '').trim().toLowerCase(),
                (poste.heureDebut || '').trim(),
                (poste.heureFin || '').trim(),
                String(poste.type || '').trim().toLowerCase()
            ].join('|');

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
    }

    private loadPostesCatalogFromLocal(): PlanningPoste[] {
        const raw = localStorage.getItem(PlanningPageComponent.POSTE_CATALOG_STORAGE_KEY);
        if (!raw) {
            return [
                { id: 'MATIN', code: 'MATIN', nom: 'Matin', type: 'jour', heureDebut: '07:00', heureFin: '14:00', actif: true },
                { id: 'APMIDI', code: 'APMIDI', nom: 'Après-midi', type: 'jour', heureDebut: '14:00', heureFin: '21:00', actif: true },
                { id: 'NUIT', code: 'NUIT', nom: 'Nuit', type: 'nuit', heureDebut: '21:00', heureFin: '07:00', actif: true }
            ];
        }

        try {
            const parsed = JSON.parse(raw) as any[];
            const mapped = parsed
                .filter(item => item?.actif !== false)
                .map(item => ({
                    id: String(item.id ?? item.code ?? item.nom),
                    code: String(item.code ?? item.nom ?? 'POSTE'),
                    nom: String(item.nom ?? 'Poste'),
                    type: this.normalizeShiftType(item.type),
                    heureDebut: String(item.heureDebut ?? '08:00'),
                    heureFin: String(item.heureFin ?? '16:00'),
                    actif: item.actif !== false,
                    serviceName: this.resolvePosteServiceName(item)
                } as PlanningPoste));

            return this.filterPostesForCurrentService(mapped);
        } catch {
            return [];
        }
    }

    private mapStaffToPersonnel(users: any[]): Personnel[] {
        return users.map((user, index) => {
            const userId = user.id ?? `staff-${index + 1}`;
            const cachedPhoto = typeof localStorage !== 'undefined'
                ? localStorage.getItem(`staff_photo_${userId}`) ?? undefined
                : undefined;
            const personnel: any = {
                id: String(userId),
                nom: String(user.nom ?? user.lastName ?? 'Utilisateur'),
                prenom: String(user.prenom ?? user.firstName ?? 'Sans prénom'),
                role: String(user.role ?? user.poste ?? 'Personnel'),
                specialty: String(user.specialite ?? user.specialty ?? 'Général'),
                category: this.resolveCategory(user),
                status: this.resolveStatus(user),
                avatar: (user.photo as string | null | undefined) || cachedPhoto
            };
            // Ajout des propriétés nécessaires pour le filtrage strict
            if (user.poleId !== undefined) personnel.poleId = user.poleId;
            if (user.pole_id !== undefined) personnel.poleId = user.pole_id;
            if (user.serviceId !== undefined) personnel.serviceId = user.serviceId;
            if (user.service_id !== undefined) personnel.serviceId = user.service_id;
            if (user.affectations !== undefined) personnel.affectations = user.affectations;
            if (user.service && user.service.poleId !== undefined) personnel.servicePoleId = user.service.poleId;
            return personnel;
        });
    }

    private filterPersonnelByService(personnel: Personnel[], service: MedicalService): Personnel[] {
        if (service.id === 'all') {
            return personnel;
        }

        const numericServiceId = Number(service.id);
        if (Number.isFinite(numericServiceId) && numericServiceId > 0) {
            return this.filterUsersByServiceId(personnel as any[], numericServiceId) as Personnel[];
        }

        const normalizedService = service.name.toLowerCase();
        return personnel.filter(item => {
            const text = `${item.role} ${item.specialty}`.toLowerCase();
            return text.includes(normalizedService);
        });
    }

    private resolveCategory(user: any): Personnel['category'] {
        const raw = String(user.category ?? user.type ?? user.role ?? '').toLowerCase();
        if (raw.includes('médecin') || raw.includes('medecin') || raw.includes('doctor')) {
            return 'medecin';
        }
        if (raw.includes('infirm')) {
            return 'infirmier';
        }
        return 'autre';
    }

    private resolveStatus(user: any): Personnel['status'] {
        const raw = String(user.status ?? user.etat ?? '').toLowerCase();
        if (raw.includes('conge')) {
            return 'conges';
        }
        if (raw.includes('formation')) {
            return 'formation';
        }
        if (raw.includes('indispo')) {
            return 'indisponible';
        }
        return 'disponible';
    }

    private normalizeShiftType(rawType: any): ShiftType {
        const value = String(rawType ?? '').toLowerCase();
        if (value.includes('nuit')) {
            return 'nuit';
        }
        if (value.includes('garde')) {
            return 'garde';
        }
        if (value.includes('astreinte')) {
            return 'astreinte';
        }
            if (value.includes('repos') || value.includes('repo')) {
                return 'repos';
            }
        if (value.includes('conge')) {
            return 'conges';
        }
        if (value.includes('formation')) {
            return 'formation';
        }
        return 'jour';
    }

    private resolvePosteServiceName(item: any): string | undefined {
        if (item.serviceName) {
            return String(item.serviceName);
        }

        if (Array.isArray(item.servicesAutorises) && item.servicesAutorises.length > 0) {
            const first = item.servicesAutorises[0];
            if (typeof first === 'string') {
                return first;
            }
            if (first?.nom) {
                return String(first.nom);
            }
        }

        return undefined;
    }

    private toMonday(date: Date): Date {
        const monday = new Date(date);
        const day = monday.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        monday.setDate(monday.getDate() + diff);
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    private toSunday(date: Date): Date {
        const sunday = new Date(this.toMonday(date));
        sunday.setDate(sunday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return sunday;
    }

    private toInputDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    private toInputMonth(date: Date): string {
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        return `${date.getFullYear()}-${month}-01`;
    }

    private getPeriodLength(): number {
        // En mode mois/période personnalisée, la page planning doit toujours afficher une semaine.
        if (this.periodMode === 'mois' || this.periodMode === 'personnalisee') {
            return 7;
        }

        if (this.currentView === 'journaliere') {
            return 1;
        }

        if (this.currentView === 'hebdomadaire') {
            return 7;
        }

        if (this.currentView === 'mensuelle') {
            const start = new Date(this.weekStart.getFullYear(), this.weekStart.getMonth(), 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            return end.getDate();
        }

        return 7;
    }

    /** Retourne le premier lundi à l'intérieur de la période (>= periodStart). */
    private getFirstMondayInPeriod(): Date {
        const d = new Date(this.periodStart);
        const dow = d.getDay();
        if (dow !== 1) {
            d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
        }
        return d;
    }

    /** Retourne le premier lundi >= start, indépendamment de l'état courant periodStart. */
    private getFirstMondayAtOrAfter(start: Date): Date {
        const d = new Date(start);
        const dow = d.getDay();
        if (dow !== 1) {
            d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
        }
        d.setHours(0, 0, 0, 0);
        return d;
    }

    private getEffectiveWeekEnd(weekStart: Date, periodEnd?: Date): Date {
        const weekEnd = this.toSunday(weekStart);
        if (!periodEnd || weekEnd <= periodEnd) {
            return weekEnd;
        }

        return new Date(periodEnd);
    }

    private cloneAssignmentsForPeriodWeek(
        sourceAssignments: Assignment[],
        weekStart: Date,
        weekEnd: Date,
        includeUpdatedAt = false
    ): Assignment[] {
        const weekLabel = this.toInputDate(weekStart);
        const maxDayIndex = Math.max(0, Math.floor((weekEnd.getTime() - weekStart.getTime()) / 86400000));

        return sourceAssignments
            .filter(assignment => assignment.day >= 0 && assignment.day <= maxDayIndex)
            .map(assignment => ({
                ...assignment,
                id: `${assignment.personnelId}-${assignment.day}-${weekLabel}`,
                ...(includeUpdatedAt ? { updatedAt: new Date() } : {})
            }));
    }

    private getPeriodSplitSummary(start: Date, end: Date): {
        totalLabel: string;
        submittedLabel: (done: number, total: number) => string;
    } {
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
        const fullWeeks = Math.floor(totalDays / 7);
        const remainingDays = totalDays % 7;

        const totalLabel = remainingDays === 0
            ? `${fullWeeks} semaine(s)`
            : `${fullWeeks} semaine(s) et ${remainingDays} jour(s)`;

        const submittedLabel = (done: number, total: number) => {
            const plural = done === 1 ? 'bloc' : 'blocs';
            return `${done}/${total} ${plural} soumis (${totalLabel})`;
        };

        return { totalLabel, submittedLabel };
    }

    /** Calcule les bornes effectives (début/fin) à partir des champs de saisie,
     *  afin de garantir la propagation correcte en mode mois/période même sans clic sur Charger. */
    private getActionPeriodBounds(): { start: Date; end: Date } {
        if (this.periodMode === 'mois') {
            const monthDate = this.monthInput ? new Date(this.monthInput) : new Date();
            const source = Number.isNaN(monthDate.getTime()) ? new Date() : monthDate;
            const start = new Date(source.getFullYear(), source.getMonth(), 1);
            const end = new Date(source.getFullYear(), source.getMonth() + 1, 0);
            this.periodStart = start;
            this.periodEnd = end;
            return { start, end };
        }

        if (this.periodMode === 'personnalisee') {
            const rawStart = this.customStartInput ? new Date(this.customStartInput) : this.periodStart;
            const rawEnd = this.customEndInput ? new Date(this.customEndInput) : this.periodEnd;
            const start = Number.isNaN(rawStart.getTime()) ? new Date(this.periodStart) : rawStart;
            const endCandidate = Number.isNaN(rawEnd.getTime()) ? new Date(this.periodEnd) : rawEnd;
            const end = endCandidate < start ? new Date(start) : endCandidate;
            this.periodStart = start;
            this.periodEnd = end;
            return { start, end };
        }

        const start = new Date(this.periodStart);
        const end = new Date(this.periodEnd);
        return { start, end };
    }

    /** Choisit le weekStart approprié lors d'une entrée dans un mode mois/période.
     *  Préfère le lundi de la semaine courante s'il est dans la période, sinon le premier lundi. */
    private pickWeekStartInPeriod(): Date {
        const todayMonday = this.toMonday(new Date());
        const firstMonday = this.getFirstMondayInPeriod();
        if (todayMonday >= firstMonday && todayMonday <= this.periodEnd) {
            return todayMonday;
        }
        return firstMonday;
    }

    private getVisibleDayOffset(): number {
        return 0;
    }

    private toAbsoluteDay(localDay: number): number {
        return this.getVisibleDayOffset() + localDay;
    }

    private getTotalPeriodLength(): number {
        const diff = Math.floor((this.periodEnd.getTime() - this.periodStart.getTime()) / 86400000) + 1;
        return Math.max(diff, 1);
    }

    private toCellKey(personnelId: string, day: number): string {
        return `${personnelId}::${day}`;
    }

    private getMissingAssignmentsCount(): number {
        if (!this.planningData || this.weekDays.length === 0) {
            return 0;
        }

        const personnel = this.planningData.personnel || [];
        const assignments = this.planningData.assignments || [];
        const assignedCells = new Set(assignments.map(a => `${a.personnelId}::${a.day}`));

        let missing = 0;
        for (const person of personnel) {
            for (let day = 0; day < this.weekDays.length; day++) {
                // Samedi/Dimanche autorisés vides.
                const currentDate = this.dayDates[day];
                const dayOfWeek = currentDate?.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    continue;
                }

                const key = `${person.id}::${this.toAbsoluteDay(day)}`;
                if (!assignedCells.has(key)) {
                    missing++;
                }
            }
        }

        return missing;
    }

    private createVersion(action: string): void {
        if (!this.planningData || !this.currentService) {
            return;
        }

        const author = localStorage.getItem('nom') || 'Gestionnaire';
        this.planningService.saveVersion({
            serviceId: this.currentService.id,
            serviceName: this.currentService.name,
            weekStart: this.weekStart,
            weekEnd: this.weekEnd,
            author,
            comment: action,
            assignmentsCount: this.allDaysPlanning.length
        })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: entry => {
                    const safeCreatedAt = entry.createdAt instanceof Date && !Number.isNaN(entry.createdAt.getTime())
                        ? entry.createdAt
                        : new Date();

                    this.versionHistory = [entry, ...this.versionHistory.filter(item => item.id !== entry.id)];
                    this.currentVersion = entry.versionLabel;
                    this.lastSavedAt = safeCreatedAt;
                    this.planningData!.history.unshift({
                        id: entry.id,
                        at: safeCreatedAt,
                        author: entry.author,
                        action,
                        details: `${entry.versionLabel} (${entry.assignmentsCount} affectations)`
                    });

                    if (action.includes('Soumission')) {
                        this.planningNotificationService.showInfo('Planning soumis pour validation (workflow Module 3).');
                    } else {
                        this.planningNotificationService.showSuccess('Brouillon sauvegardé.');
                    }
                },
                error: () => {
                    this.planningNotificationService.showError('Impossible de sauvegarder la version côté API.');
                }
            });
    }

    private syncDashboardServiceSelection(service: MedicalService | null): void {
        if (!service) {
            return;
        }

        const numericServiceId = Number(service.id);
        if (!Number.isFinite(numericServiceId) || numericServiceId <= 0) {
            return;
        }

        this.serviceSelectionService.setCurrentService(numericServiceId);
    }

    private loadVersionHistory(showToast = false): void {
        if (!this.currentService) {
            this.versionHistory = [];
            return;
        }

        this.planningService.getVersions(this.currentService.id, this.periodStart, this.periodEnd)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: versions => {
                    this.versionHistory = versions;
                    if (versions.length > 0) {
                        this.currentVersion = versions[0].versionLabel;
                        this.lastSavedAt = versions[0].createdAt;
                    }

                    if (showToast) {
                        if (versions.length === 0) {
                            this.planningNotificationService.showInfo('Aucune version disponible.');
                            return;
                        }

                        const summary = versions
                            .slice(0, 5)
                            .map(item => `${item.versionLabel} • ${new Date(item.createdAt).toLocaleString('fr-FR')} • ${item.author}`)
                            .join('\n');
                        this.planningNotificationService.showInfo(`Historique:\n${summary}`);
                    }
                },
                error: () => {
                    if (showToast) {
                        this.planningNotificationService.showError('Impossible de charger l\'historique des versions.');
                    }
                }
            });
    }

    private loadPlanningOverview(): void {
        if (!this.currentService) {
            this.planningOverviewRows = [];
            return;
        }

        this.loadingOverview = true;
        this.planningService
            .getPlanningOverview(this.currentService.id, this.periodStart)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: rows => {
                    this.planningOverviewRows = rows || [];
                    this.loadingOverview = false;
                },
                error: () => {
                    this.planningOverviewRows = [];
                    this.loadingOverview = false;
                }
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
