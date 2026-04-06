export interface Compteurs {
    solde_rc_plus_heures: number;
    solde_rc_moins_heures: number;
}

export interface Affectation {
    id?: string | number;
    code: string;
    libelle: string;
    heureDebut: string;
    heureFin: string;
    type?: string;
    couleur?: string;
    badgeClass?: string;
}

export interface Demande {
    id?: string | number;
    code?: string;
    libelle?: string;
    type: string;
    statut: 'en_attente' | 'approuve' | 'rejete' | string;
    heureDebut?: string;
    heureFin?: string;
    couleur?: string;
    motifRejet?: string;
    commentaire?: string;
    validePar?: number;
    valideParNom?: string;
    dateValidation?: string;
    date?: string;
}

export interface PlanningDay {
    date: string;
    nomJour: string;
    affectations: Affectation[];
    demandes: Demande[];
}