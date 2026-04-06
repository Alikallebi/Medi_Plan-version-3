export interface WorkflowConfigEtapeDTO {
    ordre: number;
    label: string;
    roleValidateur: string;
    validateurSpecifiqueId?: number;
    delaiMaxHeures?: number;
}

export interface CreateWorkflowConfigDTO {
    serviceId: number;
    serviceName: string;
    etapes: WorkflowConfigEtapeDTO[];
}

export interface UpdateWorkflowConfigDTO extends Partial<CreateWorkflowConfigDTO> {
    id: number;
}