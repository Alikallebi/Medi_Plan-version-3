export type AuditEventType =
    | 'WORKFLOW_CONFIG_CREATED'
    | 'WORKFLOW_CONFIG_UPDATED'
    | 'PLANNING_SUBMITTED'
    | 'PLANNING_APPROVED'
    | 'PLANNING_REJECTED'
    | 'VERSION_CREATED'
    | 'NOTIFICATION_SENT';

export interface AuditEvent {
    /** Identifiant unique d'événement d'audit */
    id: string;
    /** Type d'événement */
    eventType: AuditEventType;
    /** Utilisateur à l'origine de l'action */
    actorUserId: string;
    /** Rôle de l'acteur au moment de l'action */
    actorRole?: string;
    /** Planning concerné, si applicable */
    planningId?: string;
    /** Configuration workflow concernée, si applicable */
    workflowConfigId?: string;
    /** Service concerné, si applicable */
    serviceId?: string;
    /** Données complémentaires sérialisables JSON */
    metadata?: Record<string, unknown>;
    /** Date ISO précise de l'événement (UTC recommandé) */
    occurredAt: string;
    /** ID de corrélation (requête/transaction) */
    correlationId?: string;
}