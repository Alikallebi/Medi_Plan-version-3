# MediPlan

MediPlan is a medical planning application split into a .NET backend and an Angular frontend. It centralizes organizational structure, workforce planning, validation workflows, personal requests, notifications, and audit/history tracking for medical scheduling.

## Project Overview

The repository contains two main applications:

- `Backend/`: ASP.NET Core Minimal API service that exposes planning, workflow, staff, structure, competencies, roles/permissions, and notification endpoints.
- `Front/`: Angular 14 client that provides the user interface, routing, layout shell, workflow screens, demo pages, and documentation assets.

The backend persists data through a mix of stores and databases:

- MySQL for the main application data.
- SQLite for workflow-related persistence in `workflow.db`.
- Entity Framework Core migrations for the workflow context.

## Folder Structure

- `Backend/` - ASP.NET Core backend project.
- `Backend/Program.cs` - API startup, service registration, endpoint mapping, and workflow helpers.
- `Backend/appsettings.json` - Backend configuration for database, email, and logging.
- `Backend/Competence/` - Competency domain models and storage.
- `Backend/Email/` - Email service abstraction and SMTP implementation.
- `Backend/Metier/` - Job/role domain models and storage.
- `Backend/Migrations/` - Entity Framework Core migrations for the workflow database.
- `Backend/Planning/` - Planning models, validation, workflow integration, export helpers, and request handling.
- `Backend/Poste/` - Position/poste models and storage.
- `Backend/RolesPermissions/` - RBAC models, permissions, users, and import/export helpers.
- `Backend/Staff/` - Staff models, authentication, planning links, history, and affectation logic.
- `Backend/Structure/` - Organizational structure models, database access, seed data, and statistics.
- `Backend/Workflow/` - Workflow database context, workflow store, and workflow-specific migrations.
- `Front/` - Angular application.
- `Front/angular.json` - Angular workspace configuration.
- `Front/package.json` - Frontend scripts and dependencies.
- `Front/src/app/` - Angular application source code.
- `Front/src/app/layout/` - Shell layout, menu, sidebar, topbar, footer, and layout services.
- `Front/src/app/demo/` - Demo pages, generated API models, and supporting services.
- `Front/src/app/features/workflow/` - Workflow feature module, components, guards, services, DTOs, and tests.
- `Front/src/app/planning/` - Planning export component.
- `Front/src/assets/` - Shared images, layout assets, theme styles, and demo static files.
- `Front/src/docs/` - Frontend documentation and technical workflow notes.
- `Front/docs/` - Accessibility and project support documentation.

## Tech Stack

### Backend

- ASP.NET Core Minimal APIs
- C# with .NET 10
- Entity Framework Core
- SQLite for workflow persistence
- MySQL for primary application data
- Serilog for logging
- AutoMapper
- FluentValidation
- MediatR
- Swashbuckle / OpenAPI

### Frontend

- Angular 14
- TypeScript
- RxJS
- PrimeNG / PrimeIcons / PrimeFlex
- SCSS / CSS
- Chart.js
- FullCalendar
- ngx-toastr
- Karma / Jasmine for tests

## Install and Run Locally

### Prerequisites

- .NET 10 SDK
- Node.js and npm
- A MySQL instance reachable by the backend
- Optional: an SMTP account if you want email features to send messages

### Backend

```powershell
cd Backend
dotnet restore
dotnet run
```

If you want to build the full solution:

```powershell
cd c:\Users\User\Desktop\MediPlan
dotnet build CLINISYSY_APP.sln
```

### Frontend

```powershell
cd Front
npm install
npm start
```

Other common frontend commands:

```powershell
npm run build
npm test
npm run test:coverage
npm run lighthouse
```

## Environment Variables

The repository currently uses `appsettings.json` and Angular environment files for local configuration.

Backend settings to configure locally:

- `ConnectionStrings:ClinisysDb` - MySQL connection string.
- `Email:SmtpHost` - SMTP host.
- `Email:SmtpPort` - SMTP port.
- `Email:EnableSsl` - Enable or disable SSL.
- `Email:SenderEmail` - Sender address.
- `Email:SenderName` - Display name.
- `Email:Password` - SMTP credential. This is intentionally left blank in the repo and should be supplied locally.
- `Staff:ApplyStartupDataNormalization` - Startup normalization flag.

Frontend settings:

- `Front/src/environments/environment.ts` - Development API base URL.
- `Front/src/environments/environment.prod.ts` - Production build configuration.

## Available Scripts

### Frontend npm scripts

- `npm start` - Start the Angular dev server.
- `npm run build` - Build the Angular app.
- `npm run watch` - Build in watch mode.
- `npm test` - Run the Angular unit test suite.
- `npm run test:coverage` - Run tests with coverage output.
- `npm run lighthouse` - Run Lighthouse CI.
- `npm run docs:generate` - Emit the current workflow docs message.

### Helper files

- `Front/test-backend-connection.ps1` - PowerShell helper for backend connectivity checks.
- `Front/test-dashboard-api.html` - Browser-based API test helper.

## Architecture Notes

MediPlan is organized around domain-specific stores instead of a traditional controller-heavy backend. `Program.cs` wires the services, configures serialization, seeds workflow tables, and exposes the HTTP endpoints consumed by the frontend.

The frontend is split between the main application shell and a large workflow feature area. The layout module handles navigation and global UI chrome, while the workflow module owns validation flows, audit history, notifications, and permissions-driven access patterns.

Workflow data is split between the MySQL-backed application data and the SQLite-backed workflow context. That split is intentional in the current codebase and is reflected in the backend startup logic and entity migrations.

## Contribution Guidelines

- Keep changes small and behavior-preserving unless the task explicitly requires a broader refactor.
- Avoid committing secrets or environment-specific credentials.
- Prefer existing domain stores and feature modules over introducing duplicate logic.
- Keep comments only when they explain non-obvious intent or complex behavior.
- Update or remove stale documentation when it no longer reflects the codebase.
- Run the relevant backend or frontend validation command after changes.
