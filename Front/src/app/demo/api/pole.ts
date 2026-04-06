export interface Pole {
    id?: number;
    nom?: string;
    code?: string;
    typePole?: TypePole;
    description?: string;
    localisation?: string;
    telephone?: string;
    email?: string;
    couleur?: string;
    chefPole?: any; // Référence à User
    chefAdjoint?: any; // Référence à User
    assistant?: any; // Référence à User
    poleUrgence?: boolean;
    activite24h?: boolean;
    statut?: StatutActif;
    dateCreation?: Date;
    
    // Propriétés de suivi
    creePar?: string;
    modifieLe?: Date;
    modifiePar?: string;
}

export enum TypePole {
    MEDICAL = 'Médical',
    CHIRURGICAL = 'Chirurgical',
    MERE_ENFANT = 'Mère-enfant',
    URGENCES = 'Urgences',
    GERIATRIE = 'Gériatrie',
    PSYCHIATRIE = 'Psychiatrie',
    PLATEAU_TECHNIQUE = 'Plateau technique',
    AUTRE = 'Autre'
}

export enum StatutActif {
    ACTIF = 'Actif',
    INACTIF = 'Inactif'
}
