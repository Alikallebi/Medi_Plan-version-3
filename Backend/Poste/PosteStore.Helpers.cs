using MySqlConnector;
using System.Text.Json;

namespace Backend.Poste;

public sealed partial class PosteStore
{
    private static bool IsNull(MySqlDataReader reader, string column)
        => reader.IsDBNull(reader.GetOrdinal(column));

    private static T? Deserialize<T>(MySqlDataReader reader, string column)
    {
        if (IsNull(reader, column))
        {
            return default;
        }

        var raw = reader.GetString(column);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(raw);
        }
        catch
        {
            return default;
        }
    }
}
