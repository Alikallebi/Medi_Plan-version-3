using MySqlConnector;
using System.Globalization;
using System.Text;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    private static DateTime NormalizeDate(DateTime date)
        => date.Date;

    private static (DateTime Start, DateTime End) NormalizePeriod(DateTime weekStart, DateTime? weekEnd)
    {
        var start = NormalizeDate(weekStart);
        var end = weekEnd.HasValue ? NormalizeDate(weekEnd.Value) : start.AddDays(6);
        return (start, end);
    }

    private static string BuildPlanningId(string serviceId, string personnelId, int dayIndex)
        => $"{serviceId}-{personnelId}-{dayIndex}";

    private static bool IsNull(MySqlDataReader reader, string columnName)
        => reader.IsDBNull(reader.GetOrdinal(columnName));

    private static string NormalizeShiftLabel(string? shiftType)
    {
        return (shiftType ?? string.Empty).ToLowerInvariant() switch
        {
            "jour" => "Jour",
            "nuit" => "Nuit",
            "garde" => "Garde",
            "astreinte" => "Astreinte",
            "repos" => "Repos",
            "formation" => "Formation",
            "matin" => "Matin",
            "après-midi" or "apres-midi" => "Après-midi",
            _ => shiftType ?? "Non défini"
        };
    }

    private static string GetShiftTypeColor(string? shiftType)
    {
        return (shiftType ?? string.Empty).ToLowerInvariant() switch
        {
            "jour" or "matin" => "0.678 0.847 0.902",
            "après-midi" or "apres-midi" => "0.8 0.9 0.95",
            "nuit" => "0.4 0.4 0.5",
            "garde" => "1 0.8 0.6",
            "astreinte" => "1 1 0.8",
            "repos" => "0.9 0.9 0.9",
            "formation" => "0.847 0.749 0.847",
            _ => "0.945 0.961 0.976"
        };
    }

    private static void AddPdfObject(StringBuilder sb, List<int> offsets, int objectNumber, string content)
    {
        offsets.Add(Encoding.ASCII.GetByteCount(sb.ToString()));
        sb.Append($"{objectNumber} 0 obj\n{content}\nendobj\n");
    }

    private async Task SeedTestPlanningDataAsync(MySqlConnection connection)
    {
        // Check if test data already exists
        const string checkSql = "SELECT COUNT(*) FROM planning_assignments LIMIT 1;";
        await using var checkCmd = new MySqlCommand(checkSql, connection);
        var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
        
        if (count > 0)
        {
            Console.WriteLine("Planning test data already exists, skipping seed.");
            return;
        }

        Console.WriteLine("Seeding planning test data for current week...");

        // Calculate current week (Monday to Sunday)
        var today = DateTime.Today;
        var dayOfWeek = (int)today.DayOfWeek;
        var diff = dayOfWeek == 0 ? -6 : 1 - dayOfWeek; // Monday = 1
        var weekStart = today.AddDays(diff);
        var weekEnd = weekStart.AddDays(6);

        // Create week entry
        var weekId = await EnsureWeekAsync(connection, "1", "Service Urgences", weekStart, weekEnd, null);

        // Get first 5 staff members from service 1
        const string staffSql = "SELECT id FROM staff_users WHERE service_id = 1 AND actif = 1 LIMIT 5;";
        await using var staffCmd = new MySqlCommand(staffSql, connection);
        await using var reader = await staffCmd.ExecuteReaderAsync();
        var staffIds = new List<int>();
        while (await reader.ReadAsync())
        {
            staffIds.Add(reader.GetInt32(0));
        }
        await reader.CloseAsync();

        if (staffIds.Count == 0)
        {
            Console.WriteLine("No staff found for service 1, skipping planning seed.");
            return;
        }

        // Create assignments for each staff member
        var assignments = new List<(int personnelId, int day, string shift, string? poste, string? note)>();
        
        // Personnel 1: Chef - jour shifts Monday-Friday
        if (staffIds.Count > 0)
        {
            for (int day = 0; day < 5; day++)
            {
                assignments.Add((staffIds[0], day, "jour", "Bureau Chef", day == 1 ? "Réunion équipe" : null));
            }
        }

        // Personnel 2: Mix jour/formation
        if (staffIds.Count > 1)
        {
            assignments.Add((staffIds[1], 0, "jour", "Service", null));
            assignments.Add((staffIds[1], 1, "jour", "Service", null));
            assignments.Add((staffIds[1], 3, "formation", "Salle 201", "Formation DPC"));
            assignments.Add((staffIds[1], 4, "formation", "Salle 201", "Certification"));
        }

        // Personnel 3: Nuit/Jour rotation
        if (staffIds.Count > 2)
        {
            assignments.Add((staffIds[2], 0, "nuit", "Urgences Nuit", "Garde 12h"));
            assignments.Add((staffIds[2], 1, "repos", null, "Repos post-nuit"));
            assignments.Add((staffIds[2], 2, "jour", "Urgences", null));
            assignments.Add((staffIds[2], 3, "jour", "Urgences", null));
            assignments.Add((staffIds[2], 4, "garde", "Urgences", "Garde 12h"));
        }

        // Personnel 4: Jour régulier + weekend
        if (staffIds.Count > 3)
        {
            for (int day = 0; day < 3; day++)
            {
                assignments.Add((staffIds[3], day, "jour", "Urgences", "Équipe matin"));
            }
            assignments.Add((staffIds[3], 3, "nuit", "Urgences Nuit", "Garde nuit"));
            assignments.Add((staffIds[3], 4, "repos", null, "Repos"));
            assignments.Add((staffIds[3], 6, "jour", "Urgences", "Renfort weekend"));
        }

        // Personnel 5: Nuit rotation
        if (staffIds.Count > 4)
        {
            assignments.Add((staffIds[4], 0, "nuit", "Urgences Nuit", "Équipe nuit"));
            assignments.Add((staffIds[4], 1, "repos", null, null));
            assignments.Add((staffIds[4], 2, "nuit", "Urgences Nuit", "Équipe nuit"));
            assignments.Add((staffIds[4], 3, "repos", null, null));
            assignments.Add((staffIds[4], 4, "nuit", "Urgences Nuit", "Équipe nuit"));
            assignments.Add((staffIds[4], 6, "garde", "Urgences", "Garde dimanche"));
        }

        // Insert all assignments
        const string insertSql = @"
INSERT INTO planning_assignments (planning_week_id, assignment_id, personnel_id, day_index, shift_type, poste_label, note, created_at, updated_at)
VALUES (@weekId, @assignmentId, @personnelId, @dayIndex, @shiftType, @posteLabel, @note, @now, @now);";

        var now = DateTime.UtcNow;
        foreach (var (personnelId, day, shift, poste, note) in assignments)
        {
            await using var cmd = new MySqlCommand(insertSql, connection);
            cmd.Parameters.AddWithValue("@weekId", weekId);
            cmd.Parameters.AddWithValue("@assignmentId", $"{personnelId}-{day}");
            cmd.Parameters.AddWithValue("@personnelId", personnelId.ToString());
            cmd.Parameters.AddWithValue("@dayIndex", day);
            cmd.Parameters.AddWithValue("@shiftType", shift);
            cmd.Parameters.AddWithValue("@posteLabel", (object?)poste ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@note", (object?)note ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@now", now);
            await cmd.ExecuteNonQueryAsync();
        }

        Console.WriteLine($"✅ Created {assignments.Count} planning assignments for {staffIds.Count} staff members");
    }

    private static string BuildPlanningId(string serviceId, DateTime weekStart)
        => $"{serviceId}-{weekStart:yyyyMMdd}";
}
