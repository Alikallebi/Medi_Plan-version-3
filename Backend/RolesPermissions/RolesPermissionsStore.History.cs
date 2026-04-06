using MySqlConnector;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Backend.RolesPermissions
{
    public partial class RolesPermissionsStore
    {
        public async Task<IReadOnlyList<RoleHistoryDto>> GetRoleHistoryAsync(string roleId)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            var history = new List<RoleHistoryDto>();
            const string sql = @"
SELECT id, event_type, event_description, event_date, event_by, event_icon
FROM rbac_role_history
WHERE role_id = @roleId
ORDER BY event_date DESC;";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@roleId", roleId);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                history.Add(new RoleHistoryDto
                {
                    Id = reader.GetString("id"),
                    Type = reader.GetString("event_type"),
                    Description = reader.GetString("event_description"),
                    Date = reader.GetDateTime("event_date"),
                    By = reader.GetString("event_by"),
                    Icon = reader.GetString("event_icon")
                });
            }

            return history;
        }

        private static async Task AddHistoryAsync(
            MySqlConnection connection,
            string roleId,
            string type,
            string description,
            string icon,
            string? by,
            MySqlTransaction? tx = null)
        {
            const string sql = @"
INSERT INTO rbac_role_history (id, role_id, event_type, event_description, event_icon, event_by, event_date)
VALUES (@id, @roleId, @type, @description, @icon, @by, @date);";

            await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
            cmd.Parameters.AddWithValue("@id", Guid.NewGuid().ToString("N"));
            cmd.Parameters.AddWithValue("@roleId", roleId);
            cmd.Parameters.AddWithValue("@type", type);
            cmd.Parameters.AddWithValue("@description", description);
            cmd.Parameters.AddWithValue("@icon", icon);
            cmd.Parameters.AddWithValue("@by", string.IsNullOrWhiteSpace(by) ? "Admin GTA" : by);
            cmd.Parameters.AddWithValue("@date", DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync();
        }
    }
}
