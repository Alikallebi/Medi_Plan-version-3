export interface ApprobationDTO {
    planningId: number;
    commentaire?: string;
    notifierCreateur?: boolean;
    notifierAutresValidateurs?: boolean;
}

export interface RejetDTO {
    planningId: number;
    motif: string;
    commentaire: string;
    dateLimite?: Date;
}

export interface DemandeModificationDTO {
    planningId: number;
    commentaire: string;
    instructions?: string;  // Alias for backend compatibility
}