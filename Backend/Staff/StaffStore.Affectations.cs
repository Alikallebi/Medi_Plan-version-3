using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using MySqlConnector;

namespace Backend.Staff;

public sealed partial class StaffStore
{
    public async Task<IReadOnlyList<object>> GetUserAffectationsAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT
    a.id,
    a.role_label,
    a.date_debut,
    a.date_fin,
    a.taux,
    a.is_primary,
    a.updated_at,
    sv.nom AS service_nom,
    e.nom AS equipe_nom
FROM staff_affectations a
LEFT JOIN services sv ON sv.id = a.service_id
LEFT JOIN equipes e ON e.id = a.equipe_id
WHERE a.staff_user_id = @id
ORDER BY a.is_primary DESC, a.date_debut DESC, a.id DESC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", userId);

        var affectations = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            affectations.Add(new
            {
                id = reader.GetInt32("id"),
                service = IsDbNull(reader, "service_nom") ? "Service non affecté" : reader.GetString("service_nom"),
                equipe = IsDbNull(reader, "equipe_nom") ? "Équipe non affectée" : reader.GetString("equipe_nom"),
                role = IsDbNull(reader, "role_label") ? "STAFF" : reader.GetString("role_label"),
                dateDebut = reader.GetDateTime("date_debut"),
                dateFin = IsDbNull(reader, "date_fin") ? (DateTime?)null : reader.GetDateTime("date_fin"),
                taux = reader.GetInt32("taux"),
                postes = new[] { "Standard" },
                isPrimary = reader.GetBoolean("is_primary"),
                updatedAt = reader.GetDateTime("updated_at")
            });
        }

        return affectations;
    }

    public async Task<object?> AddUserAffectationAsync(int userId, UserAffectationRequest request)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var userExists = await GetByIdAsync(userId);
        if (userExists is null)
        {
            return null;
        }

        var serviceId = request.ServiceId;
        var equipeId = request.EquipeId;

        if (!serviceId.HasValue && !string.IsNullOrWhiteSpace(request.ServiceName))
        {
            const string serviceByNameSql = "SELECT id FROM services WHERE LOWER(nom) = LOWER(@name) LIMIT 1;";
            await using var serviceCmd = new MySqlCommand(serviceByNameSql, connection);
            serviceCmd.Parameters.AddWithValue("@name", request.ServiceName!.Trim());
            var serviceObj = await serviceCmd.ExecuteScalarAsync();
            if (serviceObj is not null && serviceObj is not DBNull)
            {
                serviceId = Convert.ToInt32(serviceObj);
            }
        }

        if (!equipeId.HasValue && !string.IsNullOrWhiteSpace(request.EquipeName))
        {
            const string equipeByNameSql = @"
SELECT id
FROM equipes
WHERE LOWER(nom) = LOWER(@name)
  AND (@serviceId IS NULL OR service_id = @serviceId)
LIMIT 1;";

            await using var equipeCmd = new MySqlCommand(equipeByNameSql, connection);
            equipeCmd.Parameters.AddWithValue("@name", request.EquipeName!.Trim());
            equipeCmd.Parameters.AddWithValue("@serviceId", (object?)serviceId ?? DBNull.Value);
            var equipeObj = await equipeCmd.ExecuteScalarAsync();
            if (equipeObj is not null && equipeObj is not DBNull)
            {
                equipeId = Convert.ToInt32(equipeObj);
            }
        }

        if (!serviceId.HasValue && equipeId.HasValue)
        {
            const string serviceFromEquipeSql = "SELECT service_id FROM equipes WHERE id = @id LIMIT 1;";
            await using var fromEquipeCmd = new MySqlCommand(serviceFromEquipeSql, connection);
            fromEquipeCmd.Parameters.AddWithValue("@id", equipeId.Value);
            var serviceObj = await fromEquipeCmd.ExecuteScalarAsync();
            if (serviceObj is not null && serviceObj is not DBNull)
            {
                serviceId = Convert.ToInt32(serviceObj);
            }
        }

        if (!serviceId.HasValue || !equipeId.HasValue)
        {
            return null;
        }

        var now = DateTime.UtcNow;

        if (request.IsPrimary)
        {
            const string clearPrimarySql = "UPDATE staff_affectations SET is_primary = 0, updated_at = @updatedAt WHERE staff_user_id = @userId;";
            await using var clearCmd = new MySqlCommand(clearPrimarySql, connection);
            clearCmd.Parameters.AddWithValue("@updatedAt", now);
            clearCmd.Parameters.AddWithValue("@userId", userId);
            await clearCmd.ExecuteNonQueryAsync();
        }

        const string insertSql = @"
INSERT INTO staff_affectations
    (staff_user_id, service_id, equipe_id, role_label, date_debut, date_fin, taux, is_primary, created_at, updated_at)
VALUES
    (@userId, @serviceId, @equipeId, @roleLabel, @dateDebut, @dateFin, @taux, @isPrimary, @createdAt, @updatedAt);
SELECT LAST_INSERT_ID();";

        await using var insertCmd = new MySqlCommand(insertSql, connection);
        insertCmd.Parameters.AddWithValue("@userId", userId);
        insertCmd.Parameters.AddWithValue("@serviceId", serviceId.Value);
        insertCmd.Parameters.AddWithValue("@equipeId", equipeId.Value);
        insertCmd.Parameters.AddWithValue("@roleLabel", string.IsNullOrWhiteSpace(request.Role) ? "STAFF" : request.Role!.Trim());
        insertCmd.Parameters.AddWithValue("@dateDebut", request.DateDebut.Date);
        insertCmd.Parameters.AddWithValue("@dateFin", (object?)request.DateFin?.Date ?? DBNull.Value);
        insertCmd.Parameters.AddWithValue("@taux", Math.Clamp(request.Taux, 0, 100));
        insertCmd.Parameters.AddWithValue("@isPrimary", request.IsPrimary);
        insertCmd.Parameters.AddWithValue("@createdAt", now);
        insertCmd.Parameters.AddWithValue("@updatedAt", now);

        var affectationId = Convert.ToInt32(await insertCmd.ExecuteScalarAsync());
        await SyncStaffAssignmentFromPrimaryAsync(connection, userId);

        var affectations = await GetUserAffectationsAsync(userId);
        return affectations.FirstOrDefault(a => (int)a.GetType().GetProperty("id")!.GetValue(a)! == affectationId);
    }

    public async Task<bool> DeleteUserAffectationAsync(int userId, int affectationId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string deleteSql = "DELETE FROM staff_affectations WHERE id = @id AND staff_user_id = @userId;";
        await using var cmd = new MySqlCommand(deleteSql, connection);
        cmd.Parameters.AddWithValue("@id", affectationId);
        cmd.Parameters.AddWithValue("@userId", userId);
        var deleted = await cmd.ExecuteNonQueryAsync() > 0;

        if (!deleted)
        {
            return false;
        }

        await EnsureOnePrimaryAffectationAsync(connection, userId);
        await SyncStaffAssignmentFromPrimaryAsync(connection, userId);
        return true;
    }

    private static async Task<(int? ServiceId, int? EquipeId)> ResolveAffectationIdsAsync(
        MySqlConnection connection,
        int? serviceId,
        string? serviceName,
        int? equipeId,
        string? equipeName)
    {
        if (!serviceId.HasValue && !string.IsNullOrWhiteSpace(serviceName))
        {
            const string serviceByNameSql = "SELECT id FROM services WHERE LOWER(nom) = LOWER(@name) LIMIT 1;";
            await using var serviceCmd = new MySqlCommand(serviceByNameSql, connection);
            serviceCmd.Parameters.AddWithValue("@name", serviceName.Trim());
            var serviceObj = await serviceCmd.ExecuteScalarAsync();
            if (serviceObj is not null && serviceObj is not DBNull)
            {
                serviceId = Convert.ToInt32(serviceObj);
            }
        }

        if (!equipeId.HasValue && !string.IsNullOrWhiteSpace(equipeName))
        {
            const string equipeByNameSql = @"
SELECT id
FROM equipes
WHERE LOWER(nom) = LOWER(@name)
  AND (@serviceId IS NULL OR service_id = @serviceId)
LIMIT 1;";

            await using var equipeCmd = new MySqlCommand(equipeByNameSql, connection);
            equipeCmd.Parameters.AddWithValue("@name", equipeName.Trim());
            equipeCmd.Parameters.AddWithValue("@serviceId", (object?)serviceId ?? DBNull.Value);
            var equipeObj = await equipeCmd.ExecuteScalarAsync();
            if (equipeObj is not null && equipeObj is not DBNull)
            {
                equipeId = Convert.ToInt32(equipeObj);
            }
        }

        if (!serviceId.HasValue && equipeId.HasValue)
        {
            const string serviceFromEquipeSql = "SELECT service_id FROM equipes WHERE id = @id LIMIT 1;";
            await using var fromEquipeCmd = new MySqlCommand(serviceFromEquipeSql, connection);
            fromEquipeCmd.Parameters.AddWithValue("@id", equipeId.Value);
            var serviceObj = await fromEquipeCmd.ExecuteScalarAsync();
            if (serviceObj is not null && serviceObj is not DBNull)
            {
                serviceId = Convert.ToInt32(serviceObj);
            }
        }

        return (serviceId, equipeId);
    }

    private static async Task ReplaceUserAffectationsAsync(MySqlConnection connection, int userId, StaffUser payload)
    {
        if (payload.Affectations is null || payload.Affectations.Count == 0)
        {
            await UpsertPrimaryAffectationAsync(connection, userId, payload);
            return;
        }

        const string deleteSql = "DELETE FROM staff_affectations WHERE staff_user_id = @userId;";
        await using (var deleteCmd = new MySqlCommand(deleteSql, connection))
        {
            deleteCmd.Parameters.AddWithValue("@userId", userId);
            await deleteCmd.ExecuteNonQueryAsync();
        }

        var now = DateTime.UtcNow;
        var insertedCount = 0;
        var hasPrimary = false;

        const string insertSql = @"
INSERT INTO staff_affectations
    (staff_user_id, service_id, equipe_id, role_label, date_debut, date_fin, taux, is_primary, created_at, updated_at)
VALUES
    (@userId, @serviceId, @equipeId, @roleLabel, @dateDebut, @dateFin, @taux, @isPrimary, @createdAt, @updatedAt);";

        foreach (var affectation in payload.Affectations)
        {
            var (serviceId, equipeId) = await ResolveAffectationIdsAsync(connection,
                affectation.ServiceId,
                affectation.ServiceName,
                affectation.EquipeId,
                affectation.EquipeName);

            if (!serviceId.HasValue || !equipeId.HasValue)
            {
                continue;
            }

            var isPrimary = affectation.IsPrimary ?? affectation.Principale;
            hasPrimary = hasPrimary || isPrimary;

            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@userId", userId);
            insertCmd.Parameters.AddWithValue("@serviceId", serviceId.Value);
            insertCmd.Parameters.AddWithValue("@equipeId", equipeId.Value);
            insertCmd.Parameters.AddWithValue("@roleLabel", string.IsNullOrWhiteSpace(affectation.Role)
                ? (string.IsNullOrWhiteSpace(payload.Role) ? "STAFF" : payload.Role)
                : affectation.Role!.Trim());
            insertCmd.Parameters.AddWithValue("@dateDebut", affectation.DateDebut == default ? DateTime.UtcNow.Date : affectation.DateDebut.Date);
            insertCmd.Parameters.AddWithValue("@dateFin", (object?)affectation.DateFin?.Date ?? DBNull.Value);
            insertCmd.Parameters.AddWithValue("@taux", Math.Clamp(affectation.Taux, 0, 100));
            insertCmd.Parameters.AddWithValue("@isPrimary", isPrimary);
            insertCmd.Parameters.AddWithValue("@createdAt", now);
            insertCmd.Parameters.AddWithValue("@updatedAt", now);
            await insertCmd.ExecuteNonQueryAsync();

            insertedCount++;
        }

        if (insertedCount == 0)
        {
            await UpsertPrimaryAffectationAsync(connection, userId, payload);
            return;
        }

        if (!hasPrimary)
        {
            await EnsureOnePrimaryAffectationAsync(connection, userId);
        }

        await SyncStaffAssignmentFromPrimaryAsync(connection, userId);
    }

    private static async Task UpsertPrimaryAffectationAsync(MySqlConnection connection, int userId, StaffUser payload)
    {
        if (!payload.ServiceId.HasValue || !payload.EquipeId.HasValue)
        {
            return;
        }

        var now = DateTime.UtcNow;

        const string clearPrimarySql = "UPDATE staff_affectations SET is_primary = 0, updated_at = @updatedAt WHERE staff_user_id = @userId;";
        await using (var clearCmd = new MySqlCommand(clearPrimarySql, connection))
        {
            clearCmd.Parameters.AddWithValue("@updatedAt", now);
            clearCmd.Parameters.AddWithValue("@userId", userId);
            await clearCmd.ExecuteNonQueryAsync();
        }

        const string existingSql = @"
SELECT id
FROM staff_affectations
WHERE staff_user_id = @userId
  AND service_id = @serviceId
  AND equipe_id = @equipeId
ORDER BY id DESC
LIMIT 1;";

        int? existingId = null;
        await using (var existingCmd = new MySqlCommand(existingSql, connection))
        {
            existingCmd.Parameters.AddWithValue("@userId", userId);
            existingCmd.Parameters.AddWithValue("@serviceId", payload.ServiceId.Value);
            existingCmd.Parameters.AddWithValue("@equipeId", payload.EquipeId.Value);
            var existingObj = await existingCmd.ExecuteScalarAsync();
            if (existingObj is not null && existingObj is not DBNull)
            {
                existingId = Convert.ToInt32(existingObj);
            }
        }

        if (existingId.HasValue)
        {
            const string updateSql = @"
UPDATE staff_affectations
SET role_label = @roleLabel,
    taux = 100,
    is_primary = 1,
    updated_at = @updatedAt
WHERE id = @id;";

            await using var updateCmd = new MySqlCommand(updateSql, connection);
            updateCmd.Parameters.AddWithValue("@roleLabel", string.IsNullOrWhiteSpace(payload.Role) ? "STAFF" : payload.Role);
            updateCmd.Parameters.AddWithValue("@updatedAt", now);
            updateCmd.Parameters.AddWithValue("@id", existingId.Value);
            await updateCmd.ExecuteNonQueryAsync();
        }
        else
        {
            const string insertSql = @"
INSERT INTO staff_affectations
    (staff_user_id, service_id, equipe_id, role_label, date_debut, date_fin, taux, is_primary, created_at, updated_at)
VALUES
    (@userId, @serviceId, @equipeId, @roleLabel, @dateDebut, NULL, 100, 1, @createdAt, @updatedAt);";

            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@userId", userId);
            insertCmd.Parameters.AddWithValue("@serviceId", payload.ServiceId.Value);
            insertCmd.Parameters.AddWithValue("@equipeId", payload.EquipeId.Value);
            insertCmd.Parameters.AddWithValue("@roleLabel", string.IsNullOrWhiteSpace(payload.Role) ? "STAFF" : payload.Role);
            insertCmd.Parameters.AddWithValue("@dateDebut", DateTime.UtcNow.Date);
            insertCmd.Parameters.AddWithValue("@createdAt", now);
            insertCmd.Parameters.AddWithValue("@updatedAt", now);
            await insertCmd.ExecuteNonQueryAsync();
        }
    }

    private static async Task EnsureOnePrimaryAffectationAsync(MySqlConnection connection, int userId)
    {
        const string primaryCountSql = "SELECT COUNT(*) FROM staff_affectations WHERE staff_user_id = @userId AND is_primary = 1;";
        await using var countCmd = new MySqlCommand(primaryCountSql, connection);
        countCmd.Parameters.AddWithValue("@userId", userId);
        var primaryCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
        if (primaryCount > 0)
        {
            return;
        }

        const string fallbackSql = @"
SELECT id
FROM staff_affectations
WHERE staff_user_id = @userId
ORDER BY date_debut DESC, id DESC
LIMIT 1;";

        await using var fallbackCmd = new MySqlCommand(fallbackSql, connection);
        fallbackCmd.Parameters.AddWithValue("@userId", userId);
        var fallbackObj = await fallbackCmd.ExecuteScalarAsync();
        if (fallbackObj is null || fallbackObj is DBNull)
        {
            return;
        }

        const string markPrimarySql = "UPDATE staff_affectations SET is_primary = 1, updated_at = @updatedAt WHERE id = @id;";
        await using var markCmd = new MySqlCommand(markPrimarySql, connection);
        markCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        markCmd.Parameters.AddWithValue("@id", Convert.ToInt32(fallbackObj));
        await markCmd.ExecuteNonQueryAsync();
    }

    private static async Task SyncStaffAssignmentFromPrimaryAsync(MySqlConnection connection, int userId)
    {
        const string primarySql = @"
SELECT service_id, equipe_id, role_label
FROM staff_affectations
WHERE staff_user_id = @userId AND is_primary = 1
ORDER BY updated_at DESC, id DESC
LIMIT 1;";

        await using var primaryCmd = new MySqlCommand(primarySql, connection);
        primaryCmd.Parameters.AddWithValue("@userId", userId);
        await using var reader = await primaryCmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return;
        }

        var serviceId = reader.GetInt32("service_id");
        var equipeId = reader.GetInt32("equipe_id");
        var roleLabel = reader.GetString("role_label");
        await reader.CloseAsync();

        const string updateStaffSql = @"
UPDATE staff_users
SET service_id = @serviceId,
    equipe_id = @equipeId,
    role = @role,
    updated_at = @updatedAt
WHERE id = @id;";

        await using var updateCmd = new MySqlCommand(updateStaffSql, connection);
        updateCmd.Parameters.AddWithValue("@serviceId", serviceId);
        updateCmd.Parameters.AddWithValue("@equipeId", equipeId);
        updateCmd.Parameters.AddWithValue("@role", string.IsNullOrWhiteSpace(roleLabel) ? "STAFF" : roleLabel);
        updateCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        updateCmd.Parameters.AddWithValue("@id", userId);
        await updateCmd.ExecuteNonQueryAsync();
    }

    private static async Task BackfillAffectationsAsync(MySqlConnection connection)
    {
        const string sql = @"
INSERT INTO staff_affectations
    (staff_user_id, service_id, equipe_id, role_label, date_debut, date_fin, taux, is_primary, created_at, updated_at)
SELECT
    s.id,
    s.service_id,
    s.equipe_id,
    s.role,
    DATE(s.created_at),
    NULL,
    100,
    1,
    s.created_at,
    s.updated_at
FROM staff_users s
LEFT JOIN staff_affectations a ON a.staff_user_id = s.id
WHERE s.service_id IS NOT NULL
  AND s.equipe_id IS NOT NULL
  AND a.id IS NULL;";

        await using var cmd = new MySqlCommand(sql, connection);
        await cmd.ExecuteNonQueryAsync();
    }
}