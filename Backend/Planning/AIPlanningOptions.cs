namespace Backend.Planning;

public sealed class AIPlanningOptions
{
    public bool Enabled { get; set; }
    public string Endpoint { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 20;
    public bool UseFallbackOnFailure { get; set; } = true;
}
