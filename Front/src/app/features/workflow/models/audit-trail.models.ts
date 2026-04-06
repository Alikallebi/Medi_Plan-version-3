export type AuditTrailEventType =
    | 'PLANNING_CREATION'
    | 'PLANNING_MODIFICATION'
    | 'PLANNING_SOUMISSION'
    | 'PLANNING_APPROBATION'
    | 'PLANNING_REJET'
    | 'PLANNING_VALIDATION_FINALE'
    | 'DEMANDE_MODIFICATION'
    | 'VERSION_CREATION'
    | 'COMMENTAIRE_AJOUT'
    | 'PIECE_JOINTE_AJOUT'
    | 'PIECE_JOINTE_SUPPRESSION'
    | 'WORKFLOW_CONFIG_CREATION'
    | 'WORKFLOW_CONFIG_MODIFICATION'
    | 'CONNEXION'
    | 'EXPORT'
    | 'AUTRE';

export interface AuditTrailEvent {
    id: number;
    date: string;
    utilisateurId: number;
    utilisateurNom: string;
    utilisateurRole: string;
    typeEvenement: AuditTrailEventType;
    planningId?: number;
    planningNom?: string;
    description: string;
    details: Record<string, unknown>;
    ipAdresse?: string;
    userAgent?: string;
}

export interface AuditTrailFilter {
    dateDebut?: Date;
    dateFin?: Date;
    utilisateurId?: number;
    planningId?: number;
    typeEvenement?: AuditTrailEventType[];
    recherche?: string;
    page?: number;
    limit?: number;
}

export interface AuditTrailResponse {
    events: AuditTrailEvent[];
    total: number;
    page: number;
    totalPages: number;
}

export interface AuditExportRequest {
    format: 'pdf' | 'excel' | 'csv' | 'json';
    scope: 'all' | 'filtered' | 'last-days';
    lastDays?: number;
    includePlanning: boolean;
    includeUser: boolean;
}
