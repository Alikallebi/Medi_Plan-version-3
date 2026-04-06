export type DemandeType = 'HS' | 'RC+' | 'RC-' | 'ABSENCE' | 'ARRET';

export interface DemandeItem {
    id: number;
    userId: number;
    serviceId: number;
    date: string;
    type: string;
    heureDebut: string;
    heureFin: string;
    dureeHeures: number;
    commentaire?: string;
    statut: string;
    motifRejet?: string;
    traitePar?: number;
    traiteLe?: string;
    createdAt: string;
    updatedAt: string;
    sourceAssignmentId?: string;
    validePar?: number;
    valideParNom?: string;
    dateValidation?: string;
}

export interface DemandeCreatePayload {
    serviceId: number;
    date: string;
    type: DemandeType;
    heureDebut: string;
    heureFin: string;
    commentaire?: string;
    sourceAssignmentId?: string;
}

export interface DemandeHistoriqueItem {
    id: number;
    demandeId: number;
    action: string;
    acteurId?: number;
    acteurNom?: string;
    commentaire?: string;
    createdAt: string;
}