using MySqlConnector;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Backend.Competence;

public sealed class CompetenceStore
{
    private readonly string _connectionString;

    public CompetenceStore(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("ClinisysDb")
            ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
    }

    public async Task InitializeAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string createCompetenceSql = @"
CREATE TABLE IF NOT EXISTS competence (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    domaine VARCHAR(100) NOT NULL,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        const string createPosteCompetenceSql = @"
CREATE TABLE IF NOT EXISTS poste_competence (
    poste_id INT NOT NULL,
    competence_id INT NOT NULL,
    PRIMARY KEY (poste_id, competence_id),
    CONSTRAINT fk_poste_competence_poste FOREIGN KEY (poste_id) REFERENCES postes(id) ON DELETE CASCADE,
    CONSTRAINT fk_poste_competence_competence FOREIGN KEY (competence_id) REFERENCES competence(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        const string createUtilisateurCompetenceSql = @"
CREATE TABLE IF NOT EXISTS utilisateur_competence (
    utilisateur_id INT NOT NULL,
    competence_id INT NOT NULL,
    PRIMARY KEY (utilisateur_id, competence_id),
    CONSTRAINT fk_utilisateur_competence_user FOREIGN KEY (utilisateur_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_utilisateur_competence_competence FOREIGN KEY (competence_id) REFERENCES competence(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        await using (var cmd = new MySqlCommand(createCompetenceSql, connection))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        await EnsureCompetenceColumnsAsync(connection);

        await using (var cmd = new MySqlCommand(createPosteCompetenceSql, connection))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = new MySqlCommand(createUtilisateurCompetenceSql, connection))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        await EnsureForeignKeysToCompetenceAsync(connection);

        await SeedCompetencesAsync(connection);
    }

    public async Task<IReadOnlyList<CompetenceItem>> GetActiveCompetencesAsync()
    {
        var result = new List<CompetenceItem>();
        await LoadActiveCompetencesFromTableAsync("competence", result, legacyTable: false);
        await LoadActiveCompetencesFromTableAsync("competences", result, legacyTable: true);

        return result
            .GroupBy(item => $"{item.Domaine}::{item.Nom}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(item => item.Domaine, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Nom, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<IReadOnlyList<string>> GetDomainesAsync()
    {
        var domaines = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        await LoadDomainesFromTableAsync("competence", domaines);
        if (await LegacyCompetenceTableHasRowsAsync())
        {
            domaines.Add("Général");
        }

        return domaines
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<CompetenceItem> CreateCompetenceAsync(CompetenceUpsertRequest request)
    {
        var nom = request.Nom.Trim();
        if (string.IsNullOrWhiteSpace(nom))
        {
            throw new InvalidOperationException("Le nom de la compétence est requis.");
        }

        var domaine = string.IsNullOrWhiteSpace(request.Domaine) ? "Général" : request.Domaine.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        var isActive = request.IsActive ?? true;

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
INSERT INTO competence (nom, domaine, description, is_active)
VALUES (@nom, @domaine, @description, @isActive);";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@nom", nom);
        cmd.Parameters.AddWithValue("@domaine", domaine);
        cmd.Parameters.AddWithValue("@description", (object?)description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@isActive", isActive);
        await cmd.ExecuteNonQueryAsync();

        var createdId = Convert.ToInt32(cmd.LastInsertedId);
        var created = await GetCompetenceByIdAsync(createdId);
        if (created is null)
        {
            throw new InvalidOperationException("La compétence a été créée mais n'a pas pu être relue depuis la base.");
        }

        return created;
    }

    public async Task<CompetenceItem?> UpdateCompetenceAsync(int id, CompetenceUpsertRequest request)
    {
        var nom = request.Nom.Trim();
        if (string.IsNullOrWhiteSpace(nom))
        {
            throw new InvalidOperationException("Le nom de la compétence est requis.");
        }

        var domaine = string.IsNullOrWhiteSpace(request.Domaine) ? "Général" : request.Domaine.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        var isActive = request.IsActive ?? true;

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
UPDATE competence
SET nom = @nom,
    domaine = @domaine,
    description = @description,
    is_active = @isActive,
    updated_at = CURRENT_TIMESTAMP
WHERE id = @id;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@nom", nom);
        cmd.Parameters.AddWithValue("@domaine", domaine);
        cmd.Parameters.AddWithValue("@description", (object?)description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@isActive", isActive);

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return null;
        }

        return await GetCompetenceByIdAsync(id);
    }

    public async Task<bool> DeleteCompetenceAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM competence WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);

        var affected = await cmd.ExecuteNonQueryAsync();
        return affected > 0;
    }

    public async Task<IReadOnlyList<PlanningAvailableUserItem>> GetUtilisateursDisponiblesForPosteAsync(int posteId)
    {
        var requiredCompetenceIds = await GetRequiredCompetenceIdsForPosteAsync(posteId);
        if (requiredCompetenceIds.Count == 0)
        {
            return await GetAllUsersWithCompetencesAsync();
        }

        var requiredCompetenceCandidates = await GetRequiredCompetenceCandidatesByIdsAsync(requiredCompetenceIds);
        if (requiredCompetenceCandidates.Count == 0)
        {
            return await GetAllUsersWithCompetencesAsync();
        }

        var competenceNamesById = await GetCompetenceNamesByIdAsync();

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = @"
SELECT
    u.id,
    u.nom,
    u.prenom,
    u.competences_json,
    GROUP_CONCAT(DISTINCT c_all.nom ORDER BY c_all.nom SEPARATOR '|') AS linked_competences
FROM staff_users u
LEFT JOIN utilisateur_competence uc_all ON uc_all.utilisateur_id = u.id
LEFT JOIN competence c_all ON c_all.id = uc_all.competence_id
WHERE u.actif = 1
GROUP BY u.id, u.nom, u.prenom
ORDER BY u.nom, u.prenom;";

        await using var cmd = new MySqlCommand(sql, connection);

        await using var reader = await cmd.ExecuteReaderAsync();
        var users = new List<PlanningAvailableUserItem>();
        while (await reader.ReadAsync())
        {
            var linkedCompetences = SplitCompetences(reader, "linked_competences");
            var legacyCompetences = ParseLegacyCompetences(reader, "competences_json", competenceNamesById);
            var mergedCompetences = linkedCompetences
                .Concat(legacyCompetences)
                .Select(item => item.Trim())
                .Where(item => item.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var isEligible = requiredCompetenceCandidates.All(candidates =>
                candidates.Any(required => mergedCompetences.Any(userComp => AreCompetencesEquivalent(userComp, required))));

            if (!isEligible)
            {
                continue;
            }

            users.Add(new PlanningAvailableUserItem
            {
                Id = reader.GetInt32("id"),
                Nom = reader.GetString("nom"),
                Prenom = reader.GetString("prenom"),
                Competences = mergedCompetences
            });
        }

        return users;
    }

    private async Task<IReadOnlyList<IReadOnlyList<string>>> GetRequiredCompetenceCandidatesByIdsAsync(IReadOnlyList<int> ids)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        var namesById = await GetCompetenceNamesByIdAsync();
        var result = new List<IReadOnlyList<string>>();
        foreach (var id in ids.Distinct())
        {
            if (!namesById.TryGetValue(id, out var names) || names.Count == 0)
            {
                continue;
            }

            result.Add(names);
        }

        return result;
    }

    private async Task<Dictionary<int, List<string>>> GetCompetenceNamesByIdAsync()
    {
        var result = new Dictionary<int, HashSet<string>>();

        await LoadCompetenceNamesFromTableAsync("competence", result);
        await LoadCompetenceNamesFromTableAsync("competences", result);

        return result.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value
                .Select(item => item.Trim())
                .Where(item => item.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList());
    }

    private async Task LoadCompetenceNamesFromTableAsync(string tableName, Dictionary<int, HashSet<string>> namesById)
    {
        if (tableName != "competence" && tableName != "competences")
        {
            return;
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = $@"
SELECT id, nom
FROM {tableName};";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var id = reader.GetInt32("id");
            var nom = reader.GetString("nom").Trim();
            if (nom.Length == 0)
            {
                continue;
            }

            if (!namesById.TryGetValue(id, out var bucket))
            {
                bucket = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                namesById[id] = bucket;
            }

            bucket.Add(nom);
        }
    }

    private async Task<IReadOnlyList<int>> GetRequiredCompetenceIdsForPosteAsync(int posteId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT competence_id
FROM poste_competence
WHERE poste_id = @posteId;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@posteId", posteId);
        var ids = new List<int>();
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ids.Add(reader.GetInt32("competence_id"));
            }
        }

        if (ids.Count > 0)
        {
            return ids.Distinct().ToList();
        }

        const string fallbackSql = @"
SELECT competences_requises
FROM postes
WHERE id = @posteId
LIMIT 1;";

        await using var fallbackCmd = new MySqlCommand(fallbackSql, connection);
        fallbackCmd.Parameters.AddWithValue("@posteId", posteId);
        var raw = await fallbackCmd.ExecuteScalarAsync();
        if (raw is null || raw is DBNull)
        {
            return [];
        }

        var json = raw.ToString();
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var fallbackIds = new List<int>();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var numId))
                {
                    fallbackIds.Add(numId);
                    continue;
                }

                if (item.ValueKind == JsonValueKind.String && int.TryParse(item.GetString(), out var strId))
                {
                    fallbackIds.Add(strId);
                }
            }

            return fallbackIds.Distinct().ToList();
        }
        catch
        {
            return [];
        }
    }

    private async Task<IReadOnlyList<PlanningAvailableUserItem>> GetAllUsersWithCompetencesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT
    u.id,
    u.nom,
    u.prenom,
    GROUP_CONCAT(DISTINCT c.nom ORDER BY c.nom SEPARATOR '|') AS competences
FROM staff_users u
LEFT JOIN utilisateur_competence uc ON uc.utilisateur_id = u.id
LEFT JOIN competence c ON c.id = uc.competence_id
WHERE u.actif = 1
GROUP BY u.id, u.nom, u.prenom
ORDER BY u.nom, u.prenom;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();

        var users = new List<PlanningAvailableUserItem>();
        while (await reader.ReadAsync())
        {
            users.Add(new PlanningAvailableUserItem
            {
                Id = reader.GetInt32("id"),
                Nom = reader.GetString("nom"),
                Prenom = reader.GetString("prenom"),
                Competences = SplitCompetences(reader, "competences")
            });
        }

        return users;
    }

    private static List<string> SplitCompetences(MySqlDataReader reader, string column)
    {
        if (reader.IsDBNull(reader.GetOrdinal(column)))
        {
            return [];
        }

        return reader.GetString(column)
            .Split('|', StringSplitOptions.RemoveEmptyEntries)
            .Select(item => item.Trim())
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static List<string> ParseLegacyCompetences(MySqlDataReader reader, string column, IReadOnlyDictionary<int, List<string>> competenceNamesById)
    {
        if (reader.IsDBNull(reader.GetOrdinal(column)))
        {
            return [];
        }

        var raw = reader.GetString(column);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var values = new List<string>();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    var value = item.GetString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        values.Add(value);
                    }
                    continue;
                }

                if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var id) && competenceNamesById.TryGetValue(id, out var competenceNames))
                {
                    values.AddRange(competenceNames);
                }
            }

            return values
                .Select(v => v.Trim())
                .Where(v => v.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static bool AreCompetencesEquivalent(string userCompetence, string requiredCompetence)
    {
        var a = NormalizeCompetence(userCompetence);
        var b = NormalizeCompetence(requiredCompetence);

        if (a.Length == 0 || b.Length == 0)
        {
            return false;
        }

        return a.Equals(b, StringComparison.Ordinal)
            || a.Contains(b, StringComparison.Ordinal)
            || b.Contains(a, StringComparison.Ordinal);
    }

    private static string NormalizeCompetence(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);

        foreach (var c in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(c) || char.IsWhiteSpace(c))
            {
                sb.Append(char.ToLowerInvariant(c));
            }
        }

        return string.Join(' ', sb
            .ToString()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private static async Task SeedCompetencesAsync(MySqlConnection connection)
    {
        var seeds = new[]
        {
            new { Nom = "Chirurgie générale", Domaine = "Chirurgie" },
            new { Nom = "Médecine d'urgence", Domaine = "Urgences" },
            new { Nom = "Soins intensifs", Domaine = "Soins infirmiers" },
            new { Nom = "Anesthésie-Réanimation", Domaine = "Chirurgie" },
            new { Nom = "Radiologie", Domaine = "Imagerie & Diagnostic" },
            new { Nom = "Triage infirmier", Domaine = "Urgences" },
            new { Nom = "Prélèvement sanguin", Domaine = "Biologie" },
            new { Nom = "Lecture ECG", Domaine = "Cardiologie" },
            new { Nom = "Hygiène hospitalière", Domaine = "Qualité & Sécurité" },
            new { Nom = "Gestion des urgences vitales", Domaine = "Urgences" }
        };

        const string existsSql = "SELECT COUNT(*) FROM competence WHERE nom = @nom;";
        const string insertSql = "INSERT INTO competence (nom, domaine, is_active) VALUES (@nom, @domaine, 1);";

        foreach (var seed in seeds)
        {
            await using var existsCmd = new MySqlCommand(existsSql, connection);
            existsCmd.Parameters.AddWithValue("@nom", seed.Nom);
            var exists = Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0;
            if (exists)
            {
                continue;
            }

            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@nom", seed.Nom);
            insertCmd.Parameters.AddWithValue("@domaine", seed.Domaine);
            await insertCmd.ExecuteNonQueryAsync();
        }
    }

    private async Task LoadActiveCompetencesFromTableAsync(string tableName, List<CompetenceItem> result, bool legacyTable)
    {
        if (tableName != "competence" && tableName != "competences")
        {
            return;
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        if (legacyTable)
        {
            var legacySql = $@"
SELECT id, nom
FROM {tableName};";

            try
            {
                await using var legacyCmd = new MySqlCommand(legacySql, connection);
                await using var legacyReader = await legacyCmd.ExecuteReaderAsync();
                while (await legacyReader.ReadAsync())
                {
                    result.Add(new CompetenceItem
                    {
                        Id = legacyReader.GetInt32("id"),
                        Nom = legacyReader.GetString("nom"),
                        Domaine = "Général",
                        IsActive = true
                    });
                }
            }
            catch (MySqlException)
            {
                return;
            }

            return;
        }

        const string sql = @"
SELECT id, nom, domaine, description, is_active, updated_at
FROM competence
WHERE is_active = 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new CompetenceItem
            {
                Id = reader.GetInt32("id"),
                Nom = reader.GetString("nom"),
                Domaine = reader.GetString("domaine"),
                Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description"),
                IsActive = reader.GetBoolean("is_active"),
                UpdatedAt = reader.IsDBNull(reader.GetOrdinal("updated_at")) ? null : reader.GetDateTime("updated_at")
            });
        }
    }

    private async Task LoadDomainesFromTableAsync(string tableName, HashSet<string> domaines)
    {
        if (tableName != "competence" && tableName != "competences")
        {
            return;
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = $@"
SELECT DISTINCT domaine
FROM {tableName}
WHERE is_active = 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            domaines.Add(reader.GetString("domaine"));
        }
    }

    private async Task<bool> LegacyCompetenceTableHasRowsAsync()
    {
        try
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            const string sql = "SELECT COUNT(*) FROM competences;";
            await using var cmd = new MySqlCommand(sql, connection);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch (MySqlException)
        {
            return false;
        }
    }

    private async Task EnsureCompetenceColumnsAsync(MySqlConnection connection)
    {
        await EnsureColumnAsync(connection, "competence", "domaine", "VARCHAR(100) NOT NULL DEFAULT 'Général'");
        await EnsureColumnAsync(connection, "competence", "description", "TEXT NULL");
        await EnsureColumnAsync(connection, "competence", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
        await EnsureColumnAsync(connection, "competence", "updated_at", "DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

        const string normalizeSql = @"
UPDATE competence
SET domaine = 'Général'
WHERE domaine IS NULL OR domaine = '';

UPDATE competence
SET is_active = 1
WHERE is_active IS NULL;";

        await using var normalizeCmd = new MySqlCommand(normalizeSql, connection);
        await normalizeCmd.ExecuteNonQueryAsync();
    }

    private async Task EnsureForeignKeysToCompetenceAsync(MySqlConnection connection)
    {
        await EnsureForeignKeyToCompetenceAsync(
            connection,
            tableName: "poste_competence",
            constraintName: "fk_poste_competence_competence",
            keyColumn: "competence_id");

        await EnsureForeignKeyToCompetenceAsync(
            connection,
            tableName: "utilisateur_competence",
            constraintName: "fk_utilisateur_competence_competence",
            keyColumn: "competence_id");
    }

    private async Task EnsureForeignKeyToCompetenceAsync(
        MySqlConnection connection,
        string tableName,
        string constraintName,
        string keyColumn)
    {
        const string fkSql = @"
SELECT REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = @tableName
  AND CONSTRAINT_NAME = @constraintName
LIMIT 1;";

        string? referencedTable;
        await using (var fkCmd = new MySqlCommand(fkSql, connection))
        {
            fkCmd.Parameters.AddWithValue("@tableName", tableName);
            fkCmd.Parameters.AddWithValue("@constraintName", constraintName);
            referencedTable = (await fkCmd.ExecuteScalarAsync())?.ToString();
        }

        if (string.Equals(referencedTable, "competence", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(referencedTable))
        {
            var dropSql = $"ALTER TABLE {tableName} DROP FOREIGN KEY {constraintName};";
            await using var dropCmd = new MySqlCommand(dropSql, connection);
            await dropCmd.ExecuteNonQueryAsync();
        }

        if (await TableExistsAsync(connection, "competences"))
        {
            var remapSql = $@"
UPDATE {tableName} t
JOIN competences oldc ON oldc.id = t.{keyColumn}
SET t.{keyColumn} = (
    SELECT MIN(n.id)
    FROM competence n
    WHERE LOWER(TRIM(n.nom)) = LOWER(TRIM(oldc.nom))
)
WHERE EXISTS (
    SELECT 1
    FROM competence n2
    WHERE LOWER(TRIM(n2.nom)) = LOWER(TRIM(oldc.nom))
);";

            await using var remapCmd = new MySqlCommand(remapSql, connection);
            await remapCmd.ExecuteNonQueryAsync();
        }

        var deleteInvalidSql = $@"
DELETE t
FROM {tableName} t
LEFT JOIN competence c ON c.id = t.{keyColumn}
WHERE c.id IS NULL;";

        await using (var deleteInvalidCmd = new MySqlCommand(deleteInvalidSql, connection))
        {
            await deleteInvalidCmd.ExecuteNonQueryAsync();
        }

        var addSql = $@"
ALTER TABLE {tableName}
ADD CONSTRAINT {constraintName}
FOREIGN KEY ({keyColumn}) REFERENCES competence(id) ON DELETE CASCADE;";

        await using var addCmd = new MySqlCommand(addSql, connection);
        await addCmd.ExecuteNonQueryAsync();
    }

    private static async Task<bool> TableExistsAsync(MySqlConnection connection, string tableName)
    {
        const string sql = @"
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = @tableName;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@tableName", tableName);
        var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        return count > 0;
    }

    private static async Task EnsureColumnAsync(MySqlConnection connection, string tableName, string columnName, string columnDefinition)
    {
        const string existsSql = @"
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = @tableName
  AND column_name = @columnName;";

        await using var existsCmd = new MySqlCommand(existsSql, connection);
        existsCmd.Parameters.AddWithValue("@tableName", tableName);
        existsCmd.Parameters.AddWithValue("@columnName", columnName);
        var exists = Convert.ToInt32(await existsCmd.ExecuteScalarAsync()) > 0;
        if (exists)
        {
            return;
        }

        var alterSql = $"ALTER TABLE {tableName} ADD COLUMN {columnName} {columnDefinition};";
        await using var alterCmd = new MySqlCommand(alterSql, connection);
        await alterCmd.ExecuteNonQueryAsync();
    }

    private async Task<CompetenceItem?> GetCompetenceByIdAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT id, nom, domaine, description, is_active, updated_at
FROM competence
WHERE id = @id
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return new CompetenceItem
        {
            Id = reader.GetInt32("id"),
            Nom = reader.GetString("nom"),
            Domaine = reader.GetString("domaine"),
            Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description"),
            IsActive = reader.GetBoolean("is_active"),
            UpdatedAt = reader.IsDBNull(reader.GetOrdinal("updated_at")) ? null : reader.GetDateTime("updated_at")
        };
    }
}
