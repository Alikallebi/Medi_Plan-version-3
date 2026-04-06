export type PlanningWorkflowStatus =
    | 'BROUILLON'
    | 'EN_ATTENTE_N1'
    | 'EN_ATTENTE_N2'
    | 'VALIDE'
    | 'REJETE';

export interface ValidationStatus {
    /** Statut courant du planning dans le workflow */
    status: PlanningWorkflowStatus;
    /** Index de l'étape courante dans WorkflowConfig.steps */
    currentStepIndex: number;
    /** Date ISO du dernier changement de statut */
    changedAt: string;
    /** Utilisateur ayant déclenché le changement */
    changedBy: string;
}