import { Component, OnInit, ViewChild } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { forkJoin } from 'rxjs';
import { PosteService } from '../../../service/poste.service';
import { RbacService } from 'src/app/demo/service/rbac.service';
import { Competence, CompetenceService } from 'src/app/demo/service/competence.service';

interface Poste {
    id?: number;
    code: string;
    nom: string;
    description?: string;
    type: string;
    heureDebut: string;
    heureFin: string;
    heureDebutDate?: Date;
    heureFinDate?: Date;
    jourSuivant: boolean;
    duree: number;
    couleur: string;
    icone?: string;
    tolerance?: number;
    actif: boolean;
    reglesAssociees?: Regle[];
    servicesAutorises?: any[];
    conditionsSaisonnieres?: string[];
    competencesRequises?: any[];
    effectifMin?: number;
    effectifMax?: number;
    chevauchementAutorise: boolean;
    fractionnable: boolean;
    selected?: boolean;
}

interface Regle {
    id?: number;
    nom: string;
    type?: string;
    valeur?: string;
    description?: string;
}

@Component({
    selector: 'app-poste',
    templateUrl: './poste.component.html',
    styleUrls: ['./poste.component.scss'],
    providers: [MessageService]
})
export class PosteComponent implements OnInit {
    private readonly posteStorageKey = 'planning_postes_catalogue';

    @ViewChild('posteMenu') posteMenu!: Menu;

    // Données
    postes: Poste[] = [];
    filteredPostes: Poste[] = [];
    selectedPostes: Poste[] = [];
    currentPoste: Poste = this.getEmptyPoste();
    
    // États UI
    viewMode: 'grid' | 'table' = 'grid';
    loading: boolean = false;
    showPosteDialog: boolean = false;
    showPreviewDialog: boolean = false;
    showQuickRuleDialog: boolean = false;
    showImportDialog: boolean = false;
    showBulkRuleDialog: boolean = false;
    showAdvancedFilters: boolean = false;
    editMode: boolean = false;
    selectAll: boolean = false;
    activeTabIndex: number = 0;
    
    // Filtres
    searchTerm: string = '';
    activeFilter: string = 'all';
    advancedFilters = {
        services: [],
        duree: null,
        regle: null,
        statut: null
    };
    
    // Règles
    regles: Regle[] = [
        { id: 1, nom: 'Repos obligatoire après garde', type: 'repos', valeur: '12 heures' },
        { id: 2, nom: 'Maximum 4 gardes par mois', type: 'quota', valeur: '4' },
        { id: 3, nom: 'Incompatible avec poste nuit', type: 'incompatibilite' },
        { id: 4, nom: 'Nécessite qualification senior', type: 'competence' },
        { id: 5, nom: 'Effectif minimum 2 personnes', type: 'effectif' }
    ];
    newRegle: Regle = { nom: '', type: '', valeur: '', description: '' };
    searchRegle: string = '';
    selectedRegles: Regle[] = [];
    bulkRegle: Regle | null = null;
    
    // Options
    services: any[] = [
        { id: 1, nom: 'Cardiologie' },
        { id: 2, nom: 'Urgences' },
        { id: 3, nom: 'Pédiatrie' },
        { id: 4, nom: 'Chirurgie' }
    ];
    
    competences: Competence[] = [];
    
    typePosteOptions = [
        { label: 'Jour', value: 'jour' },
        { label: 'Nuit', value: 'nuit' },
        { label: 'Garde', value: 'garde' },
        { label: 'Astreinte', value: 'astreinte' },
        { label: 'Repos', value: 'repos' },
        { label: 'Période de garde', value: 'periode' },
        { label: 'Autre', value: 'autre' }
    ];
    
    dureeOptions = [
        { label: 'Moins de 4h', value: '<4' },
        { label: '4h à 8h', value: '4-8' },
        { label: '8h à 12h', value: '8-12' },
        { label: '12h à 24h', value: '12-24' },
        { label: '24h', value: '24' }
    ];
    
    statutOptions = [
        { label: 'Actifs uniquement', value: 'actif' },
        { label: 'Inactifs uniquement', value: 'inactif' },
        { label: 'Tous', value: null }
    ];
    
    typeRegleOptions = [
        { label: 'Repos obligatoire', value: 'repos' },
        { label: 'Quota maximum', value: 'quota' },
        { label: 'Incompatibilité', value: 'incompatibilite' },
        { label: 'Compétence requise', value: 'competence' },
        { label: 'Effectif requis', value: 'effectif' },
        { label: 'Autre', value: 'autre' }
    ];

    conditionPosteOptions = [
        { label: 'Ramadhan', value: 'ramadhan' },
        { label: 'Été', value: 'ete' },
        { label: 'Hiver', value: 'hiver' },
        { label: 'Printemps', value: 'printemps' },
        { label: 'Automne', value: 'automne' },
        { label: 'Toute l\'année', value: 'toute_annee' }
    ];
    
    iconeOptions = [
        { label: 'Soleil', value: '☀️' },
        { label: 'Lune', value: '🌙' },
        { label: 'Hôpital', value: '🏥' },
        { label: 'Téléphone', value: '📞' },
        { label: 'Repos', value: '🛌' },
        { label: 'Horloge', value: '⏰' },
        { label: 'Étoile', value: '⭐' },
        { label: 'Cloche', value: '🔔' },
        { label: 'Aucune', value: '' }
    ];
    
    // Menu contextuel
    posteMenuItems: any[] = [];
    selectedPosteForMenu: Poste | null = null;
    
    // Aperçu calendrier
    previewDays = [
        { label: 'Lun', date: '04/02' },
        { label: 'Mar', date: '05/02' },
        { label: 'Mer', date: '06/02' },
        { label: 'Jeu', date: '07/02' },
        { label: 'Ven', date: '08/02' },
        { label: 'Sam', date: '09/02' },
        { label: 'Dim', date: '10/02' }
    ];

    constructor(
        private messageService: MessageService,
        private posteService: PosteService,
        private competenceService: CompetenceService,
        public rbac: RbacService
    ) {}

    ngOnInit() {
        this.loadCompetencesCatalog();
        this.loadPostes();
        this.initMenuItems();
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

    get competenceMultiSelectOptions(): Array<{ label: string; items: Array<{ label: string; value: number }> }> {
        return this.groupedCompetences.map(group => ({
            label: group.domaine,
            items: group.items.map(item => ({
                label: item.nom,
                value: item.id
            }))
        }));
    }

    toggleCompetence(id: number): void {
        if (!this.currentPoste.competencesRequises) {
            this.currentPoste.competencesRequises = [];
        }

        const current = this.extractIds(this.currentPoste.competencesRequises);
        if (current.includes(id)) {
            this.currentPoste.competencesRequises = current.filter(item => item !== id);
            return;
        }

        this.currentPoste.competencesRequises = [...current, id];
    }

    isSelected(id: number): boolean {
        return this.extractIds(this.currentPoste.competencesRequises).includes(id);
    }

    private loadCompetencesCatalog(): void {
        this.competenceService.getAllCompetences().subscribe({
            next: competences => {
                this.competences = (competences || []).filter(item => item?.isActive !== false && item?.actif !== false);
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

    loadPostes() {
        this.loading = true;

        forkJoin({
            postes: this.posteService.getPostes(),
            services: this.posteService.getServices()
        }).subscribe({
            next: ({ postes, services }) => {
                this.services = services;
                this.postes = (postes || []).map(poste => ({
                    ...poste,
                    conditionsSaisonnieres: poste.conditionsSaisonnieres || [],
                    reglesAssociees: poste.reglesAssociees || [],
                    servicesAutorises: poste.servicesAutorises || [],
                    competencesRequises: this.extractIds(poste.competencesRequises),
                    selected: false
                }));
                this.applyFilters();
                this.loading = false;
            },
            error: () => {
                const stored = this.loadPostesFromStorage();
                this.postes = stored;
                this.filteredPostes = [...this.postes];
                this.loading = false;
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Connexion API',
                    detail: 'Backend indisponible, affichage des données locales.'
                });
            }
        });
    }

    initMenuItems() {
        this.posteMenuItems = [
            {
                label: 'Voir détails',
                icon: 'pi pi-eye',
                command: () => this.viewPosteDetails()
            },
            {
                label: 'Modifier',
                icon: 'pi pi-pencil',
                command: () => this.editPoste(this.selectedPosteForMenu!)
            },
            {
                label: 'Dupliquer',
                icon: 'pi pi-copy',
                command: () => this.duplicatePoste(this.selectedPosteForMenu!)
            },
            { separator: true },
            {
                label: 'Activer/Désactiver',
                icon: 'pi pi-power-off',
                command: () => this.togglePosteStatus()
            },
            {
                label: 'Tester dans planning',
                icon: 'pi pi-calendar',
                command: () => this.testInPlanning()
            },
            { separator: true },
            {
                label: 'Voir statistiques',
                icon: 'pi pi-chart-bar',
                command: () => this.viewStatistics()
            },
            {
                label: 'Historique',
                icon: 'pi pi-history',
                command: () => this.viewHistory()
            },
            { separator: true },
            {
                label: 'Supprimer',
                icon: 'pi pi-trash',
                command: () => this.deletePoste()
            }
        ];
    }

    // Gestion des vues
    toggleView() {
        this.viewMode = this.viewMode === 'grid' ? 'table' : 'grid';
    }

    // Filtres
    setFilter(filter: string) {
        this.activeFilter = filter;
        this.applyFilters();
    }

    applyFilters() {
        this.filteredPostes = this.postes.filter(poste => {
            // Recherche textuelle
            if (this.searchTerm) {
                const search = this.searchTerm.toLowerCase();
                const matchesSearch = 
                    poste.nom.toLowerCase().includes(search) ||
                    poste.code.toLowerCase().includes(search) ||
                    poste.description?.toLowerCase().includes(search);
                if (!matchesSearch) return false;
            }

            // Filtre par type
            if (this.activeFilter !== 'all') {
                if (this.activeFilter === 'regles') {
                    if (!poste.reglesAssociees || poste.reglesAssociees.length === 0) return false;
                } else {
                    if (poste.type !== this.activeFilter) return false;
                }
            }

            // Filtres avancés
            if (this.advancedFilters.services && this.advancedFilters.services.length > 0) {
                // Logique de filtrage par service
            }

            if (this.advancedFilters.duree) {
                const duree = poste.duree;
                switch (this.advancedFilters.duree) {
                    case '<4': if (duree >= 4) return false; break;
                    case '4-8': if (duree < 4 || duree > 8) return false; break;
                    case '8-12': if (duree < 8 || duree > 12) return false; break;
                    case '12-24': if (duree < 12 || duree > 24) return false; break;
                    case '24': if (duree !== 24) return false; break;
                }
            }

            if (this.advancedFilters.statut) {
                if (this.advancedFilters.statut === 'actif' && !poste.actif) return false;
                if (this.advancedFilters.statut === 'inactif' && poste.actif) return false;
            }

            return true;
        });
    }

    // Statistiques
    getActivePostes(): Poste[] {
        return this.postes.filter(p => p.actif);
    }

    getPostesByType(type: string): Poste[] {
        return this.postes.filter(p => p.type === type && p.actif);
    }

    // Sélection
    onPosteSelectionChange() {
        this.selectedPostes = this.filteredPostes.filter(p => p.selected);
        this.selectAll = this.selectedPostes.length === this.filteredPostes.length;
    }

    toggleSelectAll() {
        this.filteredPostes.forEach(p => p.selected = this.selectAll);
        this.onPosteSelectionChange();
    }

    // CRUD Poste
    openCreateDialog() {
        this.editMode = false;
        this.currentPoste = this.getEmptyPoste();
        this.activeTabIndex = 0;
        this.showPosteDialog = true;
    }

    editPoste(poste: Poste) {
        this.editMode = true;
        this.currentPoste = {
            ...poste,
            competencesRequises: this.extractIds(poste.competencesRequises)
        };
        
        // Convertir les heures en objets Date pour p-calendar
        if (this.currentPoste.heureDebut) {
            const [h, m] = this.currentPoste.heureDebut.split(':');
            this.currentPoste.heureDebutDate = new Date(2000, 0, 1, parseInt(h), parseInt(m));
        }
        if (this.currentPoste.heureFin) {
            const [h, m] = this.currentPoste.heureFin.split(':');
            this.currentPoste.heureFinDate = new Date(2000, 0, 1, parseInt(h), parseInt(m));
        }
        
        this.activeTabIndex = 0;
        this.showPosteDialog = true;
    }

    duplicatePoste(poste: Poste) {
        this.editMode = false;
        this.currentPoste = { 
            ...poste, 
            id: undefined,
            code: poste.code + '_COPY',
            nom: poste.nom + ' (Copie)'
        };
        this.showPosteDialog = true;
        this.messageService.add({ 
            severity: 'info', 
            summary: 'Duplication', 
            detail: 'Modifiez le code et le nom avant d\'enregistrer' 
        });
    }

    savePoste() {
        // Validation
        if (!this.currentPoste.code || !this.currentPoste.nom || !this.currentPoste.type) {
            this.messageService.add({ 
                severity: 'error', 
                summary: 'Erreur', 
                detail: 'Veuillez remplir tous les champs obligatoires' 
            });
            return;
        }

        // Convertir les dates en chaînes HH:MM
        if (this.currentPoste.heureDebutDate) {
            this.currentPoste.heureDebut = this.formatTime(this.currentPoste.heureDebutDate);
        }
        if (this.currentPoste.heureFinDate) {
            this.currentPoste.heureFin = this.formatTime(this.currentPoste.heureFinDate);
        }

        // Calculer la durée
        this.currentPoste.duree = this.calculateDuree();

        const payload = this.toPostePayload(this.currentPoste);
        const request$ = this.editMode && this.currentPoste.id
            ? this.posteService.updatePoste(this.currentPoste.id, payload)
            : this.posteService.createPoste(payload);

        request$.subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Succès',
                    detail: this.editMode ? 'Poste modifié avec succès' : 'Poste créé avec succès'
                });
                this.showPosteDialog = false;
                this.currentPoste = this.getEmptyPoste();
                this.loadPostes();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible d\'enregistrer le poste.'
                });
            }
        });
    }

    saveAndCreateNew() {
        this.savePoste();
        if (!this.showPosteDialog) {
            this.openCreateDialog();
        }
    }

    cancelPosteDialog() {
        this.showPosteDialog = false;
        this.currentPoste = this.getEmptyPoste();
    }

    // Actions en masse
    bulkActivate() {
        const updates = this.selectedPostes
            .filter(poste => poste.id)
            .map(poste => this.posteService.updatePoste(poste.id!, this.toPostePayload({ ...poste, actif: true })));

        if (updates.length === 0) {
            return;
        }

        forkJoin(updates).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Succès',
                    detail: `${updates.length} poste(s) activé(s)`
                });
                this.selectedPostes = [];
                this.selectAll = false;
                this.loadPostes();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible d\'activer la sélection.'
                });
            }
        });
    }

    bulkDeactivate() {
        const updates = this.selectedPostes
            .filter(poste => poste.id)
            .map(poste => this.posteService.updatePoste(poste.id!, this.toPostePayload({ ...poste, actif: false })));

        if (updates.length === 0) {
            return;
        }

        forkJoin(updates).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Succès',
                    detail: `${updates.length} poste(s) désactivé(s)`
                });
                this.selectedPostes = [];
                this.selectAll = false;
                this.loadPostes();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible de désactiver la sélection.'
                });
            }
        });
    }

    confirmBulkDelete() {
        if (confirm(`Voulez-vous vraiment supprimer ${this.selectedPostes.length} poste(s) ?`)) {
            const deletes = this.selectedPostes
                .filter(poste => poste.id)
                .map(poste => this.posteService.deletePoste(poste.id!));

            if (deletes.length === 0) {
                return;
            }

            forkJoin(deletes).subscribe({
                next: () => {
                    this.selectedPostes = [];
                    this.selectAll = false;
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Succès',
                        detail: 'Postes supprimés'
                    });
                    this.loadPostes();
                },
                error: () => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Erreur',
                        detail: 'Impossible de supprimer la sélection.'
                    });
                }
            });
        }
    }

    bulkAssociateRule() {
        if (!this.bulkRegle) return;
        
        this.selectedPostes.forEach(poste => {
            if (!poste.reglesAssociees) poste.reglesAssociees = [];
            if (!poste.reglesAssociees.find(r => r.id === this.bulkRegle!.id)) {
                poste.reglesAssociees.push(this.bulkRegle!);
            }
        });
        
        this.messageService.add({ 
            severity: 'success', 
            summary: 'Succès', 
            detail: 'Règle associée aux postes sélectionnés' 
        });
        this.showBulkRuleDialog = false;
    }

    // Règles
    getAvailableRegles(): Regle[] {
        const currentRegles = this.currentPoste.reglesAssociees || [];
        let available = this.regles.filter(r => !currentRegles.find(cr => cr.id === r.id));
        
        if (this.searchRegle) {
            const search = this.searchRegle.toLowerCase();
            available = available.filter(r => r.nom.toLowerCase().includes(search));
        }
        
        return available;
    }

    removeRegle(regle: Regle) {
        if (this.currentPoste.reglesAssociees) {
            this.currentPoste.reglesAssociees = this.currentPoste.reglesAssociees.filter(r => r.id !== regle.id);
        }
    }

    associateRegles() {
        if (!this.currentPoste.reglesAssociees) {
            this.currentPoste.reglesAssociees = [];
        }
        this.currentPoste.reglesAssociees.push(...this.selectedRegles);
        this.selectedRegles = [];
        this.messageService.add({ 
            severity: 'success', 
            summary: 'Succès', 
            detail: 'Règles associées' 
        });
    }

    openQuickRuleDialog() {
        this.newRegle = { nom: '', type: '', valeur: '', description: '' };
        this.showQuickRuleDialog = true;
    }

    createAndAssociateRule() {
        if (!this.newRegle.nom || !this.newRegle.type) {
            this.messageService.add({ 
                severity: 'error', 
                summary: 'Erreur', 
                detail: 'Veuillez remplir les champs obligatoires' 
            });
            return;
        }

        this.newRegle.id = Math.max(...this.regles.map(r => r.id || 0)) + 1;
        this.regles.push({ ...this.newRegle });
        
        if (!this.currentPoste.reglesAssociees) {
            this.currentPoste.reglesAssociees = [];
        }
        this.currentPoste.reglesAssociees.push({ ...this.newRegle });
        
        this.messageService.add({ 
            severity: 'success', 
            summary: 'Succès', 
            detail: 'Règle créée et associée' 
        });
        this.showQuickRuleDialog = false;
    }

    // Menu contextuel
    openPosteMenu(event: Event, poste: Poste) {
        this.selectedPosteForMenu = poste;
        this.posteMenu.toggle(event);
    }

    viewPosteDetails() {
        console.log('Voir détails', this.selectedPosteForMenu);
    }

    togglePosteStatus() {
        if (this.selectedPosteForMenu?.id) {
            const nextStatus = !this.selectedPosteForMenu.actif;
            this.posteService.updatePoste(
                this.selectedPosteForMenu.id,
                this.toPostePayload({ ...this.selectedPosteForMenu, actif: nextStatus })
            ).subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Succès',
                        detail: `Poste ${nextStatus ? 'activé' : 'désactivé'}`
                    });
                    this.loadPostes();
                },
                error: () => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Erreur',
                        detail: 'Impossible de mettre à jour le statut.'
                    });
                }
            });
        }
    }

    testInPlanning() {
        this.showPreviewDialog = true;
    }

    viewStatistics() {
        this.messageService.add({ 
            severity: 'info', 
            summary: 'Statistiques', 
            detail: 'Fonctionnalité à venir' 
        });
    }

    viewHistory() {
        this.messageService.add({ 
            severity: 'info', 
            summary: 'Historique', 
            detail: 'Fonctionnalité à venir' 
        });
    }

    deletePoste() {
        if (confirm('Voulez-vous vraiment supprimer ce poste ?') && this.selectedPosteForMenu?.id) {
            this.posteService.deletePoste(this.selectedPosteForMenu.id).subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Succès',
                        detail: 'Poste supprimé'
                    });
                    this.loadPostes();
                },
                error: () => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Erreur',
                        detail: 'Impossible de supprimer le poste.'
                    });
                }
            });
        }
    }

    private savePostesToStorage() {
        try {
            localStorage.setItem(this.posteStorageKey, JSON.stringify(this.postes));
        } catch (error) {
            console.warn('Impossible de sauvegarder les postes en localStorage', error);
        }
    }

    private loadPostesFromStorage(): Poste[] {
        try {
            const raw = localStorage.getItem(this.posteStorageKey);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw) as Poste[];
            return parsed.map(poste => ({
                ...poste,
                conditionsSaisonnieres: poste.conditionsSaisonnieres || []
            }));
        } catch {
            return [];
        }
    }

    // Import/Export
    onFileSelect(event: any) {
        console.log('Fichier sélectionné', event);
    }

    importPostes() {
        this.messageService.add({ 
            severity: 'info', 
            summary: 'Import', 
            detail: 'Fonctionnalité à venir' 
        });
        this.showImportDialog = false;
    }

    exportCatalogue() {
        this.messageService.add({ 
            severity: 'info', 
            summary: 'Export', 
            detail: 'Export du catalogue en cours...' 
        });
    }

    exportSelection() {
        this.messageService.add({ 
            severity: 'info', 
            summary: 'Export', 
            detail: `Export de ${this.selectedPostes.length} poste(s)...` 
        });
    }

    // Utilitaires
    getEmptyPoste(): Poste {
        return {
            code: '',
            nom: '',
            type: 'jour',
            heureDebut: '08:00',
            heureFin: '16:00',
            jourSuivant: false,
            duree: 8,
            couleur: '#fef9c3',
            actif: true,
            conditionsSaisonnieres: [],
            reglesAssociees: [],
            chevauchementAutorise: true,
            fractionnable: false
        };
    }

    isNonWorkingType(type?: string): boolean {
        return type === 'repos' || type === 'conges';
    }

    calculateDuree(): number {
        if (this.isNonWorkingType(this.currentPoste.type)) {
            return 0;
        }

        if (!this.currentPoste.heureDebutDate || !this.currentPoste.heureFinDate) {
            return 0;
        }

        let debut = this.currentPoste.heureDebutDate.getHours() + 
                    this.currentPoste.heureDebutDate.getMinutes() / 60;
        let fin = this.currentPoste.heureFinDate.getHours() + 
                  this.currentPoste.heureFinDate.getMinutes() / 60;

        if (this.currentPoste.jourSuivant || fin < debut) {
            fin += 24;
        }

        return Math.round((fin - debut) * 10) / 10;
    }

    formatTime(date: Date): string {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    private toPostePayload(poste: Poste): any {
        const { id, selected, heureDebutDate, heureFinDate, ...payload } = poste as any;

        return {
            ...payload,
            reglesAssociees: (payload.reglesAssociees || [])
                .filter((regle: any) => regle && regle.nom)
                .map((regle: any) => ({
                    id: regle.id,
                    nom: regle.nom,
                    type: regle.type ?? null,
                    valeur: regle.valeur ?? null,
                    description: regle.description ?? null
                })),
            servicesAutorises: this.extractIds(payload.servicesAutorises),
            competencesRequises: this.extractIds(payload.competencesRequises),
            conditionsSaisonnieres: (payload.conditionsSaisonnieres || []).filter((item: any) => typeof item === 'string')
        };
    }

    private extractIds(items: any[] | undefined): number[] {
        if (!Array.isArray(items)) {
            return [];
        }

        return items
            .map(item => {
                if (typeof item === 'number') {
                    return item;
                }
                if (item && typeof item.id === 'number') {
                    return item.id;
                }
                const parsed = Number(item);
                return Number.isFinite(parsed) ? parsed : null;
            })
            .filter((value): value is number => value !== null);
    }

    getTextColor(bgColor: string): string {
        if (!bgColor) return '#000000';
        
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        
        return brightness > 155 ? '#000000' : '#ffffff';
    }

    onColorChange() {
        // Mise à jour de l'aperçu en temps réel
    }

    getTypeLabel(type: string): string {
        if (type === 'repos' || type === 'conges') {
            return 'Congé / Repos';
        }

        const option = this.typePosteOptions.find(o => o.value === type);
        return option ? option.label : type;
    }

    getIconeLabel(icone: string): string {
        const option = this.iconeOptions.find(o => o.value === icone);
        return option ? option.label : '';
    }
}
