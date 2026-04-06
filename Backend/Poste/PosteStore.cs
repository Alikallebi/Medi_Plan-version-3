using MySqlConnector;
using System.Text.Json;

namespace Backend.Poste;

public sealed partial class PosteStore
{
    private readonly string _connectionString;

    public PosteStore(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("ClinisysDb")
            ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
    }

    public async Task InitializeAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await SeedIfEmptyAsync(connection);
    }

    public async Task<IReadOnlyList<PosteItem>> GetAllAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"SELECT id, code, nom, description, type, heure_debut, heure_fin, jour_suivant, duree,
           couleur, icone, tolerance, actif,
           regles_associees, services_autorises, conditions_saisonnieres, competences_requises,
           effectif_min, effectif_max, chevauchement_autorise, fractionnable
        FROM postes
        ORDER BY id;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();

        var items = new List<PosteItem>();
        while (await reader.ReadAsync())
        {
            items.Add(Map(reader));
        }

        return items;
    }

    public async Task<PosteItem?> GetByIdAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"SELECT id, code, nom, description, type, heure_debut, heure_fin, jour_suivant, duree,
           couleur, icone, tolerance, actif,
           regles_associees, services_autorises, conditions_saisonnieres, competences_requises,
           effectif_min, effectif_max, chevauchement_autorise, fractionnable
        FROM postes
        WHERE id = @id;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        return Map(reader);
    }

    public async Task<PosteItem> CreateAsync(PosteItem payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var now = DateTime.UtcNow;
        const string sql = @"
INSERT INTO postes (code, nom, description, type, heure_debut, heure_fin, jour_suivant, duree,
                    couleur, icone, tolerance, actif,
                    regles_associees, services_autorises, conditions_saisonnieres, competences_requises,
                    effectif_min, effectif_max, chevauchement_autorise, fractionnable,
                    date_creation, date_modification)
VALUES (@code, @nom, @description, @type, @heureDebut, @heureFin, @jourSuivant, @duree,
        @couleur, @icone, @tolerance, @actif,
        @reglesAssociees, @servicesAutorises, @conditionsSaisonnieres, @competencesRequises,
        @effectifMin, @effectifMax, @chevauchementAutorise, @fractionnable,
        @dateCreation, @dateModification);
SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(sql, connection);
        BindParameters(cmd, payload, now);

        var scalarResult = await cmd.ExecuteScalarAsync();
        if (scalarResult is null)
        {
            throw new InvalidOperationException("Failed to retrieve inserted poste ID");
        }
        
        var id = Convert.ToInt32(scalarResult);
        await SyncPosteCompetencesAsync(connection, id, payload.CompetencesRequises);
        var result = await GetByIdAsync(id);
        return result ?? throw new InvalidOperationException($"Failed to retrieve created poste with id {id}");
    }

    public async Task<PosteItem?> UpdateAsync(int id, PosteItem payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var now = DateTime.UtcNow;
        const string sql = @"
UPDATE postes SET
    code = @code,
    nom = @nom,
    description = @description,
    type = @type,
    heure_debut = @heureDebut,
    heure_fin = @heureFin,
    jour_suivant = @jourSuivant,
    duree = @duree,
    couleur = @couleur,
    icone = @icone,
    tolerance = @tolerance,
    actif = @actif,
    regles_associees = @reglesAssociees,
    services_autorises = @servicesAutorises,
    conditions_saisonnieres = @conditionsSaisonnieres,
    competences_requises = @competencesRequises,
    effectif_min = @effectifMin,
    effectif_max = @effectifMax,
    chevauchement_autorise = @chevauchementAutorise,
    fractionnable = @fractionnable,
    date_modification = @dateModification
WHERE id = @id;";

        await using var cmd = new MySqlCommand(sql, connection);
        BindParameters(cmd, payload, now);
        cmd.Parameters.AddWithValue("@id", id);

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return null;
        }

        await SyncPosteCompetencesAsync(connection, id, payload.CompetencesRequises);

        return await GetByIdAsync(id);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM postes WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }
}
