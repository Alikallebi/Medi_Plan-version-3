using MySqlConnector;
using System.Data.Common;

namespace Backend.Structure;

public sealed partial class StructureStore
{
    private static async Task SeedIfEmptyAsync(MySqlConnection connection)
    {
        await EnsurePolesAsync(connection);
        await EnsureServicesAsync(connection, targetServices: 10);
        await EnsureEquipesAsync(connection);
        await EnsureUtilisateursAsync(connection, targetUsers: 50);
    }

    private static async Task EnsurePolesAsync(MySqlConnection connection)
    {
        var polesCount = await CountAsync(connection, "SELECT COUNT(*) FROM poles");
        if (polesCount > 0)
        {
            return;
        }

        const string sql = @"
INSERT INTO poles
    (nom, code, description, adresse, telephone, email, couleur, statut, chef_pole_id, assistant_id,
     effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres, date_creation, date_modification)
VALUES
    ('Pôle Médecine', 'POLE-MED', 'Pôle médical principal', 'Bâtiment A', '01 40 00 10 10', 'pole.medecine@clinisys.fr', '#8b5cf6', 'ACTIF', NULL, NULL, 0, 0, 0, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
    ('Pôle Chirurgie', 'POLE-CHIR', 'Pôle de chirurgie et urgence', 'Bâtiment C', '01 40 00 10 20', 'pole.chirurgie@clinisys.fr', '#7c3aed', 'ACTIF', NULL, NULL, 0, 0, 0, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP());";

        await using var cmd = new MySqlCommand(sql, connection);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task EnsureServicesAsync(MySqlConnection connection, int targetServices)
    {
        var count = await CountAsync(connection, "SELECT COUNT(*) FROM services");
        if (count >= targetServices)
        {
            return;
        }

        var poles = new List<int>();
        await using (var poleCmd = new MySqlCommand("SELECT id FROM poles ORDER BY id;", connection))
        await using (var poleReader = await poleCmd.ExecuteReaderAsync())
        {
            while (await poleReader.ReadAsync())
            {
                poles.Add(poleReader.GetInt32("id"));
            }
        }

        if (poles.Count == 0)
        {
            return;
        }

        var serviceTemplates = new (string Name, string Code, bool Is24h, bool IsUrgence, int Lits, int Gardes)[]
        {
            ("Cardiologie", "CARDIO", false, false, 24, 42),
            ("Pneumologie", "PNEUMO", false, false, 18, 30),
            ("Neurologie", "NEURO", false, false, 20, 32),
            ("Urgences", "URG", true, true, 16, 80),
            ("Réanimation", "REA", true, true, 14, 74),
            ("Pédiatrie", "PED", true, false, 22, 38),
            ("Oncologie", "ONCO", false, false, 19, 28),
            ("Radiologie", "RAD", true, false, 10, 36),
            ("Néphrologie", "NEPHRO", false, false, 17, 26),
            ("Chirurgie Générale", "CHIR", true, true, 26, 58)
        };

        var existingCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using (var codeCmd = new MySqlCommand("SELECT code FROM services;", connection))
        await using (var codeReader = await codeCmd.ExecuteReaderAsync())
        {
            while (await codeReader.ReadAsync())
            {
                existingCodes.Add(codeReader.GetString("code"));
            }
        }

        const string insertSql = @"
INSERT INTO services
    (nom, code, pole_id, description, localisation, telephone, email, couleur, statut, chef_service_id, cadre_id,
     effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres, date_creation, date_modification,
     est_24h, est_urgence, effectif_minimum, lits, taux_occupation, gardes_par_mois)
VALUES
    (@nom, @code, @poleId, @description, @localisation, @telephone, @email, @couleur, 'ACTIF', NULL, NULL,
     @total, @medecins, @infirmiers, @autres, UTC_TIMESTAMP(), UTC_TIMESTAMP(),
     @est24h, @estUrgence, @effectifMinimum, @lits, @tauxOccupation, @gardesParMois);";

        var index = 0;
        foreach (var tpl in serviceTemplates)
        {
            if (existingCodes.Contains(tpl.Code))
            {
                continue;
            }

            if (count >= targetServices)
            {
                break;
            }

            var poleId = poles[index % poles.Count];
            index++;

            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@nom", tpl.Name);
            insertCmd.Parameters.AddWithValue("@code", tpl.Code);
            insertCmd.Parameters.AddWithValue("@poleId", poleId);
            insertCmd.Parameters.AddWithValue("@description", $"Service {tpl.Name}");
            insertCmd.Parameters.AddWithValue("@localisation", $"Bâtiment {Convert.ToChar('A' + (index % 4))}");
            insertCmd.Parameters.AddWithValue("@telephone", $"01 40 00 2{index:00}");
            insertCmd.Parameters.AddWithValue("@email", $"{tpl.Code.ToLowerInvariant()}@clinisys.fr");
            insertCmd.Parameters.AddWithValue("@couleur", "#10b981");
            insertCmd.Parameters.AddWithValue("@total", 12 + (index % 8));
            insertCmd.Parameters.AddWithValue("@medecins", 4 + (index % 3));
            insertCmd.Parameters.AddWithValue("@infirmiers", 6 + (index % 4));
            insertCmd.Parameters.AddWithValue("@autres", 2);
            insertCmd.Parameters.AddWithValue("@est24h", tpl.Is24h);
            insertCmd.Parameters.AddWithValue("@estUrgence", tpl.IsUrgence);
            insertCmd.Parameters.AddWithValue("@effectifMinimum", 4 + (index % 2));
            insertCmd.Parameters.AddWithValue("@lits", tpl.Lits);
            insertCmd.Parameters.AddWithValue("@tauxOccupation", 70 + (index % 20));
            insertCmd.Parameters.AddWithValue("@gardesParMois", tpl.Gardes);
            await insertCmd.ExecuteNonQueryAsync();
            count++;
        }
    }

    private static async Task EnsureEquipesAsync(MySqlConnection connection)
    {
        var serviceIds = new List<int>();
        await using (var cmd = new MySqlCommand("SELECT id FROM services ORDER BY id;", connection))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                serviceIds.Add(reader.GetInt32("id"));
            }
        }

        if (serviceIds.Count == 0)
        {
            return;
        }

        const string existsSql = "SELECT COUNT(*) FROM equipes WHERE service_id = @serviceId;";
        const string insertSql = @"
INSERT INTO equipes
    (nom, code, service_id, description, type, couleur, statut, chef_equipe_id,
     effectif_total, effectif_medecins, effectif_infirmiers, effectif_autres, date_creation, date_modification)
VALUES
    (@nom, @code, @serviceId, @description, @type, '#f59e0b', 'ACTIF', NULL,
     @total, @medecins, @infirmiers, @autres, UTC_TIMESTAMP(), UTC_TIMESTAMP());";

        foreach (var serviceId in serviceIds)
        {
            var count = 0;
            await using (var countCmd = new MySqlCommand(existsSql, connection))
            {
                countCmd.Parameters.AddWithValue("@serviceId", serviceId);
                count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            }

            if (count > 0)
            {
                continue;
            }

            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@nom", $"Équipe {serviceId}");
            insertCmd.Parameters.AddWithValue("@code", $"EQ-{serviceId:00}");
            insertCmd.Parameters.AddWithValue("@serviceId", serviceId);
            insertCmd.Parameters.AddWithValue("@description", "Équipe opérationnelle");
            insertCmd.Parameters.AddWithValue("@type", serviceId % 3 == 0 ? "MIXTE" : "JOUR");
            insertCmd.Parameters.AddWithValue("@total", 8 + (serviceId % 5));
            insertCmd.Parameters.AddWithValue("@medecins", 2 + (serviceId % 3));
            insertCmd.Parameters.AddWithValue("@infirmiers", 4 + (serviceId % 3));
            insertCmd.Parameters.AddWithValue("@autres", 1);
            await insertCmd.ExecuteNonQueryAsync();
        }
    }

    private static async Task EnsureUtilisateursAsync(MySqlConnection connection, int targetUsers)
    {
        const string cleanupSql = "DELETE FROM utilisateurs WHERE email LIKE '%@hopital.fr';";
        await using (var cleanupCmd = new MySqlCommand(cleanupSql, connection))
        {
            await cleanupCmd.ExecuteNonQueryAsync();
        }

        var current = await CountAsync(connection, "SELECT COUNT(*) FROM utilisateurs");
        if (current >= targetUsers)
        {
            return;
        }

        var firstNames = new[]
        {
            "Mohamed", "Ahmed", "Yassin", "Rami", "Omar", "Karim", "Samir", "Hassan", "Ali", "Nabil",
            "Basma", "Yasmin", "Nour", "Rania", "Lina", "Sara", "Maha", "Dina", "Amal", "Imane"
        };

        var lastNames = new[]
        {
            "Benali", "Haddad", "Mansouri", "Khaldi", "Youssef", "Abdallah", "Rahmani", "Saidi", "Kacem", "Fahmi"
        };

        var specialites = new[] { "Cardiologie", "Pneumologie", "Neurologie", "Urgences", "Pédiatrie", "Oncologie", "Radiologie", "Néphrologie" };
        var roles = new[] { "SUPER_ADMIN", "CHEF_POLE", "CHEF_SERVICE", "STAFF" };

        const string existsSql = "SELECT 1 FROM utilisateurs WHERE email = @email LIMIT 1;";
        const string insertSql = @"
INSERT INTO utilisateurs (nom, prenom, email, telephone, role, specialite, statut)
VALUES (@nom, @prenom, @email, @telephone, @role, @specialite, @statut);";

        var index = 1;
        while (current < targetUsers)
        {
            var prenom = firstNames[(index - 1) % firstNames.Length];
            var nom = lastNames[(index - 1) % lastNames.Length];
            var email = $"{prenom.ToLowerInvariant()}.{nom.ToLowerInvariant()}.{index}@clinisys.fr";

            var exists = false;
            await using (var existsCmd = new MySqlCommand(existsSql, connection))
            {
                existsCmd.Parameters.AddWithValue("@email", email);
                exists = await existsCmd.ExecuteScalarAsync() is not null;
            }

            if (!exists)
            {
                await using var insertCmd = new MySqlCommand(insertSql, connection);
                insertCmd.Parameters.AddWithValue("@nom", nom);
                insertCmd.Parameters.AddWithValue("@prenom", prenom);
                insertCmd.Parameters.AddWithValue("@email", email);
                insertCmd.Parameters.AddWithValue("@telephone", $"06 5{index % 10} {10 + (index % 89):00} {10 + ((index * 3) % 89):00} {10 + ((index * 7) % 89):00}");
                insertCmd.Parameters.AddWithValue("@role", roles[(index - 1) % roles.Length]);
                insertCmd.Parameters.AddWithValue("@specialite", specialites[(index - 1) % specialites.Length]);
                insertCmd.Parameters.AddWithValue("@statut", index % 9 == 0 ? "INACTIF" : "ACTIF");
                await insertCmd.ExecuteNonQueryAsync();
                current++;
            }

            index++;
        }
    }
}
