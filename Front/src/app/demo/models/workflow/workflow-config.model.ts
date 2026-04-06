import type { WorkflowEtape } from './workflow-etape.model';

export interface WorkflowConfig {
    /** Identifiant unique de configuration */
    id: string;
    /** Service concerné (référence module Structure) */
    serviceId: string;
    /** Version logique de la configuration */
    version: number;
    /** Liste ordonnée des étapes de validation */
    steps: WorkflowEtape[];
    /** Indique si cette configuration est active */
    isActive: boolean;
    /** Force une validation finale par SUPER_ADMIN */
    superAdminFinalRequired: boolean;
    /** Utilisateur créateur */
    createdBy: string;
    /** Dernier utilisateur modificateur */
    updatedBy?: string;
    /** Date ISO de création */
    createdAt: string;
    /** Date ISO de dernière modification */
    updatedAt?: string;
}