using System.Globalization;
using System.Text;
using Microsoft.Extensions.Configuration;
using MySqlConnector;

var config = new ConfigurationBuilder()
    .SetBasePath(Path.Combine(Directory.GetCurrentDirectory(), "Backend"))
    .AddJsonFile("appsettings.json", optional: false)
    .Build();

var connStr = config.GetConnectionString("ClinisysDb")
    ?? throw new InvalidOperationException("Connection string 'ClinisysDb' missing.");

static string NormalizeRole(string? raw)
{
    if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
    var lower = raw.Trim().ToLowerInvariant();
    var normalized = lower.Normalize(NormalizationForm.FormD);
    var sb = new StringBuilder();
    foreach (var c in normalized)
    {
        if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            sb.Append(c);
    }

    return sb.ToString()
        .Normalize(NormalizationForm.FormC)
        .Replace("_", " ")
        .Replace("-", " ")
        .Replace("  ", " ")
        .Trim();
}

var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "superadmin",
    "chef de pole",
    "chef de service",
    "staff"
};

static string CanonicalRole(string normalized)
{
    return normalized switch
    {
        "superadmin" or "super admin" => "SUPERADMIN",
        "chef de pole" or "chef pole" => "CHEF DE POLE",
        "chef de service" or "chef service" => "CHEF DE SERVICE",
        "staff" => "STAFF",
        _ => "STAFF"
    };
}

await using var conn = new MySqlConnection(connStr);
await conn.OpenAsync();
await using var tx = await conn.BeginTransactionAsync();

// Backup roles to a timestamped file
var backupPath = Path.Combine(Directory.GetCurrentDirectory(), $"role-backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}.txt");
await using (var cmd = new MySqlCommand("SELECT id, role_name, role_type FROM rbac_roles ORDER BY role_name;", conn, tx))
await using (var reader = await cmd.ExecuteReaderAsync())
await using (var writer = new StreamWriter(backupPath, false, Encoding.UTF8))
{
    await writer.WriteLineAsync("id\trole_name\trole_type");
    while (await reader.ReadAsync())
    {
        var id = reader["id"]?.ToString() ?? "";
        var roleName = reader["role_name"]?.ToString() ?? "";
        var roleType = reader["role_type"]?.ToString() ?? "";
        await writer.WriteLineAsync($"{id}\t{roleName}\t{roleType}");
    }
}

// Determine deletions
var toDelete = new List<(string Id, string RoleName)>();
await using (var cmd = new MySqlCommand("SELECT id, role_name FROM rbac_roles;", conn, tx))
await using (var reader = await cmd.ExecuteReaderAsync())
{
    while (await reader.ReadAsync())
    {
        var id = reader["id"]?.ToString() ?? "";
        var roleName = reader["role_name"]?.ToString() ?? "";
        var normalized = NormalizeRole(roleName);

        var keep = allowed.Contains(normalized)
            || normalized == "super admin"
            || normalized == "chef pole"
            || normalized == "chef service";

        if (!keep)
            toDelete.Add((id, roleName));
    }
}

foreach (var role in toDelete)
{
    await using var del = new MySqlCommand("DELETE FROM rbac_roles WHERE id = @id;", conn, tx);
    del.Parameters.AddWithValue("@id", role.Id);
    await del.ExecuteNonQueryAsync();
}

// Canonicalize kept role names in rbac_roles
var roleRenames = new List<(string Id, string Canonical)>();
await using (var cmd = new MySqlCommand("SELECT id, role_name FROM rbac_roles;", conn, tx))
await using (var reader = await cmd.ExecuteReaderAsync())
{
    while (await reader.ReadAsync())
    {
        var id = reader["id"]?.ToString() ?? "";
        var roleName = reader["role_name"]?.ToString() ?? "";
        var canonical = CanonicalRole(NormalizeRole(roleName));
        if (!string.Equals(roleName, canonical, StringComparison.Ordinal))
            roleRenames.Add((id, canonical));
    }
}

foreach (var rr in roleRenames)
{
    await using var up = new MySqlCommand("UPDATE rbac_roles SET role_name = @name WHERE id = @id;", conn, tx);
    up.Parameters.AddWithValue("@name", rr.Canonical);
    up.Parameters.AddWithValue("@id", rr.Id);
    await up.ExecuteNonQueryAsync();
}

// Normalize staff role labels to allowed set (staff_users)
var updates = new List<(int Id, string NewRole)>();
await using (var cmd = new MySqlCommand("SELECT id, role FROM staff_users;", conn, tx))
await using (var reader = await cmd.ExecuteReaderAsync())
{
    while (await reader.ReadAsync())
    {
        var id = Convert.ToInt32(reader["id"]);
        var role = reader["role"]?.ToString() ?? "";
        var n = NormalizeRole(role);
        var newRole = CanonicalRole(n);

        if (!string.Equals(role, newRole, StringComparison.Ordinal))
            updates.Add((id, newRole));
    }
}

// Normalize utilisateurs.role as well (legacy structure table)
var updatesUtilisateurs = new List<(int Id, string NewRole)>();
await using (var cmd = new MySqlCommand("SELECT id, role FROM utilisateurs;", conn, tx))
await using (var reader = await cmd.ExecuteReaderAsync())
{
    while (await reader.ReadAsync())
    {
        var id = Convert.ToInt32(reader["id"]);
        var role = reader["role"]?.ToString() ?? "";
        var newRole = CanonicalRole(NormalizeRole(role));
        if (!string.Equals(role, newRole, StringComparison.Ordinal))
            updatesUtilisateurs.Add((id, newRole));
    }
}

foreach (var u in updatesUtilisateurs)
{
    await using var up = new MySqlCommand("UPDATE utilisateurs SET role = @role WHERE id = @id;", conn, tx);
    up.Parameters.AddWithValue("@role", u.NewRole);
    up.Parameters.AddWithValue("@id", u.Id);
    await up.ExecuteNonQueryAsync();
}

foreach (var u in updates)
{
    await using var up = new MySqlCommand("UPDATE staff_users SET role = @role WHERE id = @id;", conn, tx);
    up.Parameters.AddWithValue("@role", u.NewRole);
    up.Parameters.AddWithValue("@id", u.Id);
    await up.ExecuteNonQueryAsync();
}

await tx.CommitAsync();

Console.WriteLine($"Backup file: {backupPath}");
Console.WriteLine($"Deleted roles from rbac_roles: {toDelete.Count}");
Console.WriteLine($"Canonicalized role names in rbac_roles: {roleRenames.Count}");
Console.WriteLine($"Updated staff_users.role: {updates.Count}");
Console.WriteLine($"Updated utilisateurs.role: {updatesUtilisateurs.Count}");
if (toDelete.Count > 0)
{
    Console.WriteLine("Removed role names:");
    foreach (var r in toDelete.OrderBy(r => r.RoleName, StringComparer.OrdinalIgnoreCase))
        Console.WriteLine($" - {r.RoleName} ({r.Id})");
}
Console.WriteLine("Done.");
