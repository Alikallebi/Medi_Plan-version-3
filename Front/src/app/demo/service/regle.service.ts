import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
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
} from '../api/regle';

@Injectable({ providedIn: 'root' })
export class RegleService {
    private regles: Regle[] = [
        {
            id: '1',
            nom: 'Repos après garde',
            code: 'REPOS_GARDE',
            description: 'Imposer un repos de sécurité minimum après une garde',
            type: TypeRegle.LEGALE,
            source: 'Code du travail - Article L3132-1',
            priorite: PrioriteRegle.ELEVEE,
            statut: StatutRegle.ACTIVE,
            conditions: [
                { operateur: 'OU', champ: 'Type de poste', comparateur: 'est', valeur: 'Garde 24h' },
                { operateur: 'OU', champ: 'Type de poste', comparateur: 'est', valeur: 'Garde nuit' }
            ],
            action: {
                type: TypeAction.IMPOSER_REPOS,
                parametres: { dureeMinimale: 11, unite: 'heures', fenetre: 0, typeRepos: 'Repos de sécurité' },
                messageAction: 'Un repos de 11h est obligatoire après une garde'
            },
            niveauAlerte: NiveauAlerte.BLOQUANT,
            messageAlerte: 'Planning non conforme: repos après garde manquant',
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: ['Garde 24h', 'Garde nuit'],
            creeLe: new Date('2026-01-01'),
            creerPar: 'Super Admin',
            modifieLe: new Date('2026-02-15'),
            modifiePar: 'Admin GTA'
        },
        {
            id: '2',
            nom: 'Durée max journalière',
            code: 'DUREE_MAX_JOUR',
            description: 'Limiter la durée de travail quotidienne',
            type: TypeRegle.LEGALE,
            source: 'Code du travail - Article L3121-18',
            priorite: PrioriteRegle.ELEVEE,
            statut: StatutRegle.ACTIVE,
            conditions: [
                { operateur: 'ET', champ: 'Durée du poste', comparateur: 'sup', valeur: 12 }
            ],
            action: {
                type: TypeAction.LIMITER_NOMBRE,
                parametres: { maximum: 12, unite: 'heures', periode: 'jour' },
                messageAction: 'La durée de travail ne peut excéder 12h par jour'
            },
            niveauAlerte: NiveauAlerte.BLOQUANT,
            messageAlerte: 'Durée maximale journalière dépassée',
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: [],
            creeLe: new Date('2026-01-01'),
            creerPar: 'Super Admin'
        },
        {
            id: '3',
            nom: 'Repos hebdomadaire',
            code: 'REPOS_HEBDO',
            description: 'Garantir un repos hebdomadaire minimum',
            type: TypeRegle.LEGALE,
            source: 'Code du travail - Article L3132-2',
            priorite: PrioriteRegle.ELEVEE,
            statut: StatutRegle.INACTIVE,
            conditions: [],
            action: {
                type: TypeAction.IMPOSER_REPOS,
                parametres: { dureeMinimale: 35, unite: 'heures', periode: 'semaine', consecutif: true },
                messageAction: 'Un repos de 35h consécutives est obligatoire par semaine'
            },
            niveauAlerte: NiveauAlerte.BLOQUANT,
            messageAlerte: 'Repos hebdomadaire insuffisant',
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: [],
            creeLe: new Date('2026-01-01'),
            creerPar: 'Super Admin'
        },
        {
            id: '4',
            nom: 'Max 4 gardes par mois',
            code: 'MAX_GARDES',
            description: 'Limiter le nombre de gardes mensuelles',
            type: TypeRegle.INTERNE,
            priorite: PrioriteRegle.MOYENNE,
            statut: StatutRegle.ACTIVE,
            conditions: [
                { operateur: 'ET', champ: 'Type de poste', comparateur: 'est', valeur: 'Garde 24h' }
            ],
            action: {
                type: TypeAction.LIMITER_NOMBRE,
                parametres: { maximum: 4, unite: 'postes', periode: 'mois' },
                messageAction: 'Maximum 4 gardes par mois et par personne'
            },
            niveauAlerte: NiveauAlerte.AVERTISSEMENT,
            messageAlerte: 'Nombre maximal de gardes mensuelles atteint',
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: ['Garde 24h'],
            creeLe: new Date('2026-01-01'),
            creerPar: 'Super Admin'
        },
        {
            id: '5',
            nom: 'Incompatibilité jour/nuit',
            code: 'INCOMP_JOUR_NUIT',
            description: 'Interdire les postes jour et nuit consécutifs',
            type: TypeRegle.INTERNE,
            priorite: PrioriteRegle.MOYENNE,
            statut: StatutRegle.ACTIVE,
            conditions: [],
            action: {
                type: TypeAction.INTERDIRE_COMBINAISON,
                parametres: { postes: ['Jour', 'Nuit'], delai: 'consecutif' },
                messageAction: 'Un poste jour ne peut être suivi directement d\'un poste nuit'
            },
            niveauAlerte: NiveauAlerte.BLOQUANT,
            messageAlerte: 'Combinaison jour/nuit interdite',
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: ['Jour', 'Nuit'],
            creeLe: new Date('2026-01-01'),
            creerPar: 'Super Admin'
        },
        {
            id: '6',
            nom: 'Équité weekends',
            code: 'EQUITE_WEEKEND',
            description: 'Répartition équitable des weekends travaillés',
            type: TypeRegle.EQUITE,
            priorite: PrioriteRegle.BASSE,
            statut: StatutRegle.ACTIVE,
            conditions: [
                { operateur: 'ET', champ: 'Période', comparateur: 'est', valeur: 'Weekend' }
            ],
            action: {
                type: TypeAction.LIMITER_NOMBRE,
                parametres: { ecartMaximum: 1, unite: 'weekends', periode: 'trimestre' },
                messageAction: 'Répartition équitable des weekends entre tous les membres'
            },
            niveauAlerte: NiveauAlerte.INFORMATION,
            messageAlerte: 'Déséquilibre dans la répartition des weekends détecté',
            perimetre: { niveau: 'ETABLISSEMENT' },
            posteConcernes: [],
            creeLe: new Date('2026-01-01'),
            creerPar: 'Super Admin'
        }
    ];

    private exceptions: Exception[] = [
        {
            id: '1',
            regleId: '1',
            type: 'SERVICE',
            cibleNom: 'Service Urgences',
            motif: 'Sous-effectif chronique',
            justification: 'Manque de personnel qualifié temporaire',
            dateDebut: new Date('2026-03-01'),
            dateFin: new Date('2026-05-31'),
            validerPar: 'dr.martin@hopital.fr',
            validerParNom: 'Dr MARTIN',
            permanent: false
        },
        {
            id: '2',
            regleId: '1',
            type: 'UTILISATEUR',
            cibleNom: 'Dr DUPONT',
            motif: 'Détachement temporaire',
            justification: 'Mission spéciale service COVID',
            dateDebut: new Date('2026-01-01'),
            validerPar: 'admin@hopital.fr',
            validerParNom: 'Admin GTA',
            permanent: true
        },
        {
            id: '3',
            regleId: '1',
            type: 'PERIODE',
            cibleNom: 'Période de Noël',
            motif: 'Dérogation exceptionnelle',
            justification: 'Période de fêtes avec charge exceptionnelle',
            dateDebut: new Date('2026-12-24'),
            dateFin: new Date('2026-12-26'),
            validerPar: 'direction@hopital.fr',
            validerParNom: 'Direction',
            permanent: false
        }
    ];

    private modeles: ModeleRegle[] = [
        {
            id: '1',
            nom: 'Repos après garde',
            type: TypeRegle.LEGALE,
            description: '11h minimum après une garde',
            template: {
                nom: 'Repos après garde',
                code: 'REPOS_GARDE',
                type: TypeRegle.LEGALE,
                priorite: PrioriteRegle.ELEVEE,
                niveauAlerte: NiveauAlerte.BLOQUANT
            }
        },
        {
            id: '2',
            nom: 'Durée max journalière',
            type: TypeRegle.LEGALE,
            description: 'Maximum 12h de travail par jour',
            template: {
                nom: 'Durée max journalière',
                code: 'DUREE_MAX_JOUR',
                type: TypeRegle.LEGALE,
                priorite: PrioriteRegle.ELEVEE,
                niveauAlerte: NiveauAlerte.BLOQUANT
            }
        },
        {
            id: '3',
            nom: 'Équité weekends',
            type: TypeRegle.EQUITE,
            description: 'Répartition égale des weekends travaillés',
            template: {
                nom: 'Équité weekends',
                code: 'EQUITE_WEEKEND',
                type: TypeRegle.EQUITE,
                priorite: PrioriteRegle.BASSE,
                niveauAlerte: NiveauAlerte.INFORMATION
            }
        }
    ];

    getRegles(): Observable<Regle[]> {
        return of([...this.regles]).pipe(delay(300));
    }

    getRegleById(id: string): Observable<Regle | undefined> {
        return of(this.regles.find(r => r.id === id)).pipe(delay(200));
    }

    createRegle(regle: Regle): Observable<Regle> {
        const newRegle = {
            ...regle,
            id: (Math.max(0, ...this.regles.map(r => parseInt(r.id || '0'))) + 1).toString(),
            creeLe: new Date(),
            creerPar: 'Utilisateur actuel'
        };
        this.regles.push(newRegle);
        return of(newRegle).pipe(delay(300));
    }

    updateRegle(regle: Regle): Observable<Regle> {
        const index = this.regles.findIndex(r => r.id === regle.id);
        if (index !== -1) {
            this.regles[index] = {
                ...regle,
                modifieLe: new Date(),
                modifiePar: 'Utilisateur actuel'
            };
        }
        return of(this.regles[index]).pipe(delay(300));
    }

    deleteRegle(id: string): Observable<void> {
        this.regles = this.regles.filter(r => r.id !== id);
        return of(void 0).pipe(delay(300));
    }

    toggleRegleStatut(id: string): Observable<Regle> {
        const regle = this.regles.find(r => r.id === id);
        if (regle) {
            regle.statut = regle.statut === StatutRegle.ACTIVE ? StatutRegle.INACTIVE : StatutRegle.ACTIVE;
            regle.modifieLe = new Date();
            regle.modifiePar = 'Utilisateur actuel';
        }
        return of(regle!).pipe(delay(300));
    }

    dupliquerRegle(id: string): Observable<Regle> {
        const regle = this.regles.find(r => r.id === id);
        if (regle) {
            const newRegle = {
                ...regle,
                id: (Math.max(0, ...this.regles.map(r => parseInt(r.id || '0'))) + 1).toString(),
                nom: `${regle.nom} (copie)`,
                code: `${regle.code}_COPIE`,
                creeLe: new Date(),
                creerPar: 'Utilisateur actuel'
            };
            this.regles.push(newRegle);
            return of(newRegle).pipe(delay(300));
        }
        return of(undefined as any);
    }

    // Exceptions
    getExceptionsByRegleId(regleId: string): Observable<Exception[]> {
        return of(this.exceptions.filter(e => e.regleId === regleId)).pipe(delay(200));
    }

    createException(exception: Exception): Observable<Exception> {
        const newException = {
            ...exception,
            id: (Math.max(0, ...this.exceptions.map(e => parseInt(e.id || '0'))) + 1).toString()
        };
        this.exceptions.push(newException);
        return of(newException).pipe(delay(300));
    }

    deleteException(id: string): Observable<void> {
        this.exceptions = this.exceptions.filter(e => e.id !== id);
        return of(void 0).pipe(delay(300));
    }

    // Impact
    getImpactRegle(regleId: string): Observable<ImpactRegle> {
        const impact: ImpactRegle = {
            regleId,
            planningsConcernes: 45,
            violationsDetectees: 3,
            tauxViolation: 6.7,
            violationsParService: {
                'Cardiologie': 2,
                'Urgences': 1,
                'Radiologie': 0
            },
            evolutionViolations: [
                { mois: 'Jan', nombre: 3 },
                { mois: 'Fév', nombre: 4 },
                { mois: 'Mar', nombre: 5 },
                { mois: 'Avr', nombre: 4 },
                { mois: 'Mai', nombre: 3 },
                { mois: 'Juin', nombre: 2 },
                { mois: 'Juil', nombre: 1 },
                { mois: 'Août', nombre: 1 }
            ],
            violationsRecentes: [
                {
                    id: '1',
                    planning: 'Sem 10',
                    service: 'Cardiologie',
                    date: new Date('2026-03-05'),
                    responsable: 'Dr MARTIN',
                    details: 'Repos insuffisant après garde'
                },
                {
                    id: '2',
                    planning: 'Sem 09',
                    service: 'Urgences',
                    date: new Date('2026-02-28'),
                    responsable: 'Dr LEROY',
                    details: 'Repos insuffisant après garde'
                },
                {
                    id: '3',
                    planning: 'Sem 08',
                    service: 'Cardiologie',
                    date: new Date('2026-02-21'),
                    responsable: 'Dr MARTIN',
                    details: 'Repos insuffisant après garde'
                }
            ]
        };
        return of(impact).pipe(delay(300));
    }

    // Historique
    getHistoriqueRegle(regleId: string): Observable<HistoriqueRegle[]> {
        const regle = this.regles.find(r => r.id === regleId);
        if (!regle) return of([]);

        const historique: HistoriqueRegle[] = [
            {
                id: '1',
                regleId,
                date: new Date('2026-02-15T10:30:00'),
                type: 'MODIFICATION',
                detail: 'Paramètre modifié - Durée: 10h → 11h',
                utilisateur: 'Admin GTA'
            },
            {
                id: '2',
                regleId,
                date: new Date('2026-02-01T14:15:00'),
                type: 'EXCEPTION_AJOUTEE',
                detail: 'Exception ajoutée - Service Urgences',
                utilisateur: 'Dr MARTIN'
            },
            {
                id: '3',
                regleId,
                date: new Date('2026-01-15T09:00:00'),
                type: 'ACTIVATION',
                detail: 'Règle activée',
                utilisateur: 'Super Admin'
            },
            {
                id: '4',
                regleId,
                date: regle.creeLe || new Date('2026-01-01T11:30:00'),
                type: 'CREATION',
                detail: 'Règle créée',
                utilisateur: regle.creerPar || 'Super Admin'
            }
        ];
        return of(historique).pipe(delay(200));
    }

    // Modèles
    getModeles(): Observable<ModeleRegle[]> {
        return of([...this.modeles]).pipe(delay(200));
    }

    // Statistiques
    getStatistiques(): Observable<StatistiquesRegles> {
        const actives = this.regles.filter(r => r.statut === StatutRegle.ACTIVE);
        const inactives = this.regles.filter(r => r.statut === StatutRegle.INACTIVE);
        const enConflit = this.regles.filter(r => r.statut === StatutRegle.EN_CONFLIT);

        const parType: { [type: string]: number } = {};
        this.regles.forEach(r => {
            parType[r.type] = (parType[r.type] || 0) + 1;
        });

        const stats: StatistiquesRegles = {
            totalActives: actives.length,
            totalInactives: inactives.length,
            parType,
            enConflit: enConflit.length,
            exceptionsActives: this.exceptions.length
        };

        return of(stats).pipe(delay(200));
    }

    // Test de règle
    testerRegle(regleId: string, planning: any): Observable<{ succes: boolean; violations: any[] }> {
        // Simulation de test
        return of({
            succes: false,
            violations: [
                {
                    jour: 'Mardi',
                    poste: 'Matin',
                    personne: 'Dr DUPONT',
                    message: 'VIOLATION: Repos insuffisant après garde',
                    solution: 'Décaler le matin à mercredi'
                }
            ]
        }).pipe(delay(500));
    }
}
