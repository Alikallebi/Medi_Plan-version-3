using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using MySqlConnector;

namespace Backend.Staff;

public sealed partial class StaffStore
{
    private readonly string _connectionString;
    private readonly IPasswordHasher<StaffUser> _passwordHasher;

    public StaffStore(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("ClinisysDb")
            ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
        _passwordHasher = new PasswordHasher<StaffUser>();
    }

    public async Task InitializeAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        await EnsureTablesAsync(connection);
        await EnsureExtendedUserColumnsAsync(connection);
        await EnsureProfileJsonColumnAsync(connection);
        await EnsureCompetencesTableAsync(connection);
        await EnsureDefaultPasswordsAsync(connection);
    }

    // ========== CRUD ==========

    public async Task<IReadOnlyList<object>> GetAllAsync(
        int? serviceId = null,
        int? poleId = null,
        int? equipeId = null,
        string? userId = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = @"
SELECT
    u.id,
    u.nom,
    u.prenom,
    u.email,
    u.tel,
    u.matricule,
    u.role,
    u.specialite,
    u.actif,
    u.equipe_id,
    u.service_id,
    COALESCE(u.pole_id, s.pole_id) AS pole_id,
    u.created_at,
    u.updated_at,
    s.nom AS service_nom,
    p.nom AS pole_nom,
    e.nom AS equipe_nom,
    u.civilite,
    u.date_naissance,
    u.telephone,
    u.mobile,
    u.email_personnel,
    u.adresse,
    u.code_postal,
    u.ville,
    u.username,
    u.expiration,
    u.force_change_password,
    u.two_factor_auth,
    u.roles_secondaires_json,
    u.date_embauche,
    u.diplome,
    u.universite,
    u.rpps,
    u.secu,
    u.competences_json,
    u.notif_email,
    u.notif_sms,
    u.notif_push,
    u.rappel_planning,
    u.notif_modifications,
    u.recevoir_rapports,
    u.photo,
    u.profile_json
FROM staff_users u
LEFT JOIN services s ON s.id = u.service_id
LEFT JOIN poles p ON p.id = COALESCE(u.pole_id, s.pole_id)
LEFT JOIN equipes e ON e.id = u.equipe_id
WHERE 1=1";

        var conditions = new List<string>();
        if (serviceId.HasValue) conditions.Add("u.service_id = @serviceId");
        if (poleId.HasValue) conditions.Add("COALESCE(u.pole_id, s.pole_id) = @poleId");
        if (equipeId.HasValue) conditions.Add("u.equipe_id = @equipeId");
        if (!string.IsNullOrWhiteSpace(userId) && int.TryParse(userId, out var uid)) conditions.Add("u.id = @userId");

        if (conditions.Count > 0)
            sql += " AND " + string.Join(" AND ", conditions);

        sql += " ORDER BY u.nom, u.prenom;";

        await using var cmd = new MySqlCommand(sql, connection);
        if (serviceId.HasValue) cmd.Parameters.AddWithValue("@serviceId", serviceId.Value);
        if (poleId.HasValue) cmd.Parameters.AddWithValue("@poleId", poleId.Value);
        if (equipeId.HasValue) cmd.Parameters.AddWithValue("@equipeId", equipeId.Value);
        if (!string.IsNullOrWhiteSpace(userId) && int.TryParse(userId, out var uid2)) cmd.Parameters.AddWithValue("@userId", uid2);

        var result = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(MapStaffRow(reader));
        }

        return result;
    }

    public async Task<object?> GetByIdAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT
    u.id,
    u.nom,
    u.prenom,
    u.email,
    u.tel,
    u.matricule,
    u.role,
    u.specialite,
    u.actif,
    u.equipe_id,
    u.service_id,
    COALESCE(u.pole_id, s.pole_id) AS pole_id,
    u.created_at,
    u.updated_at,
    s.nom AS service_nom,
    p.nom AS pole_nom,
    e.nom AS equipe_nom,
    u.civilite,
    u.date_naissance,
    u.telephone,
    u.mobile,
    u.email_personnel,
    u.adresse,
    u.code_postal,
    u.ville,
    u.username,
    u.expiration,
    u.force_change_password,
    u.two_factor_auth,
    u.roles_secondaires_json,
    u.date_embauche,
    u.diplome,
    u.universite,
    u.rpps,
    u.secu,
    u.competences_json,
    u.notif_email,
    u.notif_sms,
    u.notif_push,
    u.rappel_planning,
    u.notif_modifications,
    u.recevoir_rapports,
    u.photo,
    u.profile_json
FROM staff_users u
LEFT JOIN services s ON s.id = u.service_id
LEFT JOIN poles p ON p.id = COALESCE(u.pole_id, s.pole_id)
LEFT JOIN equipes e ON e.id = u.equipe_id
WHERE u.id = @id
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return MapStaffRow(reader);
    }

    public async Task<object?> CreateAsync(StaffUser payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        await ResolveAndApplyAssignmentsAsync(connection, payload);

        var now = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(payload.Password))
        {
            payload.Password = _passwordHasher.HashPassword(payload, payload.Password);
        }

        const string insertSql = @"
INSERT INTO staff_users (
    nom, prenom, email, tel, matricule, role, specialite, actif,
    equipe_id, service_id, pole_id,
    civilite, date_naissance, telephone, mobile, email_personnel,
    adresse, code_postal, ville, username, expiration,
    force_change_password, two_factor_auth, roles_secondaires_json,
    date_embauche, diplome, universite, rpps, secu, competences_json,
    notif_email, notif_sms, notif_push, rappel_planning,
    notif_modifications, recevoir_rapports, photo, profile_json, password,
    created_at, updated_at
) VALUES (
    @nom, @prenom, @email, @tel, @matricule, @role, @specialite, @actif,
    @equipeId, @serviceId, @poleId,
    @civilite, @dateNaissance, @telephone, @mobile, @emailPersonnel,
    @adresse, @codePostal, @ville, @username, @expiration,
    @forceChangePassword, @twoFactorAuth, @rolesSecondairesJson,
    @dateEmbauche, @diplome, @universite, @rpps, @secu, @competencesJson,
    @notifEmail, @notifSMS, @notifPush, @rappelPlanning,
    @notifModifications, @recevoirRapports, @photo, @profileJson, @password,
    @createdAt, @updatedAt
);
SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(insertSql, connection);
        BindStaffParams(cmd, payload, now, true);
        var newId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        await SyncUtilisateurCompetencesAsync(connection, newId, payload.Competences);
        return await GetByIdAsync(newId);
    }

    public async Task<object?> UpdateAsync(int id, StaffUser payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var existing = await GetByIdAsync(id);
        if (existing is null) return null;

        await ResolveAndApplyAssignmentsAsync(connection, payload);

        var now = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(payload.Password) && !IsLikelyIdentityHash(payload.Password))
        {
            payload.Password = _passwordHasher.HashPassword(payload, payload.Password);
        }

        const string updateSql = @"
UPDATE staff_users SET
    nom = @nom,
    prenom = @prenom,
    email = @email,
    tel = @tel,
    matricule = @matricule,
    role = @role,
    specialite = @specialite,
    actif = @actif,
    equipe_id = @equipeId,
    service_id = @serviceId,
    pole_id = @poleId,
    civilite = @civilite,
    date_naissance = @dateNaissance,
    telephone = @telephone,
    mobile = @mobile,
    email_personnel = @emailPersonnel,
    adresse = @adresse,
    code_postal = @codePostal,
    ville = @ville,
    username = @username,
    expiration = @expiration,
    force_change_password = @forceChangePassword,
    two_factor_auth = @twoFactorAuth,
    roles_secondaires_json = @rolesSecondairesJson,
    date_embauche = @dateEmbauche,
    diplome = @diplome,
    universite = @universite,
    rpps = @rpps,
    secu = @secu,
    competences_json = @competencesJson,
    notif_email = @notifEmail,
    notif_sms = @notifSMS,
    notif_push = @notifPush,
    rappel_planning = @rappelPlanning,
    notif_modifications = @notifModifications,
    recevoir_rapports = @recevoirRapports,
    photo = @photo,
    profile_json = @profileJson,
    password = CASE WHEN @password IS NOT NULL THEN @password ELSE password END,
    updated_at = @updatedAt
WHERE id = @id;";

        await using var cmd = new MySqlCommand(updateSql, connection);
        BindStaffParams(cmd, payload, now, false);
        cmd.Parameters.AddWithValue("@id", id);
        await cmd.ExecuteNonQueryAsync();
        await SyncUtilisateurCompetencesAsync(connection, id, payload.Competences);
        return await GetByIdAsync(id);
    }

    public async Task<object?> UpdatePhotoAsync(int id, string? photo)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string existsSql = "SELECT COUNT(1) FROM staff_users WHERE id = @id;";
        await using var existsCmd = new MySqlCommand(existsSql, connection);
        existsCmd.Parameters.AddWithValue("@id", id);
        var exists = Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0;
        if (!exists)
        {
            return null;
        }

        const string selectSql = "SELECT profile_json FROM staff_users WHERE id = @id LIMIT 1;";
        await using var selectCmd = new MySqlCommand(selectSql, connection);
        selectCmd.Parameters.AddWithValue("@id", id);
        var currentProfileJson = await selectCmd.ExecuteScalarAsync() as string;

        var profileDict = ParseProfileJson(currentProfileJson);
        profileDict["photo"] = string.IsNullOrWhiteSpace(photo) ? null : photo;

        var updatedProfileJson = JsonSerializer.Serialize(profileDict);
        const string updateSql = @"
UPDATE staff_users
SET photo = @photo,
    profile_json = @profileJson,
    updated_at = @updatedAt
WHERE id = @id;";

        await using var updateCmd = new MySqlCommand(updateSql, connection);
        updateCmd.Parameters.AddWithValue("@photo", (object?)profileDict["photo"] ?? DBNull.Value);
        updateCmd.Parameters.AddWithValue("@profileJson", updatedProfileJson);
        updateCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        updateCmd.Parameters.AddWithValue("@id", id);

        var affected = await updateCmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return null;
        }

        return await GetByIdAsync(id);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM staff_users WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<int> DeleteBackendCreatedUsersAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        // Supprimer les utilisateurs créés via l'API (avec matricule AUTO- ou backend-)
        const string sql = @"
DELETE FROM staff_users
WHERE matricule LIKE 'AUTO-%'
   OR matricule LIKE 'BACKEND-%'
   OR (created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND role = 'STAFF' AND email LIKE '%@test.%');";

        await using var cmd = new MySqlCommand(sql, connection);
        return await cmd.ExecuteNonQueryAsync();
    }

    public async Task<int> DeleteAllUsersAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM staff_users;";
        await using var cmd = new MySqlCommand(sql, connection);
        return await cmd.ExecuteNonQueryAsync();
    }

    public async Task<IReadOnlyList<object>> GetCompetencesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "SELECT id, nom FROM competences ORDER BY nom;";
        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();

        var result = new List<object>();
        while (await reader.ReadAsync())
        {
            result.Add(new
            {
                id = reader.GetInt32("id"),
                nom = reader.GetString("nom")
            });
        }

        return result;
    }

    // ========== PRIVATE HELPERS ==========

    private static Dictionary<string, object?> MapStaffRow(DbDataReader reader)
    {
        static object? SafeGet(DbDataReader r, string col)
        {
            try { return r.IsDBNull(r.GetOrdinal(col)) ? null : r.GetValue(r.GetOrdinal(col)); }
            catch { return null; }
        }

        static string? Str(DbDataReader r, string col) => SafeGet(r, col)?.ToString();
        static bool Bool(DbDataReader r, string col)
        {
            var v = SafeGet(r, col);
            if (v is bool b) return b;
            if (v is sbyte sb) return sb != 0;
            if (v is byte by) return by != 0;
            return v is not null && v.ToString() != "0";
        }
        static int? NullInt(DbDataReader r, string col)
        {
            var v = SafeGet(r, col);
            return v is null ? null : Convert.ToInt32(v);
        }

        var profileJson = Str(reader, "profile_json");
        var profileDict = ParseProfileJson(profileJson);
        var columnPhoto = Str(reader, "photo");
        var normalizedPhoto = string.IsNullOrWhiteSpace(columnPhoto)
            ? (profileDict.TryGetValue("photo", out var profilePhoto) ? profilePhoto?.ToString() : null)
            : columnPhoto;

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = SafeGet(reader, "id"),
            ["nom"] = Str(reader, "nom") ?? "",
            ["prenom"] = Str(reader, "prenom") ?? "",
            ["email"] = Str(reader, "email") ?? "",
            ["tel"] = Str(reader, "tel"),
            ["telephone"] = Str(reader, "telephone") ?? Str(reader, "tel"),
            ["matricule"] = Str(reader, "matricule"),
            ["role"] = Str(reader, "role") ?? "STAFF",
            ["specialite"] = Str(reader, "specialite"),
            ["actif"] = Bool(reader, "actif"),
            ["equipeId"] = NullInt(reader, "equipe_id"),
            ["equipe_id"] = NullInt(reader, "equipe_id"),
            ["serviceId"] = NullInt(reader, "service_id"),
            ["service_id"] = NullInt(reader, "service_id"),
            ["poleId"] = NullInt(reader, "pole_id"),
            ["pole_id"] = NullInt(reader, "pole_id"),
            ["createdAt"] = SafeGet(reader, "created_at"),
            ["updatedAt"] = SafeGet(reader, "updated_at"),
            ["service_nom"] = Str(reader, "service_nom"),
            ["serviceNom"] = Str(reader, "service_nom"),
            ["service"] = Str(reader, "service_nom") is string sn ? (object?)new Dictionary<string, object?> { ["nom"] = sn } : null,
            ["pole_nom"] = Str(reader, "pole_nom"),
            ["poleNom"] = Str(reader, "pole_nom"),
            ["equipe_nom"] = Str(reader, "equipe_nom"),
            ["equipeNom"] = Str(reader, "equipe_nom"),
            ["civilite"] = Str(reader, "civilite"),
            ["dateNaissance"] = SafeGet(reader, "date_naissance"),
            ["mobile"] = Str(reader, "mobile"),
            ["emailPersonnel"] = Str(reader, "email_personnel"),
            ["adresse"] = Str(reader, "adresse"),
            ["codePostal"] = Str(reader, "code_postal"),
            ["ville"] = Str(reader, "ville"),
            ["username"] = Str(reader, "username"),
            ["expiration"] = SafeGet(reader, "expiration"),
            ["forceChangePassword"] = Bool(reader, "force_change_password"),
            ["twoFactorAuth"] = Bool(reader, "two_factor_auth"),
            ["rolesSecondaires"] = DeserializeJsonList(Str(reader, "roles_secondaires_json")),
            ["dateEmbauche"] = SafeGet(reader, "date_embauche"),
            ["diplome"] = Str(reader, "diplome"),
            ["universite"] = Str(reader, "universite"),
            ["rpps"] = Str(reader, "rpps"),
            ["secu"] = Str(reader, "secu"),
            ["competences"] = DeserializeJsonList(Str(reader, "competences_json")),
            ["notifEmail"] = Bool(reader, "notif_email"),
            ["notifSMS"] = Bool(reader, "notif_sms"),
            ["notifPush"] = Bool(reader, "notif_push"),
            ["rappelPlanning"] = Str(reader, "rappel_planning"),
            ["notifModifications"] = Bool(reader, "notif_modifications"),
            ["recevoirRapports"] = Bool(reader, "recevoir_rapports"),
            ["photo"] = normalizedPhoto,
            ["fonction"] = profileDict.TryGetValue("fonction", out var f) ? f?.ToString() : Str(reader, "specialite")
        };
    }

    private static async Task EnsureTablesAsync(MySqlConnection connection)
    {
        const string createStaffTable = @"
CREATE TABLE IF NOT EXISTS staff_users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(120) NOT NULL DEFAULT '',
    prenom VARCHAR(120) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    tel VARCHAR(30) NULL,
    matricule VARCHAR(60) NULL,
    role VARCHAR(60) NOT NULL DEFAULT 'STAFF',
    specialite VARCHAR(120) NULL,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    equipe_id INT NULL,
    service_id INT NULL,
    photo LONGTEXT NULL,
    password VARCHAR(512) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        await using var cmd = new MySqlCommand(createStaffTable, connection);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task EnsureCompetencesTableAsync(MySqlConnection connection)
    {
        const string createSql = @"
CREATE TABLE IF NOT EXISTS competences (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        await using var createCmd = new MySqlCommand(createSql, connection);
        await createCmd.ExecuteNonQueryAsync();
        await SeedCompetencesAsync(connection);
    }

    private static async Task SyncUtilisateurCompetencesAsync(MySqlConnection connection, int utilisateurId, List<string>? competences)
    {
        const string deleteSql = "DELETE FROM utilisateur_competence WHERE utilisateur_id = @uid;";
        await using (var deleteCmd = new MySqlCommand(deleteSql, connection))
        {
            deleteCmd.Parameters.AddWithValue("@uid", utilisateurId);
            await deleteCmd.ExecuteNonQueryAsync();
        }

        if (competences is null || competences.Count == 0)
        {
            return;
        }

        const string findByIdSql = "SELECT id FROM competence WHERE id = @id LIMIT 1;";
        const string findByNameSql = "SELECT id FROM competence WHERE LOWER(nom) = LOWER(@nom) LIMIT 1;";
        const string insertSql = "INSERT IGNORE INTO utilisateur_competence (utilisateur_id, competence_id) VALUES (@uid, @cid);";

        foreach (var raw in competences.Select(item => item?.Trim()).Where(item => !string.IsNullOrWhiteSpace(item)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            int? competenceId = null;

            if (int.TryParse(raw, out var parsedId))
            {
                await using var findByIdCmd = new MySqlCommand(findByIdSql, connection);
                findByIdCmd.Parameters.AddWithValue("@id", parsedId);
                var foundById = await findByIdCmd.ExecuteScalarAsync();
                if (foundById is not null && foundById is not DBNull)
                {
                    competenceId = Convert.ToInt32(foundById);
                }
            }

            if (!competenceId.HasValue)
            {
                await using var findByNameCmd = new MySqlCommand(findByNameSql, connection);
                findByNameCmd.Parameters.AddWithValue("@nom", raw);
                var foundByName = await findByNameCmd.ExecuteScalarAsync();
                if (foundByName is not null && foundByName is not DBNull)
                {
                    competenceId = Convert.ToInt32(foundByName);
                }
            }

            if (!competenceId.HasValue)
            {
                continue;
            }

            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@uid", utilisateurId);
            insertCmd.Parameters.AddWithValue("@cid", competenceId.Value);
            await insertCmd.ExecuteNonQueryAsync();
        }
    }
}
