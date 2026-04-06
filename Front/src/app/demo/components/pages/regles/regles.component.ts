import { Component, OnInit } from '@angular/core';
import { MessageService, ConfirmationService } from 'primeng/api';
import { RegleService } from '../../../service/regle.service';
import { RbacService } from 'src/app/demo/service/rbac.service';
import {
    Regle,
    TypeRegle,
    StatutRegle,
    PrioriteRegle,
    NiveauAlerte,
    Exception,
    ImpactRegle,
    HistoriqueRegle,
    ModeleRegle,
    StatistiquesRegles,
    TypeAction
} from '../../../api/regle';

@Component({
    selector: 'app-regles',
    templateUrl: './regles.component.html',
    styleUrls: ['./regles.component.css'],
    providers: [MessageService, ConfirmationService]
})
export class ReglesComponent implements OnInit {
    // Données
    regles: Regle[] = [];
    reglesFiltrees: Regle[] = [];
    regleSelectionnee: Regle | null = null;
    exceptions: Exception[] = [];
    impact: ImpactRegle | null = null;
    historique: HistoriqueRegle[] = [];
    modeles: ModeleRegle[] = [];
    statistiques: StatistiquesRegles | null = null;

    // UI States
    loading = false;
    searchTerm = '';
    filtreActif: string = 'TOUTES';
    ongletActif: string = 'configuration';
    
    // Modales
    afficherModaleCreation = false;
    afficherModaleException = false;
    afficherModaleTest = false;
    etapeCreation = 1;

    // Formulaires
    nouvelleRegle: Partial<Regle> = {};
    nouvelleException: Partial<Exception> = {};

    // Enums pour le template
    TypeRegle = TypeRegle;
    StatutRegle = StatutRegle;
    PrioriteRegle = PrioriteRegle;
    NiveauAlerte = NiveauAlerte;
    TypeAction = TypeAction;

    // Catégories pour l'affichage
    categories = [
        { nom: 'RÈGLES LÉGALES', type: TypeRegle.LEGALE, collapsed: false },
        { nom: 'RÈGLES INTERNES', type: TypeRegle.INTERNE, collapsed: false },
        { nom: 'RÈGLES D\'ÉQUITÉ', type: TypeRegle.EQUITE, collapsed: false }
    ];

    // Filtres disponibles
    filtres = [
        { label: 'Toutes', value: 'TOUTES' },
        { label: 'Règles légales', value: TypeRegle.LEGALE },
        { label: 'Règles internes', value: TypeRegle.INTERNE },
        { label: 'Règles d\'équité', value: TypeRegle.EQUITE },
        { label: 'Actives uniquement', value: 'ACTIVES' },
        { label: 'Inactives uniquement', value: 'INACTIVES' },
        { label: 'En conflit', value: 'CONFLITS' }
    ];

    constructor(
        private regleService: RegleService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        public rbac: RbacService
    ) {}

    ngOnInit() {
        this.chargerDonnees();
    }

    chargerDonnees() {
        this.loading = true;
        this.regleService.getRegles().subscribe({
            next: (regles) => {
                this.regles = regles;
                this.appliquerFiltres();
                this.loading = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible de charger les règles'
                });
                this.loading = false;
            }
        });

        this.regleService.getStatistiques().subscribe({
            next: (stats) => {
                this.statistiques = stats;
            }
        });

        this.regleService.getModeles().subscribe({
            next: (modeles) => {
                this.modeles = modeles;
            }
        });
    }

    appliquerFiltres() {
        let resultats = [...this.regles];

        // Recherche textuelle
        if (this.searchTerm) {
            const terme = this.searchTerm.toLowerCase();
            resultats = resultats.filter(r =>
                r.nom.toLowerCase().includes(terme) ||
                r.code.toLowerCase().includes(terme) ||
                r.description.toLowerCase().includes(terme)
            );
        }

        // Filtre par catégorie/statut
        if (this.filtreActif !== 'TOUTES') {
            if (this.filtreActif === 'ACTIVES') {
                resultats = resultats.filter(r => r.statut === StatutRegle.ACTIVE);
            } else if (this.filtreActif === 'INACTIVES') {
                resultats = resultats.filter(r => r.statut === StatutRegle.INACTIVE);
            } else if (this.filtreActif === 'CONFLITS') {
                resultats = resultats.filter(r => r.statut === StatutRegle.EN_CONFLIT);
            } else {
                resultats = resultats.filter(r => r.type === this.filtreActif);
            }
        }

        this.reglesFiltrees = resultats;
    }

    onSearchChange() {
        this.appliquerFiltres();
    }

    changerFiltre(filtre: string) {
        this.filtreActif = filtre;
        this.appliquerFiltres();
    }

    getReglesParCategorie(type: TypeRegle): Regle[] {
        return this.reglesFiltrees.filter(r => r.type === type);
    }

    toggleCategorie(categorie: any) {
        categorie.collapsed = !categorie.collapsed;
    }

    selectionnerRegle(regle: Regle) {
        this.regleSelectionnee = regle;
        this.ongletActif = 'configuration';
        this.chargerDetailsRegle(regle.id!);
    }

    chargerDetailsRegle(regleId: string) {
        // Charger les exceptions
        this.regleService.getExceptionsByRegleId(regleId).subscribe({
            next: (exceptions) => {
                this.exceptions = exceptions;
            }
        });

        // Charger l'impact
        this.regleService.getImpactRegle(regleId).subscribe({
            next: (impact) => {
                this.impact = impact;
            }
        });

        // Charger l'historique
        this.regleService.getHistoriqueRegle(regleId).subscribe({
            next: (historique) => {
                this.historique = historique;
            }
        });
    }

    changerOnglet(onglet: string) {
        this.ongletActif = onglet;
    }

    handleTabChange(event: any) {
        const index = event.index || 0;
        const onglets = ['configuration', 'application', 'exceptions', 'impact', 'historique'];
        this.ongletActif = onglets[index] || 'configuration';
    }

    // Actions sur les règles
    nouvelleRegleAction() {
        this.nouvelleRegle = {
            type: TypeRegle.LEGALE,
            priorite: PrioriteRegle.MOYENNE,
            statut: StatutRegle.ACTIVE,
            niveauAlerte: NiveauAlerte.AVERTISSEMENT,
            conditions: [],
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: []
        };
        this.etapeCreation = 1;
        this.afficherModaleCreation = true;
    }

    modifierRegle() {
        if (!this.regleSelectionnee) return;
        // Ouvrir la modale de modification avec les données existantes
        this.nouvelleRegle = { ...this.regleSelectionnee };
        this.afficherModaleCreation = true;
    }

    dupliquerRegle(regle?: Regle) {
        const regleADupliquer = regle || this.regleSelectionnee;
        if (!regleADupliquer?.id) return;

        this.regleService.dupliquerRegle(regleADupliquer.id).subscribe({
            next: (nouvRegle) => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Succès',
                    detail: 'Règle dupliquée avec succès'
                });
                this.chargerDonnees();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible de dupliquer la règle'
                });
            }
        });
    }

    toggleStatutRegle(regle?: Regle) {
        const regleACible = regle || this.regleSelectionnee;
        if (!regleACible?.id) return;

        const action = regleACible.statut === StatutRegle.ACTIVE ? 'désactiver' : 'activer';

        this.confirmationService.confirm({
            message: `Voulez-vous ${action} cette règle ?`,
            header: 'Confirmation',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.regleService.toggleRegleStatut(regleACible.id!).subscribe({
                    next: (regleMAJ) => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Succès',
                            detail: `Règle ${action === 'activer' ? 'activée' : 'désactivée'} avec succès`
                        });
                        
                        // Mettre à jour dans la liste
                        const index = this.regles.findIndex(r => r.id === regleMAJ.id);
                        if (index !== -1) {
                            this.regles[index] = regleMAJ;
                        }
                        
                        // Mettre à jour la règle sélectionnée si c'est celle-ci
                        if (this.regleSelectionnee?.id === regleMAJ.id) {
                            this.regleSelectionnee = regleMAJ;
                        }
                        
                        this.appliquerFiltres();
                    },
                    error: () => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Erreur',
                            detail: 'Impossible de modifier le statut'
                        });
                    }
                });
            }
        });
    }

    supprimerRegle(regle?: Regle) {
        const regleASupprimer = regle || this.regleSelectionnee;
        if (!regleASupprimer?.id) return;

        this.confirmationService.confirm({
            message: 'Êtes-vous sûr de vouloir supprimer cette règle ?',
            header: 'Confirmation de suppression',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.regleService.deleteRegle(regleASupprimer.id!).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Succès',
                            detail: 'Règle supprimée avec succès'
                        });
                        
                        if (this.regleSelectionnee?.id === regleASupprimer.id) {
                            this.regleSelectionnee = null;
                        }
                        
                        this.chargerDonnees();
                    },
                    error: () => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Erreur',
                            detail: 'Impossible de supprimer la règle'
                        });
                    }
                });
            }
        });
    }

    testerRegle() {
        if (!this.regleSelectionnee?.id) return;
        this.afficherModaleTest = true;
        
        // Effectuer le test
        this.regleService.testerRegle(this.regleSelectionnee.id, {}).subscribe({
            next: (resultat) => {
                // Le résultat sera affiché dans la modale
            }
        });
    }

    // Gestion des exceptions
    ajouterException() {
        this.nouvelleException = {
            regleId: this.regleSelectionnee?.id,
            type: 'SERVICE',
            permanent: false,
            dateDebut: new Date()
        };
        this.afficherModaleException = true;
    }

    enregistrerException() {
        if (!this.nouvelleException.cibleNom || !this.nouvelleException.motif) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Attention',
                detail: 'Veuillez remplir tous les champs obligatoires'
            });
            return;
        }

        this.regleService.createException(this.nouvelleException as Exception).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Succès',
                    detail: 'Exception ajoutée avec succès'
                });
                this.afficherModaleException = false;
                if (this.regleSelectionnee?.id) {
                    this.chargerDetailsRegle(this.regleSelectionnee.id);
                }
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible d\'ajouter l\'exception'
                });
            }
        });
    }

    supprimerException(exception: Exception) {
        this.confirmationService.confirm({
            message: 'Voulez-vous révoquer cette exception ?',
            header: 'Confirmation',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.regleService.deleteException(exception.id!).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Succès',
                            detail: 'Exception révoquée avec succès'
                        });
                        if (this.regleSelectionnee?.id) {
                            this.chargerDetailsRegle(this.regleSelectionnee.id);
                        }
                    },
                    error: () => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Erreur',
                            detail: 'Impossible de révoquer l\'exception'
                        });
                    }
                });
            }
        });
    }

    // Création de règle (wizard)
    etapeSuivante() {
        if (this.etapeCreation < 4) {
            this.etapeCreation++;
        }
    }

    etapePrecedente() {
        if (this.etapeCreation > 1) {
            this.etapeCreation--;
        }
    }

    enregistrerRegle() {
        if (!this.nouvelleRegle.nom || !this.nouvelleRegle.code) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Attention',
                detail: 'Veuillez remplir tous les champs obligatoires'
            });
            return;
        }

        const regle = this.nouvelleRegle as Regle;
        
        if (regle.id) {
            // Modification
            this.regleService.updateRegle(regle).subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Succès',
                        detail: 'Règle mise à jour avec succès'
                    });
                    this.afficherModaleCreation = false;
                    this.chargerDonnees();
                },
                error: () => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Erreur',
                        detail: 'Impossible de mettre à jour la règle'
                    });
                }
            });
        } else {
            // Création
            this.regleService.createRegle(regle).subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Succès',
                        detail: 'Règle créée avec succès'
                    });
                    this.afficherModaleCreation = false;
                    this.chargerDonnees();
                },
                error: () => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Erreur',
                        detail: 'Impossible de créer la règle'
                    });
                }
            });
        }
    }

    annulerCreation() {
        this.afficherModaleCreation = false;
        this.nouvelleRegle = {};
        this.etapeCreation = 1;
    }

    // Helpers
    getClasseRegle(regle: Regle): string {
        const classes = ['regle-card'];
        
        if (regle.type === TypeRegle.LEGALE) classes.push('regle-legale');
        if (regle.type === TypeRegle.INTERNE) classes.push('regle-interne');
        if (regle.type === TypeRegle.EQUITE) classes.push('regle-equite');
        
        if (regle.statut === StatutRegle.ACTIVE) classes.push('regle-active');
        if (regle.statut === StatutRegle.INACTIVE) classes.push('regle-inactive');
        if (regle.statut === StatutRegle.EN_CONFLIT) classes.push('regle-conflit');
        
        if (this.regleSelectionnee?.id === regle.id) classes.push('selected');
        
        return classes.join(' ');
    }

    getBadgeStatut(statut: StatutRegle): string {
        switch (statut) {
            case StatutRegle.ACTIVE: return 'success';
            case StatutRegle.INACTIVE: return 'secondary';
            case StatutRegle.EN_CONFLIT: return 'warning';
            default: return 'info';
        }
    }

    getIconeStatut(statut: StatutRegle): string {
        switch (statut) {
            case StatutRegle.ACTIVE: return 'pi pi-check-circle';
            case StatutRegle.INACTIVE: return 'pi pi-pause-circle';
            case StatutRegle.EN_CONFLIT: return 'pi pi-exclamation-triangle';
            default: return 'pi pi-info-circle';
        }
    }

    getLibellePriorite(priorite: PrioriteRegle): string {
        switch (priorite) {
            case PrioriteRegle.ELEVEE: return 'Élevée';
            case PrioriteRegle.MOYENNE: return 'Moyenne';
            case PrioriteRegle.BASSE: return 'Basse';
            default: return '';
        }
    }

    getIconeTypeHistorique(type: string): string {
        switch (type) {
            case 'CREATION': return 'pi pi-plus-circle';
            case 'MODIFICATION': return 'pi pi-pencil';
            case 'ACTIVATION': return 'pi pi-play-circle';
            case 'DESACTIVATION': return 'pi pi-pause-circle';
            case 'EXCEPTION_AJOUTEE': return 'pi pi-file';
            case 'EXCEPTION_SUPPRIMEE': return 'pi pi-trash';
            default: return 'pi pi-info-circle';
        }
    }

    retourListe() {
        this.regleSelectionnee = null;
    }

    exporterRegles() {
        this.messageService.add({
            severity: 'info',
            summary: 'Export',
            detail: 'Fonctionnalité d\'export en cours de développement'
        });
    }

    importerRegles() {
        this.messageService.add({
            severity: 'info',
            summary: 'Import',
            detail: 'Fonctionnalité d\'import en cours de développement'
        });
    }

    testerGlobal() {
        this.messageService.add({
            severity: 'info',
            summary: 'Test global',
            detail: 'Test de toutes les règles sur le planning en cours...'
        });
    }

    afficherAide() {
        this.messageService.add({
            severity: 'info',
            summary: 'Aide',
            detail: 'Guide des types de règles disponible dans la documentation'
        });
    }
}
