using System.Text.Json.Serialization;

namespace Backend.Chat;

public sealed class ChatRequest
{
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("conversationId")]
    public string? ConversationId { get; set; }

    [JsonPropertyName("userId")]
    public int? UserId { get; set; }

    [JsonPropertyName("role")]
    public string? Role { get; set; }

    [JsonPropertyName("serviceId")]
    public int? ServiceId { get; set; }

    [JsonPropertyName("poleId")]
    public int? PoleId { get; set; }

    [JsonPropertyName("userName")]
    public string? UserName { get; set; }
}

public sealed class ChatResponse
{
    [JsonPropertyName("reply")]
    public string Reply { get; set; } = string.Empty;

    [JsonPropertyName("intent")]
    public string Intent { get; set; } = "unknown";

    [JsonPropertyName("conversationId")]
    public string ConversationId { get; set; } = string.Empty;

    [JsonPropertyName("suggestions")]
    public List<string> Suggestions { get; set; } = [];

    [JsonPropertyName("actionPending")]
    public bool ActionPending { get; set; }
}

public sealed class ChatbotOptions
{
    public bool UseAzureOpenAI { get; set; }
    public string AzureOpenAIEndpoint { get; set; } = string.Empty;
    public string AzureOpenAIKey { get; set; } = string.Empty;
    public string AzureOpenAIDeployment { get; set; } = string.Empty;
    public int TimeoutMs { get; set; } = 1800;
}

internal sealed class ChatKnowledge
{
    public Dictionary<string, string> Faq { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> Rules { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> Procedures { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ChatUserContext
{
    public int UserId { get; set; }
    public string Role { get; set; } = "staff";
    public int? ServiceId { get; set; }
    public int? PoleId { get; set; }
    public string? Specialite { get; set; }
    public string? UserName { get; set; }
}
