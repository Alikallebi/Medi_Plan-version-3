using MySqlConnector;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    /// <summary>
    /// Résout le vrai nom du service depuis la table <c>services</c>.
    /// Si le serviceId n'est pas un entier valide, retourne null.
    /// </summary>
    private static async Task<string?> ResolveServiceNameFromDbAsync(
        MySqlConnection connection,
        string serviceId,
        MySqlTransaction? tx = null)
    {
        if (!int.TryParse(serviceId, out var numericId) || numericId <= 0)
            return null;

        const string sql = "SELECT nom FROM services WHERE id = @id LIMIT 1;";
        await using var cmd = tx != null
            ? new MySqlCommand(sql, connection, tx)
            : new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", numericId);
        var result = await cmd.ExecuteScalarAsync();
        return result is DBNull || result is null ? null : result.ToString();
    }

    private async Task<string> EnsureWeekAsync(
        MySqlConnection connection,
        string serviceId,
        string serviceName,
        DateTime weekStart,
        DateTime weekEnd,
        MySqlTransaction? tx = null)
    {
        var normalizedWeekStart = weekStart.Date;
        var normalizedWeekEnd = weekEnd.Date;
        if (normalizedWeekEnd < normalizedWeekStart)
        {
            normalizedWeekEnd = normalizedWeekStart;
        }
        var maxWeeklyEnd = normalizedWeekStart.AddDays(6);
        if (normalizedWeekEnd > maxWeeklyEnd)
        {
            normalizedWeekEnd = maxWeeklyEnd;
        }

        // Toujours résoudre le nom réel depuis la BD pour éviter les noms erronés
        // comme "Tous les services" envoyés par le frontend.
        var dbName = await ResolveServiceNameFromDbAsync(connection, serviceId, tx);
        if (!string.IsNullOrWhiteSpace(dbName))
            serviceName = dbName;

        var weekId = await FindWeekIdAsync(connection, serviceId, normalizedWeekStart, normalizedWeekEnd, tx);
        if (!string.IsNullOrEmpty(weekId))
        {
            await UpdateWeekMetadataAsync(connection, weekId, serviceName, normalizedWeekEnd, tx);
            return weekId;
        }

        var now = DateTime.UtcNow;
        const string insertSql = @"
    INSERT INTO planning_weeks (service_id, service_name, week_start, week_end, created_at, updated_at)
    VALUES (@serviceId, @serviceName, @weekStart, @weekEnd, @createdAt, @updatedAt);";

        await using var cmd = new MySqlCommand(insertSql, connection, tx);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@serviceName", serviceName);
        cmd.Parameters.AddWithValue("@weekStart", normalizedWeekStart);
        cmd.Parameters.AddWithValue("@weekEnd", normalizedWeekEnd);
        cmd.Parameters.AddWithValue("@createdAt", now);
        cmd.Parameters.AddWithValue("@updatedAt", now);
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex) when (ex.Message.Contains("Duplicate entry"))
        {
            var existingWeekId = await FindWeekIdAsync(connection, serviceId, normalizedWeekStart, null, tx);
            if (!string.IsNullOrEmpty(existingWeekId))
            {
                await UpdateWeekMetadataAsync(connection, existingWeekId, serviceName, normalizedWeekEnd, tx);
                return existingWeekId;
            }

            throw;
        }

        var insertedWeekId = await FindWeekIdAsync(connection, serviceId, normalizedWeekStart, normalizedWeekEnd, tx);
        return insertedWeekId;
    }

    private static async Task UpdateWeekMetadataAsync(
        MySqlConnection connection,
        string weekId,
        string serviceName,
        DateTime requestedWeekEnd,
        MySqlTransaction? tx = null)
    {
        const string sql = @"
UPDATE planning_weeks
SET service_name = @serviceName,
    week_end = @requestedWeekEnd,
    updated_at = @updatedAt
WHERE id = @weekId;";

        await using var cmd = tx != null
            ? new MySqlCommand(sql, connection, tx)
            : new MySqlCommand(sql, connection);

        cmd.Parameters.AddWithValue("@serviceName", serviceName);
        cmd.Parameters.AddWithValue("@requestedWeekEnd", requestedWeekEnd);
        cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@weekId", weekId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<string> FindWeekIdAsync(
        MySqlConnection connection,
        string serviceId,
        DateTime weekStart,
        DateTime? weekEnd = null,
        MySqlTransaction? tx = null)
    {
        var sql = weekEnd.HasValue
            ? @"SELECT id FROM planning_weeks WHERE service_id = @serviceId AND week_start = @weekStart AND week_end = @weekEnd LIMIT 1;"
            : @"SELECT id FROM planning_weeks WHERE service_id = @serviceId AND week_start = @weekStart ORDER BY id DESC LIMIT 1;";

        await using var cmd = tx != null
            ? new MySqlCommand(sql, connection, tx)
            : new MySqlCommand(sql, connection);

        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@weekStart", weekStart);
        if (weekEnd.HasValue) cmd.Parameters.AddWithValue("@weekEnd", weekEnd.Value);

        var result = await cmd.ExecuteScalarAsync();
        return result?.ToString() ?? string.Empty;
    }

    private static async Task<IReadOnlyList<PlanningAssignment>> GetAssignmentsAsync(
        MySqlConnection connection,
        string weekId,
        MySqlTransaction? tx = null)
    {
        const string sql = @"
SELECT
    assignment_id,
    personnel_id,
    day_index,
    shift_type,
    poste_id,
    poste_label,
    start_time,
    end_time,
    note,
    created_at,
    updated_at
FROM planning_assignments
WHERE planning_week_id = @weekId
ORDER BY day_index, personnel_id;";

        await using var cmd = tx != null
            ? new MySqlCommand(sql, connection, tx)
            : new MySqlCommand(sql, connection);

        cmd.Parameters.AddWithValue("@weekId", weekId);

        await using var reader = await cmd.ExecuteReaderAsync();
        var assignments = new List<PlanningAssignment>();

        while (await reader.ReadAsync())
        {
            assignments.Add(new PlanningAssignment
            {
                Id = reader.GetString("assignment_id"),
                PersonnelId = reader.GetString("personnel_id"),
                Day = reader.GetInt32("day_index"),
                ShiftType = reader.GetString("shift_type"),
                PosteId = reader.IsDBNull(reader.GetOrdinal("poste_id")) ? null : reader.GetString("poste_id"),
                PosteLabel = reader.IsDBNull(reader.GetOrdinal("poste_label")) ? null : reader.GetString("poste_label"),
                StartTime = reader.IsDBNull(reader.GetOrdinal("start_time")) ? null : reader.GetString("start_time"),
                EndTime = reader.IsDBNull(reader.GetOrdinal("end_time")) ? null : reader.GetString("end_time"),
                Note = reader.IsDBNull(reader.GetOrdinal("note")) ? null : reader.GetString("note"),
                CreatedAt = reader.IsDBNull(reader.GetOrdinal("created_at")) ? null : reader.GetDateTime("created_at"),
                UpdatedAt = reader.IsDBNull(reader.GetOrdinal("updated_at")) ? null : reader.GetDateTime("updated_at")
            });
        }

        return assignments;
    }

    /// <summary>
    /// Charge toutes les affectations de la semaine pour TOUS les services d'un pôle.
    /// Utilisé pour les Chef de Pôle qui voient l'ensemble de leur pôle.
    /// </summary>
    private static async Task<IReadOnlyList<PlanningAssignment>> GetAssignmentsByPoleAsync(
        MySqlConnection connection,
        int poleId,
        DateTime weekStart)
    {
        const string sql = @"
SELECT
    pa.assignment_id,
    pa.personnel_id,
    pa.day_index,
    pa.shift_type,
    pa.poste_id,
    pa.poste_label,
    pa.start_time,
    pa.end_time,
    pa.note,
    pa.created_at,
    pa.updated_at
FROM planning_assignments pa
JOIN planning_weeks pw ON pa.planning_week_id = pw.id
JOIN services s ON s.id = CAST(pw.service_id AS UNSIGNED)
WHERE s.pole_id = @poleId
  AND pw.week_start = @weekStart
ORDER BY pa.day_index, pa.personnel_id;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@poleId", poleId);
        cmd.Parameters.AddWithValue("@weekStart", weekStart.Date);

        await using var reader = await cmd.ExecuteReaderAsync();
        var assignments = new List<PlanningAssignment>();

        while (await reader.ReadAsync())
        {
            assignments.Add(new PlanningAssignment
            {
                Id = reader.GetString("assignment_id"),
                PersonnelId = reader.GetString("personnel_id"),
                Day = reader.GetInt32("day_index"),
                ShiftType = reader.GetString("shift_type"),
                PosteId = reader.IsDBNull(reader.GetOrdinal("poste_id")) ? null : reader.GetString("poste_id"),
                PosteLabel = reader.IsDBNull(reader.GetOrdinal("poste_label")) ? null : reader.GetString("poste_label"),
                StartTime = reader.IsDBNull(reader.GetOrdinal("start_time")) ? null : reader.GetString("start_time"),
                EndTime = reader.IsDBNull(reader.GetOrdinal("end_time")) ? null : reader.GetString("end_time"),
                Note = reader.IsDBNull(reader.GetOrdinal("note")) ? null : reader.GetString("note"),
                CreatedAt = reader.IsDBNull(reader.GetOrdinal("created_at")) ? null : reader.GetDateTime("created_at"),
                UpdatedAt = reader.IsDBNull(reader.GetOrdinal("updated_at")) ? null : reader.GetDateTime("updated_at")
            });
        }

        return assignments;
    }

    private static async Task<IReadOnlyList<PersonnelInfo>> GetPersonnelByServiceAsync(
        MySqlConnection connection,
        string serviceId,
        int? poleId = null,
        int? equipeId = null,
        string? userId = null,
        MySqlTransaction? tx = null)
    {
        const string sql = @"
SELECT
    id,
    nom,
    prenom,
    COALESCE(NULLIF(TRIM(role), ''), 'Personnel') AS poste,
    NULLIF(TRIM(specialite), '') AS specialite,
    NULLIF(TRIM(photo), '') AS photo,
    competences_json
FROM staff_users
WHERE service_id = @serviceId
ORDER BY nom, prenom;";

        await using var cmd = tx != null
            ? new MySqlCommand(sql, connection, tx)
            : new MySqlCommand(sql, connection);

        cmd.Parameters.AddWithValue("@serviceId", serviceId);

        await using var reader = await cmd.ExecuteReaderAsync();
        var personnel = new List<PersonnelInfo>();

        while (await reader.ReadAsync())
        {
            var personnelId = reader["id"]?.ToString() ?? string.Empty;
            personnel.Add(new PersonnelInfo
            {
                Id = personnelId,
                Nom = reader.GetString("nom"),
                Prenom = reader.GetString("prenom"),
                Poste = reader.IsDBNull(reader.GetOrdinal("poste")) ? "Personnel" : reader.GetString("poste"),
                Specialite = reader.IsDBNull(reader.GetOrdinal("specialite")) ? null : reader.GetString("specialite"),
                Photo = reader.IsDBNull(reader.GetOrdinal("photo")) ? null : reader.GetString("photo"),
                CompetenceIds = ParseIntList(reader.IsDBNull(reader.GetOrdinal("competences_json")) ? null : reader.GetString("competences_json"))
            });
        }

        return personnel;
    }

    /// <summary>
    /// Synchronise la table dénormalisée <c>planning</c> à partir de planning_assignments + planning_weeks.
    /// Si <paramref name="weekId"/> est fourni, seule la semaine concernée est mise à jour (DELETE puis INSERT
    /// scopés) — cela évite les doublons et garantit que service_id/service_name restent corrects.
    /// Sans weekId (appel initial au démarrage), toute la table est reconstruite.
    /// </summary>
    private static async Task SyncPlanningTableAsync(
        MySqlConnection connection,
        MySqlTransaction? tx = null,
        string? weekId = null)
    {
        // ── Étape 1 : supprimer les lignes obsolètes/dupliquées pour la semaine ciblée ──
        var deleteSql = weekId != null
            ? "DELETE FROM planning WHERE planning_week_id = @weekId;"
            : "DELETE FROM planning;";

        await using (var deleteCmd = tx != null
            ? new MySqlCommand(deleteSql, connection, tx)
            : new MySqlCommand(deleteSql, connection))
        {
            if (weekId != null)
                deleteCmd.Parameters.AddWithValue("@weekId", weekId);
            await deleteCmd.ExecuteNonQueryAsync();
        }

        // ── Étape 2 : insérer les données fraîches ──
        var syncSql = weekId != null
            ? @"
INSERT INTO planning (planning_id, planning_week_id, service_id, service_name, week_start, week_end, personnel_id, day_index, shift_type, poste_id, poste_label, start_time, end_time, note, created_at, updated_at)
SELECT
    CONCAT(pw.id, '-', pa.personnel_id, '-', pa.day_index),
    pw.id,
    pw.service_id,
    pw.service_name,
    pw.week_start,
    pw.week_end,
    pa.personnel_id,
    pa.day_index,
    pa.shift_type,
    pa.poste_id,
    pa.poste_label,
    pa.start_time,
    pa.end_time,
    pa.note,
    pa.created_at,
    pa.updated_at
FROM planning_assignments pa
INNER JOIN planning_weeks pw ON pw.id = pa.planning_week_id
WHERE pw.id = @weekId;"
            : @"
INSERT INTO planning (planning_id, planning_week_id, service_id, service_name, week_start, week_end, personnel_id, day_index, shift_type, poste_id, poste_label, start_time, end_time, note, created_at, updated_at)
SELECT
    CONCAT(pw.id, '-', pa.personnel_id, '-', pa.day_index),
    pw.id,
    pw.service_id,
    pw.service_name,
    pw.week_start,
    pw.week_end,
    pa.personnel_id,
    pa.day_index,
    pa.shift_type,
    pa.poste_id,
    pa.poste_label,
    pa.start_time,
    pa.end_time,
    pa.note,
    pa.created_at,
    pa.updated_at
FROM planning_assignments pa
INNER JOIN planning_weeks pw ON pw.id = pa.planning_week_id;";

        await using var cmd = tx != null
            ? new MySqlCommand(syncSql, connection, tx)
            : new MySqlCommand(syncSql, connection);
        if (weekId != null)
            cmd.Parameters.AddWithValue("@weekId", weekId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<IReadOnlyDictionary<string, string>> ResolvePersonnelNamesAsync(
        MySqlConnection connection,
        IEnumerable<PlanningAssignment> assignments)
    {
        var personnelIds = assignments
            .Select(a => a.PersonnelId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        if (personnelIds.Count == 0)
        {
            return new Dictionary<string, string>();
        }

        var parameterPlaceholders = string.Join(", ", personnelIds.Select((_, i) => $"@id{i}"));
        var sql = $@"
SELECT id, CONCAT(prenom, ' ', nom) as full_name
FROM staff_users
WHERE id IN ({parameterPlaceholders});";

        await using var cmd = new MySqlCommand(sql, connection);
        for (var i = 0; i < personnelIds.Count; i++)
        {
            cmd.Parameters.AddWithValue($"@id{i}", personnelIds[i]);
        }

        await using var reader = await cmd.ExecuteReaderAsync();
        var nameMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        while (await reader.ReadAsync())
        {
            var id = reader["id"]?.ToString() ?? string.Empty;
            var fullName = reader.GetString("full_name");
            nameMap[id] = fullName;
        }

        return nameMap;
    }

    private static async Task<string> EnsureWeekAsyncStatic(
        MySqlConnection connection,
        MySqlTransaction tx,
        string serviceId,
        string serviceName,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var weekId = await FindWeekIdAsync(connection, serviceId, weekStart, weekEnd, tx);
        if (!string.IsNullOrEmpty(weekId))
        {
            return weekId;
        }

        var now = DateTime.UtcNow;
        const string insertSql = @"
    INSERT INTO planning_weeks (service_id, service_name, week_start, week_end, created_at, updated_at)
    VALUES (@serviceId, @serviceName, @weekStart, @weekEnd, @createdAt, @updatedAt);";

        await using var cmd = new MySqlCommand(insertSql, connection, tx);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@serviceName", serviceName);
        cmd.Parameters.AddWithValue("@weekStart", weekStart);
        cmd.Parameters.AddWithValue("@weekEnd", weekEnd);
        cmd.Parameters.AddWithValue("@createdAt", now);
        cmd.Parameters.AddWithValue("@updatedAt", now);
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (MySqlException ex) when (ex.Message.Contains("Duplicate entry"))
        {
            var existingWeekId = await FindWeekIdAsync(connection, serviceId, weekStart, null, tx);
            if (!string.IsNullOrEmpty(existingWeekId))
            {
                return existingWeekId;
            }

            throw;
        }

        var insertedWeekId = await FindWeekIdAsync(connection, serviceId, weekStart, weekEnd, tx);
        return insertedWeekId;
    }

    private static string BuildCellKey(string personnelId, int dayIndex)
        => $"{personnelId}|{dayIndex}";

    private static string BuildPropagatedAssignmentId(string sourceAssignmentId, DateTime targetWeekStart, int dayIndex)
        => $"{sourceAssignmentId}-propagated-{targetWeekStart:yyyyMMdd}-day{dayIndex}";
}
