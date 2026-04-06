using MySqlConnector;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    public async Task<IReadOnlyList<PlanningConflict>> ValidatePlanningAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd = null)
    {
        var normalizedServiceName = string.IsNullOrWhiteSpace(serviceName) ? serviceId : serviceName;
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var weekId = await EnsureWeekAsync(connection, serviceId, normalizedServiceName, start, end, tx);
        var assignments = await GetAssignmentsAsync(connection, weekId, tx);

        if (end > start.AddDays(6))
        {
            await PropagateFirstWeekAssignmentsAcrossPeriodAsync(
                connection,
                tx,
                serviceId,
                normalizedServiceName,
                start,
                end,
                assignments);
        }

        await SyncPlanningTableAsync(connection, tx, weekId);
        await tx.CommitAsync();

        var conflicts = new List<PlanningConflict>(DetectConflicts(assignments));

        // Détecter les doubles affectations inter-services pour la même semaine
        var crossServiceConflicts = await DetectCrossServiceConflictsAsync(connection, serviceId, start, end, assignments);
        conflicts.AddRange(crossServiceConflicts);

        return conflicts;
    }

    /// <summary>
    /// Détecte les personnels de ce service qui sont également affectés dans d'autres services
    /// sur la même plage de dates — signe d'une erreur de saisie ou d'un conflit réel.
    /// </summary>
    private static async Task<IReadOnlyList<PlanningConflict>> DetectCrossServiceConflictsAsync(
        MySqlConnection connection,
        string serviceId,
        DateTime weekStart,
        DateTime weekEnd,
        IReadOnlyList<PlanningAssignment> assignments)
    {
        if (assignments.Count == 0)
            return [];

        var personnelIds = assignments
            .Select(a => a.PersonnelId)
            .Distinct()
            .ToList();

        var paramNames = personnelIds.Select((_, i) => $"@pid{i}").ToList();
        var sql = $@"
SELECT pa.personnel_id, pa.day_index, pw.service_id, pw.service_name
FROM planning_assignments pa
INNER JOIN planning_weeks pw ON pw.id = pa.planning_week_id
WHERE pw.service_id <> @serviceId
  AND pw.week_start = @weekStart
  AND pw.week_end   = @weekEnd
  AND pa.personnel_id IN ({string.Join(',', paramNames)});";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@weekStart", weekStart);
        cmd.Parameters.AddWithValue("@weekEnd", weekEnd);
        for (int i = 0; i < personnelIds.Count; i++)
            cmd.Parameters.AddWithValue(paramNames[i], personnelIds[i]);

        await using var reader = await cmd.ExecuteReaderAsync();
        var conflicts = new List<PlanningConflict>();

        while (await reader.ReadAsync())
        {
            var personnelId = reader.GetString("personnel_id");
            var dayIndex = reader.GetInt32("day_index");
            var otherServiceId = reader.GetString("service_id");
            var otherServiceName = reader.GetString("service_name");

            conflicts.Add(new PlanningConflict
            {
                Id = $"cross-{personnelId}-{dayIndex}-{otherServiceId}",
                Type = "affectation_inter_service",
                Severity = "warning",
                Description = $"Personnel {personnelId} est également affecté dans le service « {otherServiceName} » (id={otherServiceId}) pour la même semaine (jour {dayIndex + 1}). Vérifiez que cette affectation est intentionnelle.",
                PersonnelId = personnelId,
                Day = dayIndex,
                Assignments = [],
                SuggestedFix = $"Retirer l'affectation dans « {otherServiceName} » ou dans ce service."
            });
        }

        return conflicts;
    }

    private static IReadOnlyList<PlanningConflict> DetectConflicts(IReadOnlyList<PlanningAssignment> assignments)
    {
        var duplicates = assignments
            .GroupBy(item => new { item.PersonnelId, item.Day })
            .Where(group => group.Count() > 1)
            .ToList();

        var conflicts = new List<PlanningConflict>();

        foreach (var duplicate in duplicates)
        {
            conflicts.Add(new PlanningConflict
            {
                Id = $"dup-{duplicate.Key.PersonnelId}-{duplicate.Key.Day}",
                Type = "double_affectation",
                Severity = "critical",
                Description = "Personnel affecté plusieurs fois sur la même journée.",
                PersonnelId = duplicate.Key.PersonnelId,
                Day = duplicate.Key.Day,
                Assignments = duplicate.Select(item => item.Id).ToList(),
                SuggestedFix = "Supprimer l'affectation en doublon."
            });
        }

        return conflicts;
    }

    private static List<PlanningRule> DefaultRules()
    {
        return
        [
            new PlanningRule
            {
                Id = "rule-rest",
                Name = "Temps de repos minimum",
                Description = "11h de repos minimum entre deux prises de poste.",
                Type = "repos",
                Value = 11,
                Active = true
            },
            new PlanningRule
            {
                Id = "rule-guard",
                Name = "Quota de gardes",
                Description = "Maximum 3 gardes par semaine et par personnel.",
                Type = "quota",
                Value = 3,
                Active = true
            },
            new PlanningRule
            {
                Id = "rule-competence",
                Name = "Compétence obligatoire",
                Description = "Certaines gardes nécessitent une compétence spécifique.",
                Type = "competence",
                Value = new[] { "urgence", "réanimation" },
                Active = true
            }
        ];
    }

    private static async Task PropagateFirstWeekAssignmentsAcrossPeriodAsync(
        MySqlConnection connection,
        MySqlTransaction tx,
        string serviceId,
        string serviceName,
        DateTime periodStart,
        DateTime periodEnd,
        IReadOnlyList<PlanningAssignment> sourceAssignments)
    {
        var firstWeekAssignments = sourceAssignments
            .Where(item => item.Day >= 0 && item.Day < 7)
            .ToList();

        if (firstWeekAssignments.Count == 0)
        {
            return;
        }

        for (var targetWeekStart = periodStart.AddDays(7); targetWeekStart <= periodEnd; targetWeekStart = targetWeekStart.AddDays(7))
        {
            var targetWeekEnd = targetWeekStart.AddDays(6);
            if (targetWeekEnd > periodEnd)
            {
                targetWeekEnd = periodEnd;
            }

            var maxDayIndexForWeek = (int)(targetWeekEnd - targetWeekStart).TotalDays;

            var targetWeekId = await EnsureWeekAsyncStatic(connection, tx, serviceId, serviceName, targetWeekStart, targetWeekEnd);
            var targetAssignments = await GetAssignmentsAsync(connection, targetWeekId, tx);

            var existingCells = new HashSet<string>(
                targetAssignments.Select(item => BuildCellKey(item.PersonnelId, item.Day))
            );

            var now = DateTime.UtcNow;

            foreach (var source in firstWeekAssignments)
            {
                if (source.Day > maxDayIndexForWeek)
                {
                    continue;
                }

                var targetCell = BuildCellKey(source.PersonnelId, source.Day);
                if (existingCells.Contains(targetCell))
                {
                    continue;
                }

                var propagatedId = BuildPropagatedAssignmentId(source.Id, targetWeekStart, source.Day);

                const string insertSql = @"
INSERT INTO planning_assignments (planning_week_id, assignment_id, personnel_id, day_index, shift_type, poste_id, poste_label, start_time, end_time, note, created_at, updated_at)
VALUES (@weekId, @assignmentId, @personnelId, @dayIndex, @shiftType, @posteId, @posteLabel, @startTime, @endTime, @note, @createdAt, @updatedAt)
ON DUPLICATE KEY UPDATE
    personnel_id = VALUES(personnel_id),
    day_index = VALUES(day_index),
    shift_type = VALUES(shift_type),
    poste_id = VALUES(poste_id),
    poste_label = VALUES(poste_label),
    start_time = VALUES(start_time),
    end_time = VALUES(end_time),
    note = VALUES(note),
    updated_at = VALUES(updated_at);";

                await using var insertCmd = new MySqlCommand(insertSql, connection, tx);
                insertCmd.Parameters.AddWithValue("@weekId", targetWeekId);
                insertCmd.Parameters.AddWithValue("@assignmentId", propagatedId);
                insertCmd.Parameters.AddWithValue("@personnelId", source.PersonnelId);
                insertCmd.Parameters.AddWithValue("@dayIndex", source.Day);
                insertCmd.Parameters.AddWithValue("@shiftType", source.ShiftType);
                insertCmd.Parameters.AddWithValue("@posteId", (object?)source.PosteId ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("@posteLabel", (object?)source.PosteLabel ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("@startTime", (object?)source.StartTime ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("@endTime", (object?)source.EndTime ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("@note", (object?)source.Note ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("@createdAt", source.CreatedAt ?? now);
                insertCmd.Parameters.AddWithValue("@updatedAt", now);
                await insertCmd.ExecuteNonQueryAsync();

                existingCells.Add(targetCell);
            }
        }
    }
}
