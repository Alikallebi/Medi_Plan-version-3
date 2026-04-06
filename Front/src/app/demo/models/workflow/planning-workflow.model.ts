import type { PlanningData } from '../../api/planning.models';
import type { ValidationHistoryItem } from './validation-history-item.model';
import type { ValidationStatus } from './validation-status.model';

export interface PlanningWorkflow extends Omit<PlanningData, 'workflowStatus'> {
    /** Configuration workflow appliquée au planning */
    workflowConfigId: string;
    /** État courant dans le circuit de validation */
    workflowStatus: ValidationStatus;
    /** Historique complet des actions de validation */
    validationHistory: ValidationHistoryItem[];
    /** Version courante du planning */
    currentVersionId: string;
    /** Compteur de concurrence optimiste */
    lockVersion: number;
}