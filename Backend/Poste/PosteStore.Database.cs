using MySqlConnector;
using System.Text.Json;
using System.Data;
using System.Collections.Generic;

namespace Backend.Poste;

public sealed partial class PosteStore
{
    private static PosteItem Map(MySqlDataReader reader)
    {
        return new PosteItem
        {
            Id = reader.GetInt32("id"),
            Code = reader.GetString("code"),
            Nom = reader.GetString("nom"),
            Description = IsNull(reader, "description") ? null : reader.GetString("description"),
            Type = reader.GetString("type"),
            HeureDebut = reader.GetString("heure_debut"),
            HeureFin = reader.GetString("heure_fin"),
            JourSuivant = reader.GetBoolean("jour_suivant"),
            Duree = reader.GetDouble("duree"),
            Couleur = reader.GetString("couleur"),
            Icone = IsNull(reader, "icone") ? null : reader.GetString("icone"),
            Tolerance = IsNull(reader, "tolerance") ? null : (int?)reader.GetInt32("tolerance"),
            Actif = reader.GetBoolean("actif"),
            ReglesAssociees = Deserialize<List<ReglePoste>>(reader, "regles_associees") ?? new List<ReglePoste>(),
            ServicesAutorises = Deserialize<List<int>>(reader, "services_autorises") ?? new List<int>(),
            ConditionsSaisonnieres = Deserialize<List<string>>(reader, "conditions_saisonnieres") ?? new List<string>(),
            CompetencesRequises = Deserialize<List<int>>(reader, "competences_requises") ?? new List<int>(),
            EffectifMin = IsNull(reader, "effectif_min") ? null : (int?)reader.GetInt32("effectif_min"),
            EffectifMax = IsNull(reader, "effectif_max") ? null : (int?)reader.GetInt32("effectif_max"),
            ChevauchementAutorise = reader.GetBoolean("chevauchement_autorise"),
            Fractionnable = reader.GetBoolean("fractionnable")
        };
    }

    private static void BindParameters(MySqlCommand cmd, PosteItem payload, DateTime now)
    {
        cmd.Parameters.AddWithValue("@code", payload.Code);
        cmd.Parameters.AddWithValue("@nom", payload.Nom);
        cmd.Parameters.AddWithValue("@description", (object?)payload.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@type", payload.Type);
        cmd.Parameters.AddWithValue("@heureDebut", payload.HeureDebut);
        cmd.Parameters.AddWithValue("@heureFin", payload.HeureFin);
        cmd.Parameters.AddWithValue("@jourSuivant", payload.JourSuivant);
        cmd.Parameters.AddWithValue("@duree", payload.Duree);
        cmd.Parameters.AddWithValue("@couleur", payload.Couleur);
        cmd.Parameters.AddWithValue("@icone", (object?)payload.Icone ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@tolerance", (object?)payload.Tolerance ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@actif", payload.Actif);
        cmd.Parameters.AddWithValue("@reglesAssociees", JsonSerializer.Serialize(payload.ReglesAssociees ?? []));
        cmd.Parameters.AddWithValue("@servicesAutorises", JsonSerializer.Serialize(payload.ServicesAutorises ?? []));
        cmd.Parameters.AddWithValue("@conditionsSaisonnieres", JsonSerializer.Serialize(payload.ConditionsSaisonnieres ?? []));
        cmd.Parameters.AddWithValue("@competencesRequises", JsonSerializer.Serialize(payload.CompetencesRequises ?? []));
        cmd.Parameters.AddWithValue("@effectifMin", (object?)payload.EffectifMin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@effectifMax", (object?)payload.EffectifMax ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@chevauchementAutorise", payload.ChevauchementAutorise);
        cmd.Parameters.AddWithValue("@fractionnable", payload.Fractionnable);
        cmd.Parameters.AddWithValue("@dateCreation", now);
        cmd.Parameters.AddWithValue("@dateModification", now);
    }

    private static async Task<int> CountAsync(MySqlConnection connection)
    {
        const string sql = "SELECT COUNT(*) FROM postes;";
        await using var cmd = new MySqlCommand(sql, connection);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private static async Task SyncPosteCompetencesAsync(MySqlConnection connection, int posteId, List<int>? competenceIds)
    {
        const string deleteSql = "DELETE FROM poste_competence WHERE poste_id = @posteId;";
        await using (var deleteCmd = new MySqlCommand(deleteSql, connection))
        {
            deleteCmd.Parameters.AddWithValue("@posteId", posteId);
            await deleteCmd.ExecuteNonQueryAsync();
        }

        if (competenceIds is null || competenceIds.Count == 0)
        {
            return;
        }

        const string insertSql = @"
INSERT INTO poste_competence (poste_id, competence_id)
VALUES (@posteId, @competenceId);";

        foreach (var competenceId in competenceIds.Distinct())
        {
            await using var insertCmd = new MySqlCommand(insertSql, connection);
            insertCmd.Parameters.AddWithValue("@posteId", posteId);
            insertCmd.Parameters.AddWithValue("@competenceId", competenceId);
            await insertCmd.ExecuteNonQueryAsync();
        }
    }

    public static async Task SeedIfEmptyAsync(MySqlConnection connection)
    {
        var seed = new[]
        {
            new PosteItem
            {
                Code = "MATIN",
                Nom = "Matin",
                Description = "Poste du matin standard",
                Type = "jour",
                HeureDebut = "07:00",
                HeureFin = "14:00",
                JourSuivant = false,
                Duree = 7,
                Couleur = "#fef9c3",
                Icone = "☀️",
                Tolerance = 15,
                Actif = true,
                ConditionsSaisonnieres = ["toute_annee"],
                ReglesAssociees = [ new ReglePoste { Id = 1, Nom = "Repos obligatoire après garde", Type = "repos", Valeur = "12 heures" } ],
                ChevauchementAutorise = true,
                Fractionnable = false
            },
            new PosteItem
            {
                Code = "APMIDI",
                Nom = "Après-midi",
                Type = "jour",
                HeureDebut = "14:00",
                HeureFin = "21:00",
                JourSuivant = false,
                Duree = 7,
                Couleur = "#fed7aa",
                Icone = "☀️",
                Actif = true,
                ConditionsSaisonnieres = ["ete"],
                ChevauchementAutorise = true,
                Fractionnable = false
            },
            new PosteItem
            {
                Code = "NUIT",
                Nom = "Nuit",
                Type = "nuit",
                HeureDebut = "21:00",
                HeureFin = "07:00",
                JourSuivant = true,
                Duree = 10,
                Couleur = "#1e3a8a",
                Icone = "🌙",
                Actif = true,
                ConditionsSaisonnieres = ["hiver"],
                ReglesAssociees =
                [
                    new ReglePoste { Id = 1, Nom = "Repos obligatoire après garde", Type = "repos", Valeur = "12 heures" },
                    new ReglePoste { Id = 5, Nom = "Effectif minimum 2 personnes", Type = "effectif" }
                ],
                ChevauchementAutorise = true,
                Fractionnable = false
            },
            new PosteItem
            {
                Code = "GARDE24",
                Nom = "Garde 24h",
                Type = "garde",
                HeureDebut = "08:00",
                HeureFin = "08:00",
                JourSuivant = true,
                Duree = 24,
                Couleur = "#7c3aed",
                Icone = "🛡️",
                Tolerance = 30,
                Actif = true,
                ConditionsSaisonnieres = ["toute_annee"],
                ChevauchementAutorise = false,
                Fractionnable = false
            },
            new PosteItem
            {
                Code = "CONSULT",
                Nom = "Consultation",
                Type = "jour",
                HeureDebut = "09:00",
                HeureFin = "17:00",
                JourSuivant = false,
                Duree = 8,
                Couleur = "#22c55e",
                Icone = "🩺",
                Tolerance = 10,
                Actif = true,
                ConditionsSaisonnieres = ["toute_annee"],
                ChevauchementAutorise = true,
                Fractionnable = true
            },
            new PosteItem
            {
                Code = "BLOC",
                Nom = "Bloc opératoire",
                Type = "jour",
                HeureDebut = "08:00",
                HeureFin = "16:00",
                JourSuivant = false,
                Duree = 8,
                Couleur = "#ef4444",
                Icone = "🏥",
                Tolerance = 15,
                Actif = true,
                ConditionsSaisonnieres = ["toute_annee"],
                ChevauchementAutorise = false,
                Fractionnable = false
            },
            new PosteItem
            {
                Code = "ASTREINTE",
                Nom = "Astreinte",
                Type = "astreinte",
                HeureDebut = "18:00",
                HeureFin = "08:00",
                JourSuivant = true,
                Duree = 14,
                Couleur = "#0ea5e9",
                Icone = "📞",
                Tolerance = 20,
                Actif = true,
                ConditionsSaisonnieres = ["toute_annee"],
                ChevauchementAutorise = true,
                Fractionnable = false
            },
            new PosteItem
            {
                Code = "REPOS",
                Nom = "Congé / Repos",
                Description = "Journée non travaillée assimilée à un congé ou un repos.",
                Type = "repos",
                HeureDebut = "00:00",
                HeureFin = "00:00",
                JourSuivant = false,
                Duree = 0,
                Couleur = "#e2e8f0",
                Icone = "🛌",
                Actif = true,
                ConditionsSaisonnieres = ["toute_annee"],
                ReglesAssociees = [],
                ChevauchementAutorise = false,
                Fractionnable = false
            }
        };

        var existingCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        const string selectSql = "SELECT code FROM postes;";
        await using (var selectCmd = new MySqlCommand(selectSql, connection))
        await using (var reader = await selectCmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                existingCodes.Add(reader.GetString("code"));
            }
        }

        foreach (var item in seed)
        {
            if (existingCodes.Contains(item.Code))
            {
                continue;
            }

            var now = DateTime.UtcNow;
            const string insertSql = @"
INSERT INTO postes (code, nom, description, type, heure_debut, heure_fin, jour_suivant, duree,
                    couleur, icone, tolerance, actif,
                    regles_associees, services_autorises, conditions_saisonnieres, competences_requises,
                    effectif_min, effectif_max, chevauchement_autorise, fractionnable,
                    date_creation, date_modification)
VALUES (@code, @nom, @description, @type, @heureDebut, @heureFin, @jourSuivant, @duree,
        @couleur, @icone, @tolerance, @actif,
        @reglesAssociees, @servicesAutorises, @conditionsSaisonnieres, @competencesRequises,
        @effectifMin, @effectifMax, @chevauchementAutorise, @fractionnable,
        @dateCreation, @dateModification);";

            await using var cmd = new MySqlCommand(insertSql, connection);
            BindParameters(cmd, item, now);
            await cmd.ExecuteNonQueryAsync();
        }
    }
}
