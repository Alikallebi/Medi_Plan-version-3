using Backend.Chat;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/chat")]
public sealed class ChatController : ControllerBase
{
    private readonly ChatService _chatService;

    public ChatController(ChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpPost]
    public async Task<ActionResult<ChatResponse>> PostAsync([FromBody] ChatRequest request, CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Le message est obligatoire." });

        var userContext = ResolveUserContext(HttpContext, request);
        if (userContext.UserId <= 0)
            return BadRequest(new { message = "Utilisateur non identifie (X-User-Id ou userId requis)." });

        try
        {
            var response = await _chatService.HandleMessageAsync(userContext, request.Message, request.ConversationId, cancellationToken);
            return Ok(response);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                message = "Erreur interne du chatbot.",
                detail = ex.Message
            });
        }
    }

    private static ChatUserContext ResolveUserContext(HttpContext httpContext, ChatRequest request)
    {
        return new ChatUserContext
        {
            UserId = ResolveActingUserId(httpContext, request.UserId),
            Role = ResolveRole(httpContext, request.Role),
            ServiceId = ResolveOptionalInt(httpContext, request.ServiceId, "X-Service-Id", "serviceId"),
            PoleId = ResolveOptionalInt(httpContext, request.PoleId, "X-Pole-Id", "poleId"),
            UserName = ResolveUserName(httpContext, request.UserName)
        };
    }

    private static int ResolveActingUserId(HttpContext httpContext, int? bodyUserId)
    {
        if (bodyUserId.HasValue && bodyUserId.Value > 0)
            return bodyUserId.Value;

        if (httpContext.Request.Headers.TryGetValue("X-User-Id", out var userIdHeader)
            && int.TryParse(userIdHeader.ToString(), out var headerUserId)
            && headerUserId > 0)
        {
            return headerUserId;
        }

        if (httpContext.Request.Query.TryGetValue("userId", out var userIdQuery)
            && int.TryParse(userIdQuery.ToString(), out var queryUserId)
            && queryUserId > 0)
        {
            return queryUserId;
        }

        return 0;
    }

    private static int? ResolveOptionalInt(HttpContext httpContext, int? bodyValue, string headerName, string queryName)
    {
        if (bodyValue.HasValue)
            return bodyValue.Value;

        if (httpContext.Request.Headers.TryGetValue(headerName, out var headerValue)
            && int.TryParse(headerValue.ToString(), out var parsedHeader))
        {
            return parsedHeader;
        }

        if (httpContext.Request.Query.TryGetValue(queryName, out var queryValue)
            && int.TryParse(queryValue.ToString(), out var parsedQuery))
        {
            return parsedQuery;
        }

        return null;
    }

    private static string ResolveRole(HttpContext httpContext, string? bodyRole)
    {
        if (!string.IsNullOrWhiteSpace(bodyRole))
            return bodyRole.Trim();

        if (httpContext.Request.Headers.TryGetValue("X-User-Role", out var roleHeader))
        {
            var headerRole = roleHeader.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(headerRole))
                return headerRole;
        }

        if (httpContext.Request.Query.TryGetValue("role", out var roleQuery))
        {
            var queryRole = roleQuery.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(queryRole))
                return queryRole;
        }

        return "staff";
    }

    private static string? ResolveUserName(HttpContext httpContext, string? bodyUserName)
    {
        if (!string.IsNullOrWhiteSpace(bodyUserName))
            return bodyUserName.Trim();

        if (httpContext.Request.Headers.TryGetValue("X-User-Name", out var userNameHeader))
        {
            var value = userNameHeader.ToString().Trim();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        return null;
    }
}
