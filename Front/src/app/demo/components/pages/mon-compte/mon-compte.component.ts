import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { take } from 'rxjs';
import { AuthService } from 'src/app/demo/service/auth.service';
import {
    CreatePersonalPlanningRequest,
    PersonalPlanningRequest,
    StaffService,
    UserTimeCounters
} from 'src/app/demo/service/staff.service';
import { LayoutService } from 'src/app/layout/service/app.layout.service';

type AbsenceType = 'conges' | 'formation' | 'indisponibilite';
type ColorScheme = 'light' | 'dark';

interface AccountUser {
    id: number;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    mobile: string;
    emailPersonnel: string;
    photo: string | null;
    matricule: string;
    metier: string;
    specialite: string;
    service: string;
    equipe: string;
    notifEmail: boolean;
    notifSMS: boolean;
    role: string;
}

interface AbsenceItem {
    periode: string;
    type: string;
    statut: string;
    badgeClass: string;
}

interface PasswordForm {
    password: string;
    confirmPassword: string;
}

interface PlanningDayEntry {
    id: string;
    serviceId: number;
    date: string;
    poste: string;
    heureDebut?: string;
    heureFin?: string;
    shiftType?: string;
    sourceAssignmentId?: string;
}

interface PersonalRequestForm {
    type: 'HS' | 'RC+' | 'RC-' | 'ABSENCE' | 'ARRET';
    heureDebut: string;
    heureFin: string;
    commentaire: string;
}

@Component({
    selector: 'app-mon-compte',
    templateUrl: './mon-compte.component.html',
    styleUrls: ['./mon-compte.component.scss'],
    providers: [MessageService]
})
export class MonCompteComponent implements OnInit {
    private static readonly maxProfilePhotoSizeBytes = 5 * 1024 * 1024;
    private static readonly lightTheme = 'lara-light-blue';
    private static readonly darkTheme = 'lara-dark-blue';

    loading = true;
    savingProfile = false;
    savingNotifications = false;
    savingPassword = false;
    editMode = false;
    passwordFormVisible = false;

    rawUser: any = null;
    account: AccountUser = this.getFallbackAccount();
    profileForm = this.createProfileForm(this.account);
    passwordForm: PasswordForm = { password: '', confirmPassword: '' };
    absences: AbsenceItem[] = [];

    selectedTheme: ColorScheme = 'light';
    selectedLanguage = 'fr';

    counters: UserTimeCounters | null = null;
    planningEntries: PlanningDayEntry[] = [];
    personalRequests: PersonalPlanningRequest[] = [];
    loadingPersonalPlanning = false;
    planningWeekLabel = '';
    requestModalVisible = false;
    requestSubmitting = false;
    selectedPlanningEntry: PlanningDayEntry | null = null;
    requestForm: PersonalRequestForm = {
        type: 'HS',
        heureDebut: '08:00',
        heureFin: '10:00',
        commentaire: ''
    };
    readonly requestTypeOptions: Array<{ value: PersonalRequestForm['type']; label: string }> = [
        { value: 'HS', label: 'HS - Heures supplémentaires' },
        { value: 'RC+', label: 'RC+ - Récupération positive' },
        { value: 'RC-', label: 'RC- - Récupération négative' },
        { value: 'ABSENCE', label: 'Absence (familial / maladie)' },
        { value: 'ARRET', label: 'Arrêt (jour non travaillé)' }
    ];

    constructor(
        private readonly authService: AuthService,
        private readonly staffService: StaffService,
        private readonly messageService: MessageService,
        private readonly layoutService: LayoutService,
        private readonly router: Router,
        private readonly location: Location
    ) {}

    ngOnInit(): void {
        this.selectedTheme = this.readStoredTheme();
        this.selectedLanguage = localStorage.getItem('account.language') ?? 'fr';

        const currentUserId = this.authService.getUserId();
        if (currentUserId) {
            this.loadAccount(currentUserId);
            return;
        }

        this.authService.getUserContext().pipe(take(1)).subscribe(context => {
            if (context?.id) {
                this.loadAccount(context.id);
                return;
            }

            this.loading = false;
            this.account = this.getFallbackAccount();
            this.profileForm = this.createProfileForm(this.account);
            this.absences = this.getFallbackAbsences();
        });
    }

    get fullName(): string {
        return `${this.account.prenom} ${this.account.nom}`.trim();
    }

    get hasPhoto(): boolean {
        return !!this.account.photo;
    }

    get profileInitials(): string {
        const firstInitial = this.account.prenom?.charAt(0) ?? '';
        const lastInitial = this.account.nom?.charAt(0) ?? '';
        return `${firstInitial}${lastInitial}`.toUpperCase() || 'MC';
    }

    openPhotoPicker(input: HTMLInputElement): void {
        input.click();
    }

    onPhotoSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (!file || !this.account.id) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            this.showError('Veuillez sélectionner une image valide.');
            input.value = '';
            return;
        }

        if (file.size > MonCompteComponent.maxProfilePhotoSizeBytes) {
            this.showError('La photo dépasse la taille maximale de 5 Mo.');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const photo = typeof reader.result === 'string' ? reader.result : null;
            this.staffService.updateProfilePhoto(this.account.id, photo).subscribe({
                next: () => {
                    this.account.photo = photo;
                    if (this.rawUser) {
                        this.rawUser.photo = photo;
                    }
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Photo mise à jour',
                        detail: 'Votre photo de profil a été enregistrée.'
                    });
                },
                error: () => this.showError('Impossible d’enregistrer la photo de profil.')
            });
        };
        reader.readAsDataURL(file);
        input.value = '';
    }

    enableEdit(): void {
        this.editMode = true;
        this.profileForm = this.createProfileForm(this.account);
    }

    cancelEdit(): void {
        this.editMode = false;
        this.profileForm = this.createProfileForm(this.account);
    }

    saveProfile(): void {
        if (!this.account.id || !this.profileForm.nom.trim() || !this.profileForm.prenom.trim() || !this.profileForm.email.trim()) {
            this.showError('Nom, prénom et email sont obligatoires.');
            return;
        }

        this.savingProfile = true;
        const payload = this.buildUpdatePayload({
            nom: this.profileForm.nom.trim(),
            prenom: this.profileForm.prenom.trim(),
            email: this.profileForm.email.trim(),
            telephone: this.profileForm.telephone.trim(),
            tel: this.profileForm.telephone.trim(),
            mobile: this.rawUser?.mobile ?? this.profileForm.telephone.trim(),
            emailPersonnel: this.profileForm.email.trim()
        });

        this.staffService.update(this.account.id, payload).subscribe({
            next: () => {
                this.rawUser = { ...this.rawUser, ...payload };
                this.account = this.mapAccountUser(this.rawUser);
                this.profileForm = this.createProfileForm(this.account);
                this.editMode = false;
                this.savingProfile = false;
                this.authService.refreshUserContext().pipe(take(1)).subscribe({ error: () => undefined });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Profil enregistré',
                    detail: 'Vos informations personnelles ont été mises à jour.'
                });
            },
            error: () => {
                this.savingProfile = false;
                this.showError('Impossible d’enregistrer vos informations personnelles.');
            }
        });
    }

    saveNotificationPreferences(): void {
        if (!this.account.id) {
            return;
        }

        this.savingNotifications = true;
        const payload = this.buildUpdatePayload({
            notifEmail: !!this.account.notifEmail,
            notifSMS: !!this.account.notifSMS
        });

        this.staffService.update(this.account.id, payload).subscribe({
            next: () => {
                this.rawUser = { ...this.rawUser, ...payload };
                this.savingNotifications = false;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Préférences enregistrées',
                    detail: 'Vos notifications ont été mises à jour.'
                });
            },
            error: () => {
                this.savingNotifications = false;
                this.showError('Impossible d’enregistrer les préférences de notification.');
            }
        });
    }

    togglePasswordForm(): void {
        this.passwordFormVisible = !this.passwordFormVisible;
        if (!this.passwordFormVisible) {
            this.passwordForm = { password: '', confirmPassword: '' };
        }
    }

    savePassword(): void {
        const password = this.passwordForm.password.trim();
        const confirmPassword = this.passwordForm.confirmPassword.trim();

        if (!this.account.email) {
            this.showError('Aucun email utilisateur disponible pour changer le mot de passe.');
            return;
        }

        if (password.length < 8) {
            this.showError('Le mot de passe doit contenir au moins 8 caractères.');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Les mots de passe ne correspondent pas.');
            return;
        }

        this.savingPassword = true;
        this.staffService.resetPassword({
            email: this.account.email,
            password,
            confirm_password: confirmPassword
        }).subscribe({
            next: () => {
                this.savingPassword = false;
                this.passwordFormVisible = false;
                this.passwordForm = { password: '', confirmPassword: '' };
                this.messageService.add({
                    severity: 'success',
                    summary: 'Mot de passe modifié',
                    detail: 'Votre mot de passe a été mis à jour.'
                });
            },
            error: () => {
                this.savingPassword = false;
                this.showError('Impossible de modifier le mot de passe.');
            }
        });
    }

    requestAbsence(): void {
        this.router.navigate(['/pages/indisponibilite']);
    }

    openRequestModal(entry: PlanningDayEntry): void {
        this.selectedPlanningEntry = entry;
        const hsSuggestedStart = this.getHsSuggestedStartTime(entry);
        this.requestForm = {
            type: 'HS',
            heureDebut: hsSuggestedStart,
            heureFin: entry.heureFin || '10:00',
            commentaire: ''
        };
        this.requestModalVisible = true;
    }

    onRequestTypeChange(): void {
        if (this.requestForm.type !== 'HS' || !this.selectedPlanningEntry) {
            return;
        }

        this.requestForm.heureDebut = this.getHsSuggestedStartTime(this.selectedPlanningEntry);
    }

    closeRequestModal(): void {
        this.requestModalVisible = false;
        this.selectedPlanningEntry = null;
    }

    submitPersonalRequest(): void {
        const userId = this.account.id;
        const selected = this.selectedPlanningEntry;

        if (!userId || !selected) {
            this.showError('Sélection de jour invalide.');
            return;
        }

        if (!this.requestForm.heureDebut || !this.requestForm.heureFin) {
            this.showError('Les horaires de début et de fin sont obligatoires.');
            return;
        }

        this.requestSubmitting = true;
        const hsSuggestedStart = this.requestForm.type === 'HS' && selected
            ? this.getHsSuggestedStartTime(selected)
            : null;
        if (hsSuggestedStart) {
            this.requestForm.heureDebut = hsSuggestedStart;
        }

        const startHour = this.requestForm.type === 'ARRET'
            ? '00:00'
            : (hsSuggestedStart || this.requestForm.heureDebut);
        const endHour = this.requestForm.type === 'ARRET'
            ? '23:59'
            : this.requestForm.heureFin;

        const payload: CreatePersonalPlanningRequest = {
            userId,
            serviceId: selected.serviceId,
            date: selected.date,
            type: this.requestForm.type,
            heureDebut: startHour,
            heureFin: endHour,
            commentaire: this.requestForm.commentaire?.trim() || undefined,
            sourceAssignmentId: selected.sourceAssignmentId
        };

        this.staffService.createPersonalPlanningRequest(payload).subscribe({
            next: () => {
                this.requestSubmitting = false;
                this.requestModalVisible = false;
                this.selectedPlanningEntry = null;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Demande envoyée',
                    detail: 'Votre demande a été enregistrée en attente de validation.'
                });
                this.loadPersonalPlanningData(userId);
            },
            error: (error) => {
                this.requestSubmitting = false;
                this.showError(error?.error?.message || 'Impossible d\'envoyer la demande.');
            }
        });
    }

    getRequestStatusLabel(statut: string): string {
        const value = (statut || '').toUpperCase();
        if (value === 'APPROUVEE') {
            return 'Approuvée';
        }
        if (value === 'REJETEE') {
            return 'Rejetée';
        }
        return 'En attente';
    }

    getRequestStatusClass(statut: string): string {
        const value = (statut || '').toUpperCase();
        if (value === 'APPROUVEE') {
            return 'badge-approved';
        }
        if (value === 'REJETEE') {
            return 'badge-rejected';
        }
        return 'badge-pending';
    }

    countPendingForDate(dateIso: string): number {
        return this.personalRequests.filter(r => {
            if ((r.statut || '').toUpperCase() !== 'EN_ATTENTE') {
                return false;
            }
            return this.toDateOnly(r.date) === dateIso;
        }).length;
    }

    applyDisplayPreferences(): void {
        localStorage.setItem('account.language', this.selectedLanguage);
        localStorage.setItem('account.colorScheme', this.selectedTheme);
        this.changeTheme(this.selectedTheme);
        this.messageService.add({
            severity: 'success',
            summary: 'Préférences appliquées',
            detail: 'Vos préférences d’affichage ont été enregistrées.'
        });
    }

    closePage(): void {
        if (window.history.length > 1) {
            this.location.back();
            return;
        }

        this.router.navigate(['/dashboard']);
    }

    trackByPeriod(_index: number, item: AbsenceItem): string {
        return `${item.periode}-${item.type}-${item.statut}`;
    }

    private loadAccount(userId: number): void {
        this.loading = true;
        this.staffService.getUserById(userId).subscribe({
            next: user => {
                this.rawUser = user;
                this.account = this.mapAccountUser(user);
                this.profileForm = this.createProfileForm(this.account);
                this.loadAbsences(userId);
                this.loadPersonalPlanningData(userId);
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.account = this.getFallbackAccount();
                this.profileForm = this.createProfileForm(this.account);
                this.absences = this.getFallbackAbsences();
                this.showError('Impossible de charger les informations du compte.');
            }
        });
    }

    private getHsSuggestedStartTime(entry: PlanningDayEntry): string {
        const end = `${entry?.heureFin ?? ''}`.trim();
        if (/^\d{2}:\d{2}$/.test(end)) {
            return end;
        }

        const fallbackStart = `${entry?.heureDebut ?? ''}`.trim();
        if (/^\d{2}:\d{2}$/.test(fallbackStart)) {
            return fallbackStart;
        }

        return '08:00';
    }

    private loadAbsences(userId: number): void {
        this.staffService.getUserPlanning(userId).subscribe({
            next: rows => {
                const items = (rows ?? [])
                    .map(row => this.mapAbsenceRow(row))
                    .filter((item): item is AbsenceItem => item !== null)
                    .slice(0, 6);

                this.absences = items.length > 0 ? items : this.getFallbackAbsences();
            },
            error: () => {
                this.absences = this.getFallbackAbsences();
            }
        });
    }

    private loadPersonalPlanningData(userId: number): void {
        this.loadingPersonalPlanning = true;
        const { start, end, label } = this.getCurrentWeekRange();
        this.planningWeekLabel = label;

        this.staffService.getUserPlanning(userId).subscribe({
            next: rows => {
                const mapped = (rows ?? []).map((row: any) => {
                    const serviceId = Number(row?.serviceId);
                    return {
                        id: String(row?.id ?? `${row?.date ?? ''}-${Math.random()}`),
                        serviceId: Number.isFinite(serviceId) ? serviceId : 0,
                        date: this.toDateOnly(row?.date),
                        poste: row?.poste ?? 'Affectation',
                        heureDebut: row?.heureDebut ?? undefined,
                        heureFin: row?.heureFin ?? undefined,
                        shiftType: row?.shiftType ?? undefined,
                        sourceAssignmentId: row?.id ? String(row.id) : undefined
                    } as PlanningDayEntry;
                });
                this.planningEntries = mapped
                    .filter(x => !!x.date && this.isDateInRange(x.date, start, end))
                    .sort((a, b) => a.date.localeCompare(b.date));
                this.loadingPersonalPlanning = false;
            },
            error: () => {
                this.planningEntries = [];
                this.loadingPersonalPlanning = false;
            }
        });

        this.staffService.getUserTimeCounters(userId).subscribe({
            next: counters => {
                this.counters = counters;
            },
            error: () => {
                this.counters = {
                    userId,
                    soldeRcPlus: 0,
                    soldeRcMoins: 0,
                    updatedAt: new Date().toISOString()
                };
            }
        });

        this.staffService.getPersonalPlanningRequests(userId).subscribe({
            next: requests => {
                this.personalRequests = (requests ?? []).sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
            },
            error: () => {
                this.personalRequests = [];
            }
        });
    }

    private toDateOnly(value: any): string {
        if (!value) {
            return '';
        }
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    private getCurrentWeekRange(): { start: Date; end: Date; label: string } {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

        const start = new Date(today);
        start.setDate(today.getDate() + mondayOffset);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        const fmt = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return { start, end, label: `Semaine du ${fmt(start)} au ${fmt(end)}` };
    }

    private isDateInRange(dateIso: string, start: Date, end: Date): boolean {
        const date = new Date(dateIso);
        if (Number.isNaN(date.getTime())) {
            return false;
        }

        return date >= start && date <= end;
    }

    private mapAccountUser(raw: any): AccountUser {
        const context = this.authService.getCurrentUser();
        const service = raw?.service?.nom ?? raw?.serviceNom ?? raw?.service_nom ?? context?.serviceNom ?? 'Non affecté';
        const equipe = raw?.equipe?.nom ?? raw?.equipeNom ?? raw?.equipe_nom ?? context?.equipeNom ?? 'Non affectée';
        const metier = raw?.fonction ?? this.formatRoleLabel(raw?.role) ?? 'Personnel médical';
        const specialite = raw?.specialite ?? raw?.fonction ?? 'Non renseignée';

        return {
            id: Number(raw?.id ?? context?.id ?? 0),
            nom: raw?.nom ?? context?.nom ?? 'Utilisateur',
            prenom: raw?.prenom ?? context?.prenom ?? '',
            email: raw?.email ?? context?.email ?? '',
            telephone: raw?.telephone ?? raw?.tel ?? '',
            mobile: raw?.mobile ?? raw?.telephone ?? raw?.tel ?? '',
            emailPersonnel: raw?.emailPersonnel ?? raw?.email ?? context?.email ?? '',
            photo: this.normalizePhoto(raw?.photo),
            matricule: raw?.matricule ?? 'Non renseigné',
            metier,
            specialite,
            service,
            equipe,
            notifEmail: !!raw?.notifEmail,
            notifSMS: !!raw?.notifSMS,
            role: raw?.role ?? context?.role ?? 'STAFF'
        };
    }

    private mapAbsenceRow(row: any): AbsenceItem | null {
        const type = this.resolveAbsenceType(row);
        if (!type) {
            return null;
        }

        return {
            periode: this.formatAbsencePeriod(row),
            type: this.getAbsenceTypeLabel(type),
            statut: this.getAbsenceStatusLabel(row?.statut ?? row?.status),
            badgeClass: this.getAbsenceBadgeClass(type, row?.statut ?? row?.status)
        };
    }

    private resolveAbsenceType(row: any): AbsenceType | null {
        const rawType = `${row?.type ?? row?.shiftType ?? ''}`.toLowerCase();
        const rawPoste = `${row?.poste ?? ''}`.toLowerCase();
        const combined = `${rawType} ${rawPoste}`;

        if (combined.includes('cong')) {
            return 'conges';
        }
        if (combined.includes('formation')) {
            return 'formation';
        }
        if (combined.includes('absence') || combined.includes('indispo') || combined.includes('repos')) {
            return 'indisponibilite';
        }

        return null;
    }

    private formatAbsencePeriod(row: any): string {
        const startDate = row?.dateDebut ?? row?.startDate ?? row?.date;
        const endDate = row?.dateFin ?? row?.endDate ?? row?.date;
        const start = this.formatDate(startDate);
        const end = this.formatDate(endDate);

        if (!start && !end) {
            return 'Période non renseignée';
        }
        if (!end || start === end) {
            return start;
        }
        return `${start} - ${end}`;
    }

    private formatDate(value: any): string {
        if (!value) {
            return '';
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return date.toLocaleDateString('fr-FR');
    }

    private getAbsenceTypeLabel(type: AbsenceType): string {
        const labels: Record<AbsenceType, string> = {
            conges: 'Congés',
            formation: 'Formation',
            indisponibilite: 'Indisponibilité'
        };
        return labels[type];
    }

    private getAbsenceStatusLabel(status: any): string {
        const normalized = `${status ?? ''}`.toLowerCase();
        if (normalized.includes('attente') || normalized.includes('pending')) {
            return 'En attente';
        }
        if (normalized.includes('val') || normalized.includes('approv')) {
            return 'Validé';
        }
        return 'Planifié';
    }

    private getAbsenceBadgeClass(type: AbsenceType, status: any): string {
        const base = type === 'conges' ? 'badge-blue' : type === 'formation' ? 'badge-amber' : 'badge-slate';
        const normalized = `${status ?? ''}`.toLowerCase();
        if (normalized.includes('attente') || normalized.includes('pending')) {
            return `${base} is-pending`;
        }
        return base;
    }

    private createProfileForm(account: AccountUser): { nom: string; prenom: string; email: string; telephone: string } {
        return {
            nom: account.nom,
            prenom: account.prenom,
            email: account.email,
            telephone: account.telephone || account.mobile
        };
    }

    private buildUpdatePayload(overrides: Record<string, unknown>): any {
        const source = this.rawUser ?? {};

        return {
            ...source,
            ...overrides,
            serviceId: source?.serviceId ?? source?.service_id ?? null,
            equipeId: source?.equipeId ?? source?.equipe_id ?? null,
            poleId: source?.poleId ?? source?.pole_id ?? null,
            role: source?.role ?? this.account.role,
            specialite: source?.specialite ?? this.account.specialite,
            matricule: source?.matricule ?? this.account.matricule,
            affectations: Array.isArray(source?.affectations) ? source.affectations : []
        };
    }

    private formatRoleLabel(role: any): string | null {
        if (!role) {
            return null;
        }

        return role
            .toString()
            .toLowerCase()
            .split(/[_-]/g)
            .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private normalizePhoto(photo: unknown): string | null {
        return typeof photo === 'string' && photo.trim().length > 0 ? photo : null;
    }

    private getFallbackAccount(): AccountUser {
        const context = this.authService.getCurrentUser();
        return {
            id: context?.id ?? 0,
            nom: context?.nom ?? localStorage.getItem('nom') ?? 'Khoubaib',
            prenom: context?.prenom ?? localStorage.getItem('prenom') ?? 'Abdeljawed',
            email: context?.email ?? localStorage.getItem('email') ?? 'utilisateur@clinisysy.local',
            telephone: '',
            mobile: '',
            emailPersonnel: context?.email ?? localStorage.getItem('email') ?? 'utilisateur@clinisysy.local',
            photo: null,
            matricule: 'MED-001',
            metier: 'Médecin',
            specialite: 'Cardiologie',
            service: context?.serviceNom ?? 'Cardiologie',
            equipe: context?.equipeNom ?? 'Équipe A',
            notifEmail: true,
            notifSMS: false,
            role: context?.role ?? 'STAFF'
        };
    }

    private getFallbackAbsences(): AbsenceItem[] {
        return [
            {
                periode: '01/04/2026 - 15/04/2026',
                type: 'Congés',
                statut: 'Validé',
                badgeClass: 'badge-blue'
            },
            {
                periode: '20/05/2026 - 22/05/2026',
                type: 'Formation',
                statut: 'En attente',
                badgeClass: 'badge-amber is-pending'
            }
        ];
    }

    private readStoredTheme(): ColorScheme {
        const stored = localStorage.getItem('account.colorScheme') as ColorScheme | null;
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }

        return this.layoutService.getConfig().colorScheme ?? 'light';
    }

    private changeTheme(colorScheme: ColorScheme): void {
        const theme = colorScheme === 'dark' ? MonCompteComponent.darkTheme : MonCompteComponent.lightTheme;
        const themeLink = document.getElementById('theme-css') as HTMLLinkElement | null;
        const currentTheme = this.layoutService.config.theme || MonCompteComponent.lightTheme;

        if (!themeLink?.getAttribute('href')) {
            this.layoutService.updateConfig({ colorScheme, theme });
            return;
        }

        const nextHref = themeLink.getAttribute('href')!.replace(currentTheme, theme);
        this.replaceThemeLink(nextHref, () => {
            this.layoutService.config.theme = theme;
            this.layoutService.config.colorScheme = colorScheme;
            this.layoutService.onConfigUpdate$.next(this.layoutService.config);
        });
    }

    private replaceThemeLink(href: string, onComplete: () => void): void {
        const id = 'theme-css';
        const themeLink = document.getElementById(id) as HTMLLinkElement | null;
        if (!themeLink) {
            onComplete();
            return;
        }

        const cloneLinkElement = themeLink.cloneNode(true) as HTMLLinkElement;
        cloneLinkElement.setAttribute('href', href);
        cloneLinkElement.setAttribute('id', `${id}-clone`);

        themeLink.parentNode?.insertBefore(cloneLinkElement, themeLink.nextSibling);
        cloneLinkElement.addEventListener('load', () => {
            themeLink.remove();
            cloneLinkElement.setAttribute('id', id);
            onComplete();
        });
    }

    private showError(detail: string): void {
        this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail
        });
    }
}