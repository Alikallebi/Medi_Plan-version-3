using MySqlConnector;
using System.Data.Common;

namespace Backend.Structure;

public sealed partial class StructureStore
{
    private readonly string _connectionString;

    public StructureStore(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("ClinisysDb")
            ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
    }

    public async Task InitializeAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var ddl = @"
CREATE TABLE IF NOT EXISTS utilisateurs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telephone VARCHAR(30) NULL,
    role VARCHAR(30) NOT NULL,
    specialite VARCHAR(100) NULL,
    statut VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS poles (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    code VARCHAR(60) NOT NULL,
    description TEXT NULL,
    adresse VARCHAR(255) NULL,
    telephone VARCHAR(30) NULL,
    email VARCHAR(255) NULL,
    couleur VARCHAR(20) NOT NULL,
    statut VARCHAR(30) NOT NULL,
    chef_pole_id INT NULL,
    assistant_id INT NULL,
    effectif_total INT NOT NULL,
    effectif_medecins INT NOT NULL,
    effectif_infirmiers INT NOT NULL,
    effectif_autres INT NOT NULL,
    date_creation DATETIME NOT NULL,
    date_modification DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    code VARCHAR(60) NOT NULL,
    pole_id INT NOT NULL,
    description TEXT NULL,
    localisation VARCHAR(255) NULL,
    telephone VARCHAR(30) NULL,
    email VARCHAR(255) NULL,
    couleur VARCHAR(20) NOT NULL,
    statut VARCHAR(30) NOT NULL,
    chef_service_id INT NULL,
    cadre_id INT NULL,
    effectif_total INT NOT NULL,
    effectif_medecins INT NOT NULL,
    effectif_infirmiers INT NOT NULL,
    effectif_autres INT NOT NULL,
    date_creation DATETIME NOT NULL,
    date_modification DATETIME NOT NULL,
    est_24h TINYINT(1) NOT NULL,
    est_urgence TINYINT(1) NOT NULL,
    effectif_minimum INT NOT NULL,
    lits INT NOT NULL,
    taux_occupation INT NOT NULL,
    gardes_par_mois INT NOT NULL,
    CONSTRAINT fk_services_poles FOREIGN KEY (pole_id) REFERENCES poles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equipes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    code VARCHAR(60) NOT NULL,
    service_id INT NOT NULL,
    description TEXT NULL,
    type VARCHAR(30) NOT NULL,
    couleur VARCHAR(20) NOT NULL,
    statut VARCHAR(30) NOT NULL,
    chef_equipe_id INT NULL,
    effectif_total INT NOT NULL,
    effectif_medecins INT NOT NULL,
    effectif_infirmiers INT NOT NULL,
    effectif_autres INT NOT NULL,
    date_creation DATETIME NOT NULL,
    date_modification DATETIME NOT NULL,
    CONSTRAINT fk_equipes_services FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);";

        await using (var cmd = new MySqlCommand(ddl, connection))
        {
            await cmd.ExecuteNonQueryAsync();
        }

        await SeedIfEmptyAsync(connection);
    }

    public async Task<IReadOnlyList<Pole>> GetPolesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var poles = new List<Pole>();
        const string sql = @"
SELECT id, nom, code, description, adresse, telephone, email, couleur, statut,
       chef_pole_id, assistant_id,
       effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres,
       date_creation, date_modification
FROM poles
ORDER BY nom;";

        await using (var cmd = new MySqlCommand(sql, connection))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                poles.Add(new Pole
                {
                    Id = reader.GetInt32("id"),
                    Nom = reader.GetString("nom"),
                    Code = reader.GetString("code"),
                    Description = IsDbNull(reader, "description") ? null : reader.GetString("description"),
                    Adresse = IsDbNull(reader, "adresse") ? null : reader.GetString("adresse"),
                    Telephone = IsDbNull(reader, "telephone") ? null : reader.GetString("telephone"),
                    Email = IsDbNull(reader, "email") ? null : reader.GetString("email"),
                    Couleur = reader.GetString("couleur"),
                    Statut = ParseEnum<EntityStatus>(reader.GetString("statut")),
                    ChefPoleId = IsDbNull(reader, "chef_pole_id") ? null : reader.GetInt32("chef_pole_id"),
                    AssistantId = IsDbNull(reader, "assistant_id") ? null : reader.GetInt32("assistant_id"),
                    Effectif = new Effectif
                    {
                        Total = reader.GetInt32("effectif_total"),
                        Medecins = reader.GetInt32("effectif_medecins"),
                        Infirmiers = reader.GetInt32("effectif_infirmiers"),
                        Autres = reader.GetInt32("effectif_autres")
                    },
                    DateCreation = reader.GetDateTime("date_creation"),
                    DateModification = reader.GetDateTime("date_modification"),
                    Services = []
                });
            }
        }

        var services = await GetServicesInternalAsync(connection);
        foreach (var pole in poles)
        {
            pole.Services = services.Where(s => s.PoleId == pole.Id).OrderBy(s => s.Nom).ToList();
        }

        return poles;
    }

    public async Task<IReadOnlyList<ServiceMedical>> GetServicesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        return await GetServicesInternalAsync(connection);
    }

    public async Task<IReadOnlyList<Equipe>> GetEquipesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        return await GetEquipesInternalAsync(connection);
    }

    public async Task<IReadOnlyList<Utilisateur>> GetUtilisateursAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var list = new List<Utilisateur>();
        const string sql = @"
SELECT id, nom, prenom, email, telephone, role, specialite, statut
FROM utilisateurs
ORDER BY nom, prenom;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new Utilisateur
            {
                Id = reader.GetInt32("id"),
                Nom = reader.GetString("nom"),
                Prenom = reader.GetString("prenom"),
                Email = reader.GetString("email"),
                Telephone = IsDbNull(reader, "telephone") ? null : reader.GetString("telephone"),
                Role = ParseEnum<UserRole>(reader.GetString("role")),
                Specialite = IsDbNull(reader, "specialite") ? null : reader.GetString("specialite"),
                Statut = ParseEnum<EntityStatus>(reader.GetString("statut"))
            });
        }

        return list;
    }

    public async Task<Pole> CreatePoleAsync(Pole payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var now = DateTime.UtcNow;
        const string sql = @"
INSERT INTO poles (nom, code, description, adresse, telephone, email, couleur, statut, chef_pole_id, assistant_id,
                   effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres, date_creation, date_modification)
VALUES (@nom, @code, @description, @adresse, @telephone, @email, @couleur, @statut, @chefPoleId, @assistantId,
        @total, @medecins, @infirmiers, @autres, @dateCreation, @dateModification);
SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@code", payload.Code);
        cmd.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@adresse", (object?)payload.Adresse ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@telephone", (object?)payload.Telephone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)payload.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@couleur", payload.Couleur);
        cmd.Parameters.AddWithValue("@statut", payload.Statut.ToString());
        cmd.Parameters.AddWithValue("@chefPoleId", (object?)payload.ChefPoleId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@assistantId", (object?)payload.AssistantId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@total", payload.Effectif.Total);
        cmd.Parameters.AddWithValue("@medecins", payload.Effectif.Medecins);
        cmd.Parameters.AddWithValue("@infirmiers", payload.Effectif.Infirmiers);
        cmd.Parameters.AddWithValue("@autres", payload.Effectif.Autres);
        cmd.Parameters.AddWithValue("@dateCreation", now);
        cmd.Parameters.AddWithValue("@dateModification", now);

        var id = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        payload.Id = id;
        payload.DateCreation = now;
        payload.DateModification = now;
        payload.Services = [];
        return payload;
    }

    public async Task<bool> DeletePoleAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM poles WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<ServiceMedical?> CreateServiceAsync(ServiceMedical payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        if (!await ExistsAsync(connection, "SELECT 1 FROM poles WHERE id = @id", payload.PoleId))
        {
            return null;
        }

        var now = DateTime.UtcNow;
        const string sql = @"
INSERT INTO services (nom, code, pole_id, description, localisation, telephone, email, couleur, statut,
                      chef_service_id, cadre_id, effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres,
                      date_creation, date_modification, est_24h, est_urgence, effectif_minimum, lits, taux_occupation, gardes_par_mois)
VALUES (@nom, @code, @poleId, @description, @localisation, @telephone, @email, @couleur, @statut,
        @chefServiceId, @cadreId, @total, @medecins, @infirmiers, @autres,
        @dateCreation, @dateModification, @est24h, @estUrgence, @effectifMinimum, @lits, @tauxOccupation, @gardesParMois);
SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(sql, connection);
        BindServiceParameters(cmd, payload, now);

        var id = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        payload.Id = id;
        payload.DateCreation = now;
        payload.DateModification = now;
        payload.Equipes = [];
        return payload;
    }

    public async Task<ServiceMedical?> UpdateServiceAsync(int id, ServiceMedical payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        if (!await ExistsAsync(connection, "SELECT 1 FROM poles WHERE id = @id", payload.PoleId))
        {
            return null;
        }

        const string sql = @"
UPDATE services SET
    nom = @nom,
    code = @code,
    pole_id = @poleId,
    description = @description,
    localisation = @localisation,
    telephone = @telephone,
    email = @email,
    couleur = @couleur,
    statut = @statut,
    chef_service_id = @chefServiceId,
    cadre_id = @cadreId,
    effectif_total = @total,
    effectif_medecins = @medecins,
    effectif_infirmiers = @infirmiers,
    effectif_autres = @autres,
    date_modification = @dateModification,
    est_24h = @est24h,
    est_urgence = @estUrgence,
    effectif_minimum = @effectifMinimum,
    lits = @lits,
    taux_occupation = @tauxOccupation,
    gardes_par_mois = @gardesParMois
WHERE id = @id;";

        var now = DateTime.UtcNow;
        await using var cmd = new MySqlCommand(sql, connection);
        BindServiceParameters(cmd, payload, now);
        cmd.Parameters.AddWithValue("@id", id);

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return null;
        }

        return await GetServiceByIdAsync(connection, id);
    }

    public async Task<bool> DeleteServiceAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM services WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<Equipe?> CreateEquipeAsync(Equipe payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        if (!await ExistsAsync(connection, "SELECT 1 FROM services WHERE id = @id", payload.ServiceId))
        {
            return null;
        }

        var now = DateTime.UtcNow;
        const string sql = @"
INSERT INTO equipes (nom, code, service_id, description, type, couleur, statut, chef_equipe_id,
                     effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres,
                     date_creation, date_modification)
VALUES (@nom, @code, @serviceId, @description, @type, @couleur, @statut, @chefEquipeId,
        @total, @medecins, @infirmiers, @autres, @dateCreation, @dateModification);
SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@code", payload.Code);
        cmd.Parameters.AddWithValue("@serviceId", payload.ServiceId);
        cmd.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@type", payload.Type.ToString());
        cmd.Parameters.AddWithValue("@couleur", payload.Couleur);
        cmd.Parameters.AddWithValue("@statut", payload.Statut.ToString());
        cmd.Parameters.AddWithValue("@chefEquipeId", (object?)payload.ChefEquipeId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@total", payload.Effectif.Total);
        cmd.Parameters.AddWithValue("@medecins", payload.Effectif.Medecins);
        cmd.Parameters.AddWithValue("@infirmiers", payload.Effectif.Infirmiers);
        cmd.Parameters.AddWithValue("@autres", payload.Effectif.Autres);
        cmd.Parameters.AddWithValue("@dateCreation", now);
        cmd.Parameters.AddWithValue("@dateModification", now);

        var id = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        payload.Id = id;
        payload.DateCreation = now;
        payload.DateModification = now;
        return payload;
    }

    public async Task<Equipe?> UpdateEquipeAsync(int id, Equipe payload)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        if (!await ExistsAsync(connection, "SELECT 1 FROM services WHERE id = @id", payload.ServiceId))
        {
            return null;
        }

        const string sql = @"
UPDATE equipes SET
    nom = @nom,
    code = @code,
    service_id = @serviceId,
    description = @description,
    type = @type,
    couleur = @couleur,
    statut = @statut,
    chef_equipe_id = @chefEquipeId,
    effectif_total = @total,
    effectif_medecins = @medecins,
    effectif_infirmiers = @infirmiers,
    effectif_autres = @autres,
    date_modification = @dateModification
WHERE id = @id;";

        var now = DateTime.UtcNow;
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@code", payload.Code);
        cmd.Parameters.AddWithValue("@serviceId", payload.ServiceId);
        cmd.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@type", payload.Type.ToString());
        cmd.Parameters.AddWithValue("@couleur", payload.Couleur);
        cmd.Parameters.AddWithValue("@statut", payload.Statut.ToString());
        cmd.Parameters.AddWithValue("@chefEquipeId", (object?)payload.ChefEquipeId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@total", payload.Effectif.Total);
        cmd.Parameters.AddWithValue("@medecins", payload.Effectif.Medecins);
        cmd.Parameters.AddWithValue("@infirmiers", payload.Effectif.Infirmiers);
        cmd.Parameters.AddWithValue("@autres", payload.Effectif.Autres);
        cmd.Parameters.AddWithValue("@dateModification", now);
        cmd.Parameters.AddWithValue("@id", id);

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return null;
        }

        return await GetEquipeByIdAsync(connection, id);
    }

    public async Task<bool> DeleteEquipeAsync(int id)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "DELETE FROM equipes WHERE id = @id;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }
}
