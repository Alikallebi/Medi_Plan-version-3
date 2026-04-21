using MySqlConnector;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    public async Task<(string VersionId, string FileName)> SaveVersionAsync(
        string serviceId,
        string serviceName,
        DateTime weekStart,
        DateTime? weekEnd,
        string comment,
        string? author = null,
        int? assignmentsCountOverride = null)
    {
        var normalizedServiceName = string.IsNullOrWhiteSpace(serviceName) ? serviceId : serviceName;
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

                int assignmentsCountFromDb = 0;
                const string assignmentsCountSql = @"
SELECT COUNT(a.id)
FROM planning_assignments a
INNER JOIN planning_weeks w ON w.id = a.planning_week_id
WHERE w.service_id = @serviceId
    AND w.week_start = @start
    AND w.week_end = @end;";

                await using (var assignmentsCountCmd = new MySqlCommand(assignmentsCountSql, connection, tx))
                {
                        assignmentsCountCmd.Parameters.AddWithValue("@serviceId", serviceId);
                        assignmentsCountCmd.Parameters.AddWithValue("@start", start);
                        assignmentsCountCmd.Parameters.AddWithValue("@end", end);
                        assignmentsCountFromDb = Convert.ToInt32(await assignmentsCountCmd.ExecuteScalarAsync() ?? 0);
                }

        const string countSql = @"
SELECT COUNT(*)
FROM planning_versions
WHERE service_id = @serviceId
  AND period_start = @start
  AND period_end = @end;";

        await using var countCmd = new MySqlCommand(countSql, connection, tx);
        countCmd.Parameters.AddWithValue("@serviceId", serviceId);
        countCmd.Parameters.AddWithValue("@start", start);
        countCmd.Parameters.AddWithValue("@end", end);
        var existingCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync() ?? 0);

        var versionId = Guid.NewGuid().ToString();
        var versionLabel = $"V{existingCount + 1:00}";
        var effectiveAuthor = string.IsNullOrWhiteSpace(author) ? "Gestionnaire" : author;
        var assignmentsCount = assignmentsCountOverride ?? assignmentsCountFromDb;
        var fileName = $"planning-{serviceId}-{start:yyyyMMdd}-{versionLabel.ToLowerInvariant()}.json";

        const string insertSql = @"
INSERT INTO planning_versions (
    version_id,
    service_id,
    service_name,
    period_start,
    period_end,
    version_label,
    author_name,
    assignments_count,
    version_comment,
    created_at)
VALUES (
    @versionId,
    @serviceId,
    @serviceName,
    @periodStart,
    @periodEnd,
    @versionLabel,
    @authorName,
    @assignmentsCount,
    @versionComment,
    @createdAt);";

        await using var cmd = new MySqlCommand(insertSql, connection, tx);
        cmd.Parameters.AddWithValue("@versionId", versionId);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@serviceName", normalizedServiceName);
        cmd.Parameters.AddWithValue("@periodStart", start);
        cmd.Parameters.AddWithValue("@periodEnd", end);
        cmd.Parameters.AddWithValue("@versionLabel", versionLabel);
        cmd.Parameters.AddWithValue("@authorName", effectiveAuthor);
        cmd.Parameters.AddWithValue("@assignmentsCount", assignmentsCount);
        cmd.Parameters.AddWithValue("@versionComment", comment ?? string.Empty);
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();

        await tx.CommitAsync();
        return (versionId, fileName);
    }

    /// <summary>Overload accepting a request object (called from Program.cs)</summary>
    public Task<(string VersionId, string FileName)> SaveVersionAsync(SavePlanningVersionRequest request)
        => SaveVersionAsync(
            request.ServiceId,
            request.ServiceName ?? request.ServiceId,
            request.WeekStart,
            request.WeekEnd,
            request.Comment ?? string.Empty,
            request.Author,
            request.AssignmentsCount <= 0 ? null : request.AssignmentsCount);

    public async Task<IReadOnlyList<PlanningVersion>> GetVersionsAsync(string serviceId, DateTime weekStart, DateTime? weekEnd = null)
    {
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT
    pv.version_id,
        pv.service_id,
        pv.period_start,
        pv.period_end,
        pv.version_label,
        pv.author_name,
        pv.assignments_count,
        pv.version_comment,
    pv.created_at
FROM planning_versions pv
WHERE pv.service_id = @serviceId
    AND pv.period_start = @start
    AND pv.period_end = @end
ORDER BY pv.created_at DESC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@start", start);
        cmd.Parameters.AddWithValue("@end", end);

        await using var reader = await cmd.ExecuteReaderAsync();
        var versions = new List<PlanningVersion>();

        while (await reader.ReadAsync())
        {
            var rowVersionId = reader.GetString("version_id");
            var rowPeriodStart = reader.GetDateTime("period_start");
            var rowVersionLabel = reader.GetString("version_label");
            versions.Add(new PlanningVersion
            {
                Id = rowVersionId,
                VersionId = rowVersionId,
                ServiceId = reader.GetString("service_id"),
                PeriodStart = rowPeriodStart,
                PeriodEnd = reader.GetDateTime("period_end"),
                VersionLabel = rowVersionLabel,
                Author = reader.IsDBNull(reader.GetOrdinal("author_name")) ? "Gestionnaire" : reader.GetString("author_name"),
                AssignmentsCount = reader.IsDBNull(reader.GetOrdinal("assignments_count")) ? 0 : reader.GetInt32("assignments_count"),
                Comment = reader.IsDBNull(reader.GetOrdinal("version_comment")) ? string.Empty : reader.GetString("version_comment"),
                FileName = $"planning-{serviceId}-{rowPeriodStart:yyyyMMdd}-{rowVersionLabel.ToLowerInvariant()}.json",
                CreatedAt = reader.GetDateTime("created_at")
            });
        }

        return versions;
    }

    public async Task<int> GetVersionCountAsync(string serviceId, DateTime weekStart, DateTime? weekEnd = null)
    {
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT COUNT(*) as count
FROM planning_versions
WHERE service_id = @serviceId
    AND period_start = @start
    AND period_end = @end;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@start", start);
        cmd.Parameters.AddWithValue("@end", end);

        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(result ?? 0);
    }
}
