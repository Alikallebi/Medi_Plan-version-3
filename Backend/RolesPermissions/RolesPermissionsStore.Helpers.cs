using MySqlConnector;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Backend.RolesPermissions
{
    public partial class RolesPermissionsStore
    {
        private async Task SeedPermissionCatalogAsync(MySqlConnection connection)
        {
            // Migrate to page-based catalog if the new categories don't exist yet
            const string checkSql = "SELECT COUNT(*) FROM rbac_permission_categories WHERE id = 'personnel';";
            await using (var checkCmd = new MySqlCommand(checkSql, connection))
            {
                var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
                if (exists)
                {
                    await EnsurePermissionExistsAsync(
                        connection,
                        "indisponibilites.view",
                        "planification",
                        "Indisponibilités",
                        "Consultation des indisponibilités et absences",
                        "read",
                        2);
                    return;
                }
            }

            // Clear old catalog (role_permissions cascade-deleted via FK)
            await using (var truncCmd = new MySqlCommand(
                "DELETE FROM rbac_role_permissions; DELETE FROM rbac_permissions; DELETE FROM rbac_permission_categories;",
                connection))
            {
                await truncCmd.ExecuteNonQueryAsync();
            }

            // ── Categories ──────────────────────────────────────────────
            var categories = new[]
            {
                ("dashboard",      "📊 Dashboard",               "pi-home",          1),
                ("planning",       "📅 Planning",                "pi-calendar",       2),
                ("personnel",      "👥 Personnel",               "pi-users",          3),
                ("workflow",       "🔄 Workflow & Validation",   "pi-arrows-h",       4),
                ("referentiel",    "🏥 Référentiel Clinique",    "pi-building",       5),
                ("planification",  "📋 Planification",           "pi-list",           6),
                ("administration", "⚙️ Administration",          "pi-cog",            7),
                ("outils",         "🛠️ Outils",                  "pi-wrench",         8)
            };

            const string insertCategorySql = @"
INSERT INTO rbac_permission_categories (id, category_name, category_icon, display_order)
VALUES (@id, @name, @icon, @displayOrder);";

            foreach (var c in categories)
            {
                await using var cmd = new MySqlCommand(insertCategorySql, connection);
                cmd.Parameters.AddWithValue("@id", c.Item1);
                cmd.Parameters.AddWithValue("@name", c.Item2);
                cmd.Parameters.AddWithValue("@icon", c.Item3);
                cmd.Parameters.AddWithValue("@displayOrder", c.Item4);
                await cmd.ExecuteNonQueryAsync();
            }

            // ── Permissions (18 pages) ───────────────────────────────────
            var permissions = new (string Id, string CategoryId, string Name, string Description, string Level, int Order)[]
            {
                // Dashboard
                ("dashboard.view",               "dashboard",      "Tableau de bord",          "Page d'accueil avec statistiques",           "read",  1),
                // Planning
                ("planning.view",                "planning",       "Planning",                 "Grille interactive de planification",         "read",  1),
                // Personnel
                ("personnel.view",               "personnel",      "Personnel",                "Liste et gestion du personnel médical",       "read",  1),
                // Workflow & Validation
                ("workflow.soumissions",         "workflow",       "Mes Soumissions",          "Plannings soumis par l'utilisateur",          "read",  1),
                ("workflow.inbox",               "workflow",       "Boîte de validation",      "Validations de planning en attente",          "read",  2),
                ("workflow.admin-dashboard",     "workflow",       "Tableau de bord Admin",    "Dashboard de supervision workflow",           "none",  3),
                ("workflow.audit",               "workflow",       "Piste d'audit",            "Historique complet des actions workflow",     "none",  4),
                // Référentiel clinique
                ("referentiel.services",         "referentiel",    "Services médicaux",        "Gestion des services médicaux",               "read",  1),
                ("referentiel.equipes",          "referentiel",    "Équipes",                  "Gestion des équipes de soins",                "read",  2),
                ("referentiel.competences",      "referentiel",    "Compétences",              "Catalogue des compétences du personnel",       "read",  3),
                ("referentiel.postes",           "referentiel",    "Postes de travail",        "Catalogue des postes de travail",             "read",  4),
                // Planification
                ("planification.regles",         "planification",  "Règles de planification",  "Gestion des règles de planification",         "read",  1),
                ("indisponibilites.view",       "planification",  "Indisponibilités",         "Consultation des indisponibilités et absences", "read",  2),
                // Administration
                ("admin.utilisateurs",           "administration", "Utilisateurs",             "Liste et administration des utilisateurs",     "read",  1),
                ("admin.utilisateur-detail",     "administration", "Détail utilisateur",       "Fiche détaillée d'un utilisateur",            "read",  2),
                ("admin.roles",                  "administration", "Rôles & permissions",      "Configuration des rôles et droits d'accès",   "none",  3),
                // Outils
                ("outils.notifications",         "outils",         "Notifications",            "Centre de notifications de l'application",    "read",  1),
                ("outils.historique",            "outils",         "Historique",               "Historique des actions utilisateurs",         "read",  2),
                ("outils.rapports",              "outils",         "Rapports",                 "Génération et export de rapports",            "none",  3)
            };

            const string insertPermissionSql = @"
INSERT INTO rbac_permissions (id, category_id, permission_name, permission_description, default_level, display_order)
VALUES (@id, @categoryId, @name, @description, @level, @displayOrder);";

            foreach (var p in permissions)
            {
                await using var cmd = new MySqlCommand(insertPermissionSql, connection);
                cmd.Parameters.AddWithValue("@id", p.Id);
                cmd.Parameters.AddWithValue("@categoryId", p.CategoryId);
                cmd.Parameters.AddWithValue("@name", p.Name);
                cmd.Parameters.AddWithValue("@description", p.Description);
                cmd.Parameters.AddWithValue("@level", p.Level);
                cmd.Parameters.AddWithValue("@displayOrder", p.Order);
                await cmd.ExecuteNonQueryAsync();
            }
        }

        private static async Task EnsurePermissionExistsAsync(
            MySqlConnection connection,
            string id,
            string categoryId,
            string name,
            string description,
            string level,
            int displayOrder)
        {
            const string upsertSql = @"
INSERT INTO rbac_permissions (id, category_id, permission_name, permission_description, default_level, display_order)
VALUES (@id, @categoryId, @name, @description, @level, @displayOrder)
ON DUPLICATE KEY UPDATE
    category_id = VALUES(category_id),
    permission_name = VALUES(permission_name),
    permission_description = VALUES(permission_description),
    default_level = VALUES(default_level),
    display_order = VALUES(display_order);";

            await using var cmd = new MySqlCommand(upsertSql, connection);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@categoryId", categoryId);
            cmd.Parameters.AddWithValue("@name", name);
            cmd.Parameters.AddWithValue("@description", description);
            cmd.Parameters.AddWithValue("@level", level);
            cmd.Parameters.AddWithValue("@displayOrder", displayOrder);
            await cmd.ExecuteNonQueryAsync();
        }

        private async Task SeedRolesAsync(MySqlConnection connection)
        {
            var now = DateTime.UtcNow;
            var roles = new (string Id, string Name, string Type, string Color, string Icon, string Description, string? ParentId)[]
            {
                ("1", "SUPER_ADMIN", "system", "#8b5cf6", "pi-crown", "Accès complet à toutes les fonctionnalités", null),
                ("2", "ADMIN", "system", "#2563eb", "pi-user-edit", "Administration complète sauf impersonnalisation", null),
                ("3", "CHEF", "system", "#10b981", "pi-sitemap", "Chef de service et gestion des plannings", null),
                ("4", "PRATICIEN", "system", "#3b82f6", "pi-heart", "Médecin praticien", null),
                ("5", "INFIRMIER", "system", "#06b6d4", "pi-user-plus", "Personnel infirmier", null),
                ("6", "CADRE", "system", "#8b5cf6", "pi-briefcase", "Cadre de santé", null),
                ("7", "STAFF", "system", "#64748b", "pi-user", "Personnel médical standard", null),
                ("8", "Chef de Pôle", "custom", "#10b981", "pi-sitemap", "Gestion du pôle et validation", null),
                ("9", "Validateur RH", "custom", "#f59e0b", "pi-verified", "Validation des aspects RH", null),
                ("10", "Superviseur internes", "custom", "#64748b", "pi-graduation-cap", "Suivi des internes et stagiaires", null),
                ("11", "Planificateur urgence", "custom", "#ef4444", "pi-calendar-plus", "Planification service urgence", null),
                ("12", "Planificateur RH", "custom", "#0ea5e9", "pi-id-card", "Validation RH globale et supervision des plannings", null)
            };

            const string insertSql = @"
INSERT INTO rbac_roles
    (id, role_name, role_type, role_color, role_icon, role_description, updated_by, parent_role_id, is_active, created_at, updated_at)
VALUES
    (@id, @name, @type, @color, @icon, @description, 'Admin GTA', @parentRoleId, 1, @createdAt, @updatedAt);";

            const string existsSql = @"
SELECT COUNT(*)
FROM rbac_roles
WHERE id = @id OR LOWER(role_name) = LOWER(@name);";

            foreach (var role in roles)
            {
                await using (var existsCmd = new MySqlCommand(existsSql, connection))
                {
                    existsCmd.Parameters.AddWithValue("@id", role.Id);
                    existsCmd.Parameters.AddWithValue("@name", role.Name);
                    var exists = Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0;
                    if (exists)
                    {
                        continue;
                    }
                }

                await using var cmd = new MySqlCommand(insertSql, connection);
                cmd.Parameters.AddWithValue("@id", role.Id);
                cmd.Parameters.AddWithValue("@name", role.Name);
                cmd.Parameters.AddWithValue("@type", role.Type);
                cmd.Parameters.AddWithValue("@color", role.Color);
                cmd.Parameters.AddWithValue("@icon", role.Icon);
                cmd.Parameters.AddWithValue("@description", role.Description);
                cmd.Parameters.AddWithValue("@parentRoleId", (object?)role.ParentId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@createdAt", now);
                cmd.Parameters.AddWithValue("@updatedAt", now);
                await cmd.ExecuteNonQueryAsync();
            }

            // Permissions keyed by ROLE NAME (not hardcoded id) so the seed works correctly
            // regardless of which id was assigned to each role in the database.
            // Each entry: (canonical role name as stored in rbac_roles.role_name, permission id, level)
            // Both new seed names (SUPER_ADMIN, CHEF...) and legacy DB names (Super Admin, Chef de Pôle...)
            // are listed so the seed is compatible with existing databases.
            var rolePermissions = new (string RoleName, string PermissionId, string Level)[]
            {
                // ── SUPER_ADMIN / Super Admin ──────────────────────────────
                ("SUPER_ADMIN",           "dashboard.view",            "admin"),
                ("SUPER_ADMIN",           "planning.view",             "admin"),
                ("SUPER_ADMIN",           "personnel.view",            "admin"),
                ("SUPER_ADMIN",           "workflow.soumissions",      "admin"),
                ("SUPER_ADMIN",           "workflow.inbox",            "admin"),
                ("SUPER_ADMIN",           "workflow.admin-dashboard",  "admin"),
                ("SUPER_ADMIN",           "workflow.audit",            "admin"),
                ("SUPER_ADMIN",           "referentiel.services",      "admin"),
                ("SUPER_ADMIN",           "referentiel.equipes",       "admin"),
                ("SUPER_ADMIN",           "referentiel.competences",   "admin"),
                ("SUPER_ADMIN",           "referentiel.postes",        "admin"),
                ("SUPER_ADMIN",           "planification.regles",      "admin"),
                ("SUPER_ADMIN",           "admin.utilisateurs",        "admin"),
                ("SUPER_ADMIN",           "admin.utilisateur-detail",  "admin"),
                ("SUPER_ADMIN",           "admin.roles",               "admin"),
                ("SUPER_ADMIN",           "outils.notifications",      "admin"),
                ("SUPER_ADMIN",           "outils.historique",         "admin"),
                ("SUPER_ADMIN",           "outils.rapports",           "admin"),
                // legacy DB name
                ("Super Admin",           "dashboard.view",            "admin"),
                ("Super Admin",           "planning.view",             "admin"),
                ("Super Admin",           "personnel.view",            "admin"),
                ("Super Admin",           "workflow.soumissions",      "admin"),
                ("Super Admin",           "workflow.inbox",            "admin"),
                ("Super Admin",           "workflow.admin-dashboard",  "admin"),
                ("Super Admin",           "workflow.audit",            "admin"),
                ("Super Admin",           "referentiel.services",      "admin"),
                ("Super Admin",           "referentiel.equipes",       "admin"),
                ("Super Admin",           "referentiel.competences",   "admin"),
                ("Super Admin",           "referentiel.postes",        "admin"),
                ("Super Admin",           "planification.regles",      "admin"),
                ("Super Admin",           "admin.utilisateurs",        "admin"),
                ("Super Admin",           "admin.utilisateur-detail",  "admin"),
                ("Super Admin",           "admin.roles",               "admin"),
                ("Super Admin",           "outils.notifications",      "admin"),
                ("Super Admin",           "outils.historique",         "admin"),
                ("Super Admin",           "outils.rapports",           "admin"),
                // ── ADMIN / Admin GTA ──────────────────────────────────────
                ("ADMIN",                 "dashboard.view",            "admin"),
                ("ADMIN",                 "planning.view",             "write"),
                ("ADMIN",                 "personnel.view",            "write"),
                ("ADMIN",                 "workflow.soumissions",      "write"),
                ("ADMIN",                 "workflow.inbox",            "validate"),
                ("ADMIN",                 "workflow.admin-dashboard",  "read"),
                ("ADMIN",                 "workflow.audit",            "read"),
                ("ADMIN",                 "referentiel.services",      "write"),
                ("ADMIN",                 "referentiel.equipes",       "write"),
                ("ADMIN",                 "referentiel.competences",   "write"),
                ("ADMIN",                 "referentiel.postes",        "write"),
                ("ADMIN",                 "planification.regles",      "write"),
                ("ADMIN",                 "admin.utilisateurs",        "write"),
                ("ADMIN",                 "admin.utilisateur-detail",  "write"),
                ("ADMIN",                 "admin.roles",               "read"),
                ("ADMIN",                 "outils.notifications",      "read"),
                ("ADMIN",                 "outils.historique",         "read"),
                ("ADMIN",                 "outils.rapports",           "write"),
                // legacy DB name
                ("Admin GTA",             "dashboard.view",            "admin"),
                ("Admin GTA",             "planning.view",             "write"),
                ("Admin GTA",             "personnel.view",            "write"),
                ("Admin GTA",             "workflow.soumissions",      "write"),
                ("Admin GTA",             "workflow.inbox",            "validate"),
                ("Admin GTA",             "workflow.admin-dashboard",  "read"),
                ("Admin GTA",             "workflow.audit",            "read"),
                ("Admin GTA",             "referentiel.services",      "write"),
                ("Admin GTA",             "referentiel.equipes",       "write"),
                ("Admin GTA",             "referentiel.competences",   "write"),
                ("Admin GTA",             "referentiel.postes",        "write"),
                ("Admin GTA",             "planification.regles",      "write"),
                ("Admin GTA",             "admin.utilisateurs",        "write"),
                ("Admin GTA",             "admin.utilisateur-detail",  "write"),
                ("Admin GTA",             "admin.roles",               "read"),
                ("Admin GTA",             "outils.notifications",      "read"),
                ("Admin GTA",             "outils.historique",         "read"),
                ("Admin GTA",             "outils.rapports",           "write"),
                // ── Chef de Pôle (same name in all DB versions) ────────────
                ("Chef de Pôle",          "dashboard.view",            "read"),
                ("Chef de Pôle",          "planning.view",             "validate"),
                ("Chef de Pôle",          "personnel.view",            "read"),
                ("Chef de Pôle",          "workflow.soumissions",      "read"),
                ("Chef de Pôle",          "workflow.inbox",            "validate"),
                ("Chef de Pôle",          "referentiel.services",      "read"),
                ("Chef de Pôle",          "referentiel.equipes",       "read"),
                ("Chef de Pôle",          "referentiel.competences",   "read"),
                ("Chef de Pôle",          "referentiel.postes",        "read"),
                ("Chef de Pôle",          "planification.regles",      "read"),
                ("Chef de Pôle",          "admin.utilisateurs",        "read"),
                ("Chef de Pôle",          "admin.utilisateur-detail",  "read"),
                ("Chef de Pôle",          "outils.notifications",      "read"),
                ("Chef de Pôle",          "outils.historique",         "read"),
                ("Chef de Pôle",          "outils.rapports",           "read"),
                // ── CHEF / Chef de Service ──────────────────────────────────
                ("CHEF",                  "dashboard.view",            "read"),
                ("CHEF",                  "planning.view",             "write"),
                ("CHEF",                  "personnel.view",            "read"),
                ("CHEF",                  "workflow.soumissions",      "write"),
                ("CHEF",                  "workflow.inbox",            "validate"),
                ("CHEF",                  "workflow.admin-dashboard",  "none"),
                ("CHEF",                  "workflow.audit",            "none"),
                ("CHEF",                  "referentiel.services",      "read"),
                ("CHEF",                  "referentiel.equipes",       "read"),
                ("CHEF",                  "referentiel.competences",   "read"),
                ("CHEF",                  "referentiel.postes",        "read"),
                ("CHEF",                  "planification.regles",      "read"),
                ("CHEF",                  "admin.utilisateurs",        "read"),
                ("CHEF",                  "admin.utilisateur-detail",  "read"),
                ("CHEF",                  "admin.roles",               "none"),
                ("CHEF",                  "outils.notifications",      "read"),
                ("CHEF",                  "outils.historique",         "read"),
                ("CHEF",                  "outils.rapports",           "read"),
                // legacy DB name
                ("Chef de Service",       "dashboard.view",            "read"),
                ("Chef de Service",       "planning.view",             "write"),
                ("Chef de Service",       "personnel.view",            "read"),
                ("Chef de Service",       "workflow.soumissions",      "write"),
                ("Chef de Service",       "workflow.inbox",            "validate"),
                ("Chef de Service",       "workflow.admin-dashboard",  "none"),
                ("Chef de Service",       "workflow.audit",            "none"),
                ("Chef de Service",       "referentiel.services",      "read"),
                ("Chef de Service",       "referentiel.equipes",       "read"),
                ("Chef de Service",       "referentiel.competences",   "read"),
                ("Chef de Service",       "referentiel.postes",        "read"),
                ("Chef de Service",       "planification.regles",      "read"),
                ("Chef de Service",       "admin.utilisateurs",        "read"),
                ("Chef de Service",       "admin.utilisateur-detail",  "read"),
                ("Chef de Service",       "admin.roles",               "none"),
                ("Chef de Service",       "outils.notifications",      "read"),
                ("Chef de Service",       "outils.historique",         "read"),
                ("Chef de Service",       "outils.rapports",           "read"),
                // ── PRATICIEN ──────────────────────────────────────────────
                ("PRATICIEN",             "dashboard.view",            "read"),
                ("PRATICIEN",             "planning.view",             "read"),
                ("PRATICIEN",             "personnel.view",            "read"),
                ("PRATICIEN",             "workflow.soumissions",      "read"),
                ("PRATICIEN",             "outils.notifications",      "read"),
                // ── INFIRMIER ──────────────────────────────────────────────
                ("INFIRMIER",             "dashboard.view",            "read"),
                ("INFIRMIER",             "planning.view",             "read"),
                ("INFIRMIER",             "workflow.soumissions",      "read"),
                ("INFIRMIER",             "outils.notifications",      "read"),
                // ── CADRE ──────────────────────────────────────────────────
                ("CADRE",                 "dashboard.view",            "read"),
                ("CADRE",                 "planning.view",             "write"),
                ("CADRE",                 "personnel.view",            "read"),
                ("CADRE",                 "workflow.soumissions",      "write"),
                ("CADRE",                 "workflow.inbox",            "validate"),
                ("CADRE",                 "outils.notifications",      "read"),
                // ── STAFF / Staff ───────────────────────────────────────────
                ("STAFF",                 "dashboard.view",            "read"),
                ("STAFF",                 "planning.view",             "read"),
                ("STAFF",                 "outils.notifications",      "read"),
                // legacy DB name
                ("Staff",                 "dashboard.view",            "read"),
                ("Staff",                 "planning.view",             "read"),
                ("Staff",                 "outils.notifications",      "read"),
                // ── Validateur RH (same name in all DB versions) ───────────
                ("Validateur RH",         "dashboard.view",            "read"),
                ("Validateur RH",         "personnel.view",            "read"),
                ("Validateur RH",         "workflow.soumissions",      "read"),
                ("Validateur RH",         "workflow.inbox",            "validate"),
                ("Validateur RH",         "admin.utilisateurs",        "read"),
                ("Validateur RH",         "admin.utilisateur-detail",  "read"),
                ("Validateur RH",         "outils.notifications",      "read"),
                // ── Planificateur RH (same name in all DB versions) ───────
                ("Planificateur RH",      "dashboard.view",            "read"),
                ("Planificateur RH",      "planning.view",             "read"),
                ("Planificateur RH",      "personnel.view",            "read"),
                ("Planificateur RH",      "workflow.soumissions",      "read"),
                ("Planificateur RH",      "workflow.inbox",            "validate"),
                ("Planificateur RH",      "workflow.admin-dashboard",  "read"),
                ("Planificateur RH",      "workflow.audit",            "read"),
                ("Planificateur RH",      "referentiel.services",      "read"),
                ("Planificateur RH",      "referentiel.equipes",       "read"),
                ("Planificateur RH",      "referentiel.competences",   "read"),
                ("Planificateur RH",      "referentiel.postes",        "read"),
                ("Planificateur RH",      "planification.regles",      "read"),
                ("Planificateur RH",      "indisponibilites.view",     "read"),
                ("Planificateur RH",      "admin.utilisateurs",        "read"),
                ("Planificateur RH",      "admin.utilisateur-detail",  "read"),
                ("Planificateur RH",      "admin.roles",               "none"),
                ("Planificateur RH",      "outils.notifications",      "read"),
                ("Planificateur RH",      "outils.historique",         "read"),
                ("Planificateur RH",      "outils.rapports",           "read"),
                // ── Superviseur internes (same name in all DB versions) ─────
                ("Superviseur internes",  "dashboard.view",            "read"),
                ("Superviseur internes",  "planning.view",             "read"),
                ("Superviseur internes",  "personnel.view",            "read"),
                ("Superviseur internes",  "outils.notifications",      "read"),
                // ── Planificateur urgence (same name in all DB versions) ────
                ("Planificateur urgence", "dashboard.view",            "read"),
                ("Planificateur urgence", "planning.view",             "write"),
                ("Planificateur urgence", "workflow.soumissions",      "write"),
                ("Planificateur urgence", "workflow.inbox",            "read"),
                ("Planificateur urgence", "referentiel.postes",        "read"),
                ("Planificateur urgence", "outils.notifications",      "read"),
            };

            // Build role-name → actual DB id mapping (role names may differ from seed ids
            // if the database was created with an older version of the seed)
            var roleNameToId = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            const string rolesMapSql = "SELECT id, role_name FROM rbac_roles;";
            await using (var rolesCmd = new MySqlCommand(rolesMapSql, connection))
            await using (var rolesReader = await rolesCmd.ExecuteReaderAsync())
            {
                while (await rolesReader.ReadAsync())
                {
                    roleNameToId[rolesReader.GetString("role_name")] = rolesReader.GetString("id");
                }
            }

            const string insertPermissionSql = @"
INSERT INTO rbac_role_permissions (role_id, permission_id, permission_level)
VALUES (@roleId, @permissionId, @level)
ON DUPLICATE KEY UPDATE
    permission_level = VALUES(permission_level);";

            foreach (var entry in rolePermissions)
            {
                // Look up the actual id for this role name in the DB
                if (!roleNameToId.TryGetValue(entry.RoleName, out var actualRoleId))
                {
                    continue; // Role not present in DB, skip
                }

                await using var cmd = new MySqlCommand(insertPermissionSql, connection);
                cmd.Parameters.AddWithValue("@roleId", actualRoleId);
                cmd.Parameters.AddWithValue("@permissionId", entry.PermissionId);
                cmd.Parameters.AddWithValue("@level", entry.Level);
                await cmd.ExecuteNonQueryAsync();
            }
        }

        private async Task EnsureDefaultRoleHierarchyAsync(MySqlConnection connection)
        {
            var roleIdsByCanonicalName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            const string sql = @"
SELECT id, role_name
FROM rbac_roles;";

            await using (var cmd = new MySqlCommand(sql, connection))
            await using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    var roleId = reader.GetString("id");
                    var roleName = reader.GetString("role_name");
                    var canonical = ResolveRoleName(roleName);
                    roleIdsByCanonicalName[canonical] = roleId;
                }
            }

            string? GetRoleId(params string[] possibleNames)
            {
                foreach (var name in possibleNames)
                {
                    var canonical = ResolveRoleName(name);
                    if (roleIdsByCanonicalName.TryGetValue(canonical, out var roleId))
                    {
                        return roleId;
                    }
                }
                return null;
            }

            var superAdminId = GetRoleId("SUPER_ADMIN", "Super Admin");
            var adminGtaId = GetRoleId("ADMIN", "Admin GTA", "ADMIN_GTA");
            var chefPoleId = GetRoleId("Chef de Pôle", "CHEF_DE_POLE", "CHEF_POLE");
            var chefServiceId = GetRoleId("CHEF", "Chef de Service", "CHEF_DE_SERVICE");
            var staffId = GetRoleId("STAFF", "Staff");
            var validateurRhId = GetRoleId("Validateur RH", "VALIDATEUR_RH");
            var planificateurRhId = GetRoleId("Planificateur RH", "PLANIFICATEUR_RH");
            var planificateurUrgenceId = GetRoleId("Planificateur urgence", "PLANIFICATEUR_URGENCE");
            var superviseurInternesId = GetRoleId("Superviseur internes", "SUPERVISEUR_INTERNES");
            var praticienId = GetRoleId("PRATICIEN");
            var infirmierId = GetRoleId("INFIRMIER");
            var cadreId = GetRoleId("CADRE");

            var links = new List<(string? ChildId, string? ParentId)>
            {
                // Racine globale
                (adminGtaId, superAdminId),

                // Chaîne opérationnelle planning
                (chefPoleId, adminGtaId),
                (chefServiceId, chefPoleId),
                (staffId, chefServiceId),

                // Rôles RH
                (validateurRhId, adminGtaId),
                (planificateurRhId, validateurRhId),

                // Rôles spécialisés
                (planificateurUrgenceId, chefServiceId),
                (superviseurInternesId, chefServiceId),

                // Sous-types staff
                (praticienId, staffId),
                (infirmierId, staffId),
                (cadreId, staffId)
            };

            const string updateSql = @"
UPDATE rbac_roles
SET parent_role_id = @parentId
WHERE id = @childId;";

            foreach (var (childId, parentId) in links)
            {
                if (string.IsNullOrWhiteSpace(childId) || string.IsNullOrWhiteSpace(parentId))
                {
                    continue;
                }

                if (string.Equals(childId, parentId, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                await using var updateCmd = new MySqlCommand(updateSql, connection);
                updateCmd.Parameters.AddWithValue("@childId", childId);
                updateCmd.Parameters.AddWithValue("@parentId", parentId);
                await updateCmd.ExecuteNonQueryAsync();
            }
        }

        private async Task SeedRoleUsersAsync(MySqlConnection connection)
        {
            const string countSql = "SELECT COUNT(*) FROM rbac_role_users;";
            await using (var countCmd = new MySqlCommand(countSql, connection))
            {
                var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                if (count > 0)
                {
                    return;
                }
            }

            var users = new (string Id, string RoleId, string Nom, string Prenom, string Matricule, string Service, string Status)[]
            {
                ("1", "5", "DUPONT", "Jean", "MED-001", "Cardiologie", "actif"),
                ("2", "5", "MARTIN", "Marie", "ADM-002", "Direction", "actif"),
                ("3", "5", "LEROY", "Pierre", "RAD-015", "Radiologie", "inactif")
            };

            const string insertSql = @"
INSERT INTO rbac_role_users (id, role_id, nom, prenom, matricule, service_name, photo, status)
VALUES (@id, @roleId, @nom, @prenom, @matricule, @serviceName, NULL, @status);";

            var existingRoleIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            const string rolesIdSql = "SELECT id FROM rbac_roles;";
            await using (var rolesCmd = new MySqlCommand(rolesIdSql, connection))
            await using (var rolesReader = await rolesCmd.ExecuteReaderAsync())
            {
                while (await rolesReader.ReadAsync())
                {
                    existingRoleIds.Add(rolesReader.GetString("id"));
                }
            }

            foreach (var user in users)
            {
                if (!existingRoleIds.Contains(user.RoleId))
                {
                    continue;
                }

                await using var cmd = new MySqlCommand(insertSql, connection);
                cmd.Parameters.AddWithValue("@id", user.Id);
                cmd.Parameters.AddWithValue("@roleId", user.RoleId);
                cmd.Parameters.AddWithValue("@nom", user.Nom);
                cmd.Parameters.AddWithValue("@prenom", user.Prenom);
                cmd.Parameters.AddWithValue("@matricule", user.Matricule);
                cmd.Parameters.AddWithValue("@serviceName", user.Service);
                cmd.Parameters.AddWithValue("@status", user.Status);
                await cmd.ExecuteNonQueryAsync();
            }
        }

        private async Task SeedHistoryAsync(MySqlConnection connection)
        {
            const string countSql = "SELECT COUNT(*) FROM rbac_role_history;";
            await using (var countCmd = new MySqlCommand(countSql, connection))
            {
                var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                if (count > 0)
                {
                    return;
                }
            }

            var now = DateTime.UtcNow;
            var rows = new (string Id, string RoleId, string Type, string Description, string Icon, string By, DateTime Date)[]
            {
                (Guid.NewGuid().ToString("N"), "5", "modified", "Permission modifiée - \"Créer planning\" activée", "pi-pencil", "Admin GTA", now),
                (Guid.NewGuid().ToString("N"), "5", "users_added", "2 utilisateurs ajoutés (Martin, Petit)", "pi-users", "Admin GTA", now.AddDays(-1)),
                (Guid.NewGuid().ToString("N"), "5", "duplicated", "Rôle dupliqué vers \"Validateur RH\"", "pi-copy", "Super Admin", now.AddDays(-2)),
                (Guid.NewGuid().ToString("N"), "5", "created", "Rôle créé", "pi-plus", "Super Admin", now.AddDays(-10))
            };

            const string insertSql = @"
INSERT INTO rbac_role_history (id, role_id, event_type, event_description, event_icon, event_by, event_date)
VALUES (@id, @roleId, @type, @description, @icon, @by, @date);";

            var existingRoleIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            const string rolesIdSql = "SELECT id FROM rbac_roles;";
            await using (var rolesCmd = new MySqlCommand(rolesIdSql, connection))
            await using (var rolesReader = await rolesCmd.ExecuteReaderAsync())
            {
                while (await rolesReader.ReadAsync())
                {
                    existingRoleIds.Add(rolesReader.GetString("id"));
                }
            }

            foreach (var row in rows)
            {
                if (!existingRoleIds.Contains(row.RoleId))
                {
                    continue;
                }

                await using var cmd = new MySqlCommand(insertSql, connection);
                cmd.Parameters.AddWithValue("@id", row.Id);
                cmd.Parameters.AddWithValue("@roleId", row.RoleId);
                cmd.Parameters.AddWithValue("@type", row.Type);
                cmd.Parameters.AddWithValue("@description", row.Description);
                cmd.Parameters.AddWithValue("@icon", row.Icon);
                cmd.Parameters.AddWithValue("@by", row.By);
                cmd.Parameters.AddWithValue("@date", row.Date);
                await cmd.ExecuteNonQueryAsync();
            }
        }

        private async Task<bool> IsSystemRoleAsync(MySqlConnection connection, string roleId, MySqlTransaction? tx = null)
        {
            const string sql = "SELECT role_type FROM rbac_roles WHERE id = @id LIMIT 1;";
            await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
            cmd.Parameters.AddWithValue("@id", roleId);
            var value = await cmd.ExecuteScalarAsync();
            return value is string roleType && string.Equals(roleType, "system", StringComparison.OrdinalIgnoreCase);
        }

        private static async Task<int> GetUsersCountAsync(MySqlConnection connection, string roleId)
        {
            const string sql = "SELECT COUNT(*) FROM rbac_role_users WHERE role_id = @roleId;";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@roleId", roleId);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }

        private static async Task TouchRoleAsync(MySqlConnection connection, string roleId, string? updatedBy, MySqlTransaction? tx = null)
        {
            const string sql = @"
UPDATE rbac_roles
SET updated_at = @updatedAt, updated_by = @updatedBy
WHERE id = @id;";

            await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
            cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
            cmd.Parameters.AddWithValue("@updatedBy", string.IsNullOrWhiteSpace(updatedBy) ? "Admin GTA" : updatedBy);
            cmd.Parameters.AddWithValue("@id", roleId);
            await cmd.ExecuteNonQueryAsync();
        }

        private static bool IsDbNull(MySqlDataReader reader, string name)
        {
            return reader.IsDBNull(reader.GetOrdinal(name));
        }
    }
}
