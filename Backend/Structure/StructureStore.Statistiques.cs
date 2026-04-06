using MySqlConnector;
using System.Data.Common;

namespace Backend.Structure;

public sealed partial class StructureStore
{
    public async Task<Statistiques> GetStatistiquesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var stats = new Statistiques();

        stats.NombrePoles = await CountAsync(connection, "SELECT COUNT(*) FROM poles");
        stats.NombreServices = await CountAsync(connection, "SELECT COUNT(*) FROM services");
        stats.NombreEquipes = await CountAsync(connection, "SELECT COUNT(*) FROM equipes");
        stats.NombreUtilisateurs = await CountAsync(connection, "SELECT COUNT(*) FROM utilisateurs");

        stats.NombreInactifs = await CountAsync(connection, "SELECT COUNT(*) FROM poles WHERE statut = 'INACTIF'")
                            + await CountAsync(connection, "SELECT COUNT(*) FROM services WHERE statut = 'INACTIF'")
                            + await CountAsync(connection, "SELECT COUNT(*) FROM equipes WHERE statut = 'INACTIF'");

        stats.EffectifTotal = new Effectif
        {
            Total = stats.NombreUtilisateurs,
            Medecins = await CountAsync(connection, "SELECT COUNT(*) FROM utilisateurs WHERE specialite IS NOT NULL AND TRIM(specialite) <> ''"),
            Infirmiers = await CountAsync(connection, "SELECT COUNT(*) FROM utilisateurs WHERE role = 'INFIRMIER'"),
            Autres = 0
        };

        stats.EffectifTotal.Autres = Math.Max(stats.EffectifTotal.Total - stats.EffectifTotal.Medecins - stats.EffectifTotal.Infirmiers, 0);
        return stats;
    }

    private static async Task<int> CountAsync(MySqlConnection connection, string sql)
    {
        await using var cmd = new MySqlCommand(sql, connection);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }
}
