using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;

namespace Backend.Staff;

public sealed partial class StaffStore
{
    public async Task<IReadOnlyList<object>> GetUserPlanningAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string userSql = @"
    SELECT id, email, matricule, nom, prenom
FROM staff_users
WHERE id = @id
LIMIT 1;";

        string userIdAsString = userId.ToString();
        string? email = null;
        string? matricule = null;
        string? nom = null;
        string? prenom = null;
        string? fullName = null;
        string? reverseFullName = null;
        string? fullNameCompact = null;

        await using (var userCmd = new MySqlCommand(userSql, connection))
        {
            userCmd.Parameters.AddWithValue("@id", userId);
            await using var userReader = await userCmd.ExecuteReaderAsync();
            if (!await userReader.ReadAsync())
            {
                return [];
            }

            email = IsDbNull(userReader, "email") ? null : userReader.GetString("email");
            matricule = IsDbNull(userReader, "matricule") ? null : userReader.GetString("matricule");
            nom = IsDbNull(userReader, "nom") ? null : userReader.GetString("nom");
            prenom = IsDbNull(userReader, "prenom") ? null : userReader.GetString("prenom");

            if (!string.IsNullOrWhiteSpace(prenom) && !string.IsNullOrWhiteSpace(nom))
            {
                fullName = $"{prenom} {nom}".Trim();
                reverseFullName = $"{nom} {prenom}".Trim();
                fullNameCompact = fullName.Replace(" ", string.Empty, StringComparison.Ordinal);
            }
        }

        var result = new List<object>();
        const string planningSql = @"
SELECT
    a.assignment_id,
    a.planning_week_id,
    w.service_id,
    w.week_start,
    a.day_index,
    w.service_name,
    a.shift_type,
    a.poste_label,
    a.start_time,
    a.end_time,
    a.note,
    a.updated_at
FROM planning_assignments a
INNER JOIN planning_weeks w ON w.id = a.planning_week_id
WHERE a.personnel_id = @userId
   OR (@email IS NOT NULL AND a.personnel_id = @email)
   OR (@matricule IS NOT NULL AND a.personnel_id = @matricule)
    OR (@fullName IS NOT NULL AND LOWER(TRIM(a.personnel_id)) = LOWER(TRIM(@fullName)))
    OR (@reverseFullName IS NOT NULL AND LOWER(TRIM(a.personnel_id)) = LOWER(TRIM(@reverseFullName)))
    OR (@fullNameCompact IS NOT NULL AND LOWER(REPLACE(TRIM(a.personnel_id), ' ', '')) = LOWER(@fullNameCompact))
ORDER BY w.week_start DESC, a.day_index ASC, a.updated_at DESC
LIMIT 300;";

        await using var planningCmd = new MySqlCommand(planningSql, connection);
        planningCmd.Parameters.AddWithValue("@userId", userIdAsString);
        planningCmd.Parameters.AddWithValue("@email", (object?)email ?? DBNull.Value);
        planningCmd.Parameters.AddWithValue("@matricule", (object?)matricule ?? DBNull.Value);
        planningCmd.Parameters.AddWithValue("@fullName", (object?)fullName ?? DBNull.Value);
        planningCmd.Parameters.AddWithValue("@reverseFullName", (object?)reverseFullName ?? DBNull.Value);
        planningCmd.Parameters.AddWithValue("@fullNameCompact", (object?)fullNameCompact ?? DBNull.Value);

        await using var reader = await planningCmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var weekStart = reader.GetDateTime("week_start");
            var dayIndex = reader.GetInt32("day_index");
            var date = weekStart.AddDays(Math.Clamp(dayIndex, 0, 6));
            var shiftType = IsDbNull(reader, "shift_type") ? "jour" : reader.GetString("shift_type");
            var posteLabel = IsDbNull(reader, "poste_label") ? null : reader.GetString("poste_label");
            var serviceName = IsDbNull(reader, "service_name") ? "Service" : reader.GetString("service_name");

            result.Add(new
            {
                id = IsDbNull(reader, "assignment_id") ? Guid.NewGuid().ToString("N") : reader.GetString("assignment_id"),
                planningWeekId = IsDbNull(reader, "planning_week_id") ? (int?)null : reader.GetInt32("planning_week_id"),
                serviceId = IsDbNull(reader, "service_id") ? null : reader.GetString("service_id"),
                date,
                dayIndex,
                poste = string.IsNullOrWhiteSpace(posteLabel)
                    ? $"{serviceName} - {shiftType}"
                    : $"{serviceName} - {posteLabel}",
                heureDebut = IsDbNull(reader, "start_time") ? null : reader.GetString("start_time"),
                heureFin = IsDbNull(reader, "end_time") ? null : reader.GetString("end_time"),
                shiftType,
                note = IsDbNull(reader, "note") ? null : reader.GetString("note"),
                updatedAt = IsDbNull(reader, "updated_at") ? (DateTime?)null : reader.GetDateTime("updated_at")
            });
        }

        return result;
    }
}