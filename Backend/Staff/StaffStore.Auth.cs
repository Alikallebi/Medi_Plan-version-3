using System;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using MySqlConnector;
using System.Threading.Tasks;
namespace Backend.Staff;

public sealed partial class StaffStore
{
    public async Task<LoginResponse?> LoginAsync(LoginRequest request)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT 
    u.id, 
    u.email, 
    u.role, 
    u.specialite, 
    u.password,
    u.service_id,
    COALESCE(u.pole_id, s.pole_id) AS pole_id,
    u.equipe_id,
    s.nom AS service_nom,
    p.nom AS pole_nom,
    e.nom AS equipe_nom
FROM staff_users u
LEFT JOIN services s ON u.service_id = s.id
LEFT JOIN poles p ON p.id = COALESCE(u.pole_id, s.pole_id)
LEFT JOIN equipes e ON u.equipe_id = e.id
WHERE u.email = @email AND u.actif = 1
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@email", request.Email);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        var savedPassword = IsDbNull(reader, "password") ? null : reader.GetString("password");
        if (string.IsNullOrWhiteSpace(savedPassword))
        {
            return null;
        }

        var verification = _passwordHasher.VerifyHashedPassword(
            new StaffUser { Id = reader.GetInt32("id"), Email = reader.GetString("email") },
            savedPassword,
            request.Password);

        if (verification == PasswordVerificationResult.Failed)
        {
            return null;
        }

        return new LoginResponse
        {
            Id = reader.GetInt32("id"),
            Email = reader.GetString("email"),
            Role = reader.GetString("role"),
            Specialite = IsDbNull(reader, "specialite") ? null : reader.GetString("specialite"),
            Token = Guid.NewGuid().ToString("N"),
            ServiceId = IsDbNull(reader, "service_id") ? null : reader.GetInt32("service_id"),
            ServiceNom = IsDbNull(reader, "service_nom") ? null : reader.GetString("service_nom"),
            PoleId = IsDbNull(reader, "pole_id") ? null : reader.GetInt32("pole_id"),
            PoleNom = IsDbNull(reader, "pole_nom") ? null : reader.GetString("pole_nom"),
            EquipeId = IsDbNull(reader, "equipe_id") ? null : reader.GetInt32("equipe_id"),
            EquipeNom = IsDbNull(reader, "equipe_nom") ? null : reader.GetString("equipe_nom")
        };
    }

    public async Task<object> RegisterAsync(JsonElement payload)
    {
        var nom = GetJsonString(payload, "nom") ?? "Utilisateur";
        var prenom = GetJsonString(payload, "prenom") ?? string.Empty;
        var email = GetJsonString(payload, "email") ?? throw new InvalidOperationException("Email manquant");
        var password = GetJsonString(payload, "password") ?? throw new InvalidOperationException("Mot de passe manquant");
        var confirmPassword = GetJsonString(payload, "confirmPassword") ?? GetJsonString(payload, "confirm_password");
        var tel = GetJsonString(payload, "tel");
        var specialite = GetJsonString(payload, "specialite");

        if (string.IsNullOrWhiteSpace(confirmPassword) || !string.Equals(password, confirmPassword, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Les mots de passe ne correspondent pas");
        }

        var created = await CreateAsync(new StaffUser
        {
            Nom = nom,
            Prenom = prenom,
            Email = email,
            Password = password,
            Tel = tel,
            Specialite = specialite,
            Role = "STAFF",
            Actif = true
        });

        return created;
    }

    public async Task<bool> ResetPasswordAsync(JsonElement payload)
    {
        var email = GetJsonString(payload, "email");
        var password = GetJsonString(payload, "password");

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            return false;
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
UPDATE staff_users
SET password = @password, updated_at = @updatedAt
WHERE email = @email;";

        await using var cmd = new MySqlCommand(sql, connection);
        var hashedPassword = _passwordHasher.HashPassword(new StaffUser { Email = email }, password);
        cmd.Parameters.AddWithValue("@password", hashedPassword);
        cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@email", email);

        return await cmd.ExecuteNonQueryAsync() > 0;
    }
}
