using MySqlConnector;
using System.Data.Common;

namespace Backend.Structure;

public sealed partial class StructureStore
{
    private static async Task<bool> ExistsAsync(MySqlConnection connection, string sql, int id)
    {
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteScalarAsync() is not null;
    }

    private static void BindServiceParameters(MySqlCommand cmd, ServiceMedical payload, DateTime now)
    {
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@code", payload.Code);
        cmd.Parameters.AddWithValue("@poleId", payload.PoleId);
        cmd.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@localisation", (object?)payload.Localisation ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@telephone", (object?)payload.Telephone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)payload.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@couleur", payload.Couleur);
        cmd.Parameters.AddWithValue("@statut", payload.Statut.ToString());
        cmd.Parameters.AddWithValue("@chefServiceId", (object?)payload.ChefServiceId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cadreId", (object?)payload.CadreId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@total", payload.Effectif.Total);
        cmd.Parameters.AddWithValue("@medecins", payload.Effectif.Medecins);
        cmd.Parameters.AddWithValue("@infirmiers", payload.Effectif.Infirmiers);
        cmd.Parameters.AddWithValue("@autres", payload.Effectif.Autres);
        cmd.Parameters.AddWithValue("@dateCreation", now);
        cmd.Parameters.AddWithValue("@dateModification", now);
        cmd.Parameters.AddWithValue("@est24h", payload.Est24h);
        cmd.Parameters.AddWithValue("@estUrgence", payload.EstUrgence);
        cmd.Parameters.AddWithValue("@effectifMinimum", payload.EffectifMinimum);
        cmd.Parameters.AddWithValue("@lits", payload.Lits);
        cmd.Parameters.AddWithValue("@tauxOccupation", payload.TauxOccupation);
        cmd.Parameters.AddWithValue("@gardesParMois", payload.GardesParMois);
    }

    private static async Task<List<ServiceMedical>> GetServicesInternalAsync(MySqlConnection connection)
    {
        var services = new List<ServiceMedical>();
        var equipes = await GetEquipesInternalAsync(connection);

        const string sql = @"
SELECT id, nom, code, pole_id, description, localisation, telephone, email, couleur, statut,
       chef_service_id, cadre_id,
       effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres,
       date_creation, date_modification,
       est_24h, est_urgence, effectif_minimum, lits, taux_occupation, gardes_par_mois
FROM services
ORDER BY nom;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var id = reader.GetInt32("id");
            services.Add(new ServiceMedical
            {
                Id = id,
                Nom = reader.GetString("nom"),
                Code = reader.GetString("code"),
                PoleId = reader.GetInt32("pole_id"),
                Description = IsDbNull(reader, "description") ? null : reader.GetString("description"),
                Localisation = IsDbNull(reader, "localisation") ? null : reader.GetString("localisation"),
                Telephone = IsDbNull(reader, "telephone") ? null : reader.GetString("telephone"),
                Email = IsDbNull(reader, "email") ? null : reader.GetString("email"),
                Couleur = reader.GetString("couleur"),
                Statut = ParseEnum<EntityStatus>(reader.GetString("statut")),
                ChefServiceId = IsDbNull(reader, "chef_service_id") ? null : reader.GetInt32("chef_service_id"),
                CadreId = IsDbNull(reader, "cadre_id") ? null : reader.GetInt32("cadre_id"),
                Effectif = new Effectif
                {
                    Total = reader.GetInt32("effectif_total"),
                    Medecins = reader.GetInt32("effectif_medecins"),
                    Infirmiers = reader.GetInt32("effectif_infirmiers"),
                    Autres = reader.GetInt32("effectif_autres")
                },
                DateCreation = reader.GetDateTime("date_creation"),
                DateModification = reader.GetDateTime("date_modification"),
                Equipes = equipes.Where(x => x.ServiceId == id).OrderBy(x => x.Nom).ToList(),
                Specialites = [],
                Est24h = reader.GetBoolean("est_24h"),
                EstUrgence = reader.GetBoolean("est_urgence"),
                EffectifMinimum = reader.GetInt32("effectif_minimum"),
                Lits = reader.GetInt32("lits"),
                TauxOccupation = reader.GetInt32("taux_occupation"),
                GardesParMois = reader.GetInt32("gardes_par_mois")
            });
        }

        return services;
    }

    private static async Task<List<Equipe>> GetEquipesInternalAsync(MySqlConnection connection)
    {
        var list = new List<Equipe>();
        const string sql = @"
SELECT id, nom, code, service_id, description, type, couleur, statut, chef_equipe_id,
       effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres,
       date_creation, date_modification
FROM equipes
ORDER BY nom;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new Equipe
            {
                Id = reader.GetInt32("id"),
                Nom = reader.GetString("nom"),
                Code = reader.GetString("code"),
                ServiceId = reader.GetInt32("service_id"),
                Description = IsDbNull(reader, "description") ? null : reader.GetString("description"),
                Type = ParseEnum<EquipeType>(reader.GetString("type")),
                Couleur = reader.GetString("couleur"),
                Statut = ParseEnum<EntityStatus>(reader.GetString("statut")),
                ChefEquipeId = IsDbNull(reader, "chef_equipe_id") ? null : reader.GetInt32("chef_equipe_id"),
                Effectif = new Effectif
                {
                    Total = reader.GetInt32("effectif_total"),
                    Medecins = reader.GetInt32("effectif_medecins"),
                    Infirmiers = reader.GetInt32("effectif_infirmiers"),
                    Autres = reader.GetInt32("effectif_autres")
                },
                DateCreation = reader.GetDateTime("date_creation"),
                DateModification = reader.GetDateTime("date_modification")
            });
        }

        return list;
    }

    private static async Task<ServiceMedical?> GetServiceByIdAsync(MySqlConnection connection, int id)
    {
        var services = await GetServicesInternalAsync(connection);
        return services.FirstOrDefault(x => x.Id == id);
    }

    private static async Task<Equipe?> GetEquipeByIdAsync(MySqlConnection connection, int id)
    {
        var equipes = await GetEquipesInternalAsync(connection);
        return equipes.FirstOrDefault(x => x.Id == id);
    }
}
