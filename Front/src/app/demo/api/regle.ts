export interface Regle {
    id?: string;
    nom: string;
    code: string;
    description: string;
    type: TypeRegle;
    source?: string;
    priorite: PrioriteRegle;
    statut: StatutRegle;
    conditions: Condition[];
    action: Action;
    niveauAlerte: NiveauAlerte;
    messageAlerte: string;
    perimetre: Perimetre;
    posteConcernes: string[];
    periodes?: PeriodeApplication[];
    creeLe?: Date;
    creerPar?: string;
    modifieLe?: Date;
    modifiePar?: string;
}

export enum TypeRegle {
    LEGALE = 'LEGALE',
    INTERNE = 'INTERNE',
    EQUITE = 'EQUITE'
}

export enum PrioriteRegle {
    ELEVEE = 1,
    MOYENNE = 2,
    BASSE = 3
}

export enum StatutRegle {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    EN_CONFLIT = 'EN_CONFLIT'
}

export interface Condition {
    id?: string;
    operateur: 'ET' | 'OU';
    champ: string;
    comparateur: 'est' | 'nest_pas' | 'contient' | 'ne_contient_pas' | 'sup' | 'inf' | 'egal' | 'sup_egal' | 'inf_egal' | 'entre';
    valeur: any;
}

export interface Action {
    type: TypeAction;
    parametres: { [key: string]: any };
    messageAction: string;
}

export enum TypeAction {
    IMPOSER_REPOS = 'IMPOSER_REPOS',
    LIMITER_NOMBRE = 'LIMITER_NOMBRE',
    INTERDIRE_COMBINAISON = 'INTERDIRE_COMBINAISON',
    EXIGER_COMPETENCE = 'EXIGER_COMPETENCE',
    IMPOSER_EFFECTIF_MIN = 'IMPOSER_EFFECTIF_MIN',
    FORCER_ALERTE = 'FORCER_ALERTE'
}

export enum NiveauAlerte {
    INFORMATION = 'INFORMATION',
    AVERTISSEMENT = 'AVERTISSEMENT',
    BLOQUANT = 'BLOQUANT'
}

export interface Perimetre {
    niveau: 'ETABLISSEMENT' | 'POLE' | 'SERVICE' | 'EQUIPE';
    entites?: string[];
}

export interface PeriodeApplication {
    id?: string;
    nom: string;
    typeperiode: 'WEEKEND' | 'JOUR_FERIE' | 'PLAGE_DATE' | 'PLAGE_HORAIRE' | 'PERSONNALISE';
    dateDebut?: Date;
    dateFin?: Date;
    heureDebut?: string;
    heureFin?: string;
}

export interface Exception {
    id?: string;
    regleId: string;
    type: 'SERVICE' | 'EQUIPE' | 'UTILISATEUR' | 'PERIODE';
    cibleId?: string;
    cibleNom: string;
    motif: string;
    justification: string;
    documentJustificatif?: string;
    dateDebut: Date;
    dateFin?: Date;
    validerPar: string;
    validerParNom: string;
    permanent: boolean;
}

export interface ImpactRegle {
    regleId: string;
    planningsConcernes: number;
    violationsDetectees: number;
    tauxViolation: number;
    violationsParService: { [service: string]: number };
    evolutionViolations: { mois: string; nombre: number }[];
    violationsRecentes: ViolationRecente[];
}

export interface ViolationRecente {
    id: string;
    planning: string;
    service: string;
    date: Date;
    responsable: string;
    details: string;
}

export interface HistoriqueRegle {
    id?: string;
    regleId: string;
    date: Date;
    type: 'CREATION' | 'MODIFICATION' | 'ACTIVATION' | 'DESACTIVATION' | 'EXCEPTION_AJOUTEE' | 'EXCEPTION_SUPPRIMEE';
    detail: string;
    utilisateur: string;
}

export interface ModeleRegle {
    id: string;
    nom: string;
    type: TypeRegle;
    description: string;
    template: Partial<Regle>;
}

export interface StatistiquesRegles {
    totalActives: number;
    totalInactives: number;
    parType: { [type: string]: number };
    enConflit: number;
    exceptionsActives: number;
}
