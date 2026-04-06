# Composants du module Workflow

## ValidationCardComponent
- **Rôle** : carte de synthèse dans l'inbox.
- **Inputs** : `planning`, `showActions`.
- **Outputs** : `voirDetails`, `valider`, `rejeter`, `demanderModification`.
- **Dépendances** : `Router`, modales d'action.

## ValidationDetailComponent
- **Rôle** : vue détaillée de validation.
- **Inputs/Outputs** : pilotée par route (`/workflow/validation/:id`).
- **Dépendances** : `WorkflowService`, `AttachmentService`, `NotificationService`, routeur.
- **Responsabilités** : chargement détail, timeline, actions, commentaires, pièces jointes.

## CommentSectionComponent
- **Rôle** : affichage + saisie de commentaires.
- **Inputs** : `comments`, `attachments`, `isLoading`, `hasError`, `errorMessage`, `isSubmitting`.
- **Outputs** : `retry`, `submitComment`.

## AdminDashboardComponent
- **Rôle** : supervision globale workflow.
- **Dépendances** : `WorkflowService`, `NotificationService`.
- **Sous-composants** : KPI, graphiques, plannings bloqués, performance validateurs.

## AuditTrailComponent
- **Rôle** : historique global des événements.
- **Dépendances** : `WorkflowService`, `NotificationService`.
- **Sous-composants** : filtres, table, export, modal détail.

## Modales d'action
- **ApprobationModalComponent** : commentaire + options notification.
- **RejetModalComponent** : motif, commentaire, date limite.
- **DemandeModificationModalComponent** : instructions, priorité, notification.

## Exemple d'utilisation (Validation Card)

```html
<app-validation-card
  [planning]="planning"
  (voirDetails)="open($event)"
  (valider)="approve($event)"
></app-validation-card>
```
