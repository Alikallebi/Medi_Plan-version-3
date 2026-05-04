import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { environment } from 'src/environments/environment';
import { CurrentServiceService, ServiceDashboardSnapshot } from '../../service/current-service.service';
import { DashboardService, DashboardData, PlanningDataResponse } from '../../service/dashboard.service';
import { ServiceSelectionService } from '../../service/service-selection.service';
import { AuthService } from '../../service/auth.service';
import { PerimeterService, PerimeterFilter } from '../../service/perimeter.service';
import { normalizeRole } from 'src/app/features/workflow/models/user-context.model';

interface PlanningCell {
    status?: 'jour' | 'nuit' | 'garde' | 'astreinte' | 'conflit' | 'conges' | 'formation' | 'repos';
    note?: string;
    personnel?: string;
    conflictWith?: string[];
    startTime?: string;
    endTime?: string;
}

interface PlanningRow {
    id: string;
    name: string;
    role: string;
    avatar?: string;
    specialty: string;
    cells: PlanningCell[];
    stats?: {
        totalHours: number;
        nightShifts: number;
        weekendShifts: number;
    };
}

interface StatItem {
    label: string;
    value: number;
    target: number;
    subLabel: string;
    color: string;
    icon: string;
    trend: 'up' | 'down' | 'stable';
    trendValue?: number;
}

interface Notification {
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

interface WorkflowStep {
    id: string;
    title: string;
    subtitle: string;
    status: 'done' | 'pending' | 'blocked' | 'in-progress';
    statusLabel: string;
    assignedTo?: string;
    dueDate?: Date;
    comments?: number;
}

interface AISuggestion {
    id: string;
    text: string;
    impact: 'high' | 'medium' | 'low';
    category: 'optimisation' | 'conflit' | 'remplacement' | 'equilibre';
    actionable: boolean;
}

interface PersonnelAvailability {
    id: string;
    name: string;
    status: 'disponible' | 'indisponible' | 'conges' | 'formation';
    nextAvailable?: string;
    reason?: string;
}

interface CalendarAssignmentItem {
    status: 'jour' | 'nuit' | 'garde' | 'astreinte' | 'conflit' | 'conges' | 'formation' | 'repos';
    label: string;
    personnel: string;
    tooltip: string;
    timeRange?: string;
    specialty?: string;
}

interface ShiftCount {
    morning: number;
    afternoon: number;
    night: number;
    special: number;
}

interface CalendarMonthCell {
    date: Date;
    dayNumber: number;
    dayName: string;
    isToday: boolean;
    inCurrentMonth: boolean;
    hasConflict: boolean;
    items: CalendarAssignmentItem[];
    remainingCount: number;
    shiftCounts?: ShiftCount;
}

interface DayTimelineSlot {
    status: 'jour' | 'nuit' | 'garde' | 'astreinte' | 'conflit' | 'conges' | 'formation' | 'repos';
    note?: string;
    timeRange?: string;
}

type ShiftPlacement = 'morning' | 'afternoon' | 'night' | 'special';

interface DayTimelineRow {
    id: string;
    name: string;
    role: string;
    specialty: string;
    avatar?: string;
    morning: DayTimelineSlot | null;
    afternoon: DayTimelineSlot | null;
    night: DayTimelineSlot | null;
    special: DayTimelineSlot | null;
    hasConflict: boolean;
}

interface DayShiftGroups {
    morning: CalendarAssignmentItem[];
    afternoon: CalendarAssignmentItem[];
    night: CalendarAssignmentItem[];
    special: CalendarAssignmentItem[];
}

interface DayDetailSection {
    key: 'planning' | 'hs';
    badge: string;
    title: string;
    emptyLabel: string;
    items: CalendarAssignmentItem[];
}

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
    isLoading = false;
    selectedDate = new Date();
    serviceLabel = 'Chargement...';
    weekLabel = 'Semaine 25 - 31 Mars 2024';
    autoSelectedWeek = false;
    autoSelectedWeekReason = '';
    planningPeriodTypeLabel = '';
    planningWorkflowLabel = '';
    activeViewMode: 'month' | 'week' | 'day' = 'day';
    sidebarCollapsed = false;
    searchQuery = '';
    selectedDayDetail: CalendarMonthCell | null = null;
    selectedAssignment: CalendarAssignmentItem | null = null;
    weekdayHeaders = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    defaultAvatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%25" stop-color="%230B3B5F"/><stop offset="100%25" stop-color="%232C7DA0"/></linearGradient></defs><rect width="80" height="80" rx="40" fill="url(%23g)"/><circle cx="40" cy="31" r="14" fill="%23d8e9f5"/><path d="M16 68c3-12 13-20 24-20s21 8 24 20" fill="%23d8e9f5"/></svg>';
    private draggedShift: { personId: string; placement: ShiftPlacement } | null = null;
    private readonly dayPlacementOverrides = new Map<string, ShiftPlacement>();
    private readonly monthAssignmentsByDate = new Map<string, CalendarAssignmentItem[]>();
    private currentPlanningServiceId: string | null = null;
    private currentPlanningServiceName = '';
    private currentPerimeterFilter: PerimeterFilter | null = null;
    private loadedMonthCacheKey = '';
    
    // Gestion de l'absence de planning
    hasPlanning = true;
    noPlanningMessage = '';
    planningPendingValidation = false;
    planningWorkflowStatus = '';
    private loadedPlanningWeekStart: Date | null = null;
    private loadedPlanningWeekEnd: Date | null = null;
    
    // Données pour le planning
    planningDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    planningDaysShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    
    planningRows: PlanningRow[] = [
        {
            id: '1',
            name: 'Dr. Sophie Dupont',
            role: 'Médecin senior',
            specialty: 'Cardiologie interventionnelle',
            cells: [
                { status: 'jour', note: 'Consultations', personnel: 'Dr. Dupont' },
                { status: 'jour', note: 'Consultations', personnel: 'Dr. Dupont' },
                { status: 'nuit', note: 'Garde', personnel: 'Dr. Dupont' },
                { status: 'conflit', note: 'Conflit horaire', personnel: 'Dr. Dupont', conflictWith: ['Dr. Martin'] },
                { status: 'jour', note: 'Procédures', personnel: 'Dr. Dupont' },
                { status: 'garde', note: 'Astreinte', personnel: 'Dr. Dupont' },
                { status: 'repos' }
            ],
            stats: {
                totalHours: 42,
                nightShifts: 2,
                weekendShifts: 1
            }
        },
        {
            id: '2',
            name: 'Dr. Thomas Martin',
            role: 'Médecin',
            specialty: 'Rythmologie',
            cells: [
                { status: 'nuit', note: 'Garde nuit', personnel: 'Dr. Martin' },
                { status: 'nuit', note: 'Garde nuit', personnel: 'Dr. Martin' },
                { status: 'repos' },
                { status: 'jour', note: 'Consultations', personnel: 'Dr. Martin' },
                { status: 'jour', note: 'Consultations', personnel: 'Dr. Martin' },
                { status: 'jour', note: 'Consultations', personnel: 'Dr. Martin' },
                { status: 'repos' }
            ],
            stats: {
                totalHours: 38,
                nightShifts: 2,
                weekendShifts: 0
            }
        },
        {
            id: '3',
            name: 'Marie Rossi',
            role: 'Infirmière coordinatrice',
            specialty: 'Soins intensifs',
            cells: [
                { status: 'jour', note: 'Soins', personnel: 'M. Rossi' },
                { status: 'jour', note: 'Soins', personnel: 'M. Rossi' },
                { status: 'jour', note: 'Soins', personnel: 'M. Rossi' },
                { status: 'astreinte', note: 'Astreinte', personnel: 'M. Rossi' },
                { status: 'astreinte', note: 'Astreinte', personnel: 'M. Rossi' },
                { status: 'repos' },
                { status: 'repos' }
            ],
            stats: {
                totalHours: 35,
                nightShifts: 0,
                weekendShifts: 0
            }
        },
        {
            id: '4',
            name: 'Dr. Claire Bernard',
            role: 'Chef de clinique',
            specialty: 'Imagerie cardiaque',
            cells: [
                { status: 'jour', note: 'Echographies', personnel: 'Dr. Bernard' },
                { status: 'jour', note: 'Echographies', personnel: 'Dr. Bernard' },
                { status: 'jour', note: 'Echographies', personnel: 'Dr. Bernard' },
                { status: 'jour', note: 'Staff', personnel: 'Dr. Bernard' },
                { status: 'formation', note: 'Formation', personnel: 'Dr. Bernard' },
                { status: 'formation', note: 'Formation', personnel: 'Dr. Bernard' },
                { status: 'repos' }
            ],
            stats: {
                totalHours: 32,
                nightShifts: 0,
                weekendShifts: 0
            }
        },
        {
            id: '5',
            name: 'Jean Moreau',
            role: 'Infirmier',
            specialty: 'Cardiologie',
            cells: [
                { status: 'nuit', note: 'Garde nuit', personnel: 'J. Moreau' },
                { status: 'nuit', note: 'Garde nuit', personnel: 'J. Moreau' },
                { status: 'repos' },
                { status: 'jour', note: 'Soins', personnel: 'J. Moreau' },
                { status: 'jour', note: 'Soins', personnel: 'J. Moreau' },
                { status: 'jour', note: 'Soins', personnel: 'J. Moreau' },
                { status: 'repos' }
            ],
            stats: {
                totalHours: 36,
                nightShifts: 2,
                weekendShifts: 0
            }
        }
    ];

    // Statistiques améliorées
    stats: StatItem[] = [
        { 
            label: 'Postes pourvus', 
            value: 85, 
            target: 90,
            subLabel: '15 postes ouverts', 
            color: '#3b82f6',
            icon: 'pi pi-users',
            trend: 'up',
            trendValue: 5
        },
        { 
            label: 'Charge équipe', 
            value: 78, 
            target: 85,
            subLabel: 'Moyenne 42h/semaine', 
            color: '#22c55e',
            icon: 'pi pi-chart-line',
            trend: 'down',
            trendValue: 3
        },
        { 
            label: 'Taux de conformité', 
            value: 92, 
            target: 95,
            subLabel: 'Règles respectées', 
            color: '#a855f7',
            icon: 'pi pi-check-circle',
            trend: 'stable'
        },
        { 
            label: 'Satisfaction', 
            value: 88, 
            target: 90,
            subLabel: 'Score équipe', 
            color: '#f97316',
            icon: 'pi pi-star',
            trend: 'up',
            trendValue: 2
        }
    ];

    // Notifications avec types
    notifications: Notification[] = [
        {
            id: '1',
            title: 'Planning Cardiologie en attente de validation',
            subtitle: 'Dr. Moreau doit valider avant 18h',
            time: 'Il y a 2h',
            type: 'warning',
            read: false,
            actionable: true,
            actionLabel: 'Valider maintenant',
            actionRoute: '/planning/validation'
        },
        {
            id: '2',
            title: 'Conflit détecté dans le planning',
            subtitle: 'Dr. Dupont et Dr. Martin - Garde du 25/03',
            time: 'Il y a 30min',
            type: 'urgent',
            read: false,
            actionable: true,
            actionLabel: 'Résoudre',
            actionRoute: '/planning/conflits'
        },
        {
            id: '3',
            title: 'Nouveau remplaçant disponible',
            subtitle: 'Dr. Chen peut assurer les gardes cette semaine',
            time: 'Il y a 1h',
            type: 'success',
            read: false,
            actionable: true,
            actionLabel: 'Voir profil',
            actionRoute: '/personnel/remplacants'
        },
        {
            id: '4',
            title: 'Mise à jour réglementaire',
            subtitle: 'Nouvelles règles de temps de repos',
            time: 'Il y a 3h',
            type: 'info',
            read: true,
            actionable: false
        }
    ];

    // Suggestions IA améliorées
    suggestions: AISuggestion[] = [
        {
            id: '1',
            text: 'Dr. Dupont : 2 gardes consécutives détectées (risque de fatigue)',
            impact: 'high',
            category: 'conflit',
            actionable: true
        },
        {
            id: '2',
            text: 'Équilibrer les rotations de nuit : 3 personnels surchargés',
            impact: 'medium',
            category: 'equilibre',
            actionable: true
        },
        {
            id: '3',
            text: 'Optimisation possible : décaler l\'astreinte de M. Rossi au vendredi',
            impact: 'medium',
            category: 'optimisation',
            actionable: true
        },
        {
            id: '4',
            text: 'Remplacement suggéré : Inf. Petit disponible pour les gardes',
            impact: 'high',
            category: 'remplacement',
            actionable: true
        }
    ];

    // Workflow steps amélioré
    workflowSteps: WorkflowStep[] = [
        {
            id: '1',
            title: 'Brouillon',
            subtitle: 'Préparation du planning',
            status: 'done',
            statusLabel: 'Validé',
            assignedTo: 'Dr. Martin',
            dueDate: new Date('2024-03-20'),
            comments: 3
        },
        {
            id: '2',
            title: 'Service Cardiologie',
            subtitle: 'Validation chef de service',
            status: 'in-progress',
            statusLabel: 'En cours',
            assignedTo: 'Dr. Moreau',
            dueDate: new Date('2024-03-22'),
            comments: 5
        },
        {
            id: '3',
            title: 'Direction des soins',
            subtitle: 'Validation ressources',
            status: 'pending',
            statusLabel: 'En attente',
            assignedTo: 'Mme. Lambert',
            dueDate: new Date('2024-03-23')
        },
        {
            id: '4',
            title: 'RH',
            subtitle: 'Validation finale',
            status: 'blocked',
            statusLabel: 'Bloqué',
            assignedTo: 'Service RH',
            dueDate: new Date('2024-03-25'),
            comments: 1
        }
    ];

    // Disponibilités du personnel
    availabilities: PersonnelAvailability[] = [
        {
            id: '1',
            name: 'Dr. Sophie Dupont',
            status: 'disponible',
            nextAvailable: 'Maintenant'
        },
        {
            id: '2',
            name: 'Dr. Thomas Martin',
            status: 'indisponible',
            nextAvailable: '27/03',
            reason: 'Garde précédente'
        },
        {
            id: '3',
            name: 'Marie Rossi',
            status: 'conges',
            nextAvailable: '01/04',
            reason: 'Congés annuels'
        },
        {
            id: '4',
            name: 'Jean Moreau',
            status: 'disponible',
            nextAvailable: 'Maintenant'
        }
    ];

    // ─── Filtrage dashboard par spécialité (dynamique selon le service) ───────────────
    dashboardFilter = 'all';

    setDashboardFilter(key: string): void {
        this.dashboardFilter = key;
    }

    /**
     * Retourne la spécialité effective d'une ligne.
     * Le backend envoie la spécialité tantôt dans `specialty`/`specialite`,
     * tantôt dans `poste` → mappé sur `role`. On utilise `specialty` en priorité,
     * sinon on tombe sur `role` (qui contient alors le poste/spécialité réel).
     */
    private rowSpecialty(row: PlanningRow): string {
        const sp = (row.specialty || '').trim();
        if (sp && sp.toLowerCase() !== 'personnel') { return sp; }
        return (row.role || '').trim();
    }

    /**
     * Boutons-pills dynamiques : extraits des spécialités réelles du service actif.
     * Format : [{ key, label, count }]
     */
    /** Vrai uniquement si le planning a été approuvé en dernier par le super admin (statut VALIDE). */
    get planningApprovedBySuperAdmin(): boolean {
        return this.normalizeWorkflowStatus(this.planningWorkflowStatus) === 'VALIDE';
    }

    get isWorkflowPendingValidation(): boolean {
        return this.isPendingValidationStatus(this.planningWorkflowStatus);
    }

    get pendingValidationMessage(): string {
        const status = this.normalizeWorkflowStatus(this.planningWorkflowStatus);
        if (status === 'EN_ATTENTE_VALIDATION_FINALE') {
            return "Ce planning est en validation finale, en attente de l'approbation du Super Administrateur.";
        }
        if (status.startsWith('EN_ATTENTE_') || status === 'EN_ATTENTE_VALIDATION') {
            return 'Ce planning est soumis et attend la validation des étapes configurées.';
        }
        return 'Ce planning est en cours de validation.';
    }

    get approvalWaitingMessage(): string {
        const status = this.normalizeWorkflowStatus(this.planningWorkflowStatus);
        if (status === 'REJETE') {
            return 'Ce planning a été rejeté. Veuillez corriger et resoumettre pour approbation.';
        }
        if (status === 'BROUILLON' || status === '') {
            return "Ce planning est en cours de préparation et n'a pas encore été soumis pour validation.";
        }
        if (status === 'EN_ATTENTE_VALIDATION_FINALE') {
            return "Ce planning est en cours de validation, en attente de l'approbation finale du Super Administrateur.";
        }
        return 'Ce planning est soumis et attend la validation des étapes configurées.';
    }

    get availableFilters(): { key: string; label: string; count: number }[] {
        const counts = new Map<string, number>();
        for (const row of this.planningRows) {
            const key = this.rowSpecialty(row).toLowerCase();
            if (key && key !== 'personnel') {
                counts.set(key, (counts.get(key) || 0) + 1);
            }
        }
        const items = Array.from(counts.entries())
            .map(([key, count]) => ({
                key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                count
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

        return [{ key: 'all', label: 'Tous', count: this.planningRows.length }, ...items];
    }

    get filteredPlanningRows(): PlanningRow[] {
        if (this.dashboardFilter === 'all') {
            return this.planningRows;
        }
        return this.planningRows.filter(row =>
            this.rowSpecialty(row).toLowerCase() === this.dashboardFilter
        );
    }

    get dayTimelineRows(): DayTimelineRow[] {
        const dayIndex = this.getSelectedDayIndex();
        const normalizedQuery = this.searchQuery.trim().toLowerCase();

        return this.filteredPlanningRows
            .filter(row => {
                if (!normalizedQuery) {
                    return true;
                }
                const haystack = `${row.name} ${row.role} ${row.specialty}`.toLowerCase();
                return haystack.includes(normalizedQuery);
            })
            .map(row => this.toDayTimelineRow(row, dayIndex));
    }

    get dayCoverageSummary(): { filled: number; conflicts: number } {
        return this.dayTimelineRows.reduce((acc, row) => {
            const rowSlots = [row.morning, row.afternoon, row.night, row.special];
            acc.filled += rowSlots.filter(slot => !!slot).length;
            if (row.hasConflict) {
                acc.conflicts += 1;
            }
            return acc;
        }, { filled: 0, conflicts: 0 });
    }

    get monthCells(): CalendarMonthCell[] {
        const monthAnchor = new Date(this.selectedDate);
        const year = monthAnchor.getFullYear();
        const month = monthAnchor.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7;
        const gridStart = new Date(firstDayOfMonth);
        gridStart.setDate(firstDayOfMonth.getDate() - mondayOffset);

        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(gridStart);
            date.setDate(gridStart.getDate() + index);
            const items = this.buildAssignmentsForDate(date);
            return {
                date,
                dayNumber: date.getDate(),
                dayName: this.weekdayHeaders[(date.getDay() + 6) % 7],
                isToday: this.isSameDate(date, new Date()),
                inCurrentMonth: date.getMonth() === month,
                hasConflict: items.some(item => item.status === 'conflit'),
                items: items,
                remainingCount: 0,
                shiftCounts: this.countShiftsForDate(date)
            };
        });
    }

    get weekCells(): CalendarMonthCell[] {
        const currentMonday = this.toMonday(this.selectedDate);
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(currentMonday);
            date.setDate(currentMonday.getDate() + index);
            const items = this.buildAssignmentsForDate(date);
            return {
                date,
                dayNumber: date.getDate(),
                dayName: this.weekdayHeaders[(date.getDay() + 6) % 7],
                isToday: this.isSameDate(date, new Date()),
                inCurrentMonth: true,
                hasConflict: items.some(item => item.status === 'conflit'),
                items: items,
                remainingCount: 0,
                shiftCounts: this.countShiftsForDate(date)
            };
        });
    }

    get dayCell(): CalendarMonthCell | null {
        const date = new Date(this.selectedDate);
        const items = this.buildAssignmentsForDate(date);
        return {
            date,
            dayNumber: date.getDate(),
            dayName: this.weekdayHeaders[(date.getDay() + 6) % 7],
            isToday: this.isSameDate(date, new Date()),
            inCurrentMonth: true,
            hasConflict: items.some(item => item.status === 'conflit'),
            items,
            remainingCount: 0
        };
    }
    // ────────────────────────────────────────────────────────────────────────────

    // Statistiques supplémentaires
    occupancyRate = 85;
    conflictCount = 3;
    pendingValidations = 2;
    openPositions = 4;

    private readonly destroy$ = new Subject<void>();

    constructor(
        private readonly router: Router,
        private readonly currentServiceService: CurrentServiceService,
        private readonly dashboardService: DashboardService,
        private readonly serviceSelectionService: ServiceSelectionService,
        private readonly authService: AuthService,
        private readonly perimeterService: PerimeterService
    ) {}

    ngOnInit(): void {
        // Écouter les changements de service depuis le topbar
        this.serviceSelectionService.currentService$
            .pipe(takeUntil(this.destroy$))
            .subscribe(service => {
                if (service) {
                    console.log('🟢 Dashboard: Service sélectionné:', service.nom);
                    this.serviceLabel = service.nom;
                    this.loadDashboardData(service.id.toString());
                }
            });

        this.currentServiceService.isLoading$
            .pipe(takeUntil(this.destroy$))
            .subscribe(status => {
                this.isLoading = status;
            });
    }

    loadDashboardData(serviceId: string): void {
        console.log('🟢 DashboardComponent.loadDashboardData() appelé avec serviceId:', serviceId);
        this.isLoading = true;
        this.hasPlanning = false; // Défaut : pas de planning jusqu'à preuve du contraire
        this.planningPendingValidation = false;
        this.planningWorkflowStatus = '';
        this.loadedPlanningWeekStart = null;
        this.loadedPlanningWeekEnd = null;
        this.monthAssignmentsByDate.clear();
        this.loadedMonthCacheKey = '';
        this.currentPlanningServiceId = null;
        this.currentPlanningServiceName = '';
        this.currentPerimeterFilter = null;
        this.dashboardFilter = 'all'; // réinitialiser le filtre au changement de service
        
        // Obtenir le contexte utilisateur et calculer le filtre de périmètre
        const userContext = this.authService.getCurrentUser();
        const filter = this.perimeterService.getPerimeterFilter(userContext);
        console.log('🔐 Filtre de périmètre appliqué:', filter);
        
        // Charger les données réelles depuis le backend avec filtrage par périmètre
        const actualServiceId = serviceId === 'all' ? undefined : serviceId;
        console.log('🟢 Appel DashboardService avec actualServiceId:', actualServiceId);
        
        this.dashboardService.getDashboardDataWithPerimeter(filter, actualServiceId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => {
                    console.log('✅ Données réelles reçues (avec périmètre), appel applyRealData()');
                    this.applyRealData(data);
                    // Charger le planning sur un service explicite uniquement.
                    // Évite le fallback forcé vers serviceId=1 (Cardiologie).
                    const planningServiceId = this.resolvePlanningServiceId(actualServiceId, filter);
                    if (!planningServiceId) {
                        this.hasPlanning = false;
                        this.loadedPlanningWeekStart = null;
                        this.loadedPlanningWeekEnd = null;
                        this.noPlanningMessage = 'Sélectionnez un service pour afficher le planning et son workflow.';
                        this.isLoading = false;
                        return;
                    }
                    this.currentPlanningServiceId = planningServiceId;
                    this.currentPlanningServiceName = this.serviceLabel;
                    this.currentPerimeterFilter = filter;
                    this.loadPlanningDetails(planningServiceId, this.serviceLabel);
                },
                error: (error) => {
                    console.error('❌ Erreur chargement dashboard, fallback vers mock:', error);
                    this.hasPlanning = false;
                    this.noPlanningMessage = `Impossible de charger les données du service "${this.serviceLabel}".`;
                    this.isLoading = false;
                    // Fallback sur les données mockées
                    this.currentServiceService.loadDashboardSnapshot(serviceId)
                        .pipe(takeUntil(this.destroy$))
                        .subscribe(snapshot => {
                            console.log('📦 Utilisation des données mock (fallback)');
                            this.applySnapshot(snapshot);
                        });
                }
            });
    }

    private async loadPlanningDetails(serviceId: string, serviceName: string): Promise<void> {
        console.log('🔵 Chargement du planning de la semaine courante pour serviceId:', serviceId);

        // Obtenir le filtre de périmètre
        const userContext = this.authService.getCurrentUser();
        const filter = this.perimeterService.getPerimeterFilter(userContext);

        // Toujours utiliser la semaine courante (lundi au dimanche de cette semaine)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + mondayDiff);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        // Mettre à jour selectedDate pour que getDayDate() affiche les bonnes dates de colonnes
        this.selectedDate = new Date(weekStart);

        // Mettre à jour weekLabel avec la semaine courante
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        this.weekLabel = `Semaine ${fmt(weekStart)} - ${fmt(weekEnd)}`;
        this.autoSelectedWeek = false;
        this.autoSelectedWeekReason = '';
        console.log('📅 Semaine courante dashboard:', fmt(weekStart), '-', fmt(weekEnd));

        try {
            const planningData = await firstValueFrom(
                this.dashboardService.getPlanningDataWithPerimeter(filter, serviceId, serviceName, weekStart, weekEnd)
            );

            const assignmentsSource = planningData?.assignments;
            const personnelSource = planningData?.personnel;
            const assignments = Array.isArray(assignmentsSource) ? assignmentsSource : [];
            const personnel = Array.isArray(personnelSource) ? personnelSource : [];
            const hasAssignments = assignments.length > 0;
            const hasPersonnel = personnel.length > 0;
            const currentStatus = this.normalizeWorkflowStatus(planningData?.workflowStatus);

            if (planningData && !this.isFinalValidatedStatus(planningData.workflowStatus)) {
                this.hasPlanning = false;
                this.loadedPlanningWeekStart = null;
                this.loadedPlanningWeekEnd = null;
                this.noPlanningMessage = `Planning non affiché: statut actuel ${currentStatus || 'INCONNU'}. Le planning doit être validé par le validateur final (statut VALIDE).`;
                this.isLoading = false;
                return;
            }

            if (!planningData || (!hasAssignments && !hasPersonnel)) {
                this.hasPlanning = false;
                this.loadedPlanningWeekStart = null;
                this.loadedPlanningWeekEnd = null;
                this.noPlanningMessage = `Aucun planning disponible pour "${this.serviceLabel}" cette semaine (${fmt(weekStart)} – ${fmt(weekEnd)}).`;
                this.isLoading = false;
                return;
            }

            if (planningData && this.isFinalValidatedStatus(planningData.workflowStatus) && !hasAssignments) {
                this.hasPlanning = false;
                this.loadedPlanningWeekStart = null;
                this.loadedPlanningWeekEnd = null;
                this.noPlanningMessage = 'Le planning est validé, mais aucune affectation n\'est enregistrée pour cette semaine.';
                this.isLoading = false;
                return;
            }

            this.applyPlanningState(planningData, weekStart, weekEnd);
            this.isLoading = false;
        } catch (error) {
            console.error('❌ Erreur chargement planning semaine courante:', error);
            this.hasPlanning = false;
            this.loadedPlanningWeekStart = null;
            this.loadedPlanningWeekEnd = null;
            this.noPlanningMessage = `Impossible de charger le planning pour "${this.serviceLabel}".`;
            this.isLoading = false;
        }
    }

    private async tryLoadLatestValidatedWeek(serviceId: string, serviceName: string, filter: PerimeterFilter): Promise<boolean> {
        try {
            const rows = await firstValueFrom(
                this.dashboardService.getPlanningOverviewRowsWithPerimeter(filter, serviceId)
            );

            if (!Array.isArray(rows) || rows.length === 0) {
                return false;
            }

            const rowsByWeek = new Map<string, any[]>();
            for (const row of rows) {
                const key = String(row?.weekStart ?? '');
                if (!rowsByWeek.has(key)) {
                    rowsByWeek.set(key, []);
                }
                rowsByWeek.get(key)!.push(row);
            }

            const weekCandidates = Array.from(rowsByWeek.entries())
                .map(([weekStartKey, weekRows]) => ({
                    weekRows,
                    weekStart: weekRows[0]?.weekStart ? new Date(weekRows[0].weekStart) : new Date(weekStartKey),
                    weekEnd: weekRows[0]?.weekEnd ? new Date(weekRows[0].weekEnd) : null,
                    hasAssignments: weekRows.some(r => !!r?.assignmentId)
                }))
                .filter(w => !Number.isNaN(w.weekStart.getTime()) && w.hasAssignments)
                .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());

            if (weekCandidates.length === 0) {
                return false;
            }

            for (const target of weekCandidates) {
                const fallbackWeekStart = new Date(target.weekStart);
                fallbackWeekStart.setHours(0, 0, 0, 0);
                const fallbackWeekEnd = target.weekEnd ? new Date(target.weekEnd) : new Date(fallbackWeekStart);
                if (!target.weekEnd) {
                    fallbackWeekEnd.setDate(fallbackWeekStart.getDate() + 6);
                }
                fallbackWeekEnd.setHours(23, 59, 59, 999);

                const planningData = await firstValueFrom(
                    this.dashboardService.getPlanningDataWithPerimeter(filter, serviceId, serviceName, fallbackWeekStart, fallbackWeekEnd)
                );

                const assignments = Array.isArray(planningData?.assignments) ? planningData!.assignments : [];
                if (!planningData || !this.isFinalValidatedStatus(planningData.workflowStatus) || assignments.length === 0) {
                    continue;
                }

                this.autoSelectedWeek = true;
                this.autoSelectedWeekReason = 'Affichage de la dernière semaine validée contenant des affectations.';
                this.applyPlanningState(planningData, fallbackWeekStart, fallbackWeekEnd);
                return true;
            }

            return false;
        } catch (error) {
            console.error('❌ Fallback semaine validée impossible:', error);
            return false;
        }
    }

    private resolvePlanningServiceId(actualServiceId: string | undefined, filter: PerimeterFilter): string | null {
        if (actualServiceId && actualServiceId !== 'all') {
            return actualServiceId;
        }
        if (filter.serviceId) {
            return String(filter.serviceId);
        }
        return null;
    }

    private applyPlanningState(planningData: PlanningDataResponse, weekStart: Date, weekEnd: Date): void {
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        this.loadedPlanningWeekStart = new Date(weekStart);
        this.loadedPlanningWeekStart.setHours(0, 0, 0, 0);
        this.loadedPlanningWeekEnd = new Date(weekEnd);
        this.loadedPlanningWeekEnd.setHours(23, 59, 59, 999);
        const today = new Date();
        this.selectedDate = this.isDateInRange(today, weekStart, weekEnd) ? new Date(today) : new Date(weekStart);
        this.weekLabel = `Semaine ${fmt(weekStart)} - ${fmt(weekEnd)}`;

        this.hasPlanning = true;
        this.transformPlanningData(planningData);

        const wfStatus = this.normalizeWorkflowStatus(planningData.workflowStatus);
        this.planningWorkflowStatus = wfStatus;
        this.planningPendingValidation = this.isPendingValidationStatus(wfStatus);
        this.planningWorkflowLabel = this.getWorkflowDisplayLabel(wfStatus);
        this.planningPeriodTypeLabel = this.getPeriodTypeLabel(weekStart, weekEnd);

        const wfId = planningData.weekWorkflowId || planningData.workflowId;
        if (wfId) {
            this.loadWorkflowSteps(wfId);
        } else {
            this.workflowSteps = [];
        }

        this.refreshMonthPlanningCache(this.selectedDate);
    }

    private toIsoDateOnly(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    private getWorkflowDisplayLabel(status: string): string {
        const normalized = this.normalizeWorkflowStatus(status);
        if (normalized === 'VALIDE') {
            return 'Workflow: validé (toutes les étapes)';
        }
        if (normalized === 'REJETE') {
            return 'Workflow: rejeté';
        }
        if (this.isPendingValidationStatus(normalized)) {
            return 'Workflow: en attente de validation';
        }
        return 'Workflow: brouillon';
    }

    private getPeriodTypeLabel(weekStart: Date, weekEnd: Date): string {
        const days = Math.max(1, Math.round((weekEnd.getTime() - weekStart.getTime()) / 86400000) + 1);
        if (days <= 7) {
            return 'Période: hebdomadaire';
        }
        if (days >= 28 && days <= 31) {
            return 'Période: mensuelle';
        }
        return `Période: ${days} jours`;
    }

    private loadWorkflowSteps(planningId: number): void {
        this.dashboardService.getWorkflowPlanningDetails(planningId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data) => {
                    if (!data || !data.etapes || data.etapes.length === 0) {
                        this.workflowSteps = [];
                        return;
                    }
                    const etapes: any[] = data.etapes;
                    const planning = data.planning;
                    const historique: any[] = data.historique || [];
                    const etapeActuelle: number = planning?.etapeActuelle ?? 1;
                    const dbStatut: string = planning?.statut ?? '';
                    const prochainNom: string = planning?.prochainValidateurNom || '';

                    this.workflowSteps = etapes.map(etape => {
                        const stepNum: number = etape.order;
                        let status: WorkflowStep['status'];
                        let statusLabel: string;

                        if (dbStatut === 'VALIDE') {
                            status = 'done'; statusLabel = 'Validé';
                        } else if (dbStatut === 'REJETE') {
                            if (stepNum < etapeActuelle)      { status = 'done';        statusLabel = 'Validé'; }
                            else if (stepNum === etapeActuelle) { status = 'blocked';    statusLabel = 'Rejeté'; }
                            else                               { status = 'pending';     statusLabel = 'En attente'; }
                        } else if (!dbStatut || dbStatut === 'BROUILLON') {
                            status = 'pending'; statusLabel = 'En attente';
                        } else {
                            // EN_ATTENTE_VALIDATION, EN_ATTENTE_VALIDATION_FINALE…
                            if (stepNum < etapeActuelle)      { status = 'done';        statusLabel = 'Validé'; }
                            else if (stepNum === etapeActuelle) { status = 'in-progress'; statusLabel = 'En cours'; }
                            else                               { status = 'pending';     statusLabel = 'En attente'; }
                        }

                        const histEntry = historique.find(h => parseInt(h.stepId, 10) === stepNum);
                        let assignedTo: string | undefined;
                        if (status === 'done' && histEntry) {
                            assignedTo = histEntry.actorRole;
                        } else if (status === 'in-progress' && prochainNom) {
                            assignedTo = prochainNom;
                        } else {
                            assignedTo = etape.validatorRole;
                        }

                        return {
                            id: String(etape.id),
                            title: etape.label || `Étape ${stepNum}`,
                            subtitle: status === 'done' ? 'Approuvé'
                                    : status === 'blocked' ? 'Rejeté'
                                    : status === 'in-progress' ? 'En attente de validation'
                                    : 'En attente',
                            status,
                            statusLabel,
                            assignedTo
                        } as WorkflowStep;
                    });
                }
            });
    }

    private transformPlanningData(planningData: any): void {
        console.log('🔄 Transformation du planning en vue grille...');
        
        // Créer une map pour le personnel — normaliser les IDs en String pour éviter les
        // problèmes de correspondance numérique/chaîne (MySQL retourne des entiers).
        const personnelMap = new Map<string, any>();
        planningData.personnel.forEach((p: any) => {
            personnelMap.set(String(p.id), p);
        });
        
        // Grouper les affectations par personnel (clés normalisées en String)
        const assignmentsByPersonnel = new Map<string, Map<number, any[]>>();
        
        planningData.assignments.forEach((assignment: any) => {
            const pid = String(assignment.personnelId);
            if (!assignmentsByPersonnel.has(pid)) {
                assignmentsByPersonnel.set(pid, new Map());
            }
            const day = Number(assignment.day);
            const dayAssignments = assignmentsByPersonnel.get(pid)!;
            const existing = dayAssignments.get(day) || [];
            existing.push(assignment);
            dayAssignments.set(day, existing);
        });
        
        // Construire les lignes du planning
        const rows: PlanningRow[] = [];
        
        // D'abord : personnel ayant des affectations
        assignmentsByPersonnel.forEach((assignmentsMap, personnelId) => {
            const personnel = personnelMap.get(personnelId);
            if (!personnel) return;
            
            // Créer les 7 cellules pour chaque jour de la semaine
            const cells: PlanningCell[] = [];
            for (let day = 0; day < 7; day++) {
                const assignments = assignmentsMap.get(day) || [];
                const assignment = this.selectPrimaryAssignmentForDay(assignments);
                if (assignment) {
                    const startTime = assignment.startTime || assignment.heureDebut || assignment.start || undefined;
                    const endTime = assignment.endTime || assignment.heureFin || assignment.end || undefined;
                    cells.push({
                        status: this.mapShiftType(assignment.shiftType),
                        note: assignment.posteLabel || assignment.note || this.getDefaultNote(assignment.shiftType),
                        personnel: `${personnel.prenom} ${personnel.nom}`,
                        startTime,
                        endTime
                    });
                } else {
                    // Pas d'affectation ce jour = case vide
                    cells.push({});
                }
            }
            
            rows.push({
                id: personnelId,
                name: `${personnel.prenom} ${personnel.nom}`,
                role: personnel.poste || personnel.role || 'Personnel',
                avatar: this.resolveAvatarUrl(personnel),
                // Essayer tous les noms de champ possibles envoyés par le backend
                specialty: personnel.specialite || personnel.specialty || personnel.Specialite || '',
                cells: cells,
                stats: this.calculatePersonnelStats(cells)
            });
        });

        // Ensuite : personnel sans aucune affectation (lignes vides mais visibles)
        planningData.personnel.forEach((p: any) => {
            if (!assignmentsByPersonnel.has(String(p.id))) {
                const emptyCells: PlanningCell[] = Array.from({ length: 7 }, () => ({}));
                rows.push({
                    id: String(p.id),
                    name: `${p.prenom} ${p.nom}`,
                    role: p.poste || p.role || 'Personnel',
                    avatar: this.resolveAvatarUrl(p),
                    specialty: p.specialite || p.specialty || p.Specialite || '',
                    cells: emptyCells,
                    stats: { totalHours: 0, nightShifts: 0, weekendShifts: 0 }
                });
            }
        });
        
        console.log('✅ Planning transformé:', rows.length, 'lignes (dont', planningData.personnel.length - assignmentsByPersonnel.size, 'sans affectations)');
        if (rows.length === 0 && planningData.personnel?.length > 0) {
            // Sécurité : si aucun row mais du personnel existe, les afficher quand même
            planningData.personnel.forEach((p: any) => {
                const emptyCells: PlanningCell[] = Array.from({ length: 7 }, () => ({}));
                rows.push({
                    id: String(p.id),
                    name: `${p.prenom} ${p.nom}`,
                    role: p.poste || p.role || 'Personnel',
                    avatar: this.resolveAvatarUrl(p),
                    specialty: p.specialite || p.specialty || p.Specialite || '',
                    cells: emptyCells,
                    stats: { totalHours: 0, nightShifts: 0, weekendShifts: 0 }
                });
            });
        }
        this.dashboardFilter = 'all'; // reset pills quand les données du service changent
        this.planningRows = rows;
    }

    private selectPrimaryAssignmentForDay(assignments: any[]): any | null {
        if (!Array.isArray(assignments) || assignments.length === 0) {
            return null;
        }

        const withMetadata = assignments.map(item => {
            const startTime = String(item?.startTime || item?.heureDebut || item?.start || '').trim();
            const startHour = this.extractHourFromValue(startTime);
            const isHs = this.isLikelyHsAssignment(item);
            return { item, isHs, startHour };
        });

        withMetadata.sort((left, right) => {
            if (left.isHs !== right.isHs) {
                return left.isHs ? 1 : -1;
            }

            const leftHour = left.startHour;
            const rightHour = right.startHour;
            if (leftHour !== rightHour) {
                return leftHour - rightHour;
            }

            return 0;
        });

        return withMetadata[0]?.item || null;
    }

    private isLikelyHsAssignment(assignment: any): boolean {
        const raw = `${assignment?.shiftType || ''} ${assignment?.posteLabel || ''} ${assignment?.note || ''}`.toLowerCase();
        return raw.includes('hs')
            || raw.includes('heure supp')
            || raw.includes('suppl');
    }

    private extractHourFromValue(timeValue: string): number {
        const match = String(timeValue || '').match(/^([01]?\d|2[0-3]):[0-5]\d$/);
        if (!match?.[1]) {
            return 99;
        }
        return Number(match[1]);
    }
    
    private mapShiftType(shiftType: string): 'jour' | 'nuit' | 'garde' | 'astreinte' | 'conflit' | 'conges' | 'formation' | 'repos' {
        const typeMap: Record<string, any> = {
            'jour': 'jour',
            'nuit': 'nuit',
            'garde': 'garde',
            'astreinte': 'astreinte',
            'repos': 'repos',
            'conges': 'conges',
            'congés': 'conges',
            'formation': 'formation'
        };
        return typeMap[shiftType.toLowerCase()] || 'jour';
    }
    
    private getDefaultNote(shiftType: string): string {
        const noteMap: Record<string, string> = {
            'jour': 'Service',
            'nuit': 'Garde nuit',
            'garde': 'Garde',
            'astreinte': 'Astreinte',
            'formation': 'Formation',
            'conges': 'Congés',
            'congés': 'Congés',
            'repos': 'Repos'
        };
        return noteMap[shiftType.toLowerCase()] || 'Service';
    }
    
    private calculatePersonnelStats(cells: PlanningCell[]): { totalHours: number; nightShifts: number; weekendShifts: number } {
        let nightShifts = 0;
        let weekendShifts = 0;
        let totalHours = 0;
        
        cells.forEach((cell, index) => {
            if (cell.status === 'nuit') nightShifts++;
            if ((index === 5 || index === 6) && cell.status !== 'repos') weekendShifts++;
            
            // Estimation des heures (jour=8h, nuit=12h, garde=24h, astreinte=0h)
            if (cell.status === 'jour') totalHours += 8;
            else if (cell.status === 'nuit') totalHours += 12;
            else if (cell.status === 'garde') totalHours += 24;
        });
        
        return { totalHours, nightShifts, weekendShifts };
    }

    private normalizeWorkflowStatus(status?: string | null): string {
        return (status || '').trim().toUpperCase();
    }

    private isFinalValidatedStatus(status?: string | null): boolean {
        return this.normalizeWorkflowStatus(status) === 'VALIDE';
    }

    private isPendingValidationStatus(status?: string | null): boolean {
        const normalizedStatus = this.normalizeWorkflowStatus(status);
        return normalizedStatus === 'EN_COURS_VALIDATION'
            || normalizedStatus === 'EN_ATTENTE_VALIDATION'
            || normalizedStatus === 'EN_ATTENTE_VALIDATION_N1'
            || normalizedStatus === 'EN_ATTENTE_VALIDATION_N2'
            || normalizedStatus === 'EN_ATTENTE_VALIDATION_RH'
            || normalizedStatus === 'EN_ATTENTE_VALIDATION_FINALE'
            || normalizedStatus === 'EN_ATTENTE_N1'
            || normalizedStatus === 'EN_ATTENTE_N2';
    }

    private applyRealData(data: DashboardData): void {
        console.log('🟢 applyRealData() appelé avec data:', data);
        // Mise à jour des statistiques principales
        this.occupancyRate = data.stats.chargeEquipe;
        this.conflictCount = data.quickStats.conflictCount;
        this.pendingValidations = data.quickStats.pendingValidations;
        this.openPositions = data.quickStats.openPositions;

        // Mise à jour des stats cards
        this.stats = [
            {
                label: 'Postes pourvus',
                value: data.stats.postesPourvus > 0 
                    ? Math.round((data.stats.postesPourvus / data.stats.totalPostes) * 100)
                    : 0,
                target: 90,
                subLabel: `${data.quickStats.openPositions} postes ouverts`,
                color: '#3b82f6',
                icon: 'pi pi-users',
                trend: 'up' as const,
                trendValue: 5
            },
            {
                label: 'Charge équipe',
                value: data.stats.chargeEquipe,
                target: 85,
                subLabel: 'Taux d\'occupation',
                color: '#22c55e',
                icon: 'pi pi-chart-line',
                trend: data.stats.chargeEquipe > 85 ? 'up' as const : 'down' as const,
                trendValue: 3
            },
            {
                label: 'Taux de conformité',
                value: data.stats.tauxConformite,
                target: 95,
                subLabel: 'Règles respectées',
                color: '#a855f7',
                icon: 'pi pi-check-circle',
                trend: 'stable' as const
            },
            {
                label: 'Satisfaction',
                value: data.stats.satisfactionScore,
                target: 90,
                subLabel: 'Score équipe',
                color: '#f97316',
                icon: 'pi pi-star',
                trend: 'up' as const,
                trendValue: 2
            }
        ];

        // Mise à jour des notifications avec les données réelles
        if (data.notifications.length > 0) {
            this.notifications = data.notifications;
        }

        // Mise à jour des disponibilités du personnel
        if (data.staffAvailabilities.length > 0) {
            this.availabilities = data.staffAvailabilities.map(staff => ({
                id: String(staff.id),
                name: `${staff.prenom} ${staff.nom}`,
                status: staff.status,
                nextAvailable: staff.nextAvailable || '—',
                reason: staff.reason
            }));
        }

        // Mise à jour du label de planning
        if (data.planningOverview) {
            const start = new Date(data.planningOverview.weekStart);
            const end = new Date(data.planningOverview.weekEnd);
            this.weekLabel = `Semaine ${start.toLocaleDateString('fr-FR')} - ${end.toLocaleDateString('fr-FR')}`;
        }

        this.currentServiceService.markLoadingDone();
    }

    private applySnapshot(snapshot: ServiceDashboardSnapshot): void {
        this.serviceLabel = snapshot.serviceLabel;
        this.weekLabel = snapshot.weekLabel;
        this.occupancyRate = snapshot.occupancyRate;
        this.conflictCount = snapshot.conflictCount;
        this.pendingValidations = snapshot.pendingValidations;
        this.openPositions = snapshot.openPositions;

        this.stats = this.stats.map((item, index) => {
            const factor = 0.92 + (snapshot.multiplier / (index + 2));
            return {
                ...item,
                value: Math.min(99, Math.round(item.value * factor)),
                target: Math.min(100, Math.round(item.target * (0.95 + snapshot.multiplier / 3)))
            };
        });

        this.suggestions = this.suggestions.map((item, index) => ({
            ...item,
            text: item.text.replace(/Cardiologie|service/gi, snapshot.serviceLabel).replace('du', `du ${snapshot.serviceLabel}`),
            impact: index % 3 === 0 ? 'high' : item.impact
        }));

        this.workflowSteps = this.workflowSteps.map((step, index) => ({
            ...step,
            subtitle: index === 1 ? `Validation ${snapshot.serviceLabel}` : step.subtitle
        }));

        this.dashboardFilter = 'all'; // reset pills
        this.planningRows = this.planningRows.map((row, index) => ({
            ...row,
            specialty: snapshot.serviceLabel,
            stats: row.stats ? {
                ...row.stats,
                totalHours: Math.max(28, Math.round(row.stats.totalHours * (0.9 + snapshot.multiplier / 4)))
            } : row.stats,
            cells: row.cells.map((cell, cellIndex) => {
                if (cellIndex === 0 && index % 2 === 0 && snapshot.serviceLabel !== 'Tous les services') {
                    return { ...cell, note: `${snapshot.serviceLabel} - ${cell.note || 'Affectation'}` };
                }
                return cell;
            })
        }));

        this.availabilities = this.availabilities.map((item, index) => ({
            ...item,
            status: index === 0 && snapshot.multiplier > 1.2 ? 'disponible' : item.status
        }));

        this.currentServiceService.markLoadingDone();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    exportPlanning(): void {
        console.log('Export du planning');
    }

    sharePlanning(): void {
        console.log('Partage du planning');
    }

    /**
     * Vérifie si le bouton "Créer un planning" doit être affiché.
     * - Super admin   : toujours visible
     * - Admin GTA     : toujours visible
    * - Validateur RH / Planificateur RH : jamais visible (validation uniquement)
     * - Chef de service : visible si le service sélectionné est le leur
     * - Chef de pôle  : visible si le service sélectionné appartient à leur pôle
     */
    canShowCreatePlanningButton(): boolean {
        const userContext = this.authService.getCurrentUser();
        if (!userContext) {
            return false;
        }

        const role = userContext.roleNormalized || normalizeRole(userContext.role || localStorage.getItem('role') || '');

        // Super admin, Admin GTA : toujours visible
        if (role === 'super-admin' || role === 'admin-gta') {
            return true;
        }

        // Rôles RH de validation : pas de création de planning
        if (role === 'validateur-rh' || role === 'planificateur-rh') {
            return false;
        }

        // Chef de service : visible uniquement pour son propre service
        if (role === 'chef-service') {
            const selectedService = this.serviceSelectionService.getCurrentService();
             const selectedServiceId = selectedService?.id != null ? Number(selectedService.id) : NaN;
             const userServiceId = userContext.serviceId != null ? Number(userContext.serviceId) : NaN;
            return selectedService !== null &&
                   userContext.serviceId !== undefined &&
                 Number.isFinite(selectedServiceId) &&
                 Number.isFinite(userServiceId) &&
                 selectedServiceId === userServiceId;
        }

        // Chef de pôle : visible si le service sélectionné appartient à son pôle
        if (role === 'chef-pole') {
            const selectedService = this.serviceSelectionService.getCurrentService();
             const selectedPoleId = selectedService?.poleId != null ? Number(selectedService.poleId) : NaN;
             const userPoleId = userContext.poleId != null ? Number(userContext.poleId) : NaN;
            return selectedService !== null &&
                   userContext.poleId !== undefined &&
                   selectedService.poleId !== undefined &&
                 Number.isFinite(selectedPoleId) &&
                 Number.isFinite(userPoleId) &&
                 selectedPoleId === userPoleId;
        }

        return false;
    }

    createNewPlanning(): void {
        this.router.navigate(['/pages/planning']);
    }

    getDayDate(day: string): string {
        const dayIndex = this.planningDays.indexOf(day);
        if (dayIndex < 0) {
            return '';
        }

        // Utiliser selectedDate (= weekStart du planning chargé) comme base
        // et ajouter directement dayIndex pour aligner avec les dayIndex des affectations
        const baseDate = new Date(this.selectedDate);
        baseDate.setDate(baseDate.getDate() + dayIndex);

        const d = `${baseDate.getDate()}`.padStart(2, '0');
        const m = `${baseDate.getMonth() + 1}`.padStart(2, '0');
        return `${d}/${m}`;
    }

    handleNotificationAction(item: Notification): void {
        item.read = true;
        if (item.actionRoute) {
            this.router.navigate([item.actionRoute]);
        }
    }

    getStatusClass(status: string): string {
        const classes: { [key: string]: string } = {
            'jour': 'shift-jour',
            'nuit': 'shift-nuit',
            'garde': 'shift-garde',
            'astreinte': 'shift-astreinte',
            'conflit': 'shift-conflit',
            'conges': 'shift-conges',
            'formation': 'shift-formation',
            'repos': 'shift-repos'
        };
        return classes[status] || '';
    }

    getStatusLabel(status: string): string {
        const labels: { [key: string]: string } = {
            'jour': 'Jour',
            'nuit': 'Nuit',
            'garde': 'Garde',
            'astreinte': 'Astreinte',
            'conflit': 'Conflit',
            'conges': 'Congés',
            'formation': 'Formation',
            'repos': 'Repos'
        };
        return labels[status] || status;
    }

    handleAvatarError(event: Event, row?: { avatar?: string }): void {
        if (row) {
            row.avatar = undefined;
            return;
        }
        const target = event.target as HTMLImageElement | null;
        if (target) {
            target.src = this.defaultAvatar;
        }
    }

    startShiftDrag(personId: string, placement: ShiftPlacement, event: DragEvent): void {
        this.draggedShift = { personId, placement };
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', `${personId}:${placement}`);
        }
    }

    allowShiftDrop(event: DragEvent): void {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
    }

    dropShiftOn(targetPersonId: string, targetPlacement: ShiftPlacement, event: DragEvent): void {
        event.preventDefault();

        const drag = this.draggedShift;
        this.draggedShift = null;
        if (!drag) {
            return;
        }

        const dayIndex = this.getSelectedDayIndex();
        const sourceRow = this.planningRows.find(r => r.id === drag.personId);
        const targetRow = this.planningRows.find(r => r.id === targetPersonId);
        if (!sourceRow || !targetRow) {
            return;
        }

        const sourceCell = sourceRow.cells[dayIndex] ? { ...sourceRow.cells[dayIndex] } : {};
        const targetCell = targetRow.cells[dayIndex] ? { ...targetRow.cells[dayIndex] } : {};

        if (!sourceCell.status) {
            return;
        }

        sourceRow.cells[dayIndex] = targetCell;
        targetRow.cells[dayIndex] = sourceCell;

        this.setPlacementOverride(targetPersonId, dayIndex, targetPlacement);
        if (targetCell.status) {
            this.setPlacementOverride(drag.personId, dayIndex, drag.placement);
        } else {
            this.clearPlacementOverride(drag.personId, dayIndex);
        }
    }

    getNotificationIcon(type: string): string {
        const icons: { [key: string]: string } = {
            'info': 'pi pi-info-circle',
            'warning': 'pi pi-exclamation-triangle',
            'success': 'pi pi-check-circle',
            'urgent': 'pi pi-exclamation-circle'
        };
        return icons[type] || 'pi pi-bell';
    }

    getSuggestionImpactClass(impact: string): string {
        return `impact-${impact}`;
    }

    getSuggestionIcon(category: string): string {
        const icons: { [key: string]: string } = {
            'optimisation': 'pi pi-chart-line',
            'conflit': 'pi pi-exclamation-triangle',
            'remplacement': 'pi pi-user-plus',
            'equilibre': 'pi pi-balance-scale'
        };
        return icons[category] || 'pi pi-lightbulb';
    }

    applySuggestion(suggestionId: string): void {
        console.log('Appliquer suggestion:', suggestionId);
        // Implémenter la logique d'application
    }

    viewAllNotifications(): void {
        this.router.navigate(['/notifications']);
    }

    viewWorkflowDetails(stepId: string): void {
        this.router.navigate(['/workflow', stepId]);
    }

    optimizeSchedule(): void {
        console.log('Lancement optimisation IA');
        // Implémenter la logique d'optimisation
    }

    getTrendIcon(trend: string): string {
        const icons: { [key: string]: string } = {
            'up': 'pi pi-arrow-up',
            'down': 'pi pi-arrow-down',
            'stable': 'pi pi-minus'
        };
        return icons[trend] || '';
    }

    getAvailabilityStatusClass(status: string): string {
        const classes: { [key: string]: string } = {
            'disponible': 'status-available',
            'indisponible': 'status-unavailable',
            'conges': 'status-vacation',
            'formation': 'status-training'
        };
        return classes[status] || '';
    }

    getUnreadNotificationsCount(): number {
        return this.notifications.filter(n => !n.read).length;
    }

    getHighImpactSuggestions(): AISuggestion[] {
        return this.suggestions.filter(s => s.impact === 'high');
    }

    getPeriodLabel(): string {
        if (this.activeViewMode === 'day') {
            return new Intl.DateTimeFormat('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            }).format(this.selectedDate);
        }

        if (this.activeViewMode === 'week') {
            const start = this.toMonday(this.selectedDate);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            const format = (d: Date) => new Intl.DateTimeFormat('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).format(d);
            return `Semaine ${format(start)} - ${format(end)}`;
        }

        const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
        return new Intl.DateTimeFormat('fr-FR', options).format(this.selectedDate);
    }

    setViewMode(mode: 'month' | 'week' | 'day'): void {
        this.activeViewMode = mode;
        this.goToday();
        if (mode === 'month') {
            this.refreshMonthPlanningCache(this.selectedDate, true);
        }
    }

    toggleSidebar(): void {
        this.sidebarCollapsed = !this.sidebarCollapsed;
    }

    previousPeriod(): void {
        const nextDate = new Date(this.selectedDate);
        if (this.activeViewMode === 'day') {
            nextDate.setDate(nextDate.getDate() - 1);
        } else if (this.activeViewMode === 'week') {
            nextDate.setDate(nextDate.getDate() - 7);
        } else {
            nextDate.setMonth(nextDate.getMonth() - 1);
        }
        this.selectedDate = nextDate;
        if (this.activeViewMode === 'month') {
            this.refreshMonthPlanningCache(this.selectedDate);
        }
    }

    nextPeriod(): void {
        const nextDate = new Date(this.selectedDate);
        if (this.activeViewMode === 'day') {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (this.activeViewMode === 'week') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            nextDate.setMonth(nextDate.getMonth() + 1);
        }
        this.selectedDate = nextDate;
        if (this.activeViewMode === 'month') {
            this.refreshMonthPlanningCache(this.selectedDate);
        }
    }

    goToday(): void {
        this.selectedDate = new Date();
        if (this.activeViewMode === 'month') {
            this.refreshMonthPlanningCache(this.selectedDate);
        }
    }

    get isActivePeriodEmpty(): boolean {
        if (!this.hasPlanning) {
            return false;
        }

        if (this.activeViewMode === 'day') {
            return !this.hasAssignmentsForDate(this.selectedDate);
        }

        if (this.activeViewMode === 'week') {
            const monday = this.toMonday(this.selectedDate);
            for (let i = 0; i < 7; i++) {
                const date = new Date(monday);
                date.setDate(monday.getDate() + i);
                if (this.hasAssignmentsForDate(date)) {
                    return false;
                }
            }
            return true;
        }

        const monthStart = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
        const monthEnd = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 0);
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            if (this.hasAssignmentsForDate(d)) {
                return false;
            }
        }
        return true;
    }

    get noPlanningForActivePeriodMessage(): string {
        if (this.activeViewMode === 'day') {
            return `Aucun planning pour le jour actuel (${this.formatDateLabel(this.selectedDate)}).`;
        }

        if (this.activeViewMode === 'week') {
            const start = this.toMonday(this.selectedDate);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            return `Aucun planning pour la semaine actuelle (${this.formatDateLabel(start)} - ${this.formatDateLabel(end)}).`;
        }

        return `Aucun planning pour le mois actuel (${this.formatMonthLabel(this.selectedDate)}).`;
    }

    openDayDetail(day: CalendarMonthCell): void {
        this.selectedDayDetail = day;
        this.selectedAssignment = day.items.length > 0 ? day.items[0] : null;
    }

    closeDayDetail(): void {
        this.selectedDayDetail = null;
        this.selectedAssignment = null;
    }

    selectAssignment(item: CalendarAssignmentItem): void {
        this.selectedAssignment = item;
    }

    private buildAssignmentsForDate(date: Date): CalendarAssignmentItem[] {
        const monthDateKey = this.toIsoDateOnly(date);
        if (this.monthAssignmentsByDate.has(monthDateKey)) {
            return this.filterMonthItems(this.monthAssignmentsByDate.get(monthDateKey) || []);
        }

        if (!this.isDateWithinLoadedPlanningWeek(date)) {
            return [];
        }

        const dayIndex = (date.getDay() + 6) % 7;
        const normalizedQuery = this.searchQuery.trim().toLowerCase();
        const sourceRows = this.filteredPlanningRows.filter(row => {
            if (!normalizedQuery) {
                return true;
            }
            const joined = `${row.name} ${row.role} ${row.specialty}`.toLowerCase();
            return joined.includes(normalizedQuery);
        });

        const items = sourceRows
            .map(row => {
                const slot = row.cells[dayIndex];
                if (!slot?.status) {
                    return null;
                }
                const status = slot.status;
                const shortName = this.compactPersonnelName(row.name);
                const timeRange = this.getSlotTimeRange(slot);
                const label = `${this.getStatusLabel(status)} - ${shortName}`;
                return {
                    status,
                    label,
                    personnel: row.name,
                    tooltip: `${row.name} - ${slot.note || this.getStatusLabel(status)}`,
                    timeRange,
                    specialty: row.specialty || row.role
                } as CalendarAssignmentItem;
            })
            .filter((item): item is CalendarAssignmentItem => !!item);

        return items;
    }

    private countShiftsForDate(date: Date): ShiftCount {
        if (!this.isDateWithinLoadedPlanningWeek(date)) {
            return { morning: 0, afternoon: 0, night: 0, special: 0 };
        }

        const dayIndex = this.getDateDayIndex(date);
        const counts: ShiftCount = { morning: 0, afternoon: 0, night: 0, special: 0 };
        
        this.filteredPlanningRows.forEach(row => {
            const slot = row.cells[dayIndex];
            if (slot && slot.status) {
                const placement = this.resolveSlotPlacement(slot as DayTimelineSlot, row.id, dayIndex);
                counts[placement]++;
            }
        });
        
        return counts;
    }

    private getDateDayIndex(date: Date): number {
        return (date.getDay() + 6) % 7;
    }

    getShiftsForDay(day: CalendarMonthCell): DayShiftGroups {
        const dayItems = this.buildAssignmentsForDate(day.date);
        const groups: DayShiftGroups = {
            morning: [],
            afternoon: [],
            night: [],
            special: []
        };

        dayItems.forEach(item => {
            const placement = this.resolvePlacementFromItem(item);
            groups[placement].push(item);
        });

        return groups;
    }

    getShiftsOfType(day: CalendarMonthCell, type: ShiftPlacement): CalendarAssignmentItem[] {
        return this.getShiftsForDay(day)[type];
    }

    isHsItem(item: CalendarAssignmentItem): boolean {
        return ['garde', 'astreinte', 'conges', 'formation', 'repos'].includes(item.status);
    }

    getWeekViewItemTitle(item: CalendarAssignmentItem): string {
        const personnel = item.personnel?.trim() || '';
        if (!personnel) {
            return item.label;
        }

        if (this.isHsItem(item)) {
            return `${personnel} (${this.getStatusLabel(item.status)})`;
        }

        return personnel;
    }

    getSelectedDaySections(): DayDetailSection[] {
        if (!this.selectedDayDetail) {
            return [];
        }

        const planningItems = this.selectedDayDetail.items.filter(item => !this.isHsItem(item));
        const hsItems = this.selectedDayDetail.items.filter(item => this.isHsItem(item));

        return [
            {
                key: 'planning',
                badge: 'Planning',
                title: 'Affectations planning',
                emptyLabel: 'Aucune affectation planning pour ce jour.',
                items: planningItems
            },
            {
                key: 'hs',
                badge: 'HS',
                title: 'Affectations HS',
                emptyLabel: 'Aucune affectation HS pour ce jour.',
                items: hsItems
            }
        ];
    }

    getDayDetailBadgeClass(section: DayDetailSection): string {
        return section.key === 'hs'
            ? 'detail-section__badge detail-section__badge--hs'
            : 'detail-section__badge detail-section__badge--planning';
    }

    getDayDetailCardTitle(item: CalendarAssignmentItem): string {
        const personnel = item.personnel?.trim();
        if (!personnel) {
            return item.label;
        }

        if (this.isHsItem(item)) {
            return `${this.getStatusLabel(item.status)} - ${personnel}`;
        }

        return personnel;
    }

    private isDateWithinLoadedPlanningWeek(date: Date): boolean {
        if (!this.loadedPlanningWeekStart || !this.loadedPlanningWeekEnd) {
            return false;
        }

        const candidate = new Date(date);
        candidate.setHours(12, 0, 0, 0);

        const start = new Date(this.loadedPlanningWeekStart);
        start.setHours(0, 0, 0, 0);

        const end = new Date(this.loadedPlanningWeekEnd);
        end.setHours(23, 59, 59, 999);

        return candidate >= start && candidate <= end;
    }

    private toDayTimelineRow(row: PlanningRow, dayIndex: number): DayTimelineRow {
        const dayCell = row.cells[dayIndex] || {};
        const slot = this.toTimelineSlot(dayCell);
        const placement = this.resolveSlotPlacement(slot, row.id, dayIndex);

        return {
            id: row.id,
            name: row.name,
            role: row.role,
            specialty: row.specialty,
            avatar: row.avatar,
            morning: placement === 'morning' ? slot : null,
            afternoon: placement === 'afternoon' ? slot : null,
            night: placement === 'night' ? slot : null,
            special: placement === 'special' ? slot : null,
            hasConflict: slot?.status === 'conflit'
        };
    }

    private resolveAvatarUrl(personnel: any): string | undefined {
        const candidates = [
            personnel?.avatar,
            personnel?.avatarUrl,
            personnel?.photo,
            personnel?.photoUrl,
            personnel?.image,
            personnel?.imageUrl,
            personnel?.profilImage,
            personnel?.profileImage,
            personnel?.profile?.photo,
            personnel?.profile?.avatar
        ];

        const value = candidates.find(v => typeof v === 'string' && v.trim().length > 0);
        if (!value) {
            return undefined;
        }

        let raw = value
            .trim()
            .replace(/^['"]|['"]$/g, '')
            .replace(/\\\//g, '/')
            .replace(/\s+/g, '');

        const lowered = raw.toLowerCase();

        // Ignore placeholder values that are not real images.
        if (['photo', 'null', 'undefined', 'n/a', 'na', '-'].includes(lowered)) {
            return undefined;
        }

        if (lowered.startsWith('data:image/')) {
            // Accept and auto-fix common typos such as ';bas64,' from malformed payloads.
            raw = raw
                .replace(/;bas64,/i, ';base64,')
                .replace(/;base64;/i, ';base64,');

            if (!raw.includes(',')) {
                return undefined;
            }

            const payload = raw.split(',', 2)[1];
            if (!payload || payload.length < 16) {
                return undefined;
            }

            return raw;
        }

        if (lowered.startsWith('http://') || lowered.startsWith('https://')) {
            return raw;
        }

        if (lowered.startsWith('base64,')) {
            return `data:image/jpeg;base64,${raw.substring(7)}`;
        }

        // Raw base64 payload without data URI prefix.
        if (/^[a-z0-9+/=_-]+$/i.test(raw) && raw.length > 40) {
            return `data:image/jpeg;base64,${raw}`;
        }

        // Relative API paths such as /uploads/... or uploads/...
        const looksLikeRelativePath = raw.startsWith('/') || raw.includes('/');
        if (looksLikeRelativePath) {
            const base = (environment.apiBaseUrl || '').replace(/\/$/, '');
            const suffix = raw.replace(/^\//, '');
            return base ? `${base}/${suffix}` : raw;
        }

        return undefined;
    }

    private toTimelineSlot(cell: PlanningCell): DayTimelineSlot | null {
        if (!cell?.status) {
            return null;
        }
        return {
            status: cell.status,
            note: cell.note,
            timeRange: this.getSlotTimeRange(cell)
        };
    }

    private resolveSlotPlacement(slot: DayTimelineSlot | null, rowId?: string, dayIndex?: number): ShiftPlacement {
        if (rowId && dayIndex !== undefined) {
            const override = this.dayPlacementOverrides.get(this.toPlacementKey(rowId, dayIndex));
            if (override) {
                return override;
            }
        }

        if (!slot) {
            return 'morning';
        }

        if (slot.status === 'garde' || slot.status === 'astreinte' || slot.status === 'formation' || slot.status === 'repos' || slot.status === 'conges') {
            return 'special';
        }

        if (slot.status === 'nuit') {
            return 'night';
        }

        const notePlacement = this.extractPlacementFromNote(slot.note);
        if (notePlacement) {
            return notePlacement;
        }

        const startHour = this.extractStartHour(slot.timeRange);
        if (startHour !== null) {
            if (startHour >= 21 || startHour < 7) {
                return 'night';
            }
            if (startHour >= 14) {
                return 'afternoon';
            }
        }

        return 'morning';
    }

    private extractPlacementFromNote(note?: string): ShiftPlacement | null {
        if (!note) {
            return null;
        }

        const normalized = note.toLowerCase();
        if (normalized.includes('nuit') || normalized.includes('nocturne')) {
            return 'night';
        }
        if (normalized.includes('apres-midi') || normalized.includes('après-midi') || normalized.includes('soir')) {
            return 'afternoon';
        }
        if (normalized.includes('matin')) {
            return 'morning';
        }

        return null;
    }

    private extractStartHour(timeRange?: string): number | null {
        if (!timeRange) {
            return null;
        }
        const match = timeRange.match(/\b((?:[01]?\d|2[0-3])):[0-5]\d\b/);
        if (!match?.[1]) {
            return null;
        }
        return Number(match[1]);
    }

    private getSelectedDayIndex(): number {
        return (this.selectedDate.getDay() + 6) % 7;
    }

    private toPlacementKey(rowId: string, dayIndex: number): string {
        return `${rowId}:${dayIndex}`;
    }

    private setPlacementOverride(rowId: string, dayIndex: number, placement: ShiftPlacement): void {
        this.dayPlacementOverrides.set(this.toPlacementKey(rowId, dayIndex), placement);
    }

    private clearPlacementOverride(rowId: string, dayIndex: number): void {
        this.dayPlacementOverrides.delete(this.toPlacementKey(rowId, dayIndex));
    }

    private compactPersonnelName(fullName: string): string {
        const parts = fullName.split(' ').filter(Boolean);
        if (parts.length === 0) {
            return '';
        }
        if (parts.length === 1) {
            return parts[0];
        }
        return `${parts[0]} ${parts[1].charAt(0)}.`;
    }

    private getSlotTimeRange(slot: PlanningCell): string | undefined {
        if (slot.startTime && slot.endTime) {
            return `${slot.startTime} - ${slot.endTime}`;
        }

        const note = slot.note || '';
        const match = note.match(/\b((?:[01]?\d|2[0-3]):[0-5]\d)\b\s*[-a]\s*\b((?:[01]?\d|2[0-3]):[0-5]\d)\b/i);
        if (match?.[1] && match?.[2]) {
            return `${match[1]} - ${match[2]}`;
        }

        return undefined;
    }

    private isSameDate(a: Date, b: Date): boolean {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    private toMonday(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    private refreshMonthPlanningCache(anchorDate: Date, forceReload = false): void {
        if (!this.currentPlanningServiceId || !this.currentPerimeterFilter) {
            return;
        }

        const key = `${this.currentPlanningServiceId}:${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}`;
        if (!forceReload && this.loadedMonthCacheKey === key) {
            return;
        }

        void this.loadValidatedMonthPlanning(
            this.currentPlanningServiceId,
            this.currentPlanningServiceName || this.serviceLabel,
            this.currentPerimeterFilter,
            anchorDate,
            key
        );
    }

    private async loadValidatedMonthPlanning(
        serviceId: string,
        serviceName: string,
        filter: PerimeterFilter,
        anchorDate: Date,
        cacheKey: string
    ): Promise<void> {
        const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        try {
            const overviewRows = await firstValueFrom(
                this.dashboardService.getPlanningOverviewRowsWithPerimeter(filter, serviceId)
            );

            const weekTargets = this.extractValidatedWeeksForMonth(overviewRows, monthStart, monthEnd);
            const nextMap = new Map<string, CalendarAssignmentItem[]>();

            for (const week of weekTargets) {
                const planningData = await firstValueFrom(
                    this.dashboardService.getPlanningDataWithPerimeter(filter, serviceId, serviceName, week.weekStart, week.weekEnd)
                );

                if (!planningData || !this.isFinalValidatedStatus(planningData.workflowStatus)) {
                    continue;
                }

                const weekStart = new Date(planningData.weekStart || week.weekStart);
                weekStart.setHours(0, 0, 0, 0);
                const personnelById = new Map<string, any>();
                (planningData.personnel || []).forEach(p => personnelById.set(String(p.id), p));

                (planningData.assignments || []).forEach(assignment => {
                    const date = new Date(weekStart);
                    date.setDate(weekStart.getDate() + Number(assignment.day || 0));
                    date.setHours(12, 0, 0, 0);

                    if (date < monthStart || date > monthEnd) {
                        return;
                    }

                    const person = personnelById.get(String(assignment.personnelId));
                    const personName = person ? `${person.prenom || ''} ${person.nom || ''}`.trim() : String(assignment.personnelId || 'Personnel');
                    const shiftStatus = this.mapShiftType(String(assignment.shiftType || 'jour'));
                    const timeRange = assignment.startTime && assignment.endTime
                        ? `${assignment.startTime} - ${assignment.endTime}`
                        : undefined;
                    const specialty = person?.specialite || person?.specialty || person?.poste || '';

                    const item: CalendarAssignmentItem = {
                        status: shiftStatus,
                        label: `${this.getStatusLabel(shiftStatus)} - ${this.compactPersonnelName(personName)}`,
                        personnel: personName,
                        tooltip: `${personName} - ${assignment.posteLabel || assignment.note || this.getDefaultNote(String(assignment.shiftType || 'jour'))}`,
                        timeRange,
                        specialty
                    };

                    const dateKey = this.toIsoDateOnly(date);
                    const list = nextMap.get(dateKey) || [];
                    list.push(item);
                    nextMap.set(dateKey, list);
                });
            }

            this.monthAssignmentsByDate.clear();
            nextMap.forEach((items, key) => this.monthAssignmentsByDate.set(key, items));
            this.loadedMonthCacheKey = cacheKey;
        } catch (error) {
            console.error('❌ Erreur chargement planning mensuel validé:', error);
            this.monthAssignmentsByDate.clear();
            this.loadedMonthCacheKey = cacheKey;
        }
    }

    private extractValidatedWeeksForMonth(rows: any[], monthStart: Date, monthEnd: Date): { weekStart: Date; weekEnd: Date }[] {
        if (!Array.isArray(rows) || rows.length === 0) {
            return [];
        }

        const weekMap = new Map<string, { weekStart: Date; weekEnd: Date; hasAssignments: boolean }>();
        rows.forEach(row => {
            const weekStart = new Date(row?.weekStart);
            const weekEnd = row?.weekEnd ? new Date(row.weekEnd) : new Date(weekStart);
            if (Number.isNaN(weekStart.getTime()) || Number.isNaN(weekEnd.getTime())) {
                return;
            }

            weekStart.setHours(0, 0, 0, 0);
            weekEnd.setHours(23, 59, 59, 999);

            if (weekEnd < monthStart || weekStart > monthEnd) {
                return;
            }

            const key = `${this.toIsoDateOnly(weekStart)}_${this.toIsoDateOnly(weekEnd)}`;
            const existing = weekMap.get(key);
            const hasAssignment = !!row?.assignmentId;
            if (!existing) {
                weekMap.set(key, { weekStart, weekEnd, hasAssignments: hasAssignment });
            } else if (hasAssignment) {
                existing.hasAssignments = true;
            }
        });

        return Array.from(weekMap.values())
            .filter(w => w.hasAssignments)
            .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
            .map(w => ({ weekStart: w.weekStart, weekEnd: w.weekEnd }));
    }

    private filterMonthItems(items: CalendarAssignmentItem[]): CalendarAssignmentItem[] {
        const activeFilter = this.dashboardFilter.toLowerCase();
        const normalizedQuery = this.searchQuery.trim().toLowerCase();

        return items.filter(item => {
            const specialty = (item.specialty || '').toLowerCase();
            if (activeFilter !== 'all' && specialty !== activeFilter) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            const haystack = `${item.personnel} ${item.label} ${item.specialty || ''}`.toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }

    private resolvePlacementFromItem(item: CalendarAssignmentItem): ShiftPlacement {
        const slot: DayTimelineSlot = {
            status: item.status,
            note: item.label,
            timeRange: item.timeRange
        };
        return this.resolveSlotPlacement(slot);
    }

    private hasAssignmentsForDate(date: Date): boolean {
        const monthDateKey = this.toIsoDateOnly(date);
        const monthItems = this.monthAssignmentsByDate.get(monthDateKey);
        if (monthItems && this.filterMonthItems(monthItems).length > 0) {
            return true;
        }

        if (!this.isDateWithinLoadedPlanningWeek(date)) {
            return false;
        }

        const dayIndex = this.getDateDayIndex(date);
        return this.filteredPlanningRows.some(row => !!row.cells[dayIndex]?.status);
    }

    private formatDateLabel(date: Date): string {
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }

    private formatMonthLabel(date: Date): string {
        return new Intl.DateTimeFormat('fr-FR', {
            month: 'long',
            year: 'numeric'
        }).format(date);
    }

    private isDateInRange(date: Date, start: Date, end: Date): boolean {
        const candidate = new Date(date);
        candidate.setHours(12, 0, 0, 0);
        const rangeStart = new Date(start);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(end);
        rangeEnd.setHours(23, 59, 59, 999);
        return candidate >= rangeStart && candidate <= rangeEnd;
    }
}