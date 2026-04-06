export interface Service {
    id?: number;
    nom?: string;
    code?: string;
    pole?: any; // Référence à Pole
    specialite?: string;
    description?: string;
    localisation?: string;
    telephone?: string;
    email?: string;
    couleur?: string;
    chefService?: any; // Référence à User
    chefServiceAdjoint?: any; // Référence à User
    cadreSante?: any; // Référence à User
    referentPlanning?: any; // Référence à User
    typeService?: TypeService;
    capaciteAccueil?: number;
    service24h?: boolean;
    serviceUrgence?: boolean;
    effectifMinimum?: EffectifMinimum;
    statut?: StatutActif;
    dateOuverture?: Date;
    servicePilote?: boolean;
    
    // Propriétés de suivi
    creePar?: string;
    modifieLe?: Date;
    modifiePar?: string;
}

export enum TypeService {
    HOSPITALISATION = 'Hospitalisation',
    CONSULTATION = 'Consultation',
    MIXTE = 'Mixte',
    URGENCES = 'Urgences',
    SOINS_INTENSIFS = 'Soins intensifs'
}

export interface EffectifMinimum {
    medecins?: number;
    infirmiers?: number;
    autres?: number;
}

export enum StatutActif {
    ACTIF = 'Actif',
    INACTIF = 'Inactif'
}
