import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { combineLatest } from 'rxjs';
import { StaffService } from 'src/app/demo/service/staff.service';
import { AuthService } from 'src/app/demo/service/auth.service';

// Interfaces
interface Role {
  id: string;
  name: string;
  since: Date;
  by: string;
  expiration?: Date;
  isPrimary: boolean;
}

interface Permission {
  module: string;
  read: boolean;
  write: boolean;
  validate: boolean;
  admin: boolean;
}

interface Affectation {
  id: string | number;
  service: string;
  equipe: string;
  role: string;
  dateDebut: Date;
  dateFin?: Date;
  taux: number;
  postes: string[];
  isPrimary: boolean;
}

interface Planning {
  id: string;
  date: Date;
  poste: string;
  heureDebut: string;
  heureFin: string;
  type: 'shift' | 'conge' | 'repos';
}

interface HistoryEvent {
  id: string;
  type: string;
  title: string;
  date: Date;
  icon: string;
  color: string;
  by?: string;
  details?: any;
}

interface CalendarCell {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  plannings: Planning[];
}

interface User {
  id: string;
  titre?: string;
  nom: string;
  prenom: string;
  specialite: string;
  photo?: string | null;
  email: string;
  telephone: string;
  mobile: string;
  dateNaissance: Date | null;
  lieuNaissance: string;
  nationalite: string;
  adresse: string;
  emailPersonnel: string;
  telephoneUrgence: string;
  contactUrgence: string;
  situationFamiliale: string;
  diplome: string;
  universite: string;
  dateEmbauche: Date;
  numeroRPPS: string;
  numeroSecuriteSociale: string;
  competences: string[];
  langues: string[];
  formations: string[];
  service: string;
  equipe: string;
  statut: 'actif' | 'inactif' | 'en-conge' | 'verrou';
  matricule: string;
  derniereConnexion: Date;
  planningsAVenir: number;
  gardesAVenir: number;
  congesRestants: number;
  ancieneteMois: number;
}

interface PasswordForm {
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-user-detail',
  templateUrl: './user-detail.component.html',
  styleUrls: ['./user-detail.component.scss'],
  providers: [MessageService, DialogService]
})
export class UserDetailComponent implements OnInit {
  private static readonly MAX_PROFILE_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
  private static readonly SUPER_ADMIN_EMAIL = 'admin@hopital.fr';
  private static readonly SUPER_ADMIN_WHATSAPP = '23448595';

  user: User;
  roles: Role[] = [];
  affectations: Affectation[] = [];
  plannings: Planning[] = [];
  history: HistoryEvent[] = [];
  permissions: Permission[] = [];

  // UI State
  activeTab: number = 0;
  activeSubTab: number = 0;
  showEditModal: boolean = false;
  showAddAffectationModal: boolean = false;
  showResetPasswordModal: boolean = false;
  showDeactivateModal: boolean = false;
  showMoreActionsMenu: boolean = false;

  // Filters
  planningFilter: string = 'thisMonth';
  planningStatusFilter: string = 'all';
  historyTypeFilter: string = 'all';
  planningViewMode: 'month' | 'week' = 'month';

  // Planning state
  currentPlanningMonth: Date = new Date();

  // Form data
  newAffectation: Affectation = {
    id: '',
    service: '',
    equipe: '',
    role: '',
    dateDebut: new Date(),
    taux: 100,
    postes: [],
    isPrimary: false
  };

  servicesCatalog: any[] = [];
  equipesCatalog: any[] = [];

  deactivateReason: string = '';
  deactivateDate: Date | undefined;
  deactivateReasons: any[] = [
    { label: 'Départ de l\'établissement', value: 'departure' },
    { label: 'Congé longue durée', value: 'long_leave' },
    { label: 'Compte temporaire expiré', value: 'temp_expired' },
    { label: 'Autre', value: 'other' }
  ];
  planningFilters: any[] = [
    { label: 'Ce mois', value: 'thisMonth' },
    { label: 'Mois prochain', value: 'nextMonth' },
    { label: 'Trimestre', value: 'quarter' },
    { label: 'Personnalisé', value: 'custom' }
  ];
  historyTypeFilters: any[] = [
    { label: 'Tous', value: 'all' },
    { label: 'Connexions', value: 'connexion' },
    { label: 'Modifications', value: 'modification' },
    { label: 'Plannings', value: 'planning' }
  ];
  resetPasswordOption: string = 'sendEmail';
  staffPasswordForm: PasswordForm = { password: '', confirmPassword: '' };
  changingPassword = false;
  private currentUserRole = '';
  private currentUserId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService,
    private dialogService: DialogService,
    private staffService: StaffService,
    private authService: AuthService
  ) {
    this.user = this.getDummyUser();
  }

  ngOnInit(): void {
    this.refreshViewerContext();
    this.loadAffectationCatalogs();
    combineLatest([
      this.route.paramMap,
      this.route.parent?.paramMap ?? this.route.paramMap
    ]).subscribe(([params, parentParams]) => {
      this.refreshViewerContext();
      const userId = params.get('id') ?? parentParams.get('id');
      if (!userId) {
        if (this.isStaffViewer() && this.currentUserId) {
          this.router.navigate(['/pages/utilisateurs', this.currentUserId], { replaceUrl: true });
          return;
        }
        this.applyFallbackData();
        return;
      }

      this.loadUserData(userId);
    });
  }

  private loadAffectationCatalogs(): void {
    this.staffService.getServices().subscribe({
      next: (services) => {
        this.servicesCatalog = services ?? [];
      },
      error: () => {
        this.servicesCatalog = [];
      }
    });

    this.staffService.getEquipes().subscribe({
      next: (equipes) => {
        this.equipesCatalog = equipes ?? [];
      },
      error: () => {
        this.equipesCatalog = [];
      }
    });
  }

  loadUserData(userId: string): void {
    const numericId = Number(userId);

    if (this.isStaffViewer() && this.currentUserId && numericId !== this.currentUserId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Accès limité',
        detail: 'Le rôle STAFF peut consulter uniquement son propre compte.'
      });
      this.router.navigate(['/pages/utilisateurs', this.currentUserId], { replaceUrl: true });
      return;
    }

    const selectedUser = history.state?.selectedUser;
    if (selectedUser?.id && selectedUser.id.toString() === userId.toString()) {
      this.user = this.mapStaffUserToDetail(selectedUser);
      this.loadRoles(selectedUser, numericId);
      this.loadAffectations(selectedUser, numericId);
      this.loadPlannings(selectedUser, numericId);
      this.loadHistory(selectedUser, numericId);
      this.loadPermissions();
      return;
    }

    if (!Number.isFinite(numericId) || numericId <= 0) {
      this.applyFallbackData();
      return;
    }

    this.staffService.getUserById(numericId).subscribe({
      next: (staffUser) => {
        this.user = this.mapStaffUserToDetail(staffUser);
        // If backend doesn't yet return photo (needs restart), use cached value
        if (!this.user.photo) {
          this.user.photo = this.getCachedPhoto(numericId);
        } else {
          // Backend returned photo: keep cache in sync
          this.setCachedPhoto(numericId, this.user.photo);
        }
        this.loadRoles(staffUser, numericId);
        this.loadAffectations(staffUser, numericId);
        this.loadPlannings(staffUser, numericId);
        this.loadHistory(staffUser, numericId);
        this.loadPermissions();
      },
      error: () => {
        this.applyFallbackData();
        this.messageService.add({
          severity: 'warn',
          summary: 'Utilisateur non trouvé',
          detail: 'Affichage des données de démonstration.'
        });
      }
    });
  }

  private applyFallbackData(): void {
    this.user = this.getDummyUser();
    this.loadRoles();
    this.loadAffectations();
    this.loadPlannings();
    this.loadHistory();
    this.loadPermissions();
  }

  private mapStaffUserToDetail(staffUser: any): User {
    const now = new Date();
    const fullName = `${staffUser?.prenom ?? ''} ${staffUser?.nom ?? ''}`.trim();
    const parsedDateNaissance = this.parseLocalDate(staffUser?.dateNaissance);
    const parsedDateEmbauche = this.parseLocalDate(staffUser?.dateEmbauche);
    const derniereConnexion = this.resolveDerniereConnexion(staffUser) ?? now;
    const ancieneteMois = parsedDateEmbauche ? this.calculateAncienneteMois(parsedDateEmbauche) : 0;
    const planningsAVenir = this.parseNumberSafe(
      staffUser?.planningsAVenir ?? staffUser?.planningsCount ?? staffUser?.planningCount,
      0
    );
    const civilite = (staffUser?.civilite ?? '').toString().toUpperCase();
    const title = civilite === 'DR' ? 'Dr' : civilite === 'PR' ? 'Pr' : civilite === 'M' ? 'M.' : civilite === 'MME' ? 'Mme' : 'Dr';
    const effectiveDateEmbauche = parsedDateEmbauche ?? now;
    const competences = Array.isArray(staffUser?.competences)
      ? staffUser.competences.filter((item: any) => !!item).map((item: any) => item.toString())
      : (staffUser?.specialite ? [staffUser.specialite] : []);

    return {
      id: (staffUser?.id ?? '').toString(),
      titre: title,
      nom: staffUser?.nom ?? 'N/A',
      prenom: staffUser?.prenom ?? 'N/A',
      specialite: staffUser?.specialite ?? 'Non renseignée',
      photo: this.normalizePhotoValue(staffUser?.photo),
      email: staffUser?.email ?? 'non.renseigne@clinisysy.local',
      telephone: staffUser?.telephone ?? staffUser?.tel ?? 'Non renseigné',
      mobile: staffUser?.mobile ?? staffUser?.telephone ?? staffUser?.tel ?? 'Non renseigné',
      dateNaissance: parsedDateNaissance,
      lieuNaissance: 'Non renseigné',
      nationalite: 'Non renseignée',
      adresse: staffUser?.adresse ?? 'Non renseignée',
      emailPersonnel: staffUser?.emailPersonnel ?? staffUser?.email ?? 'non.renseigne@clinisysy.local',
      telephoneUrgence: staffUser?.telephone ?? staffUser?.tel ?? 'Non renseigné',
      contactUrgence: fullName || 'Non renseigné',
      situationFamiliale: 'Non renseignée',
      diplome: staffUser?.diplome ?? 'Non renseigné',
      universite: staffUser?.universite ?? 'Non renseignée',
      dateEmbauche: effectiveDateEmbauche,
      numeroRPPS: staffUser?.rpps ?? 'Non renseigné',
      numeroSecuriteSociale: staffUser?.secu ?? 'Non renseigné',
      competences,
      langues: ['Français'],
      formations: [],
      service: staffUser?.service?.nom ?? 'Service non affecté',
      equipe: staffUser?.equipe?.nom ?? 'Équipe non affectée',
      statut: staffUser?.actif ? 'actif' : 'inactif',
      matricule: staffUser?.matricule ?? 'Non renseigné',
      derniereConnexion,
      planningsAVenir,
      gardesAVenir: 0,
      congesRestants: 0,
      ancieneteMois
    };
  }

  getDummyUser(): User {
    return {
      id: '1',
      titre: 'Dr',
      nom: 'DUPONT',
      prenom: 'Jean',
      specialite: 'Cardiologue',
      photo: null,
      email: 'jean.dupont@hopital.fr',
      telephone: '01 23 45 67 89',
      mobile: '06 12 34 56 78',
      dateNaissance: new Date('1985-05-15'),
      lieuNaissance: 'Paris',
      nationalite: 'Française',
      adresse: '15 rue de la Paix, 75001 Paris',
      emailPersonnel: 'jean.dupont@gmail.com',
      telephoneUrgence: '01 23 45 67 89',
      contactUrgence: 'Mme DUPONT (Épouse)',
      situationFamiliale: 'Marié(e), 2 enfants',
      diplome: 'Doctorat en médecine',
      universite: 'Université Paris Descartes',
      dateEmbauche: new Date('2020-09-01'),
      numeroRPPS: '10002567890',
      numeroSecuriteSociale: '1 85 05 75 123 456 78',
      competences: ['Urgentiste', 'Échographie', 'Cathétérisme'],
      langues: ['Français', 'Anglais', 'Espagnol'],
      formations: ['DJU Urgences cardiaques (2024)', 'Certification échocardiographie (2022)'],
      service: 'Cardiologie',
      equipe: 'Équipe A',
      statut: 'actif',
      matricule: 'MED-001',
      derniereConnexion: new Date(Date.now() - 24 * 60 * 60 * 1000),
      planningsAVenir: 3,
      gardesAVenir: 4,
      congesRestants: 12,
      ancieneteMois: 62
    };
  }

  loadRoles(staffUser?: any, userId?: number): void {
    const normalizedUserId = userId ?? Number(staffUser?.id ?? this.user?.id);
    const currentRole = (staffUser?.role ?? '').toString().trim();

    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      this.roles = currentRole ? [{
        id: '1',
        name: currentRole,
        since: new Date(),
        by: 'Admin GTA',
        isPrimary: true
      }] : [];
      return;
    }

    this.staffService.getUserRoles(normalizedUserId).subscribe({
      next: (roles) => {
        this.roles = (roles ?? []).map((role: any, index: number) => ({
          id: (role?.id ?? `${index + 1}`).toString(),
          name: role?.name ?? 'STAFF',
          since: role?.since ? new Date(role.since) : new Date(),
          by: role?.by ?? 'Admin GTA',
          expiration: role?.expiration ? new Date(role.expiration) : undefined,
          isPrimary: !!role?.isPrimary
        }));

        if (this.roles.length === 0 && currentRole) {
          this.roles = [{
            id: '1',
            name: currentRole,
            since: new Date(),
            by: 'Admin GTA',
            isPrimary: true
          }];
        }
      },
      error: () => {
        this.roles = currentRole ? [{
          id: '1',
          name: currentRole,
          since: new Date(),
          by: 'Admin GTA',
          isPrimary: true
        }] : [];
      }
    });
  }

  loadAffectations(staffUser?: any, userId?: number): void {
    const normalizedUserId = userId ?? Number(staffUser?.id ?? this.user?.id);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      this.affectations = [];
      return;
    }

    this.staffService.getUserAffectations(normalizedUserId).subscribe({
      next: (affectations) => {
        this.affectations = (affectations ?? []).map((aff: any, index: number) => ({
          id: (aff?.id ?? `aff-${index + 1}`).toString(),
          service: aff?.service ?? 'Service non affecté',
          equipe: aff?.equipe ?? 'Équipe non affectée',
          role: aff?.role ?? (staffUser?.role ?? 'STAFF'),
          dateDebut: aff?.dateDebut ? new Date(aff.dateDebut) : new Date(),
          dateFin: aff?.dateFin ? new Date(aff.dateFin) : undefined,
          taux: Number(aff?.taux ?? 100),
          postes: Array.isArray(aff?.postes) ? aff.postes : [],
          isPrimary: !!aff?.isPrimary
        }));
      },
      error: () => {
        this.affectations = [];
      }
    });
  }

  loadPlannings(staffUser?: any, userId?: number): void {
    const normalizedUserId = userId ?? Number(staffUser?.id ?? this.user?.id);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      this.plannings = [];
      return;
    }

    this.staffService.getUserPlanning(normalizedUserId).subscribe({
      next: (rows) => {
        this.plannings = (rows ?? []).map((row: any) => {
          const rawType = (row?.type ?? '').toString().toLowerCase();
          const rawPoste = (row?.poste ?? row?.shiftType ?? '').toString().toLowerCase();
          let type: 'shift' | 'conge' | 'repos' = 'shift';
          if (rawType === 'conge' || rawPoste.includes('cong')) type = 'conge';
          else if (rawType === 'repos' || rawPoste.includes('repos')) type = 'repos';
          return {
            id: (row?.id ?? '').toString(),
            date: row?.date ? new Date(row.date) : new Date(),
            poste: row?.poste ?? row?.shiftType ?? 'Poste non défini',
            heureDebut: row?.heureDebut ?? row?.startTime ?? '--:--',
            heureFin: row?.heureFin ?? row?.endTime ?? '--:--',
            type
          };
        });

        // Prefer real count from loaded planning rows to keep the right-column metric accurate.
        this.user.planningsAVenir = this.computeUpcomingPlanningsCount(this.plannings);
      },
      error: () => {
        this.plannings = [];
        this.user.planningsAVenir = 0;
      }
    });
  }

  loadHistory(staffUser?: any, userId?: number): void {
    const normalizedUserId = userId ?? Number(staffUser?.id ?? this.user?.id);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      this.history = [];
      return;
    }

    this.staffService.getUserHistory(normalizedUserId).subscribe({
      next: (events) => {
        this.history = (events ?? []).map((event: any) => ({
          id: (event?.id ?? '').toString(),
          type: event?.type ?? 'event',
          title: event?.title ?? 'Événement',
          date: event?.date ? new Date(event.date) : new Date(),
          icon: event?.icon ?? 'pi-history',
          color: event?.color ?? '#64748b',
          by: event?.by,
          details: event?.details
        }));

        const lastConnexionFromHistory = this.resolveDerniereConnexionFromHistory(this.history);
        if (lastConnexionFromHistory) {
          this.user.derniereConnexion = lastConnexionFromHistory;
        }
      },
      error: () => {
        this.history = [];
      }
    });
  }

  loadPermissions(): void {
    this.permissions = [
      { module: 'Utilisateurs', read: true, write: true, validate: false, admin: false },
      { module: 'Plannings', read: true, write: true, validate: true, admin: false },
      { module: 'Postes', read: true, write: false, validate: false, admin: false },
      { module: 'Règles', read: true, write: false, validate: false, admin: false },
      { module: 'Rapports', read: true, write: false, validate: false, admin: false }
    ];
  }

  getAnciennetDisplay(): string {
    const years = Math.floor(this.user.ancieneteMois / 12);
    const months = this.user.ancieneteMois % 12;
    return `${years} ans ${months} mois`;
  }

  getStatusColor(): string {
    switch (this.user.statut) {
      case 'actif': return '#10b981';
      case 'inactif': return '#64748b';
      case 'en-conge': return '#f59e0b';
      case 'verrou': return '#ef4444';
      default: return '#64748b';
    }
  }

  getStatusLabel(): string {
    const labels = {
      'actif': 'Actif',
      'inactif': 'Inactif',
      'en-conge': 'En congé',
      'verrou': 'Verrouillé'
    };
    return labels[this.user.statut];
  }

  getPrimaryRole(): Role {
    return this.roles.find(r => r.isPrimary) || this.roles[0];
  }

  getPrimaryAffectation(): Affectation {
    return this.affectations.find(a => a.isPrimary) || this.affectations[0];
  }

  openProfilePhotoPicker(input: HTMLInputElement): void {
    input.click();
  }

  async onProfilePhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Format non supporté',
        detail: 'Veuillez sélectionner une image PNG, JPG ou WEBP.'
      });
      input.value = '';
      return;
    }

    if (file.size > UserDetailComponent.MAX_PROFILE_PHOTO_SIZE_BYTES) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Image trop volumineuse',
        detail: 'La taille maximale autorisée est de 2 Mo.'
      });
      input.value = '';
      return;
    }

    try {
      const photoDataUrl = await this.resizeImageToDataUrl(file);
      const userId = Number(this.user?.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        this.messageService.add({
          severity: 'error',
          summary: 'Utilisateur invalide',
          detail: 'Impossible de sauvegarder la photo pour cet utilisateur.'
        });
        return;
      }

      this.persistPhotoWithLegacyUpdate(userId, photoDataUrl);
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur de lecture',
        detail: 'Impossible de lire le fichier image.'
      });
    } finally {
      input.value = '';
    }
  }

  // Actions
  editUser(): void {
    if (!this.canEditUser()) {
      return;
    }

    const userId = Number(this.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Utilisateur invalide' });
      return;
    }

    this.router.navigate(['/pages/utilisateurs'], {
      queryParams: { editId: userId }
    });
  }

  sendEmail(): void {
    if (this.isStaffViewer()) {
      const text = encodeURIComponent(`Bonjour Super Admin, je suis ${this.user.prenom} ${this.user.nom} et j'ai besoin d'assistance sur mon compte.`);
      window.open(`https://wa.me/${UserDetailComponent.SUPER_ADMIN_WHATSAPP}?text=${text}`, '_blank');
      this.messageService.add({
        severity: 'info',
        summary: 'WhatsApp Super Admin',
        detail: `Ouverture de WhatsApp vers ${UserDetailComponent.SUPER_ADMIN_WHATSAPP}.`
      });
      return;
    }

    window.location.href = `mailto:${this.user.email}`;
    this.messageService.add({ severity: 'info', summary: 'Email', detail: `Ouverture du client mail vers ${this.user.email}.` });
  }

  resetPassword(): void {
    this.staffPasswordForm = { password: '', confirmPassword: '' };
    this.showResetPasswordModal = true;
  }

  confirmResetPassword(): void {
    if (this.isStaffViewer()) {
      const password = this.staffPasswordForm.password.trim();
      const confirmPassword = this.staffPasswordForm.confirmPassword.trim();

      if (!this.user.email) {
        this.showError('Email utilisateur introuvable pour modifier le mot de passe.');
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

      this.changingPassword = true;
      this.staffService.resetPassword({
        email: this.user.email,
        password,
        confirm_password: confirmPassword
      }).subscribe({
        next: () => {
          this.changingPassword = false;
          this.showResetPasswordModal = false;
          this.staffPasswordForm = { password: '', confirmPassword: '' };
          this.messageService.add({
            severity: 'success',
            summary: 'Mot de passe modifié',
            detail: 'Votre mot de passe a été mis à jour avec succès.'
          });
        },
        error: () => {
          this.changingPassword = false;
          this.showError('Impossible de modifier le mot de passe.');
        }
      });
      return;
    }

    if (this.resetPasswordOption === 'sendEmail') {
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Email de réinitialisation envoyé' });
    } else {
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Mot de passe temporaire généré' });
    }
    this.showResetPasswordModal = false;
  }

  deactivateAccount(): void {
    if (!this.canDeactivateUser()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Action non autorisée',
        detail: 'Le rôle STAFF ne peut pas désactiver un compte.'
      });
      return;
    }

    this.showDeactivateModal = true;
  }

  confirmDeactivate(): void {
    if (this.deactivateReason) {
      this.user.statut = 'inactif';
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Compte désactivé' });
      this.showDeactivateModal = false;
    }
  }

  addAffectation(): void {
    this.showAddAffectationModal = true;
  }

  saveAffectation(): void {
    const userId = Number(this.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Utilisateur invalide' });
      return;
    }

    const selectedService: any = this.newAffectation.service;
    const selectedEquipe: any = this.newAffectation.equipe;
    const serviceName = typeof selectedService === 'string' ? selectedService : selectedService?.nom;
    const equipeName = typeof selectedEquipe === 'string' ? selectedEquipe : selectedEquipe?.nom;

    if (!serviceName || !equipeName || !this.newAffectation.dateDebut) {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Service, équipe et date de début sont obligatoires' });
      return;
    }

    const payload = {
      serviceId: typeof selectedService === 'object' ? selectedService?.id : null,
      serviceName,
      equipeId: typeof selectedEquipe === 'object' ? selectedEquipe?.id : null,
      equipeName,
      role: this.newAffectation.role || this.getPrimaryRole()?.name || 'STAFF',
      dateDebut: this.newAffectation.dateDebut,
      dateFin: this.newAffectation.dateFin,
      taux: this.newAffectation.taux,
      isPrimary: this.newAffectation.isPrimary
    };

    this.staffService.createUserAffectation(userId, payload).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Affectation ajoutée' });
        this.showAddAffectationModal = false;
        this.newAffectation = {
          id: '',
          service: '',
          equipe: '',
          role: '',
          dateDebut: new Date(),
          taux: 100,
          postes: [],
          isPrimary: false
        };
        this.loadAffectations(undefined, userId);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible d\'ajouter l\'affectation' });
      }
    });
  }

  removeAffectation(id: string): void {
    const userId = Number(this.user?.id);
    const affectationId = Number(id);

    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(affectationId) || affectationId <= 0) {
      this.affectations = this.affectations.filter(a => `${a.id}` !== `${id}`);
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Affectation supprimée' });
      return;
    }

    this.staffService.deleteUserAffectation(userId, affectationId).subscribe({
      next: () => {
        this.affectations = this.affectations.filter(a => `${a.id}` !== `${id}`);
        this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Affectation supprimée' });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de supprimer l\'affectation' });
      }
    });
  }

  viewPlanning(): void {
    this.activeTab = 3;
    this.planningViewMode = 'week';
    this.currentPlanningMonth = new Date();

    if (this.filteredPlannings.length === 0) {
      this.messageService.add({
        severity: 'info',
        summary: 'Planning hebdomadaire',
        detail: 'Aucun planning disponible pour cette semaine.'
      });
    }
  }

  exportHistory(): void {
    this.messageService.add({ severity: 'info', summary: 'Historique', detail: 'Export en cours...' });
  }

  goBack(): void {
    this.router.navigate(['/pages/utilisateurs']);
  }

  goToUsersList(): void {
    this.router.navigate(['/pages/utilisateurs']);
  }

  goToMyProfile(): void {
    const currentUserId = localStorage.getItem('idUser') || '1';
    this.router.navigate(['/pages/utilisateurs', currentUserId]);
  }

  toggleMoreActions(): void {
    this.showMoreActionsMenu = !this.showMoreActionsMenu;
  }

  closeEditModal(): void {
    this.showEditModal = false;
  }

  closeAddAffectationModal(): void {
    this.showAddAffectationModal = false;
  }

  closeResetPasswordModal(): void {
    this.showResetPasswordModal = false;
  }

  closeDeactivateModal(): void {
    this.showDeactivateModal = false;
  }

  isStaffViewer(): boolean {
    return this.currentUserRole === 'staff';
  }

  canEditUser(): boolean {
    return !this.isStaffViewer();
  }

  canDeactivateUser(): boolean {
    return !this.isStaffViewer();
  }

  getResetPasswordLabel(): string {
    return this.isStaffViewer() ? 'Modifier MDP' : 'Réinitialiser MDP';
  }

  setActiveTab(index: number): void {
    this.activeTab = index;
    if (index !== 3) {
      this.planningViewMode = 'month';
    }
  }

  setActiveSubTab(index: number): void {
    this.activeSubTab = index;
  }

  getAge(): number {
    if (!this.user?.dateNaissance || Number.isNaN(new Date(this.user.dateNaissance).getTime())) {
      return 0;
    }

    const today = new Date();
    let age = today.getFullYear() - this.user.dateNaissance.getFullYear();
    const month = today.getMonth() - this.user.dateNaissance.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < this.user.dateNaissance.getDate())) {
      age--;
    }
    return age;
  }

  getDateNaissanceDisplay(): string {
    if (!this.user?.dateNaissance || Number.isNaN(new Date(this.user.dateNaissance).getTime())) {
      return 'Non renseignée';
    }

    const formatted = this.formatDate(this.user.dateNaissance);
    const age = this.getAge();
    return `${formatted} (${age} ans)`;
  }

  formatDate(date: Date | null | undefined): string {
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return 'Non renseignée';
    }

    return new Intl.DateTimeFormat('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
  }

  formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  private parseDateTime(value: any): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private refreshViewerContext(): void {
    const roleFromContext = (this.authService.getUserRole() || '').trim().toLowerCase();
    const roleFromStorage = (localStorage.getItem('role') || '').trim().toLowerCase().replace(/_/g, '-');
    this.currentUserRole = roleFromContext || roleFromStorage;

    const fromContext = this.authService.getUserId();
    const fromStorage = Number(localStorage.getItem('idUser') || '0');
    this.currentUserId = fromContext || (Number.isFinite(fromStorage) && fromStorage > 0 ? fromStorage : null);
  }

  private getCurrentWeekStartIso(): string {
    const today = new Date();
    const day = today.getDay();
    const mondayDelta = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayDelta);
    monday.setHours(0, 0, 0, 0);

    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  get currentWeekLabel(): string {
    const { start, end } = this.getCurrentWeekRange();
    const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    return `${f(start)} - ${f(end)}`;
  }

  get planningEmptyLabel(): string {
    return this.planningViewMode === 'week'
      ? 'Aucun planning pour cette semaine'
      : 'Aucun planning pour ce mois';
  }

  setPlanningViewMode(mode: 'month' | 'week'): void {
    this.planningViewMode = mode;
    if (mode === 'week') {
      this.currentPlanningMonth = new Date();
    }
  }

  private getCurrentWeekRange(): { start: Date; end: Date } {
    const today = new Date();
    const day = today.getDay();
    const mondayDelta = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + mondayDelta);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private resizeImageToDataUrl(file: File, maxPx = 256, quality = 0.75): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('File read error'));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onerror = () => reject(new Error('Image decode error'));
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas not supported'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  private normalizePhotoValue(value: any): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed;
  }

  private persistPhotoWithLegacyUpdate(userId: number, photoDataUrl: string): void {
    this.staffService.getUserById(userId).subscribe({
      next: (existingUser) => {
        const payload = {
          ...existingUser,
          photo: photoDataUrl
        };

        this.staffService.update(userId, payload).subscribe({
          next: (updatedUser) => {
            const finalPhoto = this.normalizePhotoValue(updatedUser?.photo ?? photoDataUrl);
            this.user.photo = finalPhoto;
            // Cache locally so it survives page refresh even if backend
            // hasn't been restarted and doesn't return photo yet.
            this.setCachedPhoto(userId, finalPhoto ?? photoDataUrl);
            this.messageService.add({
              severity: 'success',
              summary: 'Photo mise à jour',
              detail: 'La photo de profil a été enregistrée.'
            });
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: 'Échec de sauvegarde',
              detail: 'Impossible d\'enregistrer la photo de profil.'
            });
          }
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Échec de sauvegarde',
          detail: 'Impossible d\'enregistrer la photo de profil.'
        });
      }
    });
  }

  private getCachedPhoto(userId: number): string | null {
    try {
      return localStorage.getItem(`staff_photo_${userId}`) ?? null;
    } catch {
      return null;
    }
  }

  private setCachedPhoto(userId: number, photoDataUrl: string | null): void {
    try {
      if (photoDataUrl) {
        localStorage.setItem(`staff_photo_${userId}`, photoDataUrl);
      } else {
        localStorage.removeItem(`staff_photo_${userId}`);
      }
    } catch {
      // localStorage may be unavailable (private mode, quota exceeded)
    }
  }

  private parseNumberSafe(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private resolveDerniereConnexion(staffUser: any): Date | null {
    const candidates = [
      staffUser?.derniereConnexion,
      staffUser?.lastLogin,
      staffUser?.lastLoginAt,
      staffUser?.lastConnection,
      staffUser?.dateDerniereConnexion
    ];

    for (const candidate of candidates) {
      const parsed = this.parseDateTime(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private computeUpcomingPlanningsCount(plans: Planning[]): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return plans.filter((plan) => {
      const d = new Date(plan.date);
      d.setHours(0, 0, 0, 0);
      return d >= todayStart;
    }).length;
  }

  private resolveDerniereConnexionFromHistory(events: HistoryEvent[]): Date | null {
    const connexionEvents = events.filter((event) => {
      const type = (event.type ?? '').toString().toLowerCase();
      const title = (event.title ?? '').toString().toLowerCase();
      return type.includes('connexion') || title.includes('connexion');
    });

    if (connexionEvents.length === 0) {
      return null;
    }

    return connexionEvents
      .map((event) => new Date(event.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  }

  private parseLocalDate(value: any): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    const raw = value.toString().trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private calculateAncienneteMois(startDate: Date): number {
    const today = new Date();
    let months = (today.getFullYear() - startDate.getFullYear()) * 12;
    months += today.getMonth() - startDate.getMonth();

    if (today.getDate() < startDate.getDate()) {
      months -= 1;
    }

    return Math.max(0, months);
  }

  // ── Planning helpers ─────────────────────────────────────────────────────────────────────

  get currentMonthLabel(): string {
    return this.currentPlanningMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  get filteredPlannings(): Planning[] {
    return this.plannings.filter(p => {
      const d = new Date(p.date);

      if (this.planningViewMode === 'week') {
        const { start, end } = this.getCurrentWeekRange();
        return d >= start && d <= end;
      }

      return d.getFullYear() === this.currentPlanningMonth.getFullYear()
        && d.getMonth() === this.currentPlanningMonth.getMonth();
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private showError(detail: string): void {
    this.messageService.add({
      severity: 'error',
      summary: 'Erreur',
      detail
    });
  }

  prevMonth(): void {
    const d = new Date(this.currentPlanningMonth);
    d.setMonth(d.getMonth() - 1);
    this.currentPlanningMonth = d;
  }

  nextMonth(): void {
    const d = new Date(this.currentPlanningMonth);
    d.setMonth(d.getMonth() + 1);
    this.currentPlanningMonth = d;
  }

  getNightShiftsCount(): number {
    return this.filteredPlannings.filter(p =>
      p.type === 'shift' && (p.poste ?? '').toLowerCase().includes('nuit')
    ).length;
  }

  getWeekendShiftsCount(): number {
    return this.filteredPlannings.filter(p => {
      const dow = new Date(p.date).getDay();
      return dow === 0 || dow === 6;
    }).length;
  }

  getCongesCount(): number {
    return this.filteredPlannings.filter(p => p.type === 'conge').length;
  }

  getReposCount(): number {
    return this.filteredPlannings.filter(p => p.type === 'repos').length;
  }

  getShiftColor(plan: Planning): string {
    if (plan.type === 'conge') return '#0891b2';
    if (plan.type === 'repos') return '#6b7280';
    const p = (plan.poste ?? '').toLowerCase();
    if (p.includes('nuit')) return '#4f46e5';
    if (p.includes('matin')) return '#059669';
    if (p.includes('après-midi') || p.includes('apres-midi') || p.includes('après midi') || p.includes('apres midi')) return '#d97706';
    if (p.includes('urgence')) return '#dc2626';
    if (p.includes('garde')) return '#7c3aed';
    return '#2563eb';
  }

  getShiftIcon(plan: Planning): string {
    if (plan.type === 'conge') return 'pi-umbrella';
    if (plan.type === 'repos') return 'pi-home';
    const p = (plan.poste ?? '').toLowerCase();
    if (p.includes('nuit')) return 'pi-moon';
    if (p.includes('urgence')) return 'pi-exclamation-triangle';
    return 'pi-clock';
  }

  isAllDay(plan: Planning): boolean {
    return plan.type === 'conge' || plan.type === 'repos';
  }

  getShiftDuration(plan: Planning): string {
    if (this.isAllDay(plan)) return 'Journée';
    const [startH, startM] = (plan.heureDebut ?? '00:00').split(':').map(Number);
    const [endH, endM] = (plan.heureFin ?? '00:00').split(':').map(Number);
    let mins = (endH * 60 + endM) - (startH * 60 + startM);
    if (mins <= 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }

  formatPlanningDayName(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  formatPlanningDayNum(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric' });
  }

  formatPlanningMonth(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', { month: 'short' });
  }
}
