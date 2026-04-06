using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using MySqlConnector;

namespace Backend.Staff;

public sealed partial class StaffStore
{
    private static void BindStaffParams(MySqlCommand cmd, StaffUser payload, DateTime now, bool includeCreatedAt)
    {
        cmd.Parameters.AddWithValue("@nom", payload.Nom ?? string.Empty);
        cmd.Parameters.AddWithValue("@prenom", payload.Prenom ?? string.Empty);
        cmd.Parameters.AddWithValue("@email", payload.Email ?? string.Empty);
        var tel = payload.Tel ?? payload.Telephone;
        cmd.Parameters.AddWithValue("@tel", (object?)tel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@matricule", (object?)payload.Matricule ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@role", string.IsNullOrWhiteSpace(payload.Role) ? "STAFF" : payload.Role);
        cmd.Parameters.AddWithValue("@specialite", (object?)payload.Specialite ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@actif", payload.Actif);
        cmd.Parameters.AddWithValue("@equipeId", (object?)payload.EquipeId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@serviceId", (object?)payload.ServiceId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@poleId", (object?)payload.PoleId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@civilite", (object?)payload.Civilite ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@dateNaissance", (object?)payload.DateNaissance ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@telephone", (object?)payload.Telephone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@mobile", (object?)payload.Mobile ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@emailPersonnel", (object?)payload.EmailPersonnel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@adresse", (object?)payload.Adresse ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@codePostal", (object?)payload.CodePostal ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@ville", (object?)payload.Ville ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@username", (object?)payload.Username ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@expiration", (object?)payload.Expiration ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@forceChangePassword", payload.ForceChangePassword);
        cmd.Parameters.AddWithValue("@twoFactorAuth", payload.TwoFactorAuth);
        cmd.Parameters.AddWithValue("@rolesSecondairesJson", payload.RolesSecondaires is null ? DBNull.Value : JsonSerializer.Serialize(payload.RolesSecondaires));
        cmd.Parameters.AddWithValue("@dateEmbauche", (object?)payload.DateEmbauche ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@diplome", (object?)payload.Diplome ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@universite", (object?)payload.Universite ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@rpps", (object?)payload.Rpps ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@secu", (object?)payload.Secu ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@competencesJson", payload.Competences is null ? DBNull.Value : JsonSerializer.Serialize(payload.Competences));
        cmd.Parameters.AddWithValue("@notifEmail", payload.NotifEmail);
        cmd.Parameters.AddWithValue("@notifSMS", payload.NotifSMS);
        cmd.Parameters.AddWithValue("@notifPush", payload.NotifPush);
        cmd.Parameters.AddWithValue("@rappelPlanning", (object?)payload.RappelPlanning ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notifModifications", payload.NotifModifications);
        cmd.Parameters.AddWithValue("@recevoirRapports", payload.RecevoirRapports);
        cmd.Parameters.AddWithValue("@photo", (object?)payload.Photo ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@profileJson", BuildProfileJson(payload));
        cmd.Parameters.AddWithValue("@password", (object?)payload.Password ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@updatedAt", now);

        if (includeCreatedAt)
        {
            cmd.Parameters.AddWithValue("@createdAt", now);
        }
    }

    private static string? GetJsonString(JsonElement payload, string propertyName)
    {
        if (!payload.TryGetProperty(propertyName, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static bool IsDbNull(DbDataReader reader, string column)
    {
        return reader.IsDBNull(reader.GetOrdinal(column));
    }

    private static Dictionary<string, object?> ParseProfileJson(string? profileJson)
    {
        if (string.IsNullOrWhiteSpace(profileJson))
        {
            return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(profileJson)
                ?? new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);

            var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var pair in parsed)
            {
                result[pair.Key] = JsonElementToObject(pair.Value);
            }

            return result;
        }
        catch
        {
            return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static object? JsonElementToObject(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var longValue)
                ? longValue
                : element.TryGetDouble(out var doubleValue)
                    ? doubleValue
                    : element.GetRawText(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Array => element.EnumerateArray().Select(JsonElementToObject).ToList(),
            JsonValueKind.Object => element.EnumerateObject().ToDictionary(p => p.Name, p => JsonElementToObject(p.Value)),
            _ => null
        };
    }

    private static List<string> DeserializeJsonList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string BuildProfileJson(StaffUser payload)
    {
        var profile = new Dictionary<string, object?>
        {
            ["civilite"] = payload.Civilite,
            ["dateNaissance"] = payload.DateNaissance,
            ["telephone"] = payload.Telephone ?? payload.Tel,
            ["mobile"] = payload.Mobile,
            ["emailPersonnel"] = payload.EmailPersonnel,
            ["adresse"] = payload.Adresse,
            ["codePostal"] = payload.CodePostal,
            ["ville"] = payload.Ville,
            ["username"] = payload.Username,
            ["expiration"] = payload.Expiration,
            ["forceChangePassword"] = payload.ForceChangePassword,
            ["twoFactorAuth"] = payload.TwoFactorAuth,
            ["rolesSecondaires"] = payload.RolesSecondaires,
            ["dateEmbauche"] = payload.DateEmbauche,
            ["diplome"] = payload.Diplome,
            ["universite"] = payload.Universite,
            ["rpps"] = payload.Rpps,
            ["secu"] = payload.Secu,
            ["competences"] = payload.Competences,
            ["notifEmail"] = payload.NotifEmail,
            ["notifSMS"] = payload.NotifSMS,
            ["notifPush"] = payload.NotifPush,
            ["rappelPlanning"] = payload.RappelPlanning,
            ["notifModifications"] = payload.NotifModifications,
            ["recevoirRapports"] = payload.RecevoirRapports,
            ["photo"] = payload.Photo
        };

        return JsonSerializer.Serialize(profile);
    }

    private static async Task SeedCompetencesAsync(MySqlConnection connection)
    {
        const string countSql = "SELECT COUNT(*) FROM competences;";
        await using var countCmd = new MySqlCommand(countSql, connection);
        var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
        if (count > 0)
        {
            return;
        }

        const string seedSql = @"
INSERT INTO competences (nom) VALUES
('Communication'),
('Gestion planning'),
('Soins infirmiers'),
('Urgences'),
('Coordination équipe');";

        await using var seedCmd = new MySqlCommand(seedSql, connection);
        await seedCmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedStaffAsync(MySqlConnection connection)
    {
        const string countSql = "SELECT COUNT(*) FROM staff_users;";
        await using (var countCmd = new MySqlCommand(countSql, connection))
        {
            var existing = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            if (existing > 0)
            {
                return;
            }
        }

        const string seedSql = @"
INSERT INTO staff_users (nom, prenom, email, tel, matricule, role, specialite, actif, equipe_id, service_id, password, created_at, updated_at)
SELECT nom,
       prenom,
       email,
       telephone,
       CONCAT('MAT-', id),
       'STAFF',
       specialite,
       CASE WHEN statut = 'ACTIF' THEN 1 ELSE 0 END,
       (
            SELECT e.id
            FROM equipes e
            WHERE e.service_id = (
                SELECT s.id
                FROM services s
                ORDER BY s.id
                LIMIT 1
            )
            ORDER BY e.id
            LIMIT 1
       ),
       (
            SELECT s.id
            FROM services s
            ORDER BY s.id
            LIMIT 1
       ),
       NULL,
       UTC_TIMESTAMP(),
       UTC_TIMESTAMP()
    FROM utilisateurs u
ORDER BY id
LIMIT 50;";

        await using var seedCmd = new MySqlCommand(seedSql, connection);
        await seedCmd.ExecuteNonQueryAsync();
    }

    private static async Task RepairMissingAssignmentsAsync(MySqlConnection connection)
    {
        const string hasServiceSql = "SELECT COUNT(*) FROM services;";
        await using var hasServiceCmd = new MySqlCommand(hasServiceSql, connection);
        var servicesCount = Convert.ToInt32(await hasServiceCmd.ExecuteScalarAsync());
        if (servicesCount == 0)
        {
            return;
        }

        const string defaultServiceSql = "SELECT id FROM services ORDER BY id LIMIT 1;";
        await using var defaultServiceCmd = new MySqlCommand(defaultServiceSql, connection);
        var defaultServiceObj = await defaultServiceCmd.ExecuteScalarAsync();
        if (defaultServiceObj is null || defaultServiceObj is DBNull)
        {
            return;
        }

        var defaultServiceId = Convert.ToInt32(defaultServiceObj);

        const string fixInvalidOrNullServiceSql = @"
UPDATE staff_users s
LEFT JOIN services sv ON sv.id = s.service_id
SET s.service_id = @defaultServiceId
WHERE s.service_id IS NULL OR sv.id IS NULL;";
        await using (var fixServiceCmd = new MySqlCommand(fixInvalidOrNullServiceSql, connection))
        {
            fixServiceCmd.Parameters.AddWithValue("@defaultServiceId", defaultServiceId);
            await fixServiceCmd.ExecuteNonQueryAsync();
        }

        const string fixEquipeSql = @"
UPDATE staff_users s
LEFT JOIN equipes e ON e.id = s.equipe_id
JOIN (
    SELECT service_id, MIN(id) AS default_equipe_id
    FROM equipes
    GROUP BY service_id
) eq ON eq.service_id = s.service_id
SET s.equipe_id = eq.default_equipe_id
WHERE s.equipe_id IS NULL OR e.id IS NULL;";
        await using (var fixEquipeCmd = new MySqlCommand(fixEquipeSql, connection))
        {
            await fixEquipeCmd.ExecuteNonQueryAsync();
        }
    }

    private static async Task ResolveAndApplyAssignmentsAsync(MySqlConnection connection, StaffUser payload)
    {
        var serviceId = payload.ServiceId;
        var equipeId = payload.EquipeId;

        if (equipeId.HasValue)
        {
            const string equipeExistsSql = "SELECT id FROM equipes WHERE id = @equipeId LIMIT 1;";
            await using var equipeCmd = new MySqlCommand(equipeExistsSql, connection);
            equipeCmd.Parameters.AddWithValue("@equipeId", equipeId.Value);
            var equipeExists = await equipeCmd.ExecuteScalarAsync();

            if (equipeExists is null || equipeExists is DBNull)
            {
                equipeId = null;
            }
        }

        if (!serviceId.HasValue)
        {
            const string fallbackServiceSql = "SELECT id FROM services ORDER BY id LIMIT 1;";
            await using var serviceCmd = new MySqlCommand(fallbackServiceSql, connection);
            var fallbackService = await serviceCmd.ExecuteScalarAsync();
            if (fallbackService is not null && fallbackService is not DBNull)
            {
                serviceId = Convert.ToInt32(fallbackService);
            }
        }

        if (serviceId.HasValue && !equipeId.HasValue)
        {
            const string fallbackEquipeSql = "SELECT id FROM equipes WHERE service_id = @serviceId ORDER BY id LIMIT 1;";
            await using var fallbackEquipeCmd = new MySqlCommand(fallbackEquipeSql, connection);
            fallbackEquipeCmd.Parameters.AddWithValue("@serviceId", serviceId.Value);
            var fallbackEquipe = await fallbackEquipeCmd.ExecuteScalarAsync();

            if (fallbackEquipe is not null && fallbackEquipe is not DBNull)
            {
                equipeId = Convert.ToInt32(fallbackEquipe);
            }
        }

        payload.ServiceId = serviceId;
        payload.EquipeId = equipeId;
    }

    private static async Task BackfillAssignmentsAsync(MySqlConnection connection)
    {
        const string hasServiceSql = "SELECT COUNT(*) FROM services;";
        await using var hasServiceCmd = new MySqlCommand(hasServiceSql, connection);
        var servicesCount = Convert.ToInt32(await hasServiceCmd.ExecuteScalarAsync());
        if (servicesCount == 0)
        {
            return;
        }

        const string defaultServiceSql = "SELECT id FROM services ORDER BY id LIMIT 1;";
        await using var defaultServiceCmd = new MySqlCommand(defaultServiceSql, connection);
        var defaultServiceObj = await defaultServiceCmd.ExecuteScalarAsync();
        if (defaultServiceObj is null || defaultServiceObj is DBNull)
        {
            return;
        }

        var defaultServiceId = Convert.ToInt32(defaultServiceObj);

        const string fixInvalidOrNullServiceSql = @"
UPDATE staff_users s
LEFT JOIN services sv ON sv.id = s.service_id
SET s.service_id = @defaultServiceId
WHERE s.service_id IS NULL OR sv.id IS NULL;";
        await using (var fixServiceCmd = new MySqlCommand(fixInvalidOrNullServiceSql, connection))
        {
            fixServiceCmd.Parameters.AddWithValue("@defaultServiceId", defaultServiceId);
            await fixServiceCmd.ExecuteNonQueryAsync();
        }

        const string fixEquipeSql = @"
UPDATE staff_users s
LEFT JOIN equipes e ON e.id = s.equipe_id
JOIN (
    SELECT service_id, MIN(id) AS default_equipe_id
    FROM equipes
    GROUP BY service_id
) eq ON eq.service_id = s.service_id
SET s.equipe_id = eq.default_equipe_id
WHERE s.equipe_id IS NULL OR e.id IS NULL;";
        await using (var fixEquipeCmd = new MySqlCommand(fixEquipeSql, connection))
        {
            await fixEquipeCmd.ExecuteNonQueryAsync();
        }
    }

    private static async Task EnsureDefaultPasswordsAsync(MySqlConnection connection)
    {
        var hasher = new PasswordHasher<StaffUser>();

        const string selectSql = "SELECT id, email, password FROM staff_users;";
        await using var selectCmd = new MySqlCommand(selectSql, connection);
        await using var reader = await selectCmd.ExecuteReaderAsync();

        var updates = new List<(int id, string hash)>();
        while (await reader.ReadAsync())
        {
            var id = reader.GetInt32("id");
            var email = reader.GetString("email");
            var password = IsDbNull(reader, "password") ? null : reader.GetString("password");

            if (string.IsNullOrWhiteSpace(password))
            {
                updates.Add((id, hasher.HashPassword(new StaffUser { Id = id, Email = email }, "Admin@123")));
                continue;
            }

            if (!IsLikelyIdentityHash(password))
            {
                updates.Add((id, hasher.HashPassword(new StaffUser { Id = id, Email = email }, password)));
            }
        }

        await reader.CloseAsync();

        foreach (var update in updates)
        {
            const string updateSql = "UPDATE staff_users SET password = @password, updated_at = @updatedAt WHERE id = @id;";
            await using var updateCmd = new MySqlCommand(updateSql, connection);
            updateCmd.Parameters.AddWithValue("@password", update.hash);
            updateCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
            updateCmd.Parameters.AddWithValue("@id", update.id);
            await updateCmd.ExecuteNonQueryAsync();
        }
    }

    private static bool IsLikelyIdentityHash(string value)
    {
        return value.StartsWith("AQAAAA", StringComparison.Ordinal);
    }

    private static async Task EnsureProfileJsonColumnAsync(MySqlConnection connection)
    {
        const string existsSql = @"
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'staff_users'
  AND column_name = 'profile_json';";

        await using var existsCmd = new MySqlCommand(existsSql, connection);
        var exists = Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0;
        if (exists)
        {
            return;
        }

        const string alterSql = "ALTER TABLE staff_users ADD COLUMN profile_json LONGTEXT NULL;";
        await using var alterCmd = new MySqlCommand(alterSql, connection);
        await alterCmd.ExecuteNonQueryAsync();
    }

    private static async Task EnsureExtendedUserColumnsAsync(MySqlConnection connection)
    {
        var columns = new Dictionary<string, string>
        {
            ["civilite"] = "VARCHAR(20) NULL",
            ["date_naissance"] = "DATE NULL",
            ["telephone"] = "VARCHAR(30) NULL",
            ["mobile"] = "VARCHAR(30) NULL",
            ["email_personnel"] = "VARCHAR(255) NULL",
            ["adresse"] = "VARCHAR(255) NULL",
            ["code_postal"] = "VARCHAR(20) NULL",
            ["ville"] = "VARCHAR(120) NULL",
            ["username"] = "VARCHAR(120) NULL",
            ["expiration"] = "DATETIME NULL",
            ["force_change_password"] = "TINYINT(1) NOT NULL DEFAULT 0",
            ["two_factor_auth"] = "TINYINT(1) NOT NULL DEFAULT 0",
            ["roles_secondaires_json"] = "LONGTEXT NULL",
            ["date_embauche"] = "DATE NULL",
            ["diplome"] = "VARCHAR(255) NULL",
            ["universite"] = "VARCHAR(255) NULL",
            ["rpps"] = "VARCHAR(50) NULL",
            ["secu"] = "VARCHAR(50) NULL",
            ["competences_json"] = "LONGTEXT NULL",
            ["notif_email"] = "TINYINT(1) NOT NULL DEFAULT 1",
            ["notif_sms"] = "TINYINT(1) NOT NULL DEFAULT 0",
            ["notif_push"] = "TINYINT(1) NOT NULL DEFAULT 0",
            ["rappel_planning"] = "VARCHAR(50) NULL",
            ["notif_modifications"] = "TINYINT(1) NOT NULL DEFAULT 0",
            ["recevoir_rapports"] = "TINYINT(1) NOT NULL DEFAULT 0",
            ["pole_id"] = "INT NULL",
            ["photo"] = "LONGTEXT NULL"
        };

        foreach (var (columnName, columnType) in columns)
        {
            const string existsSql = @"
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'staff_users'
  AND column_name = @columnName;";

            await using var existsCmd = new MySqlCommand(existsSql, connection);
            existsCmd.Parameters.AddWithValue("@columnName", columnName);
            var exists = Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0;
            if (exists)
            {
                continue;
            }

            var alterSql = $"ALTER TABLE staff_users ADD COLUMN {columnName} {columnType};";
            await using var alterCmd = new MySqlCommand(alterSql, connection);
            await alterCmd.ExecuteNonQueryAsync();
        }
    }
}