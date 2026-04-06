using MySqlConnector;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    public async Task<string> SubmitPlanningToWorkflowAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd)
    {
        var normalizedServiceName = string.IsNullOrWhiteSpace(serviceName) ? serviceId : serviceName;
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        // EnsureWeek crée la ligne dans planning_weeks si elle n'existe pas
        var weekId = await EnsureWeekAsync(connection, serviceId, normalizedServiceName, start, end, tx);

        await tx.CommitAsync();
        return weekId;
    }

    public async Task UpdatePlanningWorkflowStatusAsync(string serviceId, DateTime weekStart, DateTime? weekEnd, string status)
    {
        // Cette méthode est conservée pour compatibilité
        // Le statut réel est géré par PlanningStore.WorkflowExecution.cs via la colonne 'statut'
        _ = status; // suppress unused warning
        var (start, end) = NormalizePeriod(weekStart, weekEnd);
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await FindWeekIdAsync(connection, serviceId, start, end); // juste vérifier que la semaine existe
    }

    public async Task<WeekInfo?> GetWeekInfoAsync(string serviceId, DateTime weekStart, DateTime? weekEnd = null)
    {
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT
    id,
    service_id,
    service_name,
    week_start,
    week_end,
    COALESCE(NULLIF(statut, 'BROUILLON'), workflow_status) AS workflow_status,
    workflow_submitted_at,
    created_at
FROM planning_weeks
WHERE service_id = @serviceId
  AND week_start = @start
  AND week_end = @end
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@start", start);
        cmd.Parameters.AddWithValue("@end", end);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return new WeekInfo(
            Id: reader.GetString("id"),
            ServiceId: reader.GetString("service_id"),
            ServiceName: reader.GetString("service_name"),
            WeekStart: reader.GetDateTime("week_start"),
            WeekEnd: reader.GetDateTime("week_end"),
            WorkflowStatus: reader.IsDBNull(reader.GetOrdinal("workflow_status")) ? null : reader.GetString("workflow_status"),
            WorkflowSubmittedAt: reader.IsDBNull(reader.GetOrdinal("workflow_submitted_at")) ? null : reader.GetDateTime("workflow_submitted_at"),
            CreatedAt: reader.GetDateTime("created_at")
        );
    }
}

public sealed record WeekInfo(
    string Id,
    string ServiceId,
    string ServiceName,
    DateTime WeekStart,
    DateTime WeekEnd,
    string? WorkflowStatus,
    DateTime? WorkflowSubmittedAt,
    DateTime CreatedAt
);
