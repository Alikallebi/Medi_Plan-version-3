using MySqlConnector;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace Backend.RolesPermissions
{
    public partial class RolesPermissionsStore
    {
        public async Task<string> ExportRolesCsvAsync()
        {
            var roles = await GetRolesAsync();
            var categories = await GetPermissionCategoriesAsync();
            var allPermissions = categories.SelectMany(c => c.Permissions).Select(p => p.Id).ToList();

            var sb = new StringBuilder();
            var header = new List<string>
            {
                "id", "name", "type", "description", "active", "usersCount", "updatedAt", "updatedBy"
            };
            header.AddRange(allPermissions);

            sb.AppendLine(string.Join(",", header.Select(Csv)));

            foreach (var role in roles)
            {
                var row = new List<string>
                {
                    role.Id,
                    role.Name,
                    role.Type,
                    role.Description ?? string.Empty,
                    role.IsActive ? "1" : "0",
                    role.UsersCount.ToString(),
                    role.UpdatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                    role.UpdatedBy ?? string.Empty
                };

                foreach (var permissionId in allPermissions)
                {
                    row.Add(role.Permissions.TryGetValue(permissionId, out var level) ? level : "none");
                }

                sb.AppendLine(string.Join(",", row.Select(Csv)));
            }

            return sb.ToString();
        }

        public async Task<(int Created, int Updated, int Ignored)> ImportRolesCsvAsync(string csvContent, string? updatedBy)
        {
            if (string.IsNullOrWhiteSpace(csvContent))
            {
                return (0, 0, 0);
            }

            var rows = ParseCsv(csvContent);
            if (rows.Count < 2)
            {
                return (0, 0, 0);
            }

            var headers = rows[0]
                .Select((name, index) => new { Name = (name ?? string.Empty).Trim(), Index = index })
                .Where(x => !string.IsNullOrWhiteSpace(x.Name))
                .ToDictionary(x => x.Name, x => x.Index, StringComparer.OrdinalIgnoreCase);

            var hasName = headers.ContainsKey("name");
            if (!hasName)
            {
                return (0, 0, rows.Count - 1);
            }

            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var tx = await connection.BeginTransactionAsync();

            var permissionIds = await LoadPermissionIdsAsync(connection, tx);
            var created = 0;
            var updated = 0;
            var ignored = 0;

            for (var rowIndex = 1; rowIndex < rows.Count; rowIndex++)
            {
                var row = rows[rowIndex];
                var name = GetCell(row, headers, "name")?.Trim();
                if (string.IsNullOrWhiteSpace(name))
                {
                    ignored++;
                    continue;
                }

                var inputId = GetCell(row, headers, "id")?.Trim();
                var type = (GetCell(row, headers, "type") ?? "custom").Trim().ToLowerInvariant();
                if (string.Equals(type, "system", StringComparison.OrdinalIgnoreCase))
                {
                    ignored++;
                    continue;
                }

                var roleColor = GetCell(row, headers, "color")?.Trim();
                var description = GetCell(row, headers, "description")?.Trim();
                var activeRaw = GetCell(row, headers, "active")?.Trim();
                var updatedByCell = GetCell(row, headers, "updatedBy")?.Trim();
                var resolvedUpdatedBy = string.IsNullOrWhiteSpace(updatedByCell)
                    ? (string.IsNullOrWhiteSpace(updatedBy) ? "Import CSV" : updatedBy!)
                    : updatedByCell;

                var roleId = await ResolveRoleIdAsync(connection, tx, inputId, name);
                if (roleId is null)
                {
                    roleId = Guid.NewGuid().ToString("N");
                    const string insertRoleSql = @"
INSERT INTO rbac_roles
    (id, role_name, role_type, role_color, role_icon, role_description, updated_by, parent_role_id, is_active, created_at, updated_at)
VALUES
    (@id, @name, 'custom', @color, 'pi-users', @description, @updatedBy, NULL, @isActive, @createdAt, @updatedAt);";

                    await using var insertRoleCmd = new MySqlCommand(insertRoleSql, connection, tx);
                    insertRoleCmd.Parameters.AddWithValue("@id", roleId);
                    insertRoleCmd.Parameters.AddWithValue("@name", name);
                    insertRoleCmd.Parameters.AddWithValue("@color", string.IsNullOrWhiteSpace(roleColor) ? "#2563eb" : roleColor);
                    insertRoleCmd.Parameters.AddWithValue("@description", (object?)description ?? DBNull.Value);
                    insertRoleCmd.Parameters.AddWithValue("@updatedBy", resolvedUpdatedBy);
                    insertRoleCmd.Parameters.AddWithValue("@isActive", ParseBoolean(activeRaw, true));
                    insertRoleCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
                    insertRoleCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
                    await insertRoleCmd.ExecuteNonQueryAsync();

                    await AddHistoryAsync(connection, roleId, "created", "Rôle importé depuis CSV", "pi-upload", resolvedUpdatedBy, tx);
                    created++;
                }
                else
                {
                    if (await IsSystemRoleAsync(connection, roleId, tx))
                    {
                        ignored++;
                        continue;
                    }

                    const string updateRoleSql = @"
UPDATE rbac_roles
SET
    role_name = @name,
    role_color = @color,
    role_description = @description,
    updated_by = @updatedBy,
    is_active = @isActive,
    updated_at = @updatedAt
WHERE id = @id;";

                    await using var updateRoleCmd = new MySqlCommand(updateRoleSql, connection, tx);
                    updateRoleCmd.Parameters.AddWithValue("@id", roleId);
                    updateRoleCmd.Parameters.AddWithValue("@name", name);
                    updateRoleCmd.Parameters.AddWithValue("@color", string.IsNullOrWhiteSpace(roleColor) ? "#2563eb" : roleColor);
                    updateRoleCmd.Parameters.AddWithValue("@description", (object?)description ?? DBNull.Value);
                    updateRoleCmd.Parameters.AddWithValue("@updatedBy", resolvedUpdatedBy);
                    updateRoleCmd.Parameters.AddWithValue("@isActive", ParseBoolean(activeRaw, true));
                    updateRoleCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
                    await updateRoleCmd.ExecuteNonQueryAsync();

                    await AddHistoryAsync(connection, roleId, "modified", "Rôle mis à jour par import CSV", "pi-upload", resolvedUpdatedBy, tx);
                    updated++;
                }

                var permissionUpdates = new List<(string PermissionId, string Level)>();
                foreach (var permissionId in permissionIds)
                {
                    if (!headers.TryGetValue(permissionId, out var colIndex) || colIndex >= row.Length)
                    {
                        continue;
                    }

                    var rawLevel = row[colIndex]?.Trim();
                    if (string.IsNullOrWhiteSpace(rawLevel))
                    {
                        continue;
                    }

                    var normalizedLevel = NormalizeLevel(rawLevel);
                    permissionUpdates.Add((permissionId, normalizedLevel));
                }

                if (permissionUpdates.Count > 0)
                {
                    const string deleteSql = "DELETE FROM rbac_role_permissions WHERE role_id = @roleId;";
                    await using (var deleteCmd = new MySqlCommand(deleteSql, connection, tx))
                    {
                        deleteCmd.Parameters.AddWithValue("@roleId", roleId);
                        await deleteCmd.ExecuteNonQueryAsync();
                    }

                    const string insertSql = @"
INSERT INTO rbac_role_permissions (role_id, permission_id, permission_level)
VALUES (@roleId, @permissionId, @level);";

                    foreach (var entry in permissionUpdates.Where(x => !string.Equals(x.Level, "none", StringComparison.OrdinalIgnoreCase)))
                    {
                        await using var insertCmd = new MySqlCommand(insertSql, connection, tx);
                        insertCmd.Parameters.AddWithValue("@roleId", roleId);
                        insertCmd.Parameters.AddWithValue("@permissionId", entry.PermissionId);
                        insertCmd.Parameters.AddWithValue("@level", entry.Level);
                        await insertCmd.ExecuteNonQueryAsync();
                    }
                }
            }

            await tx.CommitAsync();
            return (created, updated, ignored);
        }

        private static string Csv(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "";
            }

            if (!value.Contains(',') && !value.Contains('"') && !value.Contains('\n') && !value.Contains('\r'))
            {
                return value;
            }

            return $"\"{value.Replace("\"", "\"\"")}\"";
        }

        private static List<string[]> ParseCsv(string content)
        {
            var rows = new List<string[]>();
            var currentRow = new List<string>();
            var current = new StringBuilder();
            var inQuotes = false;

            for (var i = 0; i < content.Length; i++)
            {
                var ch = content[i];
                if (inQuotes)
                {
                    if (ch == '"')
                    {
                        var nextIsQuote = i + 1 < content.Length && content[i + 1] == '"';
                        if (nextIsQuote)
                        {
                            current.Append('"');
                            i++;
                        }
                        else
                        {
                            inQuotes = false;
                        }
                    }
                    else
                    {
                        current.Append(ch);
                    }

                    continue;
                }

                if (ch == '"')
                {
                    inQuotes = true;
                    continue;
                }

                if (ch == ',')
                {
                    currentRow.Add(current.ToString());
                    current.Clear();
                    continue;
                }

                if (ch == '\r')
                {
                    continue;
                }

                if (ch == '\n')
                {
                    currentRow.Add(current.ToString());
                    current.Clear();
                    if (currentRow.Any(cell => !string.IsNullOrWhiteSpace(cell)))
                    {
                        rows.Add(currentRow.ToArray());
                    }
                    currentRow = [];
                    continue;
                }

                current.Append(ch);
            }

            if (current.Length > 0 || currentRow.Count > 0)
            {
                currentRow.Add(current.ToString());
                if (currentRow.Any(cell => !string.IsNullOrWhiteSpace(cell)))
                {
                    rows.Add(currentRow.ToArray());
                }
            }

            return rows;
        }

        private static string? GetCell(string[] row, IReadOnlyDictionary<string, int> headers, string name)
        {
            if (!headers.TryGetValue(name, out var index))
            {
                return null;
            }

            return index >= 0 && index < row.Length ? row[index] : null;
        }

        private static bool ParseBoolean(string? value, bool defaultValue)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return defaultValue;
            }

            var normalized = value.Trim().ToLowerInvariant();
            return normalized switch
            {
                "1" => true,
                "0" => false,
                "true" => true,
                "false" => false,
                "yes" => true,
                "no" => false,
                "oui" => true,
                "non" => false,
                _ => defaultValue
            };
        }

        private static string NormalizeLevel(string value)
        {
            var normalized = value.Trim().ToLowerInvariant();
            return normalized switch
            {
                "none" => "none",
                "aucun" => "none",
                "read" => "read",
                "lecture" => "read",
                "write" => "write",
                "ecriture" => "write",
                "écriture" => "write",
                "validate" => "validate",
                "validation" => "validate",
                "admin" => "admin",
                _ => "none"
            };
        }

        private static async Task<HashSet<string>> LoadPermissionIdsAsync(MySqlConnection connection, MySqlTransaction tx)
        {
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            const string sql = "SELECT id FROM rbac_permissions;";
            await using var cmd = new MySqlCommand(sql, connection, tx);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ids.Add(reader.GetString("id"));
            }

            return ids;
        }

        private static async Task<string?> ResolveRoleIdAsync(MySqlConnection connection, MySqlTransaction tx, string? inputId, string name)
        {
            if (!string.IsNullOrWhiteSpace(inputId))
            {
                const string byIdSql = "SELECT id FROM rbac_roles WHERE id = @id LIMIT 1;";
                await using var byIdCmd = new MySqlCommand(byIdSql, connection, tx);
                byIdCmd.Parameters.AddWithValue("@id", inputId);
                var byId = await byIdCmd.ExecuteScalarAsync();
                if (byId is string foundById)
                {
                    return foundById;
                }
            }

            const string byNameSql = "SELECT id FROM rbac_roles WHERE role_name = @name AND role_type = 'custom' LIMIT 1;";
            await using var byNameCmd = new MySqlCommand(byNameSql, connection, tx);
            byNameCmd.Parameters.AddWithValue("@name", name);
            var byName = await byNameCmd.ExecuteScalarAsync();
            return byName as string;
        }
    }
}