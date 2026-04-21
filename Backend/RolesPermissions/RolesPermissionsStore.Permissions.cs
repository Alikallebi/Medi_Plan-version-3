using MySqlConnector;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Backend.RolesPermissions
{
    public partial class RolesPermissionsStore
    {
        public async Task<IReadOnlyList<PermissionCategory>> GetPermissionCategoriesAsync()
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            var categories = new Dictionary<string, PermissionCategory>(StringComparer.OrdinalIgnoreCase);

            const string sql = @"
SELECT
    c.id AS category_id,
    c.category_name,
    c.category_icon,
    p.id AS permission_id,
    p.permission_name,
    p.permission_description,
    p.default_level
FROM rbac_permission_categories c
LEFT JOIN rbac_permissions p ON p.category_id = c.id
ORDER BY c.display_order, p.display_order;";

            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var categoryId = reader.GetString("category_id");
                if (!categories.TryGetValue(categoryId, out var category))
                {
                    category = new PermissionCategory
                    {
                        Id = categoryId,
                        Name = reader.GetString("category_name"),
                        Icon = reader.GetString("category_icon"),
                        Expanded = categoryId == "dashboard",
                        Permissions = []
                    };

                    categories[categoryId] = category;
                }

                if (!IsDbNull(reader, "permission_id"))
                {
                    category.Permissions.Add(new PermissionDefinition
                    {
                        Id = reader.GetString("permission_id"),
                        Name = reader.GetString("permission_name"),
                        Description = reader.GetString("permission_description"),
                        Level = reader.GetString("default_level")
                    });
                }
            }

            return categories.Values.ToList();
        }

        /// <summary>
        /// Mappe les variantes de noms de rôle (stockées dans staff_users.role) vers le
        /// nom canonique utilisé dans rbac_roles.role_name.
        /// Nécessaire car staff_users peut contenir CHEF_DE_POLE, chef-pole, CHEF_POLE, etc.
        /// </summary>
        private static string ResolveRoleName(string rawRole)
        {
            var normalized = rawRole
                .Trim()
                .ToUpperInvariant()
                .Replace("-", "_")
                .Replace(" ", "_");

            return normalized switch
            {
                "CHEF_DE_POLE" or "CHEF_POLE" => "CHEF_POLE",
                "CHEF_DE_SERVICE" or "CHEF_SERVICE" or "CHEF" => "CHEF_SERVICE",
                "VALIDATEUR_RH" or "ADMIN_RH" or "RH" or "PLANIFICATEUR_RH" or "PLANIFICATEUR_URGENCE" or "SUPERVISEUR" or "SUPERVISEUR_INTERNE" or "SUPERVISEUR_INTERNES" => "STAFF",
                "SUPER_ADMIN" => "SUPER_ADMIN",
                "SUPERADMIN" or "SUPER_ADMINISTRATEUR" => "SUPER_ADMIN",
                "ADMIN_GTA" or "ADMIN" => "SUPER_ADMIN",
                "PRATICIEN" => "STAFF",
                "INFIRMIER" => "STAFF",
                "CADRE" => "STAFF",
                "STAFF" => "STAFF",
                _ => "STAFF"
            };
        }

        /// <summary>
        /// Retourne le dictionnaire { permission_id → niveau } pour un utilisateur donné,
        /// en résolvant son rôle depuis la table staff.
        /// </summary>
        public async Task<IReadOnlyDictionary<string, string>> GetUserPermissionsAsync(int userId)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            // 1. Récupérer le nom du rôle de l'utilisateur depuis staff_users
            const string roleSql = "SELECT role FROM staff_users WHERE id = @userId LIMIT 1;";
            await using var roleCmd = new MySqlCommand(roleSql, connection);
            roleCmd.Parameters.AddWithValue("@userId", userId);
            var roleNameValue = await roleCmd.ExecuteScalarAsync();

            if (roleNameValue == null || roleNameValue == DBNull.Value)
                return new Dictionary<string, string>();

            // 2. Normaliser le nom de rôle (CHEF_DE_POLE → Chef de Pôle, etc.)
            var rawRoleName = roleNameValue.ToString()!;
            var roleName = ResolveRoleName(rawRoleName);

            // 3. Résoudre le nom du rôle en ID RBAC
            const string roleIdSql = "SELECT id FROM rbac_roles WHERE LOWER(role_name) = LOWER(@roleName) LIMIT 1;";
            await using var roleIdCmd = new MySqlCommand(roleIdSql, connection);
            roleIdCmd.Parameters.AddWithValue("@roleName", roleName);
            var roleIdValue = await roleIdCmd.ExecuteScalarAsync();

            if (roleIdValue == null || roleIdValue == DBNull.Value)
                return new Dictionary<string, string>();

            var roleId = roleIdValue.ToString()!;

            // 3. Récupérer les permissions effectives avec héritage (parent -> enfant)
            var lineage = await GetRoleLineageAsync(connection, roleId);
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (var lineageRoleId in lineage)
            {
                var directPermissions = await GetDirectRolePermissionsAsync(connection, lineageRoleId);
                foreach (var permission in directPermissions)
                {
                    // L'enfant écrase le parent (y compris avec niveau "none")
                    result[permission.Key] = permission.Value;
                }
            }

            return result;
        }

        private static async Task<Dictionary<string, string>> GetDirectRolePermissionsAsync(MySqlConnection connection, string roleId)
        {
            const string sql = @"
SELECT rp.permission_id, rp.permission_level
FROM rbac_role_permissions rp
WHERE rp.role_id = @roleId;";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@roleId", roleId);

            var permissions = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                permissions[reader.GetString("permission_id")] = reader.GetString("permission_level");
            }

            return permissions;
        }

        private static async Task<List<string>> GetRoleLineageAsync(MySqlConnection connection, string roleId)
        {
            var lineage = new List<string>();
            var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string? currentRoleId = roleId;

            while (!string.IsNullOrWhiteSpace(currentRoleId) && visited.Add(currentRoleId))
            {
                lineage.Add(currentRoleId);

                const string parentSql = @"
SELECT parent_role_id
FROM rbac_roles
WHERE id = @id
LIMIT 1;";

                await using var parentCmd = new MySqlCommand(parentSql, connection);
                parentCmd.Parameters.AddWithValue("@id", currentRoleId);
                var parentRoleId = await parentCmd.ExecuteScalarAsync();

                currentRoleId = parentRoleId == null || parentRoleId == DBNull.Value
                    ? null
                    : parentRoleId.ToString();
            }

            lineage.Reverse();
            return lineage;
        }

        public async Task<bool> SetPermissionLevelAsync(string roleId, string permissionId, string level, string? updatedBy)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            if (await IsSystemRoleAsync(connection, roleId))
            {
                return false;
            }

            if (string.Equals(level, "none", StringComparison.OrdinalIgnoreCase))
            {
                const string deleteSql = @"DELETE FROM rbac_role_permissions WHERE role_id = @roleId AND permission_id = @permissionId;";
                await using var deleteCmd = new MySqlCommand(deleteSql, connection);
                deleteCmd.Parameters.AddWithValue("@roleId", roleId);
                deleteCmd.Parameters.AddWithValue("@permissionId", permissionId);
                await deleteCmd.ExecuteNonQueryAsync();
            }
            else
            {
                const string upsertSql = @"
INSERT INTO rbac_role_permissions (role_id, permission_id, permission_level)
VALUES (@roleId, @permissionId, @level)
ON DUPLICATE KEY UPDATE permission_level = VALUES(permission_level);";

                await using var upsertCmd = new MySqlCommand(upsertSql, connection);
                upsertCmd.Parameters.AddWithValue("@roleId", roleId);
                upsertCmd.Parameters.AddWithValue("@permissionId", permissionId);
                upsertCmd.Parameters.AddWithValue("@level", level);
                await upsertCmd.ExecuteNonQueryAsync();
            }

            await TouchRoleAsync(connection, roleId, updatedBy);
            await AddHistoryAsync(connection, roleId, "modified", $"Permission {permissionId} définie à {level}", "pi-pencil", updatedBy);
            return true;
        }

        public async Task<bool> SetAllPermissionsAsync(string roleId, string level, string? updatedBy)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var tx = await connection.BeginTransactionAsync();

            if (await IsSystemRoleAsync(connection, roleId, tx))
            {
                return false;
            }

            const string deleteSql = "DELETE FROM rbac_role_permissions WHERE role_id = @roleId;";
            await using (var deleteCmd = new MySqlCommand(deleteSql, connection, tx))
            {
                deleteCmd.Parameters.AddWithValue("@roleId", roleId);
                await deleteCmd.ExecuteNonQueryAsync();
            }

            if (!string.Equals(level, "none", StringComparison.OrdinalIgnoreCase))
            {
                const string insertSql = @"
INSERT INTO rbac_role_permissions (role_id, permission_id, permission_level)
SELECT @roleId, id, @level FROM rbac_permissions;";

                await using var insertCmd = new MySqlCommand(insertSql, connection, tx);
                insertCmd.Parameters.AddWithValue("@roleId", roleId);
                insertCmd.Parameters.AddWithValue("@level", level);
                await insertCmd.ExecuteNonQueryAsync();
            }

            await TouchRoleAsync(connection, roleId, updatedBy, tx);
            await AddHistoryAsync(connection, roleId, "modified", $"Toutes les permissions définies à {level}", "pi-cog", updatedBy, tx);

            await tx.CommitAsync();
            return true;
        }
    }
}
