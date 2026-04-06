using MySqlConnector;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Backend.RolesPermissions
{
    public partial class RolesPermissionsStore
    {
        public async Task<IReadOnlyList<RoleUserDto>> GetRoleUsersAsync(string roleId)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            const string roleSql = @"
SELECT role_name
FROM rbac_roles
WHERE id = @roleId
LIMIT 1;";

            string? canonicalRoleName;
            await using (var roleCmd = new MySqlCommand(roleSql, connection))
            {
                roleCmd.Parameters.AddWithValue("@roleId", roleId);
                canonicalRoleName = (await roleCmd.ExecuteScalarAsync())?.ToString();
            }

            var users = new List<RoleUserDto>();

            if (!string.IsNullOrWhiteSpace(canonicalRoleName))
            {
                const string sql = @"
SELECT
    u.id,
    u.nom,
    u.prenom,
    COALESCE(u.matricule, '') AS matricule,
    COALESCE(s.nom, 'Non assigné') AS service_name,
    u.profile_json,
    CASE WHEN u.actif = 1 THEN 'actif' ELSE 'inactif' END AS status,
    u.role
FROM staff_users u
LEFT JOIN services s ON s.id = u.service_id
WHERE u.role IS NOT NULL AND TRIM(u.role) <> ''
ORDER BY u.nom, u.prenom;";

                await using var cmd = new MySqlCommand(sql, connection);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var rawRole = reader.GetString("role");
                    if (!string.Equals(ResolveRoleName(rawRole), ResolveRoleName(canonicalRoleName), StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var rawId = reader["id"];
                    var rawNom = reader["nom"];
                    var rawPrenom = reader["prenom"];
                    var rawMatricule = reader["matricule"];
                    var rawServiceName = reader["service_name"];
                    var rawStatus = reader["status"];
                    var photo = (string?)null;
                    if (!IsDbNull(reader, "profile_json"))
                    {
                        var profileJson = reader.GetString("profile_json");
                        if (!string.IsNullOrWhiteSpace(profileJson))
                        {
                            try
                            {
                                using var doc = System.Text.Json.JsonDocument.Parse(profileJson);
                                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object
                                    && doc.RootElement.TryGetProperty("photo", out var photoProp)
                                    && photoProp.ValueKind == System.Text.Json.JsonValueKind.String)
                                {
                                    photo = photoProp.GetString();
                                }
                            }
                            catch
                            {
                                // Ignore malformed profile_json and keep photo null.
                            }
                        }
                    }

                    users.Add(new RoleUserDto
                    {
                        Id = Convert.ToString(rawId) ?? string.Empty,
                        Nom = Convert.ToString(rawNom) ?? string.Empty,
                        Prenom = Convert.ToString(rawPrenom) ?? string.Empty,
                        Matricule = Convert.ToString(rawMatricule) ?? string.Empty,
                        Service = Convert.ToString(rawServiceName) ?? "Non assigné",
                        Photo = photo,
                        Status = Convert.ToString(rawStatus) ?? "inactif"
                    });
                }
            }

            if (users.Count > 0)
            {
                return users;
            }

            const string fallbackSql = @"
SELECT id, nom, prenom, matricule, service_name, photo, status
FROM rbac_role_users
WHERE role_id = @roleId
ORDER BY nom, prenom;";

            await using var fallbackCmd = new MySqlCommand(fallbackSql, connection);
            fallbackCmd.Parameters.AddWithValue("@roleId", roleId);

            await using var fallbackReader = await fallbackCmd.ExecuteReaderAsync();
            while (await fallbackReader.ReadAsync())
            {
                users.Add(new RoleUserDto
                {
                    Id = fallbackReader.GetString("id"),
                    Nom = fallbackReader.GetString("nom"),
                    Prenom = fallbackReader.GetString("prenom"),
                    Matricule = fallbackReader.GetString("matricule"),
                    Service = fallbackReader.GetString("service_name"),
                    Photo = IsDbNull(fallbackReader, "photo") ? null : fallbackReader.GetString("photo"),
                    Status = fallbackReader.GetString("status")
                });
            }

            return users;
        }

        public async Task<bool> RemoveUserFromRoleAsync(string roleId, string userId, string? updatedBy)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = @"DELETE FROM rbac_role_users WHERE role_id = @roleId AND id = @userId;";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@roleId", roleId);
            cmd.Parameters.AddWithValue("@userId", userId);

            var affected = await cmd.ExecuteNonQueryAsync();
            if (affected > 0)
            {
                await TouchRoleAsync(connection, roleId, updatedBy);
                await AddHistoryAsync(connection, roleId, "users_removed", "Utilisateur retiré du rôle", "pi-user-minus", updatedBy);
                return true;
            }

            return false;
        }
    }
}
