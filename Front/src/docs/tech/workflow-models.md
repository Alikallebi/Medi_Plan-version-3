# Modèles de données Workflow

## Vue d'ensemble
Le module utilise des modèles centrés sur le cycle de vie du planning : configuration, statut, historique, versions, audit.

## Interfaces principales

### WorkflowConfig
Configuration de validation par service.
- `id`, `serviceId`, `version`, `steps`, `isActive`, `superAdminFinalRequired`

### WorkflowEtape
Définition d'une étape de validation.
- `id`, `order`, `label`, `validatorRole`, `isActive`, `isFinalApproval?`

### ValidationStatus
État courant du planning.
- `status`, `currentStepIndex`, `changedAt`, `changedBy`

### PlanningWorkflow
Planning enrichi avec workflow.
- Hérite de `PlanningData`
- `workflowConfigId`, `workflowStatus`, `validationHistory`, `currentVersionId`, `lockVersion`

### WorkflowComment
Commentaire de workflow.
- `id`, `planningId`, `auteurNom`, `auteurRole`, `message`, `createdAt`, `attachments?`

### WorkflowAttachment / WorkflowAttachmentRef
Pièce jointe de workflow.
- `id`, `fileName`, `fileType`, `size`, `uploadedAt`, `uploadedBy`

### AuditTrailEvent
Événement tracé.
- `id`, `date`, `utilisateurId`, `utilisateurNom`, `typeEvenement`, `description`, `details`

## Exemples

```ts
const status: ValidationStatus = {
  status: 'EN_ATTENTE_N1',
  currentStepIndex: 0,
  changedAt: new Date().toISOString(),
  changedBy: 'chef.service'
};
```

```ts
const filter: AuditTrailFilter = {
  utilisateurId: 42,
  typeEvenement: ['PLANNING_APPROBATION'],
  page: 1,
  limit: 20
};
```
