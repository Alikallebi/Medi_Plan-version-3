# CHAPITRE 3 : SPRINT 1 — Fondations sécurisées et organisation

Introduction

Ce chapitre présente le Sprint 1 du projet MediPlan : mise en place des fondations de sécurité (authentification et contrôle d'accès par rôles - RBAC), modélisation de la structure organisationnelle (pôles, services, équipes) et du référentiel du personnel. Il couvre le backlog priorisé (Epic A + Epic B), l'analyse fonctionnelle (cas d'utilisation), la conception (diagrammes de classes et séquences) et la réalisation technique (plan d'implémentation et extraits de code issus du dépôt).

3.1. Le backlog du sprint 1

- Epic A — Gestion des utilisateurs & accès (priorité haute)
  - US-A1 : Authentification des utilisateurs (login/logout) — API et interface.
  - US-A2 : Création des comptes (par Super Admin) et gestion des mots de passe par défaut (assignment initial, force change).
  - US-A3 : Gestion des sessions / tokens (émission et validation).
  - US-A4 : Mise en place du modèle RBAC : création/édition de rôles et permissions.
  - US-A5 : Attribution de rôles aux utilisateurs et consultation des permissions.

- Epic B — Structure organisationnelle & référentiel du personnel (priorité haute)
  - US-B1 : Modéliser et exposer les entités `Pole`, `ServiceMedical`, `Equipe`.
  - US-B2 : CRUD du référentiel `StaffUser` (création, mise à jour, suppression, recherche).
  - US-B3 : Gestion des affectations (affecter un `StaffUser` à un `Service`/`Equipe`).
  - US-B4 : Synchronisation des compétences et référentiels métiers.
  - US-B5 : Endpoints d'export / import minimal pour population initiale.

Priorisation : commencer par US-A1 / US-B1 / US-B2 puis US-A4 / US-A5 et US-B3.

3.2. Analyse

3.2.1. Diagramme de cas d’utilisation

Les acteurs principaux : Administrateur, Manager (chef de service/équipe) et Personnel (utilisateur final).

- Cas d'utilisation principaux :
  - Authentifier (Login)
  - Gérer le compte (Profile, Reset Password)
  - Gérer les utilisateurs (CRUD staff)
  - Gérer les rôles et permissions (RBAC)
  - Affecter utilisateur → service/équipe
  - Consulter annuaire / rechercher personnel

Remarque : insérer ici le diagramme de cas d'utilisation (image fournie par le client).

3.2.2. Description des cas d’utilisation (sélection)

- Authentifier (Login)
  - Acteur principal : Personnel
  - Préconditions : l'utilisateur existe et est actif dans la base.
  - Déclencheur : soumission d'un `LoginRequest` (email + mot de passe).
  - Scénario principal : vérifier le hash du mot de passe, émettre un token de session, retourner métadonnées (id, rôle, service/pôle/équipe).
  - Postconditions : utilisateur authentifié, token créé côté serveur.
  - Échecs possibles : utilisateur inexistant, mot de passe invalide, compte inactif.

- Création de compte & mots de passe par défaut
  - Contexte : les comptes sont créés principalement par un rôle administratif central (Super Admin) qui provisionne les utilisateurs.
  - Flux : le Super Admin crée le compte (via l'API admin ou interface) ; le serveur peut attribuer un mot de passe par défaut (ex. `Admin@123`) ou recevoir un mot de passe initial fourni lors de la création. L'utilisateur reçoit alors ses identifiants et se connecte.
  - Post-login : si le flag `ForceChangePassword` est activé, l'utilisateur est obligé de modifier son mot de passe lors de la première connexion.
  - Réinitialisation : l'utilisateur peut demander une réinitialisation (self-service) ou l'administrateur peut forcer une réinitialisation. Le backend expose `RegisterAsync` (création via API) et `ResetPasswordAsync` (réinitialisation) ; la méthode `EnsureDefaultPasswordsAsync` garantit un hash correct et backfill des comptes sans mot de passe.
  - Sécurité : prévoir distribution sécurisée des mots de passe initiaux, forcer changement à la première connexion et privilégier l'envoi d'un lien de réinitialisation plutôt qu'un mot de passe en clair.

- Gérer les rôles (création / modification)
  - Acteur principal : Administrateur
  - But : créer `Role` avec ensemble de permissions et niveau.
  - Contraintes : historique des modifications (audit), rôle parent possible.

- Affectation à un service/équipe
  - Acteur : Manager ou Administrateur
  - But : attacher un utilisateur à une unité organisationnelle avec rôle et période.
  - Règles : une affectation principale, possibilité d'affectations secondaires avec taux.

3.3. Conception

3.3.1. Diagrammes de classes

Trois diagrammes de classes sont fournis et représentent :

- Diagramme général (référentiel, staff, compétences, RBAC) — voir l'image `Rapport/images/diag_classes_general.png`.
- Diagramme de classes Sprint 1 (structure organisationnelle, staff et RBAC) — voir `Rapport/images/diag_classes_sprint1.png`.
- Diagramme Sprint 2 (fonctionnalités à venir) — voir `Rapport/images/diag_classes_sprint2.png`.

Principales classes et mapping vers le code

- `StaffUser` : référentiel du personnel — attributs clefs : `Id, Nom, Prenom, Email, Role, ServiceId, EquipeId, PoleId, Password, Actif, Competences, Photo`.
  - Code : [Backend/Staff/Models.cs](Backend/Staff/Models.cs#L1-L120)

- `RoleDto` / `PermissionDefinition` : modèle RBAC coté API
  - Code : [Backend/RolesPermissions/Models.cs](Backend/RolesPermissions/Models.cs#L1-L200)

- `Pole`, `ServiceMedical`, `Equipe` : entités organisationnelles (voir diagrammes et la table SQL créée par `StaffStore`).

3.3.2. Diagramme états-transition (optionnel)

Exemple : état d'un compte `StaffUser` : `Créé -> Actif -> Suspendu -> Désactivé` ; actions : `Activate/Deactivate/Expire/ForcePasswordChange`.

3.3.3. Diagrammes de séquence (extraits discutés)

- Sequence : Login (simplifié)
  1. Client envoie `POST /api/login` avec `LoginRequest`.
  2. `StaffStore.LoginAsync` recherche l'utilisateur (email) et récupère le hash.
  3. Vérification du mot de passe via `PasswordHasher.VerifyHashedPassword`.
  4. Si OK, génération d'un token (ici GUID) et retour d'un `LoginResponse`.
  5. Client stocke token et l'utilise dans les prochaines requêtes.

  - Extrait d'implémentation : `LoginAsync` — [Backend/Staff/StaffStore.Auth.cs](Backend/Staff/StaffStore.Auth.cs#L1-L140)

- Sequence : Attribuer un rôle à un utilisateur
  1. Admin envoie requête `PUT /api/staff/{id}/role` avec `roleId`.
  2. Backend valide l'existence du rôle et les permissions de l'admin.
  3. Mise à jour de la colonne `role` de `staff_users` et enregistrement audit.

3.4. Réalisation

Approche technique

- Langage & stack : Backend en C# (.NET 8+), base MySQL, frontend Angular/Flutter selon contexte.
- Authentification : mécanisme actuel basé sur hash de mot de passe (ASP.NET `PasswordHasher<T>`). Le backend génère un token aléatoire (GUID) au login — c'est un mécanisme simple de session.
- RBAC : modèle de rôles/permissions exposé via DTOs et tables `rbac_roles`, `rbac_permissions` (implémentations observées dans `RolesPermissions/*` et utilitaires `tools/RoleCleanup`).

Points d'implémentation et extraits pertinents

- Modèle `StaffUser` : structure des données et DTOs — voir [Backend/Staff/Models.cs](Backend/Staff/Models.cs#L1-L120)

- Login et vérification de mot de passe : implémentation (extrait)

```csharp
// Backend/Staff/StaffStore.Auth.cs (extrait)
var verification = _passwordHasher.VerifyHashedPassword(
    new StaffUser { Id = reader.GetInt32("id"), Email = reader.GetString("email") },
    savedPassword,
    request.Password);

if (verification == PasswordVerificationResult.Failed) return null;

return new LoginResponse { Id = reader.GetInt32("id"), Email = reader.GetString("email"), Token = Guid.NewGuid().ToString("N"), Role = reader.GetString("role") };
```

- Modèles RBAC : permissions & rôles — voir [Backend/RolesPermissions/Models.cs](Backend/RolesPermissions/Models.cs#L1-L200)

Plan d'implémentation détaillé (actions concrètes pour le sprint)

1. API Auth
  - Endpoint `POST /api/auth/login` → utiliser `StaffStore.LoginAsync`.
  - Endpoint `POST /api/auth/register` (ou interface admin) → création de comptes par Super Admin via `StaffStore.RegisterAsync`.
  - Endpoint `POST /api/auth/reset-password` → `StaffStore.ResetPasswordAsync` (self-service et admin-initiated).
  - Gestion des mots de passe par défaut/backfill : `EnsureDefaultPasswordsAsync` assure des mots de passe hachés et applique un mot de passe par défaut si nécessaire.
  - Stockage sécurisé des mots de passe via `PasswordHasher` (déjà en place) et option `ForceChangePassword` pour forcer la mise à jour au premier login.

2. RBAC
   - Endpoints CRUD pour rôles et permissions (modèles en `RolesPermissions`).
   - Middleware ou filtre pour vérifier permissions avant accès aux routes sensibles.
   - Table d'audit (history) pour modifications des rôles.

3. Référentiel organisationnel
   - Endpoints CRUD `Pole`, `ServiceMedical`, `Equipe`.
   - Endpoints d'affectation : `POST /api/staff/{id}/affectations`.

4. Données & migration
   - Fournir scripts d'import pour population initiale (CSV/JSON).
   - Nettoyage des rôles existants via `tools/RoleCleanup/Program.cs`.

Sécurité et recommandations

- Token management : remplacer à terme le GUID par JWT signé ou store de sessions avec expiration et révocation (actuellement token GUID sans signature ni expiration explicite).
- MFA : planifier `TwoFactorAuth` pour comptes sensibles.
- Hardening : limiter tentatives de login, logging, monitoring des échecs d'auth.

Tests et validation

- Tests unitaires pour `StaffStore.LoginAsync` et `StaffStore.CreateAsync`.
- Tests d'intégration pour endpoints d'auth et RBAC.

Conclusion

Le Sprint 1 met en place les briques essentielles pour un système sécurisé et évolutif : authentification robuste (hashing des mots de passe), modèle RBAC flexible et référentiel organisationnel normalisé. Les extraits de code fournis illustrent l'état actuel de l'implémentation ; les recommandations listées (gestion de tokens, MFA, audits) constituent des priorités pour les itérations suivantes.

Fichiers et références utiles

- Backend/Staff/Models.cs — structure des DTOs et `StaffUser` ([lien au fichier](Backend/Staff/Models.cs#L1-L120)).
- Backend/Staff/StaffStore.Auth.cs — logique d'authentification et gestion des mots de passe ([lien au fichier](Backend/Staff/StaffStore.Auth.cs#L1-L200)).
- Backend/RolesPermissions/Models.cs — modèles et DTOs RBAC ([lien au fichier](Backend/RolesPermissions/Models.cs#L1-L200)).

Prochaines actions

- Si vous souhaitez, je peux :
  - Générer le document Word `.docx` du Chapitre 3 à partir de ce Markdown.
  - Insérer vos 3 diagrammes de classes (fournissez les fichiers image ou confirmez où je dois les copier : `Rapport/images/`).
  - Produire les diagrammes de séquence en image (SVG) à partir des descriptions ci-dessus.

Fin du Chapitre 3 — Sprint 1
