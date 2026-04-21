# MediPlan - Comprehensive Repository Export

## 1) Global Overview

### Purpose
MediPlan is a full-stack planning and workflow management platform for healthcare organizations. It supports:
- Organizational structure management (poles, services, teams)
- Staff directory and assignments
- Planning creation, validation, versioning, and export
- Workflow validation pipelines (N1/N2/final)
- Role-based permissions and access control
- User personal planning requests and approvals
- Notifications and audit trails

### High-Level Architecture
- Backend: ASP.NET Core Minimal API (.NET 10), mostly custom store classes, mixed MySQL + SQLite persistence.
- Frontend: Angular 14 SPA, feature modules, guards, RBAC integration.
- Datastores:
  - MySQL (core business entities and most operational data)
  - SQLite (`workflow.db`) for workflow config context via EF Core (`WorkflowDbContext`)

### Runtime Communication
- Frontend consumes backend via `environment.apiBaseUrl` (dev: `http://localhost:5239`)
- API base pattern: `/api/*`
- Auth token + identity context stored client-side in localStorage

---

## 2) Full Repository Structure (Annotated)

## Root
- `CLINISYSY_APP.sln`: solution file including backend project.
- `Backend/`: ASP.NET Core API and business logic.
- `Front/`: Angular UI application.
- `.gitignore`, `.hintrc`: repo/tooling metadata.

## Backend (key areas)
- `Backend/Program.cs`: central bootstrap + full endpoint mapping.
- `Backend/appsettings.json`: runtime configuration (DB/email/logging).
- `Backend/Backend.csproj`: .NET target + NuGet dependencies.
- `Backend/workflow.db`: SQLite DB file used by workflow EF context.

### Backend bounded contexts
- `Backend/Structure/`
  - `Models.cs`
  - `StructureStore.cs`
  - partials: `.Database`, `.Helpers`, `.Arbre`, `.Seed`, `.Statistiques`
- `Backend/Staff/`
  - `Models.cs`
  - `StaffStore.cs`
  - partials: `.Auth`, `.Planning`, `.Affectations`, `.History`, `.Helpers`
- `Backend/Planning/`
  - `Models.cs`
  - `PlanningStore.cs`
  - partials: `.Database`, `.Helpers`, `.Validation`, `.Versions`, `.Workflow`, `.WorkflowConfig`, `.WorkflowExecution`, `.PersonalRequests`, `.Exports`
  - export templates: `PlanningExportTemplate.html`, `PlanningExportTemplate.css`
- `Backend/Workflow/`
  - `Models.cs`
  - `WorkflowStore.cs`
  - `WorkflowDbContext.cs`
  - `Migrations/` (workflow notification migration)
- `Backend/RolesPermissions/`
  - `Models.cs`
  - `RolesPermissionsStore.cs`
  - partials: `.Permissions`, `.Users`, `.History`, `.ImportExport`, `.Helpers`
- `Backend/Poste/`
  - `Models.cs`, `PosteStore.cs` + partials
- `Backend/Competence/`
  - `Models.cs`, `CompetenceStore.cs`
- `Backend/Metier/`
  - `MetierStore.cs` (contains model + data access)
- `Backend/Email/`
  - `EmailService.cs`

### Backend generated/build artifacts
- `Backend/bin/`, `Backend/obj/`: compiled outputs (non-source)
- `Backend/Migrations/`: EF migration artifacts for workflow config schema evolution

## Frontend (key areas)
- `Front/angular.json`, `tsconfig*.json`, `karma.conf.js`: Angular build/test config.
- `Front/package.json`, `package-lock.json`: npm dependencies and scripts.
- `Front/src/main.ts`, `app.module.ts`, `app-routing.module.ts`: app entry + root routing.
- `Front/src/environments/environment.ts`: API base URL + environment flags.

### Frontend app modules
- `Front/src/app/demo/components/auth/*`: login/register/reset-password.
- `Front/src/app/demo/components/pages/*`: business pages (planning, users, poles, services, etc.).
- `Front/src/app/features/workflow/*`: advanced workflow module (inbox, validation detail, audit, admin dashboard, config, attachments, notifications).
- `Front/src/app/demo/service/*`: API/data services for most entities.
- `Front/src/app/guards/*` and `auth.guard.ts`: route protection and RBAC checks.

### Frontend documentation/testing assets
- `Front/src/docs/*`: technical + user documentation.
- `Front/src/app/features/workflow/__tests__/*`: workflow integration/unit tests.
- `.lighthouseci/*`, `build_output.txt`, `test-backend-connection.ps1`, `test-dashboard-api.html`: QA/verification artifacts.

### Frontend generated/static assets
- `Front/src/assets/*`: static JSON/images/theme packs/fonts.

---

## 3) Backend Full Technical Map

## Startup and Bootstrapping (`Backend/Program.cs`)
- Configures JSON serialization:
  - camelCase output
  - case-insensitive matching
  - enum-as-string converter
- Configures CORS policy `FrontDev` for:
  - `http://localhost:4200`
  - `https://localhost:4200`
- Registers stores/services:
  - Singleton: `StaffStore`, `StructureStore`, `RolesPermissionsStore`, `PlanningStore`, `PosteStore`, `CompetenceStore`, `MetierStore`, `IEmailService`
  - Scoped: `WorkflowStore`
- Registers EF Core context:
  - `WorkflowDbContext` with SQLite `Data Source=workflow.db`
- Startup initialization:
  - `EnsureCreated` for SQLite workflow tables
  - raw SQL table checks/creation (`WorkflowConfigs`, `WorkflowConfigEtapes`)
  - online migration adding `Label` column if missing
  - executes initialization for all stores and workflow backfill tasks

## Domain Module Mapping

### Structure module
- Files: `StructureStore.cs` + partials, `Structure/Models.cs`
- Responsibilities:
  - CRUD for poles/services/equipes
  - org tree building
  - statistics computation

### Roles & Permissions module
- Files: `RolesPermissionsStore.cs` + partials, `RolesPermissions/Models.cs`
- Responsibilities:
  - role lifecycle (create/update/duplicate/delete)
  - per-role permissions matrix
  - users in roles
  - role history
  - import/export operations

### Staff module
- Files: `StaffStore.cs` + partials, `Staff/Models.cs`
- Responsibilities:
  - staff CRUD
  - auth/login/reset password support
  - user context endpoints
  - affectations/history/planning views

### Planning module
- Files: `PlanningStore.cs` + partials, `Planning/Models.cs`
- Responsibilities:
  - planning retrieval and persistence
  - assignment operations
  - planning validation and submission
  - planning versions
  - personal planning requests and lifecycle
  - export generation
  - workflow execution integration

### Workflow module
- Files: `WorkflowStore.cs`, `WorkflowDbContext.cs`, `Workflow/Models.cs`
- Responsibilities:
  - workflow state transitions (submit/approve/reject/request-change)
  - workflow comments/attachments
  - dashboard and audit endpoints
  - notification handling
  - workflow configuration entities

### Supporting modules
- `Poste`: post/shift definitions and constraints.
- `Competence`: competencies and available-user selection by role/skill.
- `Metier`: job taxonomy seeded in MySQL.
- `Email`: SMTP notifications.

---

## 4) Frontend Full Technical Map

## Root App Flow
- `app-routing.module.ts`
  - default redirect to `auth/login`
  - lazy loads:
    - `auth`
    - shell routes (`dashboard`, `uikit`, `utilities`, `blocks`, `pages`, `workflow`)
  - wildcard redirect to login

## Guards & Access Control
- `auth.guard.ts`: grants route access if token + user id exist in localStorage.
- `guards/permission.guard.ts`: checks route `data.rbacPermission` + minimum level via `RbacService`.
- `features/workflow/guards/perimeter.guard.ts`: validates planning-level perimeter via backend access check.

## Key Feature Areas

### Auth area (`demo/components/auth/*`)
- Login/register/reset-password/access-denied/message flows.

### Business pages (`demo/components/pages/*`)
- Users, user detail, account/profile, personal space, pending requests
- Services, poles, postes, planning, competencies, rules
- Notifications, history, role-permission management

### Workflow feature (`features/workflow/*`)
- Main routes:
  - `validation-inbox`
  - `validation/:id`
  - `admin-dashboard`
  - `audit-trail`
  - `workflow-config`
  - `mes-soumissions`
- Contains:
  - reusable workflow components (cards, timelines, comments, toasts, KPI charts)
  - modals (approval/rejection/modification/confirmation)
  - services (`workflow.service.ts`, `attachment.service.ts`, `notification.service.ts`)
  - DTO/model layer and dedicated tests

## Service Layer (frontend)
- Main API services under `demo/service/*`:
  - `auth.service.ts`
  - `rbac.service.ts`
  - `staff.service.ts`
  - `planning.service.ts`
  - `service-management.service.ts`
  - `poste.service.ts`, `pole.service.ts`, `competence.service.ts`
  - `roles-permissions-api.service.ts`
- Workflow API integration under `features/workflow/services/*` with API root:
  - `${environment.apiBaseUrl}/api/workflow`

---

## 5) Models and Data Contracts

## Backend Core Model Families

### Structure
- Enums: `EntityStatus`, `UserRole`, `EquipeType`, `EntityType`
- Entities: `Pole`, `ServiceMedical`, `Equipe`, `Utilisateur`, `Effectif`, `Statistiques`, `NoeudArborescence`

### Staff/Auth
- `StaffUser`, `LoginRequest`, `LoginResponse`, `UserAffectationRequest`, `StaffAffectationInput`, `UpdateStaffPhotoRequest`

### Planning
- `PlanningData`, `PlanningAssignment`, `PersonnelInfo`, `PlanningRule`, `PlanningConflict`
- version/history: `PlanningVersion`, `PlanningHistoryEntry`, `PlanningOverviewRow`
- requests: `CreateUserPlanningRequestDto`, `UserPlanningRequestActionDto`, `Demande* DTOs`, `UserPlanningRequestItem`, `DemandeHistoriqueItem`

### Roles/Permissions
- `RoleDto`, `PermissionCategory`, `PermissionDefinition`, `RoleUserDto`, `RoleHistoryDto`
- request DTOs: `CreateRoleRequest`, `UpdateRoleRequest`, `SetPermissionLevelRequest`, `SetAllPermissionsRequest`

### Workflow
- Enums: `WorkflowStatut`, `ActionType`, `NotificationType`
- entities/DTOs: `PlanningWorkflow`, `ValidationStatus`, `ValidationHistoryItem`, `WorkflowEtape`, `WorkflowComment`, `WorkflowAttachment`, `DashboardStats`, `AuditTrailEvent`, `WorkflowNotification`
- config types: `WorkflowConfigItem`, `WorkflowConfigEtapeItem`, `CreateWorkflowConfigDTO`, `WorkflowConfigDb`, `WorkflowConfigEtapeDb`

## Frontend Model Families
- `demo/api/*`: base domain interfaces (users, services, poles, rules, planning models)
- `demo/models/*`: user planning and request models
- `demo/models/workflow/*`: workflow state, versions, audit, notifications, config models
- `features/workflow/dtos/*` + `features/workflow/models/*`: module-specific request/response contracts

---

## 6) API Contract (Backend Endpoints)

Source of truth: all endpoints are mapped in `Backend/Program.cs` as Minimal API routes.

## Organization / Structure
- GET `/api/structure/poles`
- POST `/api/structure/poles`
- DELETE `/api/structure/poles/{id:int}`
- GET `/api/services`
- GET `/api/structure/services`
- GET `/api/structure/services/{id:int}`
- POST `/api/structure/services`
- PUT `/api/structure/services/{id:int}`
- DELETE `/api/structure/services/{id:int}`
- GET `/api/structure/equipes`
- POST `/api/structure/equipes`
- PUT `/api/structure/equipes/{id:int}`
- DELETE `/api/structure/equipes/{id:int}`
- GET `/api/structure/utilisateurs`
- GET `/api/structure/statistiques`
- GET `/api/structure/tree`

## Roles & Permissions
- GET `/api/roles-permissions/roles`
- GET `/api/roles-permissions/roles/{roleId}`
- POST `/api/roles-permissions/roles`
- PUT `/api/roles-permissions/roles/{roleId}`
- POST `/api/roles-permissions/roles/{roleId}/duplicate`
- DELETE `/api/roles-permissions/roles/{roleId}`
- GET `/api/roles-permissions/roles/{roleId}/users`
- GET `/api/roles-permissions/roles/{roleId}/history`
- DELETE `/api/roles-permissions/roles/{roleId}/users/{userId}`
- GET `/api/roles-permissions/permission-categories`
- GET `/api/roles-permissions/user/{userId:int}/permissions`
- PUT `/api/roles-permissions/roles/{roleId}/permissions/{permissionId}`
- PUT `/api/roles-permissions/roles/{roleId}/permissions`
- GET `/api/roles-permissions/export`

## Metier
- GET `/api/metiers`
- GET `/api/metiers/{id:int}`
- POST `/api/metiers`
- PUT `/api/metiers/{id:int}`
- DELETE `/api/metiers/{id:int}`

## Poste
- GET `/api/postes`
- GET `/api/postes/{id:int}`
- POST `/api/postes`
- PUT `/api/postes/{id:int}`
- DELETE `/api/postes/{id:int}`

## User context / Staff
- GET `/api/users/{userId:int}/context`
- GET `/api/staff`
- GET `/api/staff/{id:int}`
- POST `/api/staff`
- PUT `/api/staff/{id:int}`
- PUT `/api/staff/{id:int}/photo`
- DELETE `/api/staff/{id:int}`
- DELETE `/api/staff/purge/backend-created`
- DELETE `/api/staff/purge/all`
- GET `/api/staff/{id:int}/planning`
- GET `/api/staff/{id:int}/history`
- GET `/api/staff/{id:int}/affectations`
- GET `/api/staff/{id:int}/roles`
- POST `/api/staff/{id:int}/affectations`
- DELETE `/api/staff/{id:int}/affectations/{affectationId:int}`

## Competence
- GET `/api/competences`
- GET `/api/competences/domaines`
- POST `/api/competences`
- PUT `/api/competences/{id:int}`
- DELETE `/api/competences/{id:int}`
- GET `/api/planning/utilisateurs-disponibles`

## Planning core
- GET `/api/planning`
- POST `/api/planning/assignments`
- DELETE `/api/planning/assignments/{assignmentId}`
- PUT `/api/planning/assignments`
- POST `/api/planning/validate`
- GET `/api/planning/export`
- GET `/api/planning/overview`
- POST `/api/planning/versions`
- GET `/api/planning/versions`
- POST `/api/planning/submit`

## Personal planning requests / Demandes
- GET `/api/mon-planning/compteurs`
- GET `/api/compteurs/{userId:int}`
- GET `/api/mon-planning/demandes`
- POST `/api/mon-planning/demandes`
- POST `/api/demandes`
- GET `/api/mon-planning/demandes/en-attente`
- GET `/api/demandes/mes-demandes`
- GET `/api/demandes/a-valider`
- GET `/api/demandes/{id:int}/historique`
- POST `/api/mon-planning/demandes/{id:int}/approuver`
- PUT `/api/demandes/{id:int}/valider`
- POST `/api/mon-planning/demandes/{id:int}/rejeter`
- PUT `/api/demandes/{id:int}/rejeter`

## Auth
- POST `/api/auth/login`
- POST `/api/auth/register`
- POST `/api/auth/reset-password`

## Workflow
- GET `/api/workflow/plannings`
- GET `/api/workflow/plannings/{id:int}`
- GET `/api/workflow/plannings/{id:int}/status`
- POST `/api/workflow/plannings/{id:int}/approuver`
- POST `/api/workflow/plannings/{id:int}/rejeter`
- POST `/api/workflow/plannings/{id:int}/demander-modification`
- POST `/api/workflow/plannings/{id:int}/soumettre`
- GET `/api/workflow/plannings/mes-soumissions`
- GET `/api/workflow/plannings/en-attente`
- GET `/api/workflow/plannings/{id:int}/historique`
- GET `/api/workflow/dashboard`
- GET `/api/workflow/plannings/validated`
- GET `/api/workflow/history`
- GET `/api/workflow/comments/{planningId:int}`
- POST `/api/workflow/comments/{planningId:int}`
- GET `/api/workflow/etapes`
- GET `/api/workflow/plannings/{id:int}/comments`
- POST `/api/workflow/plannings/{id:int}/comments`
- GET `/api/workflow/plannings/{id:int}/attachments`
- POST `/api/workflow/plannings/{id:int}/attachments`
- DELETE `/api/workflow/plannings/{id:int}/attachments/{attachmentId}`
- GET `/api/workflow/plannings/{id:int}/diagnostic`
- GET `/api/workflow/debug/find-by-role`
- GET `/api/workflow/notifications`
- GET `/api/workflow/notifications/unread-count`
- POST `/api/workflow/notifications/{notificationId:int}/read`
- POST `/api/workflow/notifications/read-all`
- POST `/api/workflow/plannings/submit`

## Generic notifications + workflow config
- GET `/api/notifications`
- GET `/api/notifications/count`
- POST `/api/notifications/{id:int}/lire`
- POST `/api/notifications/lire-tout`
- GET `/api/workflow/configs`
- GET `/api/workflow/configs/service/{serviceId:int}`
- POST `/api/workflow/configs`
- PUT `/api/workflow/configs/{id:int}`
- DELETE `/api/workflow/configs/{id:int}`
- POST `/api/workflow/configs/{id:int}/activate`

---

## 7) Authentication, Authorization, and Security Behavior

## Authentication
- Login API: POST `/api/auth/login`.
- Frontend stores in localStorage:
  - `token`
  - `idUser`
  - `role`
  - perimeter ids (`serviceId`, `poleId`, `equipeId`)
- Auth state check (`AuthGuard`) is synchronous and based on token + user id presence.

## User Context Resolution
- `AuthService` tries:
  1. `/api/users/{id}/context`
  2. fallback `/api/staff/{id}`
  3. localStorage minimal context fallback

## Authorization (RBAC)
- `PermissionGuard` reads route metadata:
  - `rbacPermission`
  - `rbacMinLevel` (`none|read|write|validate|admin`)
- `RbacService` loads dynamic permissions from:
  - GET `/api/roles-permissions/user/{id}/permissions`
- If backend returns empty permissions, service applies role-based fallback matrices.
- `super-admin` bypasses checks at guard/service level.

## Perimeter Security
- Workflow detail route uses `PerimeterGuard` to call backend planning access check.
- Access decisions combine role and planning scope.

## Security notes
- No visible JWT middleware enforcement in `Program.cs` (auth appears app-level/convention-based).
- CORS limited to localhost dev origins.
- Sensitive values should remain environment-specific and never committed.

---

## 8) Configuration and Environment Variables

## Backend (`Backend/appsettings.json`)
- `ConnectionStrings.ClinisysDb`: MySQL connection string.
- `Email`:
  - `SmtpHost`
  - `SmtpPort`
  - `EnableSsl`
  - `SenderEmail`
  - `SenderName`
  - `Password`
- `Staff.ApplyStartupDataNormalization`
- `Logging.LogLevel`
- `AllowedHosts`

## Frontend (`Front/src/environments/environment.ts`)
- `production: false`
- `apiBaseUrl: 'http://localhost:5239'`

## Effective integration constraints
- Angular dev app should run on `localhost:4200` to match backend CORS policy.
- Backend endpoint host/port must match frontend `apiBaseUrl`.

---

## 9) Dependencies and Libraries

## Backend NuGet (`Backend/Backend.csproj`)
- AutoMapper, AutoMapper.Extensions.Microsoft.DependencyInjection
- FluentValidation, FluentValidation.AspNetCore
- MediatR, MediatR.Extensions.Microsoft.DependencyInjection
- Microsoft.AspNetCore.Authentication.JwtBearer
- Microsoft.AspNetCore.Identity.EntityFrameworkCore
- Microsoft.AspNetCore.OpenApi
- Microsoft.EntityFrameworkCore (+ Design, Sqlite, SqlServer)
- MySqlConnector
- Serilog.AspNetCore, Serilog.Sinks.Console
- Swashbuckle.AspNetCore

## Frontend npm (`Front/package.json`)
- Angular 14 core packages
- PrimeNG, PrimeFlex, PrimeIcons
- FullCalendar (angular/core/daygrid/interaction)
- ngx-toastr
- Chart.js
- RxJS, Zone.js
- Tooling: Angular CLI/devkit/compiler-cli, Karma/Jasmine, TypeScript

---

## 10) Scripts, Build, and Operational Commands

## Frontend scripts (`Front/package.json`)
- `npm run start`: Angular dev server
- `npm run build`: production build
- `npm run watch`: dev watch build
- `npm run test`: unit tests
- `npm run test:coverage`: tests with coverage
- `npm run lighthouse`: Lighthouse CI run
- `npm run docs:generate`: docs availability message

## Backend common commands (inferred from project type)
- `dotnet restore`
- `dotnet build Backend/Backend.csproj`
- `dotnet run --project Backend/Backend.csproj`

## Full-stack local run order
1. Start backend first (API available on configured port).
2. Start frontend on port 4200.
3. Verify auth + protected route flow.

---

## 11) Known Issues, Gaps, and Technical Debt

## Confirmed TODOs / code notes
- `Front/src/app/demo/service/permissions.service.ts`
  - TODO indicates integration with real auth service still pending.
- `Front/src/app/features/workflow/components/validation-detail/validation-detail.component.ts`
  - TODO indicates model property gaps (`poleId`, `serviceType`, `type`).

## Architectural debt
- Mixed persistence strategy:
  - SQLite for workflow config context
  - MySQL for core business data
  - increases migration/consistency complexity.

## Security hardening opportunities
- Auth appears primarily client/state-driven without clearly visible server-side route authorization middleware in `Program.cs`.
- localStorage token strategy can be improved with stronger token lifecycle and server-side policy enforcement.

## API surface / coupling risk
- Very large `Program.cs` route map with broad inline orchestration.
- `PlanningStore` and related modules carry many responsibilities (planning + workflow + requests + exports).

## Frontend consistency risk
- Some workflow service routes appear to target endpoints not visibly mapped in backend route list (possible legacy or pending backend implementation).

---

## 12) Executive Summary for New Developers

MediPlan is a modular healthcare planning platform with a rich Angular frontend and a Minimal API backend centered around store classes. The core business domains are structure, staff, planning, workflow, and RBAC. The frontend is route-guarded and permission-aware, and relies heavily on backend APIs under `/api/*`.

The fastest onboarding path is:
1. Read backend startup + routes (`Program.cs`) to understand runtime and API contract.
2. Read frontend root routing + guards to understand access flow.
3. Follow domain stores/services pairwise (e.g., `PlanningStore` + `planning.service.ts`, `RolesPermissionsStore` + `rbac.service.ts`).
4. Validate environment alignment (`apiBaseUrl`, CORS origins, DB/email settings).

This repository already includes substantial workflow and RBAC functionality, but also contains technical debt around central route orchestration, mixed storage backends, and a few known TODOs that should be prioritized for reliability and long-term maintainability.
