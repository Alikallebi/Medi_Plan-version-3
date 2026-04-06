export interface AuditFilterDTO {
    planningId?: number;
    utilisateurId?: number;
    typeEvenement?: string;
    dateDebut?: Date;
    dateFin?: Date;
    limit?: number;
    offset?: number;
}