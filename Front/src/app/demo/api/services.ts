// ====== ENUMS ======
export enum TypeEntite {
    POLE = 'POLE',
    SERVICE = 'SERVICE',
    EQUIPE = 'EQUIPE'
}

export enum StatutEntite {
    ACTIF = 'ACTIF',
    INACTIF = 'INACTIF',
    EN_MAINTENANCE = 'EN_MAINTENANCE'
}

export enum TypeEquipe {
    JOUR = 'JOUR',
    NUIT = 'NUIT',
    MIXTE = 'MIXTE',
    ROTATION = 'ROTATION'
}

export enum RolePersonnel {
    CHEF = 'CHEF',
    CADRE = 'CADRE',
    MEDECIN = 'MEDECIN',
    INFIRMIER = 'INFIRMIER',
    AUTRE = 'AUTRE'
}

export enum JourSemaine {
    LUNDI = 'LUNDI',
    MARDI = 'MARDI',
    MERCREDI = 'MERCREDI',
    JEUDI = 'JEUDI',
    VENDREDI = 'VENDREDI',
    SAMEDI = 'SAMEDI',
    DIMANCHE = 'DIMANCHE'
}

// ====== INTERFACES ======

export interface Horaire {
    jour: JourSemaine;
    matin: boolean;
    apres_midi: boolean;
    nuit: boolean;
    heureDebut?: string;
    heureFin?: string;
}

export interface Utilisateur {
    id: string;
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    avatar?: string;
    role: RolePersonnel;
    statut: 'ACTIF' | 'CONGE' | 'INACTIF';
    specialite?: string;
    dateEmbauche?: Date;
}

export interface AffectationPersonnel {
    id: string;
    utilisateur: Utilisateur;
    entiteId: string;
    entiteType: TypeEntite;
    roleLocal: RolePersonnel;
    dateAffectation: Date;
    dateFinAffectation?: Date;
    pourcentageActivite: number;
    statut: 'ACTIF' | 'SUSPENDU' | 'TERMINE';
}

export interface Pole {
    id: string;
    nom: string;
    code: string;
    description?: string;
    adresse?: string;
    telephone?: string;
    email?: string;
    couleur: string; // #8b5cf6 (violet)
    chefPole: Utilisateur;
    assistantChef?: Utilisateur;
    statut: StatutEntite;
    creeLe: Date;
    modifieLe: Date;
    modifiePar: string;
    
    // Dénormalisé pour performances
    nombreServices?: number;
    nombreEquipes?: number;
    effectifTotal?: number;
}

export interface Service {
    id: string;
    nom: string;
    code: string;
    description?: string;
    poleId?: string; // null si service autonome
    localisation?: string;
    telephone?: string;
    email?: string;
    couleur: string; // #10b981 (vert)
    chefService: Utilisateur;
    cadreSante?: Utilisateur;
    referentPlanning?: Utilisateur;
    specialites?: string[];
    
    // Configuration
    service24h: boolean;
    serviceUrgence: boolean;
    effectifMinimumParGarde: number;
    
    // Statistiques
    nombreLits?: number;
    tauxOccupation?: number;
    nombreGardesParMois?: number;
    
    statut: StatutEntite;
    creeLe: Date;
    modifieLe: Date;
    modifiePar: string;
    
    // Dénormalisé
    nombreEquipes?: number;
    effectifTotal?: number;
}

export interface Equipe {
    id: string;
    nom: string;
    code: string;
    description?: string;
    serviceId: string;
    couleur: string; // #f59e0b (orange)
    chefEquipe: Utilisateur;
    assistantChef?: Utilisateur;
    
    // Configuration
    type: TypeEquipe;
    specialite?: string;
    horaires?: Horaire[];
    
    // Statistiques
    effectifTotal?: number;
    dateCreation: Date;
    
    statut: StatutEntite;
    creeLe: Date;
    modifieLe: Date;
    modifiePar: string;
}

export interface ApercuEffectif {
    total: number;
    medecins: number;
    infirmiers: number;
    autres: number;
    encongé: number;
    inactifs: number;
}

export interface StatistiquesPole {
    nombrePoles: number;
    nombreServices: number;
    nombreEquipes: number;
    nombreUtilisateurs: number;
    entitesInactives: number;
}

export interface StructureOrganisationnelle {
    etablissement: {
        nom: string;
        adresse: string;
    };
    poles: Pole[];
}

export interface AnomalieStructure {
    type: 'RESPONSABLE_MANQUANT' | 'EFFECTIF_CRITIQUE' | 'AUCUNE_EQUIPE' | 'CODE_DUPLIQUE';
    entiteId: string;
    entiteNom: string;
    severity: 'INFO' | 'WARNING' | 'ERROR';
    message: string;
}

export interface HistoriqueEntite {
    id: string;
    entiteId: string;
    entiteType: TypeEntite;
    typeModification: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION' | 'CHANGEMENT_RESPONSABLE' | 'CHANGEMENT_STATUT' | 'AFFECTATION_PERSONNEL';
    description: string;
    utilisateur: string;
    dateModification: Date;
    ancienneValeur?: any;
    nouvelleValeur?: any;
}
