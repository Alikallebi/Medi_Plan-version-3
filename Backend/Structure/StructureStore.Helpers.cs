using MySqlConnector;
using System.Data.Common;

namespace Backend.Structure;

public sealed partial class StructureStore
{
    private static TEnum ParseEnum<TEnum>(string value) where TEnum : struct
    {
        return Enum.TryParse<TEnum>(value, true, out var parsed) ? parsed : default;
    }

    private static bool IsDbNull(DbDataReader reader, string column)
    {
        return reader.IsDBNull(reader.GetOrdinal(column));
    }

    private static string ResolveUser(Dictionary<int, string> usersById, int? userId)
    {
        if (!userId.HasValue)
        {
            return "Non défini";
        }

        return usersById.TryGetValue(userId.Value, out var label) ? label : "Non défini";
    }
}
