using MySqlConnector;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Backend.RolesPermissions
{
    public partial class RolesPermissionsStore
    {
        private readonly string _connectionString;

        public RolesPermissionsStore(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("ClinisysDb")
                ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
        }

        public async Task InitializeAsync()
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            const string ddl = @"
CREATE TABLE IF NOT EXISTS rbac_roles (
    id VARCHAR(80) NOT NULL PRIMARY KEY,
    role_name VARCHAR(120) NOT NULL,
    role_type VARCHAR(20) NOT NULL,
    role_color VARCHAR(20) NOT NULL,
    role_icon VARCHAR(80) NULL,
    role_description VARCHAR(300) NULL,
    updated_by VARCHAR(120) NULL,
    parent_role_id VARCHAR(80) NULL,
    is_active TINYINT(1) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS rbac_permission_categories (
    id VARCHAR(80) NOT NULL PRIMARY KEY,
    category_name VARCHAR(120) NOT NULL,
    category_icon VARCHAR(80) NOT NULL,
    display_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS rbac_permissions (
    id VARCHAR(120) NOT NULL PRIMARY KEY,
    category_id VARCHAR(80) NOT NULL,
    permission_name VARCHAR(140) NOT NULL,
    permission_description VARCHAR(300) NOT NULL,
    default_level VARCHAR(20) NOT NULL,
    display_order INT NOT NULL,
    CONSTRAINT fk_rbac_permission_category FOREIGN KEY (category_id) REFERENCES rbac_permission_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    role_id VARCHAR(80) NOT NULL,
    permission_id VARCHAR(120) NOT NULL,
    permission_level VARCHAR(20) NOT NULL,
    CONSTRAINT fk_rbac_role_permissions_role FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_rbac_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES rbac_permissions(id) ON DELETE CASCADE,
    UNIQUE KEY uk_rbac_role_permission (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS rbac_role_users (
    id VARCHAR(80) NOT NULL PRIMARY KEY,
    role_id VARCHAR(80) NOT NULL,
    nom VARCHAR(120) NOT NULL,
    prenom VARCHAR(120) NOT NULL,
    matricule VARCHAR(60) NOT NULL,
    service_name VARCHAR(140) NOT NULL,
    photo VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL,
    CONSTRAINT fk_rbac_role_users_role FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rbac_role_history (
    id VARCHAR(80) NOT NULL PRIMARY KEY,
    role_id VARCHAR(80) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    event_description VARCHAR(300) NOT NULL,
    event_icon VARCHAR(80) NOT NULL,
    event_by VARCHAR(120) NOT NULL,
    event_date DATETIME NOT NULL,
    CONSTRAINT fk_rbac_role_history_role FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
    INDEX ix_rbac_history_role_date (role_id, event_date)
);";

            await using (var cmd = new MySqlCommand(ddl, connection))
            {
                await cmd.ExecuteNonQueryAsync();
            }

            await SeedPermissionCatalogAsync(connection);
            await SeedRolesAsync(connection);
            await EnsureDefaultRoleHierarchyAsync(connection);
            await SeedRoleUsersAsync(connection);
            await SeedHistoryAsync(connection);
        }

        public async Task<IReadOnlyList<RoleDto>> GetRolesAsync()
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            var roles = new Dictionary<string, RoleDto>(StringComparer.OrdinalIgnoreCase);
            var actualUsersByCanonicalRole = await GetActualUsersByCanonicalRoleAsync(connection);
            var fallbackUsersByRoleId = await GetFallbackRoleUsersCountByRoleIdAsync(connection);

            const string sql = @"
SELECT
    r.id,
    r.role_name,
    r.role_type,
    r.role_color,
    r.role_icon,
    r.role_description,
    r.updated_by,
    r.parent_role_id,
    r.is_active,
    r.created_at,
    r.updated_at,
    rp.permission_id,
    rp.permission_level
FROM rbac_roles r
LEFT JOIN rbac_role_permissions rp ON rp.role_id = r.id
GROUP BY
    r.id, r.role_name, r.role_type, r.role_color, r.role_icon,
    r.role_description, r.updated_by, r.parent_role_id, r.is_active,
    r.created_at, r.updated_at, rp.permission_id, rp.permission_level
ORDER BY CASE r.role_type WHEN 'system' THEN 0 ELSE 1 END, r.role_name;";

            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var id = reader.GetString("id");
                if (!roles.TryGetValue(id, out var role))
                {
                    role = new RoleDto
                    {
                        Id = id,
                        Name = reader.GetString("role_name"),
                        Type = reader.GetString("role_type"),
                        Color = reader.GetString("role_color"),
                        Icon = IsDbNull(reader, "role_icon") ? null : reader.GetString("role_icon"),
                        Description = IsDbNull(reader, "role_description") ? null : reader.GetString("role_description"),
                        UpdatedBy = IsDbNull(reader, "updated_by") ? null : reader.GetString("updated_by"),
                        ParentRoleId = IsDbNull(reader, "parent_role_id") ? null : reader.GetString("parent_role_id"),
                        IsActive = reader.GetBoolean("is_active"),
                        CreatedAt = reader.GetDateTime("created_at"),
                        UpdatedAt = reader.GetDateTime("updated_at"),
                        UsersCount = 0,
                        Permissions = []
                    };

                    var canonicalRoleName = ResolveRoleName(role.Name);
                    if (actualUsersByCanonicalRole.TryGetValue(canonicalRoleName, out var actualUsersCount) && actualUsersCount > 0)
                    {
                        role.UsersCount = actualUsersCount;
                    }
                    else if (fallbackUsersByRoleId.TryGetValue(id, out var fallbackUsersCount))
                    {
                        role.UsersCount = fallbackUsersCount;
                    }

                    roles[id] = role;
                }

                if (!IsDbNull(reader, "permission_id"))
                {
                    var permissionId = reader.GetString("permission_id");
                    var level = reader.GetString("permission_level");
                    role.Permissions[permissionId] = level;
                }
            }

            return roles.Values.ToList();
        }

        private async Task<Dictionary<string, int>> GetActualUsersByCanonicalRoleAsync(MySqlConnection connection)
        {
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            const string sql = @"
SELECT role, COUNT(*) AS total
FROM staff_users
WHERE actif = 1 AND role IS NOT NULL AND TRIM(role) <> ''
GROUP BY role;";

            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var rawRole = reader.GetString("role");
                var canonicalRole = ResolveRoleName(rawRole);
                var total = reader.GetInt32("total");
                counts[canonicalRole] = (counts.GetValueOrDefault(canonicalRole) + total);
            }

            return counts;
        }

        private static async Task<Dictionary<string, int>> GetFallbackRoleUsersCountByRoleIdAsync(MySqlConnection connection)
        {
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            const string sql = @"
SELECT role_id, COUNT(*) AS total
FROM rbac_role_users
GROUP BY role_id;";

            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                counts[reader.GetString("role_id")] = reader.GetInt32("total");
            }

            return counts;
        }

        public async Task<RoleDto?> GetRoleByIdAsync(string roleId)
        {
            var roles = await GetRolesAsync();
            return roles.FirstOrDefault(r => string.Equals(r.Id, roleId, StringComparison.OrdinalIgnoreCase));
        }

        public async Task<RoleDto> CreateRoleAsync(CreateRoleRequest request)
        {
            var roleId = Guid.NewGuid().ToString("N");
            var now = DateTime.UtcNow;

            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = @"
INSERT INTO rbac_roles
    (id, role_name, role_type, role_color, role_icon, role_description, updated_by, parent_role_id, is_active, created_at, updated_at)
VALUES
    (@id, @name, @type, @color, @icon, @description, @updatedBy, @parentRoleId, @isActive, @createdAt, @updatedAt);";

            await using (var cmd = new MySqlCommand(sql, connection))
            {
                cmd.Parameters.AddWithValue("@id", roleId);
                cmd.Parameters.AddWithValue("@name", request.Name.Trim());
                cmd.Parameters.AddWithValue("@type", "custom");
                cmd.Parameters.AddWithValue("@color", string.IsNullOrWhiteSpace(request.Color) ? "#2563eb" : request.Color);
                cmd.Parameters.AddWithValue("@icon", (object?)request.Icon ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@description", (object?)request.Description ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@updatedBy", string.IsNullOrWhiteSpace(request.UpdatedBy) ? "Admin GTA" : request.UpdatedBy);
                cmd.Parameters.AddWithValue("@parentRoleId", (object?)request.ParentRoleId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@isActive", request.IsActive);
                cmd.Parameters.AddWithValue("@createdAt", now);
                cmd.Parameters.AddWithValue("@updatedAt", now);
                await cmd.ExecuteNonQueryAsync();
            }

            await AddHistoryAsync(connection, roleId, "created", "Rôle créé", "pi-plus", request.UpdatedBy);

            return (await GetRoleByIdAsync(roleId))!;
        }

        public async Task<RoleDto?> UpdateRoleAsync(string roleId, UpdateRoleRequest request)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = @"
UPDATE rbac_roles
SET
    role_name = @name,
    role_color = @color,
    role_icon = @icon,
    role_description = @description,
    updated_by = @updatedBy,
    parent_role_id = @parentRoleId,
    is_active = @isActive,
    updated_at = @updatedAt
WHERE id = @id;";

            await using (var cmd = new MySqlCommand(sql, connection))
            {
                cmd.Parameters.AddWithValue("@id", roleId);
                cmd.Parameters.AddWithValue("@name", request.Name.Trim());
                cmd.Parameters.AddWithValue("@color", string.IsNullOrWhiteSpace(request.Color) ? "#2563eb" : request.Color);
                cmd.Parameters.AddWithValue("@icon", (object?)request.Icon ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@description", (object?)request.Description ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@updatedBy", string.IsNullOrWhiteSpace(request.UpdatedBy) ? "Admin GTA" : request.UpdatedBy);
                cmd.Parameters.AddWithValue("@parentRoleId", (object?)request.ParentRoleId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@isActive", request.IsActive);
                cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);

                var affected = await cmd.ExecuteNonQueryAsync();
                if (affected == 0)
                {
                    return null;
                }
            }

            await AddHistoryAsync(connection, roleId, "modified", "Rôle modifié", "pi-pencil", request.UpdatedBy);
            return await GetRoleByIdAsync(roleId);
        }

        public async Task<RoleDto?> DuplicateRoleAsync(string roleId, string? updatedBy)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var tx = await connection.BeginTransactionAsync();

            const string roleSql = @"
SELECT id, role_name, role_color, role_icon, role_description, parent_role_id, is_active
FROM rbac_roles
WHERE id = @id
LIMIT 1;";

            string? newRoleId = null;
            await using (var roleCmd = new MySqlCommand(roleSql, connection, tx))
            {
                roleCmd.Parameters.AddWithValue("@id", roleId);
                await using var reader = await roleCmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                {
                    return null;
                }

                newRoleId = Guid.NewGuid().ToString("N");
                var now = DateTime.UtcNow;
                var name = reader.GetString("role_name");
                var color = reader.GetString("role_color");
                var icon = IsDbNull(reader, "role_icon") ? null : reader.GetString("role_icon");
                var description = IsDbNull(reader, "role_description") ? null : reader.GetString("role_description");
                var parentRoleId = IsDbNull(reader, "parent_role_id") ? null : reader.GetString("parent_role_id");
                var isActive = reader.GetBoolean("is_active");

                await reader.DisposeAsync();

                const string insertRoleSql = @"
INSERT INTO rbac_roles
    (id, role_name, role_type, role_color, role_icon, role_description, updated_by, parent_role_id, is_active, created_at, updated_at)
VALUES
    (@id, @name, 'custom', @color, @icon, @description, @updatedBy, @parentRoleId, @isActive, @createdAt, @updatedAt);";

                await using var insertRoleCmd = new MySqlCommand(insertRoleSql, connection, tx);
                insertRoleCmd.Parameters.AddWithValue("@id", newRoleId);
                insertRoleCmd.Parameters.AddWithValue("@name", $"{name} (Copie)");
                insertRoleCmd.Parameters.AddWithValue("@color", color);
                insertRoleCmd.Parameters.AddWithValue("@icon", (object?)icon ?? DBNull.Value);
                insertRoleCmd.Parameters.AddWithValue("@description", (object?)description ?? DBNull.Value);
                insertRoleCmd.Parameters.AddWithValue("@updatedBy", string.IsNullOrWhiteSpace(updatedBy) ? "Admin GTA" : updatedBy);
                insertRoleCmd.Parameters.AddWithValue("@parentRoleId", (object?)parentRoleId ?? DBNull.Value);
                insertRoleCmd.Parameters.AddWithValue("@isActive", isActive);
                insertRoleCmd.Parameters.AddWithValue("@createdAt", now);
                insertRoleCmd.Parameters.AddWithValue("@updatedAt", now);
                await insertRoleCmd.ExecuteNonQueryAsync();
            }

            const string copyPermsSql = @"
INSERT INTO rbac_role_permissions (role_id, permission_id, permission_level)
SELECT @newRoleId, permission_id, permission_level
FROM rbac_role_permissions
WHERE role_id = @sourceRoleId;";

            await using (var copyPermsCmd = new MySqlCommand(copyPermsSql, connection, tx))
            {
                copyPermsCmd.Parameters.AddWithValue("@newRoleId", newRoleId);
                copyPermsCmd.Parameters.AddWithValue("@sourceRoleId", roleId);
                await copyPermsCmd.ExecuteNonQueryAsync();
            }

            await AddHistoryAsync(connection, newRoleId!, "duplicated", "Rôle dupliqué", "pi-copy", updatedBy, tx);

            await tx.CommitAsync();
            return await GetRoleByIdAsync(newRoleId!);
        }

        public async Task<(bool Success, string? Error)> DeleteRoleAsync(string roleId)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            if (await IsSystemRoleAsync(connection, roleId))
            {
                return (false, "Les rôles système ne peuvent pas être supprimés.");
            }

            var usersCount = await GetUsersCountAsync(connection, roleId);
            if (usersCount > 0)
            {
                return (false, $"Ce rôle est attribué à {usersCount} utilisateurs.");
            }

            const string sql = "DELETE FROM rbac_roles WHERE id = @id;";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@id", roleId);
            var affected = await cmd.ExecuteNonQueryAsync();
            return affected > 0 ? (true, null) : (false, "Rôle introuvable.");
        }
    }
}
