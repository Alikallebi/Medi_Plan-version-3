# API Endpoints Workflow

## Base URL
`/api/workflow`

## Endpoints principaux

| Endpoint | Méthode | Description | Body | Response |
|---|---|---|---|---|
| `/configs` | GET | Liste des configurations | - | `WorkflowConfig[]` |
| `/configs` | POST | Créer une configuration | `CreateWorkflowConfigDTO` | `WorkflowConfig` |
| `/configs/{id}` | PUT | Mettre à jour une configuration | `CreateWorkflowConfigDTO` | `WorkflowConfig` |
| `/configs/{id}` | DELETE | Supprimer une configuration | - | `void` |
| `/plannings/{id}/soumettre` | POST | Soumettre un planning | `{ message }` | `PlanningWorkflow` |
| `/plannings/en-attente` | GET | Plannings à valider | Query `role?` | `PlanningWorkflow[]` |
| `/plannings/{id}/approuver` | POST | Approuver étape | `ApprobationDTO` | `PlanningWorkflow` |
| `/plannings/{id}/rejeter` | POST | Rejeter planning | `RejetDTO` | `PlanningWorkflow` |
| `/plannings/{id}/demander-modification` | POST | Demander des modifs | `DemandeModificationDTO` | `PlanningWorkflow` |
| `/plannings/{id}/comments` | GET | Liste des commentaires | - | `WorkflowComment[]` |
| `/plannings/{id}/comments` | POST | Ajouter commentaire | `AddWorkflowCommentPayload` | `WorkflowComment` |
| `/plannings/{id}/attachments` | GET | Liste des pièces jointes | - | `WorkflowAttachment[]` |
| `/plannings/{id}/attachments` | POST | Upload pièce jointe | `FormData` | `WorkflowAttachment` |
| `/plannings/{id}/attachments/{attachmentId}` | DELETE | Supprimer pièce jointe | - | `void` |
| `/admin/stats` | GET | KPI dashboard admin | - | `DashboardStats` |
| `/admin/blocked` | GET | Plannings bloqués | - | `BlockedPlanning[]` |
| `/admin/validator-performance` | GET | Performance validateurs | - | `ValidatorPerformance[]` |
| `/admin/{id}/relance` | POST | Relancer validateur | `{ message? }` | `void` |
| `/audit` | GET | Audit global filtré | `AuditTrailFilter` (query) | `AuditTrailResponse` |
| `/audit/{id}` | GET | Détail événement audit | - | `AuditTrailEvent` |
| `/audit/export/{format}` | GET | Export audit | Query filtres | `Blob` |

## Gestion d'erreurs
- Erreurs HTTP propagées pour actions critiques (`approuver`, `rejeter`, etc.).
- Fallback mock/local sur certains endpoints non critiques (`dashboard`, `audit`, commentaires, pièces jointes) pour continuité UI.
