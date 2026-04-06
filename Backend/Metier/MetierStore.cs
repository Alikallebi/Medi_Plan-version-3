using MySqlConnector;

namespace Backend.Metier;

public sealed class MetierItem
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Categorie { get; set; }
    public bool BesoinGarde { get; set; }
    public bool BesoinAstreinte { get; set; }
    public bool Actif { get; set; } = true;
}

public sealed class MetierStore
{
    private readonly string _connectionString;

    public MetierStore(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("ClinisysDb")
            ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
    }

    public async Task InitializeAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string createTable = @"
CREATE TABLE IF NOT EXISTS metiers (
    id                INT          NOT NULL AUTO_INCREMENT,
    nom               VARCHAR(150) NOT NULL,
    code              VARCHAR(20)  NULL,
    categorie         VARCHAR(50)  NULL,
    besoin_garde      TINYINT(1)   NOT NULL DEFAULT 0,
    besoin_astreinte  TINYINT(1)   NOT NULL DEFAULT 0,
    actif             TINYINT(1)   NOT NULL DEFAULT 1,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_metier_nom (nom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        await using var cmd = new MySqlCommand(createTable, connection);
        await cmd.ExecuteNonQueryAsync();

        await SeedDefaultMetiersAsync(connection);
    }

    private static async Task SeedDefaultMetiersAsync(MySqlConnection connection)
    {
        const string countSql = "SELECT COUNT(*) FROM metiers;";
        await using var countCmd = new MySqlCommand(countSql, connection);
        var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
        if (count > 0) return;

        // (nom, code, categorie, besoin_garde, besoin_astreinte)
        var defaultMetiers = new[]
        {
            ("Médecin",                      "MED",     "medical",        true,  true),
            ("Chirurgien",                   "CHIR",    "medical",        true,  true),
            ("Infirmier",                    "IDE",     "paramedical",    true,  false),
            ("Aide-soignant",                "AS",      "paramedical",    true,  false),
            ("Sage-femme",                   "SF",      "paramedical",    true,  true),
            ("Pharmacien",                   "PHA",     "paramedical",    false, true),
            ("Kinésithérapeute",             "KINE",    "paramedical",    false, false),
            ("Technicien de laboratoire",    "TEC-LAB", "technique",      true,  true),
            ("Secrétaire médicale",          "SEC-MED", "administratif",  false, false),
            ("Agent de service hospitalier", "ASH",     "service",        true,  false),
        };

        const string insertSql = @"
INSERT IGNORE INTO metiers (nom, code, categorie, besoin_garde, besoin_astreinte, actif)
VALUES (@nom, @code, @categorie, @besoinGarde, @besoinAstreinte, 1);";

        foreach (var (nom, code, categorie, besoinGarde, besoinAstreinte) in defaultMetiers)
        {
            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@nom", nom);
            insertCmd.Parameters.AddWithValue("@code", code);
            insertCmd.Parameters.AddWithValue("@categorie", categorie);
            insertCmd.Parameters.AddWithValue("@besoinGarde", besoinGarde);
            insertCmd.Parameters.AddWithValue("@besoinAstreinte", besoinAstreinte);
            await insertCmd.ExecuteNonQueryAsync();
        }
    }

    private static MetierItem MapRow(MySqlDataReader reader) => new()
    {
        Id              = reader.GetInt32("id"),
        Nom             = reader.GetString("nom"),
        Code            = reader.IsDBNull(reader.GetOrdinal("code"))             ? null : reader.GetString("code"),
        Categorie       = reader.IsDBNull(reader.GetOrdinal("categorie"))        ? null : reader.GetString("categorie"),
        BesoinGarde     = !reader.IsDBNull(reader.GetOrdinal("besoin_garde"))     && reader.GetBoolean("besoin_garde"),
        BesoinAstreinte = !reader.IsDBNull(reader.GetOrdinal("besoin_astreinte")) && reader.GetBoolean("besoin_astreinte"),
        Actif           = !reader.IsDBNull(reader.GetOrdinal("actif"))            && reader.GetBoolean("actif")
    };

    public async Task<IReadOnlyList<MetierItem>> GetAllAsync(bool activeOnly = true)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = activeOnly
            ? "SELECT id, nom, code, categorie, besoin_garde, besoin_astreinte, actif FROM metiers WHERE actif = 1 ORDER BY categorie, nom;"
            : "SELECT id, nom, code, categorie, besoin_garde, besoin_astreinte, actif FROM metiers ORDER BY categorie, nom;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();

        var items = new List<MetierItem>();
        while (await reader.ReadAsync())
            items.Add(MapRow(reader));
        return items;
    }

    public async Task<MetierItem?> GetByIdAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "SELECT id, nom, code, categorie, besoin_garde, besoin_astreinte, actif FROM metiers WHERE id = @id LIMIT 1;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return MapRow(reader);
    }

    public async Task<MetierItem> CreateAsync(MetierItem payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
INSERT INTO metiers (nom, code, categorie, besoin_garde, besoin_astreinte, actif)
VALUES (@nom, @code, @categorie, @besoinGarde, @besoinAstreinte, @actif);
SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@code", (object?)payload.Code ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@categorie", (object?)payload.Categorie ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@besoinGarde", payload.BesoinGarde);
        cmd.Parameters.AddWithValue("@besoinAstreinte", payload.BesoinAstreinte);
        cmd.Parameters.AddWithValue("@actif", payload.Actif);

        var newId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        return (await GetByIdAsync(newId))!;
    }

    public async Task<MetierItem?> UpdateAsync(int id, MetierItem payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
UPDATE metiers
SET nom = @nom, code = @code, categorie = @categorie,
    besoin_garde = @besoinGarde, besoin_astreinte = @besoinAstreinte, actif = @actif
WHERE id = @id;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@code", (object?)payload.Code ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@categorie", (object?)payload.Categorie ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@besoinGarde", payload.BesoinGarde);
        cmd.Parameters.AddWithValue("@besoinAstreinte", payload.BesoinAstreinte);
        cmd.Parameters.AddWithValue("@actif", payload.Actif);
        cmd.Parameters.AddWithValue("@id", id);

        var affected = await cmd.ExecuteNonQueryAsync();
        return affected == 0 ? null : await GetByIdAsync(id);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM metiers WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }
}
