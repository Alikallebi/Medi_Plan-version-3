# Architecture du module Workflow

## Structure des dossiers

```text
workflow/
├── components/         # Composants UI (inbox, détail, admin, audit, modales)
├── services/           # Services Angular (workflow, attachments, notifications)
├── models/             # Interfaces TypeScript (workflow, dashboard, audit)
├── dtos/               # Data Transfer Objects (soumission, validation, audit)
├── guards/             # Contrôles d'accès (RoleGuard)
└── __tests__/          # Tests unitaires et d'intégration
```

## Dépendances
- Angular 14
- RxJS
- Chart.js (dashboard)
- Jasmine + Karma (tests)

## Flux de données
1. Les composants appellent `WorkflowService`.
2. `WorkflowService` consomme les endpoints `/api/workflow/*`.
3. En cas d'indisponibilité de certains endpoints, fallback mock/local (dashboard, audit, commentaires, pièces jointes).
4. Les états UI (`loading`, `error`, pagination) sont pilotés dans les composants de feature.

## Diagramme (simplifié)

```text
ValidationInbox / ValidationDetail / AdminDashboard / AuditTrail
             │
             ▼
        WorkflowService
      /      |       \
 API Workflow  Mock fallback  LocalStorage fallback
```

## Sécurité et accès
- `AuthGuard` protège l'application.
- `RoleGuard` protège les routes admin workflow (`super-admin`, `admin-gta`).

## Observabilité
- Notifications utilisateur via `NotificationService`.
- Audit des actions via les endpoints d'audit et l'écran global d'historique.
