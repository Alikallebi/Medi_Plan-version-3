export type ValidationAction =
    | 'SOUMISSION'
    | 'APPROBATION'
    | 'REJET'
    | 'RETOUR_CORRECTION'
    | 'REASSIGNATION';

export interface ValidationHistoryItem {
    /** Identifiant unique de l'action de validation */
    id: string;
    /** Planning concerné */
    planningId: string;
    /** Étape de workflow concernée */
    stepId: string;
    /** Type d'action effectuée */
    action: ValidationAction;
    /** Utilisateur auteur de l'action */
    actorUserId: string;
    /** Rôle de l'auteur au moment de l'action */
    actorRole: string;
    /** Commentaire métier (obligatoire côté règle métier pour un rejet) */
    comment?: string;
    /** Date ISO de l'action */
    createdAt: string;
}