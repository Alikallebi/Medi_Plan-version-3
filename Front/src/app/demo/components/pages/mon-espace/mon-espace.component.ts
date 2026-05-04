import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ConfirmationService } from 'primeng/api';
import { AuthService } from 'src/app/demo/service/auth.service';
import { MonPlanningQueryContext, MonPlanningService } from 'src/app/demo/service/mon-planning.service';
import { Affectation, Compteurs, PlanningDay } from 'src/app/demo/models/mon-planning.model';
import { DemandeCreatePayload, DemandeHistoriqueItem, DemandeItem, DemandeTypeDefinition } from 'src/app/demo/models/demande.model';
import { DemandeService } from 'src/app/demo/service/demande.service';
import { CompteurService } from 'src/app/demo/service/compteur.service';
import { PlanningNotificationService } from 'src/app/demo/service/planning-notification.service';

@Component({
    selector: 'app-mon-espace',
    templateUrl: './mon-espace.component.html',
    styleUrls: ['./mon-espace.component.scss'],
    providers: [ConfirmationService]
})
export class MonEspaceComponent implements OnInit {
    weekStart = this.getCurrentWeekStart(new Date());
    weekEnd = this.addDays(this.weekStart, 6);
    weekLabel = this.buildWeekLabel(this.weekStart);
    userLabel = '';

    planningDays: PlanningDay[] = [];
    counters: Compteurs = {
        solde_rc_plus_heures: 0,
        solde_rc_moins_heures: 0
    };

    planningLoading = false;
    countersLoading = false;
    planningError = '';
    countersError = '';
    demandeError = '';
    demandeSuccess = '';
    createDemandeLoading = false;
    showDemandeModal = false;
    modalDefaultDate = '';
    selectedDemandeDetail: DemandeItem | null = null;
    expandedDemandeHistoryId: string | null = null;
    demandeHistoryLoadingId: string | null = null;
    demandeHistoryMap: Record<string, DemandeHistoriqueItem[]> = {};
    cancelDemandeLoading = false;
    private planningContext: MonPlanningQueryContext | null = null;

    readonly defaultDemandeTypes: DemandeTypeDefinition[] = [
        { code: 'VA', label: 'Vacances Annuelles', description: 'Congé annuel payé pris par l’employé.', color: '#0ea5e9', impact: 'neutral' },
        { code: 'AS', label: 'Astreinte', description: 'Astreinte: l’employé est disponible en cas de besoin.', color: '#7c3aed', impact: 'positive' },
        { code: 'AT', label: 'Arrêt de Travail', description: 'Arrêt maladie ou congé médical avec justificatif.', color: '#dc2626', impact: 'negative' },
        { code: 'AL', label: 'Autorisation légale', description: 'Autorisation de sortie / absence légale pendant les heures de travail.', color: '#d97706', impact: 'neutral' },
        { code: 'JR', label: 'Jour de Repos', description: 'Jour de repos sans travail planifié.', color: '#64748b', impact: 'neutral' },
        { code: 'HS', label: 'Heures supplémentaires', description: 'Heures travaillées au-delà de l’horaire planifié.', color: '#2563eb', impact: 'positive' },
        { code: 'RC+', label: 'Récupération positive', description: 'Utilisation d’un crédit RC+ acquis.', color: '#16a34a', impact: 'neutral' },
        { code: 'RC-', label: 'Récupération négative', description: 'Heures à récupérer ultérieurement.', color: '#f59e0b', impact: 'negative' },
        { code: 'ABSENCE', label: 'Absence', description: 'Absence déclarée sur un créneau planifié.', color: '#f97316', impact: 'negative' },
        { code: 'ARRET', label: 'Arrêt', description: 'Arrêt de travail.', color: '#ef4444', impact: 'negative' }
    ];
    demandeTypeDefinitions: DemandeTypeDefinition[] = [...this.defaultDemandeTypes];

    constructor(
        private readonly authService: AuthService,
        private readonly monPlanningService: MonPlanningService,
        private readonly demandeService: DemandeService,
        private readonly compteurService: CompteurService,
        private readonly planningNotificationService: PlanningNotificationService,
        private readonly confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        this.loadDemandeTypes();

        const context = this.authService.getCurrentUser();
        this.userLabel = this.buildUserLabel(context?.prenom, context?.nom);
        this.planningContext = this.getPlanningContext();
        const userId = this.planningContext?.userId ?? null;

        if (!userId || !this.planningContext?.serviceId) {
            this.planningDays = this.buildEmptyWeek(this.weekStart);
            this.planningError = 'Impossible de charger le planning personnel (utilisateur/service non disponible).';
            this.countersError = 'Impossible de charger les compteurs sans utilisateur connecté.';
            return;
        }

        this.loadPage(this.planningContext);
        this.loadCounters(userId);
    }

    get isLoading(): boolean {
        return this.planningLoading || this.countersLoading;
    }

    get hasError(): boolean {
        return !!this.planningError || !!this.countersError || !!this.demandeError;
    }

    get totalAffectations(): number {
        return this.planningDays.reduce((total, day) => total + day.affectations.length, 0);
    }

    get totalDemandes(): number {
        return this.planningDays.reduce((total, day) => total + day.demandes.length, 0);
    }

    get totalDurationMinutes(): number {
        return this.planningDays.reduce((total, day) => total + this.getDayDurationMinutes(day), 0);
    }

    get workEndHourByDate(): Record<string, string> {
        const result: Record<string, string> = {};

        for (const day of this.planningDays) {
            const endHours = (day.affectations ?? [])
                .map(item => this.normalizeHour(item.heureFin))
                .filter(value => !!value);

            if (endHours.length > 0) {
                result[day.date] = this.maxHour(endHours);
            }
        }

        return result;
    }

    get planningAvailableByDate(): Record<string, boolean> {
        const result: Record<string, boolean> = {};

        for (const day of this.planningDays) {
            result[day.date] = (day.affectations?.length ?? 0) > 0;
        }

        return result;
    }

    previousWeek(): void {
        this.weekStart = this.addDays(this.weekStart, -7);
        if (this.planningContext) {
            this.loadPage(this.planningContext);
        }
    }

    nextWeek(): void {
        this.weekStart = this.addDays(this.weekStart, 7);
        if (this.planningContext) {
            this.loadPage(this.planningContext);
        }
    }

    goToday(): void {
        const todayWeek = this.getCurrentWeekStart(new Date());
        if (this.sameDay(this.weekStart, todayWeek)) {
            return;
        }

        this.weekStart = todayWeek;
        if (this.planningContext) {
            this.loadPage(this.planningContext);
        }
    }

    openDemandeModal(defaultDate?: string): void {
        if (!this.planningContext?.userId || !this.planningContext?.serviceId) {
            this.demandeError = 'Impossible d’ouvrir le formulaire sans contexte utilisateur/service.';
            return;
        }

        this.demandeError = '';
        this.demandeSuccess = '';
        this.modalDefaultDate = defaultDate || this.toIsoDate(this.weekStart);
        this.showDemandeModal = true;
    }

    closeDemandeModal(): void {
        if (this.createDemandeLoading) {
            return;
        }

        this.showDemandeModal = false;
    }

    submitDemande(payload: DemandeCreatePayload): void {
        if (!this.planningContext?.userId || !this.planningContext?.serviceId) {
            this.demandeError = 'Utilisateur/service introuvable pour créer la demande.';
            return;
        }

        this.createDemandeLoading = true;
        this.demandeError = '';
        this.demandeSuccess = '';

        this.demandeService
            .createDemande(this.planningContext.userId, {
                ...payload,
                serviceId: this.planningContext.serviceId
            })
            .subscribe({
                next: () => {
                    this.createDemandeLoading = false;
                    this.showDemandeModal = false;
                    const normalizedType = `${payload.type ?? ''}`.trim().toUpperCase();
                    this.demandeSuccess = normalizedType === 'AT'
                        ? 'Votre arrêt de travail a été enregistré comme information.'
                        : 'Votre demande a été enregistrée et transmise au responsable.';
                    this.loadPage(this.planningContext as MonPlanningQueryContext);
                    this.loadCounters(this.planningContext!.userId);
                },
                error: (error) => {
                    this.createDemandeLoading = false;
                    this.demandeError = error?.error?.message || 'La création de la demande a échoué.';
                }
            });
    }

    isCurrentWeek(): boolean {
        return this.sameDay(this.weekStart, this.getCurrentWeekStart(new Date()));
    }

    formatDisplayDate(dateIso: string): string {
        const date = this.fromIsoDate(dateIso);
        return date.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }

    formatDemandePeriod(demande: DemandeItem | null): string {
        if (!demande?.date) {
            return '-';
        }

        const start = this.fromIsoDate(demande.date).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        if (!demande.dateFin || demande.dateFin === demande.date) {
            return start;
        }

        const end = this.fromIsoDate(demande.dateFin).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        return `${start} au ${end}`;
    }

    formatShortDate(dateIso: string): string {
        return this.fromIsoDate(dateIso).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short'
        });
    }

    isPastDay(dateIso: string): boolean {
        return this.normalizeRequestDate(dateIso) < this.toIsoDate(new Date());
    }

    formatCounterHours(value: number): string {
        return `${Number(value ?? 0).toFixed(2).replace('.', ',')} h`;
    }

    formatAffectationTime(affectation: Affectation): string {
        return `${affectation.heureDebut || '--:--'} - ${affectation.heureFin || '--:--'}`;
    }

    getAffectationTitle(affectation: Affectation): string {
        const code = `${affectation.code || ''}`.trim().toUpperCase();
        const libelle = `${affectation.libelle || ''}`.trim();

        if (code === 'HS') {
            return 'HS - Heures supplémentaires';
        }

        if (code === 'AT' || code === 'ARRET') {
            return 'AT - Arrêt de travail';
        }

        return `${affectation.code} - ${libelle}`;
    }

    isHsAffectation(affectation: Affectation): boolean {
        return `${affectation.code || ''}`.trim().toUpperCase() === 'HS';
    }

    isArretAffectation(affectation: Affectation): boolean {
        const normalized = `${affectation.code || ''}`.trim().toUpperCase();
        return normalized === 'AT' || normalized === 'ARRET';
    }

    getAffectationDurationLabel(affectation: Affectation): string {
        const minutes = this.getDurationMinutes(affectation.heureDebut, affectation.heureFin);
        return this.formatMinutesLabel(minutes);
    }

    getDayDurationLabel(day: PlanningDay): string {
        return this.formatMinutesLabel(this.getDayDurationMinutes(day));
    }

    getTotalDurationLabel(): string {
        return this.formatMinutesLabel(this.totalDurationMinutes);
    }

    getDayScheduleSummary(day: PlanningDay): string {
        const slots = [
            ...(day.affectations ?? []),
            ...(day.demandes ?? [])
        ]
            .map(item => ({
                start: this.normalizeHour((item as any)?.heureDebut),
                end: this.normalizeHour((item as any)?.heureFin)
            }))
            .filter(slot => !!slot.start && !!slot.end);

        if (slots.length === 0) {
            return 'Aucun créneau horaire';
        }

        const start = this.minHour(slots.map(slot => slot.start));
        const end = this.maxHour(slots.map(slot => slot.end));
        return `Créneaux ${start} - ${end}`;
    }

    getDayPrimaryTime(day: PlanningDay): string {
        const slots = [
            ...(day.affectations ?? []),
            ...(day.demandes ?? [])
        ]
            .map(item => ({
                start: this.normalizeHour((item as any)?.heureDebut),
                end: this.normalizeHour((item as any)?.heureFin)
            }))
            .filter(slot => !!slot.start && !!slot.end);

        if (slots.length === 0) {
            return '--:-- - --:--';
        }

        const start = this.minHour(slots.map(slot => slot.start));
        const end = this.maxHour(slots.map(slot => slot.end));
        return `${start} - ${end}`;
    }

    formatDemandeTitle(type: string): string {
        const meta = this.getDemandeTypeMeta(type);
        return `${meta.code} - ${meta.label}`;
    }

    getDemandeTypeMeta(type: string): DemandeTypeDefinition {
        const normalized = this.toDisplayCode(`${type ?? ''}`.trim().toUpperCase());
        return this.demandeTypeDefinitions.find(item => item.code === normalized)
            || this.defaultDemandeTypes.find(item => item.code === normalized)
            || {
                code: normalized as any,
                label: normalized || 'Demande',
                description: 'Type de demande non documenté.',
                color: '#64748b',
                impact: 'neutral'
            };
    }

    getDemandeTypeDescription(type: string): string {
        return this.getDemandeTypeMeta(type).description;
    }

    getDemandeTypeBadgeStyle(type: string): Record<string, string> {
        const meta = this.getDemandeTypeMeta(type);
        return {
            '--demande-type-color': meta.color
        };
    }

    getDemandeStatusLabel(status: string): string {
        const normalized = `${status ?? ''}`.trim().toLowerCase();

        if (normalized === 'annulee' || normalized === 'annule') {
            return 'Annulée';
        }

        if (normalized === 'approuve' || normalized === 'approuvee') {
            return 'Approuvée';
        }

        if (normalized === 'rejete' || normalized === 'rejetee') {
            return 'Rejetée';
        }

        if (normalized === 'informatif' || normalized === 'info' || normalized === 'notification') {
            return 'Informative';
        }

        return 'En attente';
    }

    getDemandeStatusClass(status: string): string {
        const normalized = `${status ?? ''}`.trim().toLowerCase();

        if (normalized === 'annulee' || normalized === 'annule') {
            return 'status-cancelled';
        }

        if (normalized === 'approuve' || normalized === 'approuvee') {
            return 'status-approved';
        }

        if (normalized === 'rejete' || normalized === 'rejetee') {
            return 'status-rejected';
        }

        if (normalized === 'informatif' || normalized === 'info' || normalized === 'notification') {
            return 'status-info';
        }

        return 'status-pending';
    }

    isInformationalDemande(demande: DemandeItem | any): boolean {
        const type = `${demande?.type ?? ''}`.trim().toUpperCase();
        const statut = `${demande?.statut ?? ''}`.trim().toLowerCase();
        return type === 'AT' || type === 'ARRET' || statut === 'informatif' || statut === 'info' || statut === 'notification';
    }

    getDemandeScheduleLabel(demande: any): string {
        if (this.isInformationalDemande(demande)) {
            return 'Information du jour';
        }

        const start = `${demande?.heureDebut ?? ''}`.trim() || '--:--';
        const end = `${demande?.heureFin ?? ''}`.trim() || '--:--';
        return `${start} - ${end}`;
    }

    getAffectationBadgeClass(affectation: Affectation): string {
        return affectation.badgeClass || 'shift-general';
    }

    trackByDay(_index: number, item: PlanningDay): string {
        return item.date;
    }

    trackByAffectation(_index: number, item: Affectation): string | number | undefined {
        return item.id ?? `${item.code}-${item.heureDebut}-${item.heureFin}`;
    }

    trackByDemande(_index: number, item: any): string | number | undefined {
        return item?.id ?? `${item?.type}-${item?.heureDebut}-${item?.heureFin}`;
    }

    openDemandeDetail(demande: any): void {
        if (!demande) {
            return;
        }

        this.selectedDemandeDetail = {
            id: Number(demande.id ?? 0),
            userId: this.planningContext?.userId ?? 0,
            serviceId: this.planningContext?.serviceId ?? 0,
            date: `${demande.date ?? ''}`,
            dateFin: demande.dateFin ? `${demande.dateFin}` : undefined,
            type: `${demande.type ?? ''}`,
            heureDebut: `${demande.heureDebut ?? ''}`,
            heureFin: `${demande.heureFin ?? ''}`,
            dureeHeures: Number(demande.dureeHeures ?? 0),
            commentaire: demande.commentaire,
            statut: `${demande.statut ?? ''}`,
            motifRejet: demande.motifRejet,
            traitePar: demande.traitePar,
            traiteLe: demande.traiteLe,
            createdAt: `${demande.createdAt ?? ''}`,
            updatedAt: `${demande.updatedAt ?? ''}`,
            sourceAssignmentId: demande.sourceAssignmentId,
            validePar: demande.validePar,
            valideParNom: demande.valideParNom,
            dateValidation: demande.dateValidation
        };
    }

    closeDemandeDetail(): void {
        this.selectedDemandeDetail = null;
    }

    getDemandeReceiverLabel(demande: DemandeItem | null): string {
        if (!demande) {
            return '-';
        }

        if (this.isInformationalDemande(demande)) {
            return 'Créateur';
        }

        const byName = `${demande.valideParNom ?? ''}`.trim();
        if (byName.length > 0) {
            return byName;
        }

        if (demande.validePar && demande.validePar > 0) {
            return `Utilisateur #${demande.validePar}`;
        }

        return 'Non défini';
    }

    toggleDemandeHistory(demande: any): void {
        const id = demande?.id;
        if (id === null || id === undefined) {
            return;
        }

        const historyKey = String(id);
        if (this.expandedDemandeHistoryId === historyKey) {
            this.expandedDemandeHistoryId = null;
            return;
        }

        this.expandedDemandeHistoryId = historyKey;

        if (this.demandeHistoryMap[historyKey]) {
            return;
        }

        const actingUserId = this.planningContext?.userId ?? this.getCurrentUserId() ?? 0;
        if (!actingUserId) {
            this.demandeError = 'Utilisateur introuvable pour charger l’historique.';
            return;
        }

        this.demandeError = '';
        this.demandeHistoryLoadingId = historyKey;
        this.demandeService.getHistoriqueDemande(Number(id), actingUserId).subscribe({
            next: rows => {
                this.demandeHistoryMap[historyKey] = rows ?? [];
                this.demandeHistoryLoadingId = null;
            },
            error: (error) => {
                this.demandeHistoryMap[historyKey] = [];
                this.demandeHistoryLoadingId = null;
                this.demandeError = error?.error?.message || 'Impossible de charger l’historique de la demande.';
            }
        });
    }

    isDemandeHistoryExpanded(demande: any): boolean {
        const id = demande?.id;
        return id !== null && id !== undefined && this.expandedDemandeHistoryId === String(id);
    }

    isDemandeHistoryLoading(demande: any): boolean {
        const id = demande?.id;
        return id !== null && id !== undefined && this.demandeHistoryLoadingId === String(id);
    }

    getDemandeHistory(demande: any): DemandeHistoriqueItem[] {
        const id = demande?.id;
        if (id === null || id === undefined) {
            return [];
        }

        return this.demandeHistoryMap[String(id)] ?? [];
    }

    getHistoryActionLabel(action: string): string {
        const normalized = `${action ?? ''}`.trim().toUpperCase();

        if (normalized === 'CREATED') {
            return 'Création';
        }

        if (normalized === 'APPROVED') {
            return 'Validation';
        }

        if (normalized === 'REJECTED') {
            return 'Rejet';
        }

        if (normalized === 'CANCELLED') {
            return 'Annulation';
        }

        return normalized || 'Action';
    }

    canCancelDemande(demande: DemandeItem | null): boolean {
        if (!demande || this.cancelDemandeLoading) {
            return false;
        }

        const status = `${demande.statut ?? ''}`.trim().toLowerCase();
        const canCancelByStatus = status === 'en_attente'
            || status === 'approuvee'
            || status === 'approuve'
            || status === 'informatif'
            || status === 'info'
            || status === 'notification';

        if (!canCancelByStatus) {
            return false;
        }

        const requestEndDateIso = this.normalizeRequestDate(demande.dateFin || demande.date);
        const todayIso = this.toIsoDate(new Date());
        return requestEndDateIso >= todayIso;
    }

    cancelSelectedDemande(): void {
        const demande = this.selectedDemandeDetail;
        const userId = this.planningContext?.userId ?? this.getCurrentUserId();

        if (!demande?.id || !userId || !this.canCancelDemande(demande)) {
            return;
        }

        const demandeCode = this.getDemandeTypeMeta(demande.type).code;
        const periodLabel = this.formatDemandePeriod(demande);

        this.confirmationService.confirm({
            key: 'cancel-demande-confirm',
            header: 'Annuler la demande',
            message: `Vous allez annuler la demande ${demandeCode} (${periodLabel}). Cette action est définitive.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Confirmer l\'annulation',
            rejectLabel: 'Garder la demande',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-text',
            accept: () => this.executeCancelDemande(demande.id, userId)
        });
    }

    private executeCancelDemande(demandeId: number, userId: number): void {
        if (this.cancelDemandeLoading) {
            return;
        }

        this.cancelDemandeLoading = true;
        this.demandeError = '';
        this.demandeSuccess = '';

        this.demandeService.annulerDemande(demandeId, userId).subscribe({
            next: () => {
                this.cancelDemandeLoading = false;
                this.demandeSuccess = 'La demande a été annulée avec succès.';
                this.closeDemandeDetail();
                if (this.planningContext) {
                    this.loadPage(this.planningContext);
                    this.loadCounters(this.planningContext.userId);
                }
            },
            error: (error) => {
                this.cancelDemandeLoading = false;
                this.demandeError = error?.error?.message || 'Impossible d\'annuler cette demande.';
            }
        });
    }

    getHistoryActorLabel(item: DemandeHistoriqueItem): string {
        if (item.acteurNom && item.acteurNom.trim().length > 0) {
            return item.acteurNom.trim();
        }

        if (item.acteurId) {
            return `Utilisateur #${item.acteurId}`;
        }

        return 'Système';
    }

    private loadPage(context: MonPlanningQueryContext): void {
        this.demandeError = '';
        this.planningError = '';
        this.planningLoading = true;
        this.weekEnd = this.addDays(this.weekStart, 6);
        this.weekLabel = this.buildWeekLabel(this.weekStart);
        const from = this.toIsoDate(this.weekStart);
        const to = this.toIsoDate(this.weekEnd);

        forkJoin({
            days: this.monPlanningService.getPlanning(context, this.weekStart),
            demandes: this.demandeService.getMesDemandes(context.userId, from, to).pipe(
                catchError(() => {
                    this.demandeError = 'Les demandes de la semaine n’ont pas pu être chargées.';
                    return of([] as DemandeItem[]);
                })
            )
        }).subscribe({
            next: ({ days, demandes }) => {
                this.planningDays = this.mergeDemandesIntoDays(days, demandes);
                this.expandedDemandeHistoryId = null;
                this.demandeHistoryLoadingId = null;
                this.demandeHistoryMap = {};
                this.planningLoading = false;
            },
            error: () => {
                this.planningDays = this.buildEmptyWeek(this.weekStart);
                this.planningError = 'Le planning de la semaine est momentanément indisponible.';
                this.planningLoading = false;
            }
        });
    }

    private loadCounters(userId: number): void {
        this.countersError = '';
        this.countersLoading = true;

        this.compteurService.getCompteurs(userId).subscribe({
            next: counters => {
                this.counters = counters;
                this.countersLoading = false;
            },
            error: () => {
                this.counters = {
                    solde_rc_plus_heures: 0,
                    solde_rc_moins_heures: 0
                };
                this.countersError = 'Les compteurs personnels n’ont pas pu être chargés.';
                this.countersLoading = false;
            }
        });
    }

    private mergeDemandesIntoDays(days: PlanningDay[], demandes: DemandeItem[]): PlanningDay[] {
        const grouped = new Map<string, DemandeItem[]>();
        const daySet = new Set((days ?? []).map(day => day.date));

        for (const demande of demandes ?? []) {
            const startDate = this.normalizeRequestDate(demande.date);
            const endDate = this.normalizeRequestDate(demande.dateFin || demande.date);

            for (const dateIso of this.expandDateRange(startDate, endDate)) {
                if (!daySet.has(dateIso)) {
                    continue;
                }

                const existing = grouped.get(dateIso) ?? [];
                existing.push(demande);
                grouped.set(dateIso, existing);
            }
        }

        return (days ?? []).map(day => ({
            ...day,
            demandes: (grouped.get(day.date) ?? []).map(item => ({
                id: item.id,
                date: day.date,
                type: item.type,
                statut: item.statut,
                heureDebut: this.normalizeHour(item.heureDebut),
                heureFin: this.normalizeHour(item.heureFin),
                commentaire: item.commentaire,
                motifRejet: item.motifRejet,
                validePar: item.validePar,
                valideParNom: item.valideParNom,
                dateValidation: item.dateValidation
            }))
        }));
    }

    private buildEmptyWeek(weekStart: Date): PlanningDay[] {
        return Array.from({ length: 7 }, (_, index) => {
            const date = this.addDays(weekStart, index);
            return {
                date: this.toIsoDate(date),
                nomJour: this.formatWeekday(date),
                affectations: [],
                demandes: []
            };
        });
    }

    private buildWeekLabel(weekStart: Date): string {
        const weekEnd = this.addDays(weekStart, 6);
        const startLabel = this.formatWeekdayTitle(weekStart);
        const endLabel = this.formatWeekdayTitle(weekEnd);
        return `${startLabel} ${this.formatWeekdayDate(weekStart)} - ${endLabel} ${this.formatWeekdayDate(weekEnd)}`;
    }

    private formatWeekdayTitle(date: Date): string {
        return date.toLocaleDateString('fr-FR', { weekday: 'long' });
    }

    private formatWeekdayDate(date: Date): string {
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    }

    private buildUserLabel(prenom?: string, nom?: string): string {
        const parts = [prenom, nom].map(part => `${part ?? ''}`.trim()).filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : 'Mon espace';
    }

    private getCurrentWeekStart(date: Date): Date {
        const current = this.toLocalDate(date);
        const dayIndex = current.getDay();
        const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;

        return this.addDays(current, mondayOffset);
    }

    private toLocalDate(date: Date): Date {
        const result = new Date(date);
        result.setHours(12, 0, 0, 0);
        return result;
    }

    private addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        result.setHours(12, 0, 0, 0);
        return result;
    }

    private sameDay(left: Date, right: Date): boolean {
        return this.toIsoDate(left) === this.toIsoDate(right);
    }

    private toIsoDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private fromIsoDate(dateIso: string): Date {
        const [year, month, day] = dateIso.split('-').map(Number);
        return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
    }

    private formatWeekday(date: Date): string {
        return date.toLocaleDateString('fr-FR', { weekday: 'long' });
    }

    private getPlanningContext(): MonPlanningQueryContext | null {
        const context = this.authService.getCurrentUser();
        const userId = this.getCurrentUserId();
        const serviceId = Number(context?.serviceId ?? localStorage.getItem('serviceId') ?? 0);

        if (!userId || !Number.isFinite(serviceId) || serviceId <= 0) {
            return null;
        }

        return {
            userId,
            serviceId,
            serviceName: context?.serviceNom,
            nom: context?.nom,
            prenom: context?.prenom
        };
    }

    private getCurrentUserId(): number | null {
        const contextId = this.authService.getCurrentUser()?.id;
        if (typeof contextId === 'number' && contextId > 0) {
            return contextId;
        }

        const storedId = Number(localStorage.getItem('idUser') ?? 0);
        return Number.isFinite(storedId) && storedId > 0 ? storedId : null;
    }

    private normalizeRequestDate(value: unknown): string {
        if (!value) {
            return this.toIsoDate(this.weekStart);
        }

        const date = value instanceof Date ? value : new Date(value as any);
        return Number.isNaN(date.getTime()) ? this.toIsoDate(this.weekStart) : this.toIsoDate(date);
    }

    private expandDateRange(startIso: string, endIso: string): string[] {
        const start = this.fromIsoDate(startIso);
        const end = this.fromIsoDate(endIso < startIso ? startIso : endIso);
        const result: string[] = [];

        for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
            result.push(this.toIsoDate(cursor));
        }

        return result;
    }

    private normalizeHour(value: unknown): string {
        const text = `${value ?? ''}`.trim();
        if (/^\d{2}:\d{2}$/.test(text)) {
            return text;
        }

        const withSeconds = text.match(/^(\d{2}):(\d{2}):(\d{2})$/);
        if (withSeconds) {
            return `${withSeconds[1]}:${withSeconds[2]}`;
        }

        const embedded = text.match(/(\d{2}:\d{2})(?::\d{2})?/);
        return embedded ? embedded[1] : '';
    }

    private minHour(values: string[]): string {
        return [...values].sort()[0] || '--:--';
    }

    private maxHour(values: string[]): string {
        return [...values].sort().pop() || '--:--';
    }

    private getDayDurationMinutes(day: PlanningDay): number {
        return (day.affectations ?? []).reduce(
            (total, affectation) => total + this.getDurationMinutes(affectation.heureDebut, affectation.heureFin),
            0
        );
    }

    private getDurationMinutes(start: string | undefined, end: string | undefined): number {
        const startValue = this.parseTimeToMinutes(start);
        const endValue = this.parseTimeToMinutes(end);

        if (startValue === null || endValue === null) {
            return 0;
        }

        let duration = endValue - startValue;
        if (duration < 0) {
            duration += 24 * 60;
        }

        return Math.max(0, duration);
    }

    private parseTimeToMinutes(value: string | undefined): number | null {
        const raw = `${value ?? ''}`.trim();
        if (!raw || raw === '--:--') {
            return null;
        }

        const match = raw.match(/^(\d{2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        return hours * 60 + minutes;
    }

    private formatMinutesLabel(minutes: number): string {
        const safeMinutes = Math.max(0, Math.round(minutes));
        const hours = Math.floor(safeMinutes / 60);
        const remaining = safeMinutes % 60;
        return `${hours}h${String(remaining).padStart(2, '0')}`;
    }

    private loadDemandeTypes(): void {
        this.demandeService.getDemandeTypes(false).subscribe({
            next: types => {
                const source = Array.isArray(types) && types.length > 0
                    ? types
                    : [...this.defaultDemandeTypes];
                this.demandeTypeDefinitions = this.deduplicateTypeDefinitions(source);
            },
            error: () => {
                this.demandeTypeDefinitions = this.deduplicateTypeDefinitions([...this.defaultDemandeTypes]);
            }
        });
    }

    private deduplicateTypeDefinitions(source: DemandeTypeDefinition[]): DemandeTypeDefinition[] {
        const map = new Map<string, DemandeTypeDefinition>();

        for (const item of source) {
            const displayCode = this.toDisplayCode(item.code);
            const existing = map.get(displayCode);
            const candidate: DemandeTypeDefinition = displayCode === item.code
                ? item
                : { ...item, code: displayCode as any };

            if (!existing) {
                map.set(displayCode, candidate);
                continue;
            }

            // Prefer canonical entries (AT) over legacy aliases (ARRET).
            if (item.code === displayCode) {
                map.set(displayCode, candidate);
            }
        }

        return Array.from(map.values());
    }

    private toDisplayCode(code: string): string {
        if (code === 'ARRET') {
            return 'AT';
        }
        return code;
    }
}
