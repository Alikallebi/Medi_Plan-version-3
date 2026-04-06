import { Component, OnInit } from '@angular/core';
import { MessageService, MenuItem } from 'primeng/api';
import { StaffService } from 'src/app/demo/service/staff.service';
import { PoleService, Pole } from 'src/app/demo/service/pole.service';
import { ActivatedRoute, Router } from '@angular/router';
import { RbacService } from 'src/app/demo/service/rbac.service';
import { AuthService } from 'src/app/demo/service/auth.service';
import { PerimeterService } from 'src/app/demo/service/perimeter.service';
import { filter, take } from 'rxjs/operators';
import { Competence, CompetenceService } from 'src/app/demo/service/competence.service';

@Component({
    templateUrl: './staff.component.html',
    styleUrls: ['./staff.component.scss'],
    providers: [MessageService]
})
export class StaffComponent implements OnInit {
    private readonly defaultRoleValues: string[] = [
        'SUPER_ADMIN',
        'ADMIN',
        'CHEF',
        'PRATICIEN',
        'INFIRMIER',
        'CADRE',
        'STAFF',
        'Chef de Pôle',
        'Validateur RH',
        'Superviseur internes',
        'Planificateur urgence'
    ];

    // Données
    staffList: any[] = [];
    filteredStaffList: any[] = [];
    staff: any = {};
    selectedStaff: any[] = [];

    // Listes déroulantes
    equipes: any[] = [];
    competences: Competence[] = [];
    services: any[] = [];
    metiers: any[] = [];
    poles: Pole[] = [];

    // Compteurs
    totalUsers: number = 0;
    activeUsers: number = 0;
    inactiveUsers: number = 0;

    // Recherche et filtres
    searchText: string = '';
    showFilters: boolean = false;
    filters: any = {
        service: null,
        role: null,
        equipe: null,
        status: 'all'
    };

    // Pagination
    rowsPerPage: number = 10;
    loading: boolean = false;

    // Modales
    staffDialog: boolean = false;
    deleteDialog: boolean = false;
    importDialog: boolean = false;
    bulkRoleDialog: boolean = false;
    isEditMode: boolean = false;

    // Import CSV
    selectedFile: any = null;
    isDragging: boolean = false;
    csvOptions: any = {
        hasHeader: true,
        separator: ','
    };

    // Actions en lot
    bulkNewRole: string = '';
    deleteReason: string = '';

    // Menus
    exportMenuItems: MenuItem[] = [];
    actionMenuItems: MenuItem[] = [];
    currentUser: any = null;

    // Mot de passe
    passwordStrength: string = '';
    pendingEditUserId: number | null = null;

    // Affectations
    newAffectation: any = {
        service: null,
        equipe: null,
        taux: 100,
        dateDebut: new Date(),
        dateFin: null,
        principale: false
    };
    editingAffectationIndex: number | null = null;

    // Options
    roles: any[] = [];

    civiliteOptions: any[] = [
        { label: 'M.', value: 'M' },
        { label: 'Mme', value: 'MME' },
        { label: 'Dr', value: 'DR' },
        { label: 'Pr', value: 'PR' }
    ];

    statusOptions: any[] = [
        { label: 'Tous', value: 'all' },
        { label: 'Actifs uniquement', value: 'active' },
        { label: 'Inactifs uniquement', value: 'inactive' }
    ];

    csvSeparators: any[] = [
        { label: 'Virgule (,)', value: ',' },
        { label: 'Point-virgule (;)', value: ';' },
        { label: 'Tabulation', value: '\t' }
    ];

    rappelOptions: any[] = [
        { label: 'Jamais', value: 'never' },
        { label: '1 jour avant', value: '1d' },
        { label: '3 jours avant', value: '3d' },
        { label: '1 semaine avant', value: '1w' }
    ];

    constructor(
        private staffService: StaffService,
        private poleService: PoleService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        public rbac: RbacService,
        private authService: AuthService,
        private perimeterService: PerimeterService,
        private competenceService: CompetenceService
    ) {}

    ngOnInit() {
        this.route.queryParamMap.subscribe(params => {
            const editIdRaw = params.get('editId');
            const editId = editIdRaw ? Number(editIdRaw) : NaN;
            this.pendingEditUserId = Number.isFinite(editId) && editId > 0 ? editId : null;
            this.tryOpenEditFromQuery();
        });

        this.loadData();
        this.initMenus();
    }

    loadData() {
        this.loading = true;
        
        // Charger d'abord les rôles depuis la base de données
        this.staffService.getRoleCatalog().subscribe({
            next: (catalogRoles) => {
                // Utiliser uniquement les rôles qui existent dans la base de données
                this.roles = catalogRoles || [];
            },
            error: () => {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Avertissement',
                    detail: 'Impossible de charger les rôles depuis la base de données'
                });
                this.roles = [];
            }
        });

        // Charger les utilisateurs filtrés par périmètre (pôle pour Chef de Pôle, etc.)
        // Utiliser l'observable pour s'assurer que le contexte complet est disponible
        // (notamment poleId pour Chef de Pôle) avant de charger la liste
        this.authService.userContext$.pipe(
            filter(ctx => ctx != null),
            take(1)
        ).subscribe(userCtx => {
            const permFilter = this.perimeterService.getPerimeterFilter(userCtx);
            this.staffService.getAllWithPerimeter(permFilter).subscribe({
                next: (data) => {
                    this.staffList = data;
                    this.updateCounters();
                    this.applyFilters();
                    this.loading = false;
                    this.tryOpenEditFromQuery();
                },
                error: (err) => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Erreur',
                        detail: 'Impossible de charger les utilisateurs'
                    });
                    this.loading = false;
                }
            });
        });

        this.staffService.getEquipes().subscribe(r => this.equipes = r);
        this.staffService.getServices().subscribe(r => this.services = r);
        this.loadCompetencesCatalog();
        this.staffService.getMetiers().subscribe(r => {
            this.metiers = (r || []).map((m: any) => ({
                ...m,
                label: m.code ? `${m.nom}  (${m.code})` : m.nom
            }));
        });
        this.poleService.getPoles().subscribe(r => this.poles = r);
        
        // Charger services et spécialités si disponibles
        // this.staffService.getServices().subscribe(r => this.services = r);
        // this.staffService.getSpecialites().subscribe(r => this.specialites = r);
    }

    get groupedCompetences(): Array<{ domaine: string; items: Competence[] }> {
        const groups = new Map<string, Competence[]>();
        for (const competence of this.competences || []) {
            const domain = competence.domaine || 'Général';
            const bucket = groups.get(domain) || [];
            bucket.push(competence);
            groups.set(domain, bucket);
        }

        return Array.from(groups.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
            .map(([domaine, items]) => ({
                domaine,
                items: items.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
            }));
    }

    isStaffCompetenceSelected(id: number): boolean {
        return this.getSelectedCompetenceIds().includes(id);
    }

    toggleStaffCompetence(id: number): void {
        const selected = this.getSelectedCompetenceIds();
        if (selected.includes(id)) {
            this.staff.competences = selected.filter(item => item !== id);
            return;
        }

        this.staff.competences = [...selected, id];
    }

    private loadCompetencesCatalog(): void {
        this.competenceService.getAllCompetences().subscribe({
            next: data => {
                this.competences = (data || []).filter(item => item?.isActive !== false && item?.actif !== false);
            },
            error: () => {
                this.competences = [];
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Compétences',
                    detail: 'Impossible de charger le catalogue des compétences.'
                });
            }
        });
    }

    private getSelectedCompetenceIds(): number[] {
        if (!Array.isArray(this.staff?.competences)) {
            return [];
        }

        return this.staff.competences
            .map((item: any) => {
                if (typeof item === 'number') return item;
                if (item && typeof item.id === 'number') return item.id;
                const parsed = Number(item);
                return Number.isFinite(parsed) ? parsed : null;
            })
            .filter((item: number | null): item is number => item !== null);
    }

    private tryOpenEditFromQuery(): void {
        if (!this.pendingEditUserId || !Array.isArray(this.staffList) || this.staffList.length === 0) {
            return;
        }

        const targetId = this.pendingEditUserId;
        const existing = this.staffList.find((u: any) => Number(u?.id) === targetId);

        if (existing) {
            this.pendingEditUserId = null;
            this.editStaff(existing);
            this.clearEditQueryParam();
            return;
        }

        this.staffService.getUserById(targetId).subscribe({
            next: (user) => {
                this.pendingEditUserId = null;
                this.editStaff(user);
                this.clearEditQueryParam();
            },
            error: () => {
                this.pendingEditUserId = null;
                this.clearEditQueryParam();
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Utilisateur introuvable',
                    detail: 'Impossible d\'ouvrir la fiche en mode modification.'
                });
            }
        });
    }

    private clearEditQueryParam(): void {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { editId: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    updateCounters() {
        this.totalUsers = this.staffList.length;
        this.activeUsers = this.staffList.filter(u => u.actif).length;
        this.inactiveUsers = this.totalUsers - this.activeUsers;
    }

    initMenus() {
        this.exportMenuItems = [
            {
                label: 'Exporter en PDF',
                icon: 'pi pi-file-pdf',
                command: () => this.exportToPDF()
            },
            {
                label: 'Exporter en Excel',
                icon: 'pi pi-file-excel',
                command: () => this.exportToExcel()
            },
            {
                label: 'Exporter en CSV',
                icon: 'pi pi-file',
                command: () => this.exportToCSV()
            }
        ];
    }

    updateActionMenu(user: any) {
        this.actionMenuItems = [
            {
                label: 'Voir détails',
                icon: 'pi pi-eye',
                command: () => this.viewDetails(user)
            },
            {
                label: 'Modifier',
                icon: 'pi pi-pencil',
                command: () => this.editStaff(user)
            },
            { separator: true },
            {
                label: user.actif ? 'Désactiver' : 'Activer',
                icon: user.actif ? 'pi pi-times' : 'pi pi-check',
                command: () => this.toggleUserStatus(user)
            },
            {
                label: 'Réinitialiser mot de passe',
                icon: 'pi pi-key',
                command: () => this.resetPassword(user)
            },
            {
                label: 'Dupliquer',
                icon: 'pi pi-copy',
                command: () => this.duplicateUser(user)
            },
            { separator: true },
            {
                label: 'Voir historique',
                icon: 'pi pi-history',
                command: () => this.viewHistory(user)
            },
            {
                label: 'Envoyer email',
                icon: 'pi pi-envelope',
                command: () => this.sendEmail(user)
            },
            { separator: true },
            {
                label: 'Supprimer',
                icon: 'pi pi-trash',
                styleClass: 'text-red-500',
                command: () => this.deleteStaff(user)
            }
        ];
    }

    // Recherche et filtres
    onSearch() {
        this.applyFilters();
    }

    clearSearch() {
        this.searchText = '';
        this.applyFilters();
    }

    hasActiveFilters(): boolean {
        return this.filters.service || this.filters.role || this.filters.equipe || this.filters.status !== 'all';
    }

    resetFilters() {
        this.searchText = '';
        this.filters = {
            service: null,
            role: null,
            equipe: null,
            status: 'all'
        };
        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.staffList];

        // Recherche texte
        if (this.searchText) {
            const search = this.normalizeSearchToken(this.searchText);
            filtered = filtered.filter(user =>
                this.isSearchMatch(search, user.nom) ||
                this.isSearchMatch(search, user.prenom) ||
                this.isSearchMatch(search, user.email) ||
                this.isSearchMatch(search, user.matricule) ||
                this.isSearchMatch(search, `${user.prenom ?? ''} ${user.nom ?? ''}`) ||
                this.isSearchMatch(search, `${user.nom ?? ''} ${user.prenom ?? ''}`)
            );
        }

        // Filtre par service
        if (this.filters.service) {
            const selectedServiceId = this.getSelectedServiceId(this.filters.service);
            if (selectedServiceId !== null) {
                filtered = filtered.filter(user => this.getUserServiceId(user) === selectedServiceId);
            }
        }

        // Filtre par rôle
        if (this.filters.role) {
            filtered = filtered.filter(user => user.role === this.filters.role);
        }

        // Filtre par équipe
        if (this.filters.equipe) {
            filtered = filtered.filter(user => user.equipe?.id === this.filters.equipe.id);
        }

        // Filtre par statut
        if (this.filters.status === 'active') {
            filtered = filtered.filter(user => user.actif);
        } else if (this.filters.status === 'inactive') {
            filtered = filtered.filter(user => !user.actif);
        }

        this.filteredStaffList = filtered;
    }

    private normalizeSearchToken(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }

        return value
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    }

    private isSearchMatch(normalizedSearch: string, rawValue: any): boolean {
        if (!normalizedSearch) {
            return true;
        }

        const token = this.normalizeSearchToken(rawValue);
        if (!token) {
            return false;
        }

        if (token.includes(normalizedSearch)) {
            return true;
        }

        // Tolérance pour petites fautes de frappe (1 caractère max)
        // utile pour les emails saisis rapidement après enregistrement.
        if (normalizedSearch.length >= 6 && Math.abs(token.length - normalizedSearch.length) <= 1) {
            return this.levenshteinDistance(token, normalizedSearch) <= 1;
        }

        return false;
    }

    private levenshteinDistance(a: string, b: string): number {
        const rows = a.length + 1;
        const cols = b.length + 1;
        const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

        for (let i = 0; i < rows; i++) {
            matrix[i][0] = i;
        }
        for (let j = 0; j < cols; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i < rows; i++) {
            for (let j = 1; j < cols; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[rows - 1][cols - 1];
    }

    private getSelectedServiceId(service: any): number | null {
        const raw = service?.id ?? service?.serviceId ?? service?.service_id ?? service;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    private getUserServiceId(user: any): number | null {
        const raw = user?.serviceId
            ?? user?.service_id
            ?? user?.service?.id
            ?? user?.service?.serviceId
            ?? user?.affectations?.find((aff: any) => aff?.principale)?.serviceId
            ?? user?.affectations?.find((aff: any) => aff?.principale)?.service?.id
            ?? null;

        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    // Gestion des utilisateurs
    openNew() {
        this.staff = {
            actif: true,
            serviceId: null,
            equipeId: null,
            poleId: null,
            notifEmail: true,
            notifSMS: false,
            notifPush: false,
            forceChangePassword: true,
            twoFactorAuth: false,
            affectations: []
        };
        this.isEditMode = false;
        this.staffDialog = true;
    }

    editStaff(user: any) {
        const userId = Number(user?.id);
        if (Number.isFinite(userId) && userId > 0) {
            this.staffService.getUserById(userId).subscribe({
                next: (fullUser) => {
                    this.staffService.getUserAffectations(userId).subscribe({
                        next: (affectations) => {
                            const merged = {
                                ...(fullUser ?? user),
                                affectations: Array.isArray(affectations) ? affectations : []
                            };
                            this.openStaffEditor(merged, true);
                        },
                        error: () => {
                            this.openStaffEditor(fullUser ?? user, true);
                        }
                    });
                },
                error: () => {
                    this.openStaffEditor(user, true);
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Avertissement',
                        detail: 'Impossible de charger tous les détails utilisateur, édition partielle affichée.'
                    });
                }
            });
            return;
        }

        this.openStaffEditor(user, true);
    }

    saveStaff() {
        // Validation
        if (!this.staff.nom || !this.staff.prenom || !this.staff.email) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur de validation',
                detail: 'Veuillez remplir tous les champs obligatoires'
            });
            return;
        }

        if (!this.isEditMode && (!this.staff.password || !this.staff.confirmPassword)) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur',
                detail: 'Le mot de passe est obligatoire'
            });
            return;
        }

        if (!this.isEditMode && this.staff.password !== this.staff.confirmPassword) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur',
                detail: 'Les mots de passe ne correspondent pas'
            });
            return;
        }

        this.applyPendingAffectationSelection();
        this.syncMainAssignmentFields();

        // Validation spécifique pour chef de pôle
        if (this.isChefDePole() && !this.staff.poleId) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur de validation',
                detail: 'Veuillez sélectionner un pôle pour le chef de pôle'
            });
            return;
        }

        if (!this.staff.specialite) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur de validation',
                detail: 'Veuillez sélectionner un métier'
            });
            return;
        }

        if (!this.staff.serviceId || !this.staff.equipeId) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur de validation',
                detail: 'Veuillez affecter un service et une équipe à cet utilisateur'
            });
            return;
        }

        // Sauvegarder
        const payload = this.buildApiPayload();

        if (this.staff.id) {
            this.staffService.update(this.staff.id, payload).subscribe({
                next: () => this.afterSave('Utilisateur modifié avec succès'),
                error: () => this.showError('Erreur lors de la modification')
            });
        } else {
            this.staffService.create(payload).subscribe({
                next: () => this.afterSave('Utilisateur créé avec succès'),
                error: () => this.showError('Erreur lors de la création')
            });
        }
    }

    afterSave(message: string) {
        this.staffDialog = false;
        this.loadData();
        this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: message
        });
    }

    deleteStaff(user: any) {
        this.staff = user;
        this.deleteDialog = true;
        this.deleteReason = '';
    }

    confirmDelete() {
        if (this.staff.id) {
            this.staffService.delete(this.staff.id).subscribe({
                next: () => {
                    this.deleteDialog = false;
                    this.loadData();
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Succès',
                        detail: 'Utilisateur supprimé'
                    });
                },
                error: () => this.showError('Erreur lors de la suppression')
            });
        }
    }

    viewDetails(user: any) {
        const userId = user?.id;
        if (userId) {
            this.router.navigate(['/pages/utilisateurs', userId], {
                state: { selectedUser: user }
            });
            return;
        }

        this.router.navigate(['/pages/user-detail']);
    }

    // Actions du menu
    showActionsMenu(event: any, user: any) {
        this.currentUser = user;
        this.updateActionMenu(user);
    }

    toggleUserStatus(user: any) {
        const payload = this.buildApiPayload({ ...user, actif: !user.actif });
        this.staffService.update(user.id, payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Succès',
                    detail: `Utilisateur ${payload.actif ? 'activé' : 'désactivé'}`
                });
                this.loadData();
            },
            error: () => this.showError('Erreur lors de la mise à jour du statut')
        });
    }

    resetPassword(user: any) {
        this.messageService.add({
            severity: 'info',
            summary: 'Réinitialisation',
            detail: 'Email de réinitialisation envoyé à ' + user.email
        });
    }

    duplicateUser(user: any) {
        const duplicate = this.normalizeStaffForForm({
            ...user,
            id: null,
            nom: user.nom + ' (Copie)',
            email: '',
            matricule: ''
        });
        this.openStaffEditor(duplicate, false);
    }

    viewHistory(user: any) {
        this.messageService.add({
            severity: 'info',
            summary: 'Historique',
            detail: 'Fonction en développement'
        });
    }

    sendEmail(user: any) {
        this.messageService.add({
            severity: 'info',
            summary: 'Email',
            detail: 'Ouverture du client email...'
        });
    }

    // Actions en lot
    bulkActivate() {
        // Activer tous les utilisateurs sélectionnés
        this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: `${this.selectedStaff.length} utilisateur(s) activé(s)`
        });
        this.selectedStaff = [];
        this.loadData();
    }

    bulkDeactivate() {
        this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: `${this.selectedStaff.length} utilisateur(s) désactivé(s)`
        });
        this.selectedStaff = [];
        this.loadData();
    }

    showBulkRoleDialog() {
        this.bulkNewRole = '';
        this.bulkRoleDialog = true;
    }

    applyBulkRole() {
        this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: `Rôle modifié pour ${this.selectedStaff.length} utilisateur(s)`
        });
        this.bulkRoleDialog = false;
        this.selectedStaff = [];
        this.loadData();
    }

    exportSelection() {
        this.messageService.add({
            severity: 'info',
            summary: 'Export',
            detail: `Export de ${this.selectedStaff.length} utilisateur(s)`
        });
    }

    clearSelection() {
        this.selectedStaff = [];
    }

    // Export
    exportToPDF() {
        this.messageService.add({
            severity: 'info',
            summary: 'Export PDF',
            detail: 'Génération du PDF en cours...'
        });
    }

    exportToExcel() {
        this.messageService.add({
            severity: 'info',
            summary: 'Export Excel',
            detail: 'Génération du fichier Excel en cours...'
        });
    }

    exportToCSV() {
        this.messageService.add({
            severity: 'info',
            summary: 'Export CSV',
            detail: 'Génération du fichier CSV en cours...'
        });
    }

    // Import
    showImportDialog() {
        this.importDialog = true;
        this.selectedFile = null;
    }

    onDragOver(event: any) {
        event.preventDefault();
        this.isDragging = true;
    }

    onDragLeave(event: any) {
        this.isDragging = false;
    }

    onDrop(event: any) {
        event.preventDefault();
        this.isDragging = false;
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    onFileSelect(event: any) {
        const files = event.target.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFile(file: any) {
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            this.selectedFile = file;
        } else {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur',
                detail: 'Seuls les fichiers CSV sont acceptés'
            });
        }
    }

    removeFile() {
        this.selectedFile = null;
    }

    importCSV() {
        this.messageService.add({
            severity: 'success',
            summary: 'Import en cours',
            detail: 'Traitement du fichier CSV...'
        });
        this.importDialog = false;
        this.selectedFile = null;
        // Simuler un délai puis recharger
        setTimeout(() => this.loadData(), 1000);
    }

    // Affectations
    addAffectation() {
        if (!this.newAffectation.service || !this.newAffectation.equipe || !this.newAffectation.taux || !this.newAffectation.dateDebut) {
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur',
                detail: 'Veuillez remplir tous les champs obligatoires'
            });
            return;
        }

        if (!this.staff.affectations) {
            this.staff.affectations = [];
        }

        if (this.newAffectation.principale) {
            this.staff.affectations = this.staff.affectations.map((aff: any) => ({ ...aff, principale: false }));
        }

        const normalizedAffectation = {
            ...this.newAffectation,
            serviceId: this.newAffectation.service?.id ?? null,
            equipeId: this.newAffectation.equipe?.id ?? null
        };

        const editIndex = this.editingAffectationIndex;
        const wasEditing = editIndex !== null && editIndex >= 0;

        if (wasEditing) {
            this.staff.affectations[editIndex] = normalizedAffectation;
        } else {
            this.staff.affectations.push(normalizedAffectation);
        }

        this.resetNewAffectationForm();

        this.syncMainAssignmentFields();

        this.messageService.add({
            severity: 'success',
            summary: 'Succès',
            detail: wasEditing ? 'Affectation mise à jour' : 'Affectation ajoutée'
        });
    }

    editAffectation(aff: any) {
        const index = (this.staff?.affectations ?? []).findIndex((item: any) => item === aff);
        this.editingAffectationIndex = index >= 0 ? index : null;

        const serviceOption = this.resolveServiceOption(aff?.service ?? aff?.serviceId);
        const serviceId = this.getSelectedServiceId(serviceOption ?? aff?.serviceId);
        const equipeOption = this.resolveEquipeOption(aff?.equipe ?? aff?.equipeId, serviceId);

        this.newAffectation = {
            service: serviceOption,
            equipe: equipeOption,
            taux: Number(aff?.taux ?? 100) || 100,
            dateDebut: this.toDateForForm(aff?.dateDebut) ?? new Date(),
            dateFin: this.toDateForForm(aff?.dateFin),
            principale: !!(aff?.principale ?? aff?.isPrimary)
        };
    }

    deleteAffectation(aff: any) {
        const index = this.staff.affectations.indexOf(aff);
        if (index > -1) {
            this.staff.affectations.splice(index, 1);
            if (this.editingAffectationIndex === index) {
                this.resetNewAffectationForm();
            }
            this.syncMainAssignmentFields();
            this.messageService.add({
                severity: 'success',
                summary: 'Succès',
                detail: 'Affectation supprimée'
            });
        }
    }

    onAffectationServiceChange(): void {
        const currentServiceId = this.newAffectation?.service?.id ?? this.newAffectation?.serviceId ?? null;
        const currentEquipeId = this.newAffectation?.equipe?.id ?? this.newAffectation?.equipeId ?? null;

        if (currentServiceId && currentEquipeId) {
            const equipeMatches = this.getEquipesForSelectedService().some(equipe => equipe.id === currentEquipeId);
            if (!equipeMatches) {
                this.newAffectation.equipe = null;
                this.newAffectation.equipeId = null;
            }
        }

        if (currentServiceId && !this.newAffectation?.equipe) {
            const firstEquipe = this.getEquipesForSelectedService()[0];
            if (firstEquipe) {
                this.newAffectation.equipe = firstEquipe;
                this.newAffectation.equipeId = firstEquipe.id;
            }
        }
    }

    getEquipesForSelectedService(): any[] {
        const selectedServiceId = this.getSelectedServiceId(this.newAffectation?.service ?? this.staff?.service ?? this.staff?.serviceId);
        if (!selectedServiceId) {
            return this.equipes ?? [];
        }

        return (this.equipes ?? []).filter((equipe: any) => {
            const equipeServiceId = Number(equipe?.serviceId ?? equipe?.service?.id ?? null);
            return Number.isFinite(equipeServiceId) && equipeServiceId === selectedServiceId;
        });
    }

    private syncMainAssignmentFields(): void {
        const affectations = this.staff?.affectations ?? [];
        const principale = affectations.find((a: any) => !!a.principale) ?? affectations[0];

        this.staff.serviceId = principale?.serviceId
            ?? principale?.service?.id
            ?? this.staff.service?.id
            ?? this.staff.serviceId
            ?? null;

        this.staff.equipeId = principale?.equipeId
            ?? principale?.equipe?.id
            ?? this.staff.equipe?.id
            ?? this.staff.equipeId
            ?? null;
    }

    private applyPendingAffectationSelection(): void {
        const pendingServiceId = this.newAffectation?.service?.id
            ?? this.newAffectation?.serviceId
            ?? null;
        const pendingEquipeId = this.newAffectation?.equipe?.id
            ?? this.newAffectation?.equipeId
            ?? null;

        if (!pendingServiceId || !pendingEquipeId) {
            return;
        }

        if (!this.staff.affectations) {
            this.staff.affectations = [];
        }

        if (this.editingAffectationIndex !== null && this.editingAffectationIndex >= 0) {
            const idx = this.editingAffectationIndex;
            const current = this.staff.affectations[idx] ?? {};
            this.staff.affectations[idx] = {
                ...current,
                ...this.newAffectation,
                serviceId: pendingServiceId,
                equipeId: pendingEquipeId,
                principale: !!this.newAffectation?.principale
            };

            if (this.newAffectation?.principale) {
                this.staff.affectations = this.staff.affectations.map((aff: any, index: number) => ({
                    ...aff,
                    principale: index === idx
                }));
            }

            this.staff.serviceId = pendingServiceId;
            this.staff.equipeId = pendingEquipeId;
            return;
        }

        const hasMatchingAffectation = this.staff.affectations.some((aff: any) =>
            (aff.serviceId ?? aff.service?.id) === pendingServiceId
            && (aff.equipeId ?? aff.equipe?.id) === pendingEquipeId);

        if (!hasMatchingAffectation) {
            this.staff.affectations.push({
                ...this.newAffectation,
                serviceId: pendingServiceId,
                equipeId: pendingEquipeId,
                principale: this.staff.affectations.length === 0 ? true : !!this.newAffectation?.principale
            });
        }

        if (this.newAffectation?.principale) {
            this.staff.affectations = this.staff.affectations.map((aff: any) => ({
                ...aff,
                principale: (aff.serviceId ?? aff.service?.id) === pendingServiceId
                    && (aff.equipeId ?? aff.equipe?.id) === pendingEquipeId
            }));
        }

        this.staff.serviceId = pendingServiceId;
        this.staff.equipeId = pendingEquipeId;
    }

    private openStaffEditor(user: any, isEditMode: boolean): void {
        this.staff = this.normalizeStaffForForm(user);
        this.isEditMode = isEditMode;

        const affectations = this.staff?.affectations ?? [];
        const principale = affectations.find((a: any) => !!(a?.principale ?? a?.isPrimary)) ?? affectations[0] ?? null;

        if (principale) {
            const serviceOption = this.resolveServiceOption(principale?.service ?? principale?.serviceId);
            const serviceId = this.getSelectedServiceId(serviceOption ?? principale?.serviceId);
            const equipeOption = this.resolveEquipeOption(principale?.equipe ?? principale?.equipeId, serviceId);

            this.newAffectation = {
                service: serviceOption,
                equipe: equipeOption,
                taux: Number(principale?.taux ?? 100) || 100,
                dateDebut: this.toDateForForm(principale?.dateDebut) ?? new Date(),
                dateFin: this.toDateForForm(principale?.dateFin),
                principale: !!(principale?.principale ?? principale?.isPrimary)
            };
            this.editingAffectationIndex = null;
        } else {
            this.resetNewAffectationForm();
        }

        this.staffDialog = true;
    }

    private resetNewAffectationForm(): void {
        this.newAffectation = {
            service: null,
            equipe: null,
            taux: 100,
            dateDebut: new Date(),
            dateFin: null,
            principale: false
        };
        this.editingAffectationIndex = null;
    }

    private normalizeStaffForForm(user: any): any {
        const source = { ...(user || {}) };

        const serviceOption = this.resolveServiceOption(source?.service ?? source?.serviceId ?? source?.service_id ?? source?.service_nom);
        const serviceId = this.getSelectedServiceId(serviceOption ?? source?.serviceId ?? source?.service_id);
        const equipeOption = this.resolveEquipeOption(source?.equipe ?? source?.equipeId ?? source?.equipe_id ?? source?.equipe_nom, serviceId);

        const affectations = Array.isArray(source?.affectations)
            ? source.affectations.map((aff: any) => {
                const affService = this.resolveServiceOption(aff?.service ?? aff?.serviceId ?? aff?.serviceName);
                const affServiceId = this.getSelectedServiceId(affService ?? aff?.serviceId);
                const affEquipe = this.resolveEquipeOption(aff?.equipe ?? aff?.equipeId ?? aff?.equipeName, affServiceId);
                const affEquipeId = Number(aff?.equipeId ?? aff?.equipe?.id ?? affEquipe?.id ?? 0) || null;

                return {
                    ...aff,
                    service: affService,
                    equipe: affEquipe,
                    serviceId: affServiceId,
                    equipeId: affEquipeId,
                    dateDebut: this.toDateForForm(aff?.dateDebut) ?? new Date(),
                    dateFin: this.toDateForForm(aff?.dateFin),
                    principale: !!(aff?.principale ?? aff?.isPrimary)
                };
            })
            : [];

        return {
            ...source,
            role: typeof source?.role === 'object' ? (source?.role?.value ?? source?.role?.label ?? '') : (source?.role ?? ''),
            service: serviceOption,
            equipe: equipeOption,
            serviceId: serviceId,
            equipeId: Number(source?.equipeId ?? source?.equipe_id ?? equipeOption?.id ?? 0) || null,
            poleId: Number(source?.poleId ?? source?.pole_id ?? 0) || null,
            dateNaissance: this.toDateForForm(source?.dateNaissance),
            dateEmbauche: this.toDateForForm(source?.dateEmbauche),
            expiration: this.toDateForForm(source?.expiration),
            rolesSecondaires: Array.isArray(source?.rolesSecondaires) ? source.rolesSecondaires : [],
            competences: Array.isArray(source?.competences)
                ? source.competences.map((item: any) => {
                    const n = Number(item?.id ?? item);
                    return Number.isFinite(n) ? n : item;
                })
                : [],
            affectations: affectations.length > 0 ? affectations : [{
                service: serviceOption,
                equipe: equipeOption,
                serviceId: serviceId,
                equipeId: Number(source?.equipeId ?? source?.equipe_id ?? equipeOption?.id ?? 0) || null,
                taux: 100,
                dateDebut: new Date(),
                dateFin: null,
                principale: true
            }]
        };
    }

    private toDateForForm(value: any): Date | null {
        if (!value) {
            return null;
        }

        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    private buildApiPayload(source: any = this.staff): any {
        const toNullableDate = (value: any): string | null => {
            if (!value || value === '') {
                return null;
            }

            const date = value instanceof Date ? value : new Date(value);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        };

        const toNullableString = (value: any): string | null => {
            if (value === null || value === undefined) {
                return null;
            }

            const normalized = value.toString().trim();
            return normalized.length > 0 ? normalized : null;
        };

        const toNumberOrNull = (value: any): number | null => {
            if (value === null || value === undefined || value === '') {
                return null;
            }

            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        };

        const resolveServiceId = (value: any): number | null => {
            const direct = toNumberOrNull(value?.id ?? value?.serviceId ?? value?.service_id ?? value);
            if (direct) {
                return direct;
            }

            const serviceName = (value?.nom ?? value?.serviceName ?? value?.service_nom ?? value?.service?.nom ?? value)?.toString?.().trim?.() ?? '';
            if (!serviceName) {
                return null;
            }

            const match = (this.services ?? []).find((service: any) =>
                (service?.nom ?? '').toString().trim().toLowerCase() === serviceName.toLowerCase()
            );
            return toNumberOrNull(match?.id);
        };

        const resolveEquipeId = (value: any, serviceIdHint: number | null): number | null => {
            const direct = toNumberOrNull(value?.id ?? value?.equipeId ?? value?.equipe_id ?? value);
            if (direct) {
                return direct;
            }

            const equipeName = (value?.nom ?? value?.equipeName ?? value?.equipe_nom ?? value?.equipe?.nom ?? value)?.toString?.().trim?.() ?? '';
            if (!equipeName) {
                return null;
            }

            const match = (this.equipes ?? []).find((equipe: any) => {
                const name = (equipe?.nom ?? '').toString().trim().toLowerCase();
                const matchesName = name === equipeName.toLowerCase();
                if (!matchesName) {
                    return false;
                }

                if (!serviceIdHint) {
                    return true;
                }

                const equipeServiceId = Number(equipe?.serviceId ?? equipe?.service?.id ?? null);
                return Number.isFinite(equipeServiceId) && equipeServiceId === serviceIdHint;
            });

            return toNumberOrNull(match?.id);
        };

        const toStringArray = (value: any): string[] => {
            if (!Array.isArray(value)) {
                return [];
            }

            return value
                .map(item => {
                    if (item === null || item === undefined) {
                        return null;
                    }

                    if (typeof item === 'string') {
                        return item.trim();
                    }

                    if (typeof item === 'number' || typeof item === 'boolean') {
                        return item.toString();
                    }

                    if (typeof item === 'object') {
                        const candidate = item.value ?? item.nom ?? item.label ?? item.name ?? null;
                        return candidate === null || candidate === undefined ? null : candidate.toString().trim();
                    }

                    return null;
                })
                .filter((item: any) => !!item);
        };

        const normalizedAffectations = Array.isArray(source?.affectations)
            ? source.affectations
                .map((aff: any) => {
                    const serviceId = resolveServiceId(aff?.serviceId ?? aff?.service);
                    const equipeId = resolveEquipeId(aff?.equipeId ?? aff?.equipe, serviceId);

                    if (!serviceId || !equipeId) {
                        return null;
                    }

                    return {
                        serviceId,
                        serviceName: toNullableString(aff?.serviceName ?? aff?.service?.nom),
                        equipeId,
                        equipeName: toNullableString(aff?.equipeName ?? aff?.equipe?.nom),
                        role: toNullableString(aff?.role ?? this.staff.role),
                        dateDebut: toNullableDate(aff?.dateDebut) ?? new Date().toISOString(),
                        dateFin: toNullableDate(aff?.dateFin),
                        taux: Math.max(0, Math.min(100, Number(aff?.taux ?? 100) || 100)),
                        isPrimary: !!(aff?.isPrimary ?? aff?.principale)
                    };
                })
                .filter((item: any) => !!item)
            : [];

        const civilite = typeof source?.civilite === 'object'
            ? (source.civilite?.value ?? source.civilite?.label ?? null)
            : source?.civilite;

        const serviceId = toNumberOrNull(source?.serviceId ?? source?.service?.id);
        const equipeId = toNumberOrNull(source?.equipeId ?? source?.equipe?.id);
        const roleValue = typeof source?.role === 'object' ? (source?.role?.value ?? source?.role?.label ?? null) : source?.role;
        const rolesSecondaires = toStringArray(source?.rolesSecondaires);
        const competences = toStringArray(source?.competences);
        const selectedService = this.resolveServiceOption(source?.serviceId ?? source?.service);
        const selectedEquipe = this.resolveEquipeOption(source?.equipeId ?? source?.equipe, serviceId);
        const password = toNullableString(source?.password);

        return {
            ...source,
            role: roleValue,
            service: selectedService,
            equipe: selectedEquipe,
            serviceId,
            equipeId,
            poleId: toNumberOrNull(source?.poleId),
            tel: toNullableString(source?.tel ?? source?.telephone),
            telephone: toNullableString(source?.telephone ?? source?.tel),
            mobile: toNullableString(source?.mobile),
            dateNaissance: toNullableDate(source?.dateNaissance),
            dateEmbauche: toNullableDate(source?.dateEmbauche),
            expiration: toNullableDate(source?.expiration),
            rolesSecondaires,
            competences,
            emailPersonnel: toNullableString(source?.emailPersonnel),
            adresse: toNullableString(source?.adresse),
            codePostal: toNullableString(source?.codePostal),
            ville: toNullableString(source?.ville),
            username: toNullableString(source?.username),
            civilite: toNullableString(civilite),
            rappelPlanning: toNullableString(source?.rappelPlanning),
            diplome: toNullableString(source?.diplome),
            universite: toNullableString(source?.universite),
            rpps: toNullableString(source?.rpps),
            secu: toNullableString(source?.secu),
            password,
            affectations: normalizedAffectations
        };
    }

    private resolveServiceOption(value: any): any {
        const serviceId = this.getSelectedServiceId(value);
        if (serviceId !== null) {
            const byId = (this.services ?? []).find((service: any) => Number(service?.id) === serviceId);
            if (byId) {
                return byId;
            }
        }

        const serviceName = (value?.nom ?? value?.serviceName ?? value?.service_nom ?? value?.service?.nom ?? value ?? '').toString().trim().toLowerCase();
        return (this.services ?? []).find((service: any) => (service?.nom ?? '').toString().trim().toLowerCase() === serviceName) ?? value ?? null;
    }

    private resolveEquipeOption(value: any, serviceIdHint: number | null): any {
        const equipeId = Number(value?.id ?? value?.equipeId ?? value?.equipe_id ?? value);
        if (Number.isFinite(equipeId) && equipeId > 0) {
            const byId = (this.equipes ?? []).find((equipe: any) => Number(equipe?.id) === equipeId);
            if (byId) {
                return byId;
            }
        }

        const equipeName = (value?.nom ?? value?.equipeName ?? value?.equipe_nom ?? value?.equipe?.nom ?? value ?? '').toString().trim().toLowerCase();
        return (this.equipes ?? []).find((equipe: any) => {
            const matchesName = (equipe?.nom ?? '').toString().trim().toLowerCase() === equipeName;
            if (!matchesName) {
                return false;
            }

            if (!serviceIdHint) {
                return true;
            }

            const equipeServiceId = Number(equipe?.serviceId ?? equipe?.service?.id ?? null);
            return Number.isFinite(equipeServiceId) && equipeServiceId === serviceIdHint;
        }) ?? value ?? null;
    }

    // Utilitaires de rôle
    getRoleClass(role: string): string {
        const normalized = (role || '').toUpperCase();
        if (normalized.includes('SUPER')) return 'super-admin';
        if (normalized.includes('ADMIN')) return 'admin-gta';
        if (normalized.includes('CHEF') || normalized.includes('MANAGER')) return 'chef-service';
        if (normalized.includes('CADRE')) return 'chef-equipe';
        return 'staff';
    }

    getRoleLabel(role: string): string {
        const roleObj = this.roles.find(r => r.value === role);
        return roleObj ? roleObj.label : role;
    }

    onRoleChange() {
        // Mettre à jour les permissions selon le rôle
        // Si le rôle n'est pas "chef de pole", réinitialiser poleId
        if (!this.isChefDePole()) {
            this.staff.poleId = null;
        }
    }

    isChefDePole(): boolean {
        if (!this.staff?.role) {
            return false;
        }
        const role = (this.staff.role as string).toUpperCase();
        return role.includes('CHEF') && (role.includes('POLE') || role.includes('PÔLE'));
    }

    getRolePermissionsDescription(): string {
        if (!this.staff?.role) {
            return '';
        }

        const normalized = (this.staff.role as string).toUpperCase();
        if (normalized.includes('SUPER')) return 'Accès complet à toutes les fonctionnalités du système';
        if (normalized.includes('ADMIN')) return 'Gestion avancée des utilisateurs, rôles et paramètres';
        if (normalized.includes('CHEF')) return 'Validation et gestion opérationnelle des équipes et plannings';
        if (normalized.includes('CADRE')) return 'Gestion métier du service et supervision des ressources';
        return 'Accès standard de consultation et actions métier autorisées.';
    }

    private buildRoleOptions(staffItems: any[]): any[] {
        const valuesFromData = (staffItems || [])
            .map(item => (item?.role || '').toString().trim())
            .filter(value => value.length > 0);

        const customValues = Array.from(new Set(valuesFromData
            .filter(value => !this.defaultRoleValues.includes(value))
            .sort((a, b) => a.localeCompare(b, 'fr'))));

        const values = [...this.defaultRoleValues, ...customValues];

        return values.map(value => ({
            value,
            label: this.formatRoleLabel(value)
        }));
    }

    private formatRoleLabel(value: string): string {
        return value
            .toLowerCase()
            .split('_')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    // Mot de passe
    checkPasswordStrength() {
        if (!this.staff.password) {
            this.passwordStrength = '';
            return;
        }

        const password = this.staff.password;
        let strength = 0;

        if (password.length >= 8) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^a-zA-Z\d]/.test(password)) strength++;

        if (strength <= 1) this.passwordStrength = 'weak';
        else if (strength <= 3) this.passwordStrength = 'medium';
        else this.passwordStrength = 'strong';
    }

    getPasswordStrengthText(): string {
        const texts: any = {
            'weak': 'Faible',
            'medium': 'Moyen',
            'strong': 'Fort'
        };
        return texts[this.passwordStrength] || '';
    }

    // Utilitaires de formatage
    formatLastConnection(date: any): string {
        if (!date) return 'Jamais';

        const now = new Date();
        const lastConn = new Date(date);
        const diff = now.getTime() - lastConn.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Aujourd\'hui ' + this.formatTime(lastConn);
        if (days === 1) return 'Hier ' + this.formatTime(lastConn);
        return this.formatDate(lastConn) + ' ' + this.formatTime(lastConn);
    }

    formatDate(date: any): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('fr-FR');
    }

    formatTime(date: any): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    showError(message: string) {
        this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: message
        });
    }
}
