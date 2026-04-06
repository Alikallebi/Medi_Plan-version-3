export type NotificationType =
    | 'WORKFLOW_SUBMITTED'
    | 'WORKFLOW_APPROVED'
    | 'WORKFLOW_REJECTED'
    | 'WORKFLOW_REMINDER'
    | 'VERSION_CREATED';

export interface Notification {
    /** Identifiant unique de notification */
    id: string;
    /** Destinataire de la notification */
    userId: string;
    /** Type métier de notification */
    type: NotificationType;
    /** Planning concerné */
    planningId: string;
    /** Message affiché à l'utilisateur */
    message: string;
    /** URL d'action (deep-link écran) */
    actionUrl?: string;
    /** Indique si la notification a été lue */
    isRead: boolean;
    /** Date ISO de création */
    createdAt: string;
    /** Date ISO de lecture */
    readAt?: string;
}