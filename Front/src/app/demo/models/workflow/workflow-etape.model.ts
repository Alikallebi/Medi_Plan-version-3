export type WorkflowRole =
    | 'SUPER_ADMIN'
    | 'ADMIN_GTA'
    | 'CHEF_SERVICE'
    | 'CHEF_POLE'
    | 'VALIDATEUR_RH'
    | 'PLANIFICATEUR_RH'
    | 'PLANIFICATEUR_URGENCE'
    | 'SUPERVISEUR_INTERNES'
    | 'STAFF';

export interface WorkflowEtape {
    /** Identifiant unique de l'étape */
    id: string;
    /** Position de l'étape dans le circuit (ordre strictement croissant) */
    order: number;
    /** Libellé affiché dans l'interface */
    label: string;
    /** Rôle autorisé à valider cette étape */
    validatorRole: WorkflowRole;
    /** Utilisateur spécifique si l'étape est nominative (prioritaire sur le rôle) */
    validatorUserId?: string;
    /** Délai maximal en heures avant relance/escalade */
    maxDelayHours?: number;
    /** Indique l'étape de validation finale obligatoire */
    isFinalApproval?: boolean;
    /** Activation/désactivation de l'étape sans suppression historique */
    isActive: boolean;
}