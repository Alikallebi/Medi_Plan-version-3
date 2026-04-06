using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySqlConnector;

namespace Backend.Staff;

public sealed partial class StaffStore
{
    public async Task<IReadOnlyList<object>> GetUserHistoryAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string userSql = @"
SELECT id, role, email, matricule, created_at, updated_at
FROM staff_users
WHERE id = @id
LIMIT 1;";

        string userIdAsString = userId.ToString();
        string? role = null;
        string? email = null;
        string? matricule = null;
        DateTime createdAt;
        DateTime updatedAt;

        await using (var userCmd = new MySqlCommand(userSql, connection))
        {
            userCmd.Parameters.AddWithValue("@id", userId);
            await using var userReader = await userCmd.ExecuteReaderAsync();
            if (!await userReader.ReadAsync())
            {
                return [];
            }

            role = IsDbNull(userReader, "role") ? "STAFF" : userReader.GetString("role");
            email = IsDbNull(userReader, "email") ? null : userReader.GetString("email");
            matricule = IsDbNull(userReader, "matricule") ? null : userReader.GetString("matricule");
            createdAt = userReader.GetDateTime("created_at");
            updatedAt = userReader.GetDateTime("updated_at");
        }

        var history = new List<object>
        {
            new
            {
                id = $"staff-created-{userId}",
                type = "created",
                title = "Création du compte utilisateur",
                date = createdAt,
                icon = "pi-user-plus",
                color = "#10b981",
                by = "Système"
            },
            new
            {
                id = $"staff-role-{userId}",
                type = "role",
                title = $"Rôle actuel: {role}",
                date = updatedAt,
                icon = "pi-shield",
                color = "#6366f1",
                by = "Admin GTA"
            }
        };

        if (updatedAt > createdAt.AddSeconds(1))
        {
            history.Add(new
            {
                id = $"staff-updated-{userId}",
                type = "updated",
                title = "Mise à jour du profil utilisateur",
                date = updatedAt,
                icon = "pi-pencil",
                color = "#3b82f6",
                by = "Admin GTA"
            });
        }

        const string planningEventsSql = @"
SELECT
    a.assignment_id,
    a.updated_at,
    w.service_name,
    a.shift_type,
    a.poste_label
FROM planning_assignments a
INNER JOIN planning_weeks w ON w.id = a.planning_week_id
WHERE a.personnel_id = @userId
   OR (@email IS NOT NULL AND a.personnel_id = @email)
   OR (@matricule IS NOT NULL AND a.personnel_id = @matricule)
ORDER BY a.updated_at DESC
LIMIT 25;";

        await using var planningCmd = new MySqlCommand(planningEventsSql, connection);
        planningCmd.Parameters.AddWithValue("@userId", userIdAsString);
        planningCmd.Parameters.AddWithValue("@email", (object?)email ?? DBNull.Value);
        planningCmd.Parameters.AddWithValue("@matricule", (object?)matricule ?? DBNull.Value);

        await using var planningReader = await planningCmd.ExecuteReaderAsync();
        while (await planningReader.ReadAsync())
        {
            var serviceName = IsDbNull(planningReader, "service_name") ? "Service" : planningReader.GetString("service_name");
            var shiftType = IsDbNull(planningReader, "shift_type") ? "jour" : planningReader.GetString("shift_type");
            var posteLabel = IsDbNull(planningReader, "poste_label") ? null : planningReader.GetString("poste_label");
            var assignmentId = IsDbNull(planningReader, "assignment_id") ? Guid.NewGuid().ToString("N") : planningReader.GetString("assignment_id");
            var eventDate = IsDbNull(planningReader, "updated_at") ? DateTime.UtcNow : planningReader.GetDateTime("updated_at");

            history.Add(new
            {
                id = $"planning-{assignmentId}",
                type = "planning",
                title = string.IsNullOrWhiteSpace(posteLabel)
                    ? $"Affectation planning {serviceName} ({shiftType})"
                    : $"Affectation planning {serviceName} - {posteLabel}",
                date = eventDate,
                icon = "pi-calendar",
                color = "#f59e0b",
                by = "Planification"
            });
        }

        return history
            .OrderByDescending(item => (DateTime)item.GetType().GetProperty("date")!.GetValue(item)!)
            .Take(50)
            .ToList();
    }

    public async Task<IReadOnlyList<object>> GetUserRolesAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string userSql = @"
SELECT id, nom, prenom, matricule, role, created_at, updated_at
FROM staff_users
WHERE id = @id
LIMIT 1;";

        string? nom;
        string? prenom;
        string? matricule;
        string currentRole;
        DateTime createdAt;
        DateTime updatedAt;

        await using (var userCmd = new MySqlCommand(userSql, connection))
        {
            userCmd.Parameters.AddWithValue("@id", userId);
            await using var userReader = await userCmd.ExecuteReaderAsync();
            if (!await userReader.ReadAsync())
            {
                return [];
            }

            nom = IsDbNull(userReader, "nom") ? null : userReader.GetString("nom");
            prenom = IsDbNull(userReader, "prenom") ? null : userReader.GetString("prenom");
            matricule = IsDbNull(userReader, "matricule") ? null : userReader.GetString("matricule");
            currentRole = IsDbNull(userReader, "role") ? "STAFF" : userReader.GetString("role");
            createdAt = userReader.GetDateTime("created_at");
            updatedAt = userReader.GetDateTime("updated_at");
        }

        var roles = new List<object>();
        var knownRoleNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        const string currentRoleMetaSql = @"
SELECT id, role_name, updated_by, updated_at
FROM rbac_roles
WHERE LOWER(role_name) = LOWER(@roleName)
LIMIT 1;";

        await using (var roleCmd = new MySqlCommand(currentRoleMetaSql, connection))
        {
            roleCmd.Parameters.AddWithValue("@roleName", currentRole);
            await using var roleReader = await roleCmd.ExecuteReaderAsync();
            if (await roleReader.ReadAsync())
            {
                var roleName = roleReader.GetString("role_name");
                roles.Add(new
                {
                    id = roleReader.GetString("id"),
                    name = roleName,
                    since = createdAt,
                    by = IsDbNull(roleReader, "updated_by") ? "Admin GTA" : roleReader.GetString("updated_by"),
                    expiration = (DateTime?)null,
                    isPrimary = true,
                    updatedAt = IsDbNull(roleReader, "updated_at") ? updatedAt : roleReader.GetDateTime("updated_at")
                });
                knownRoleNames.Add(roleName);
            }
        }

        if (!knownRoleNames.Contains(currentRole))
        {
            roles.Add(new
            {
                id = $"staff-role-{userId}",
                name = currentRole,
                since = createdAt,
                by = "Admin GTA",
                expiration = (DateTime?)null,
                isPrimary = true,
                updatedAt
            });
            knownRoleNames.Add(currentRole);
        }

        const string linkedRolesSql = @"
SELECT DISTINCT r.id, r.role_name, r.updated_by, r.updated_at
FROM rbac_role_users ru
INNER JOIN rbac_roles r ON r.id = ru.role_id
WHERE (
    @matricule IS NOT NULL AND LOWER(ru.matricule) = LOWER(@matricule)
) OR (
    @nom IS NOT NULL AND @prenom IS NOT NULL AND LOWER(ru.nom) = LOWER(@nom) AND LOWER(ru.prenom) = LOWER(@prenom)
)
ORDER BY r.role_name;";

        await using var linkedCmd = new MySqlCommand(linkedRolesSql, connection);
        linkedCmd.Parameters.AddWithValue("@matricule", (object?)matricule ?? DBNull.Value);
        linkedCmd.Parameters.AddWithValue("@nom", (object?)nom ?? DBNull.Value);
        linkedCmd.Parameters.AddWithValue("@prenom", (object?)prenom ?? DBNull.Value);

        await using var linkedReader = await linkedCmd.ExecuteReaderAsync();
        while (await linkedReader.ReadAsync())
        {
            var roleName = linkedReader.GetString("role_name");
            if (knownRoleNames.Contains(roleName))
            {
                continue;
            }

            roles.Add(new
            {
                id = linkedReader.GetString("id"),
                name = roleName,
                since = createdAt,
                by = IsDbNull(linkedReader, "updated_by") ? "Admin GTA" : linkedReader.GetString("updated_by"),
                expiration = (DateTime?)null,
                isPrimary = false,
                updatedAt = IsDbNull(linkedReader, "updated_at") ? updatedAt : linkedReader.GetDateTime("updated_at")
            });

            knownRoleNames.Add(roleName);
        }

        return roles;
    }
}