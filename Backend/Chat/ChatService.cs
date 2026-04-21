using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Backend.Planning;
using Backend.Staff;
using Backend.Structure;
using Microsoft.Extensions.Options;

namespace Backend.Chat;

public sealed class ChatService
{
    private readonly PlanningStore _planningStore;
    private readonly StaffStore _staffStore;
    private readonly StructureStore _structureStore;
    private readonly IOptions<ChatbotOptions> _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ChatKnowledge _knowledge;
    private readonly ConcurrentDictionary<int, PendingCreateRequest> _pendingByUser = new();

    private static readonly Regex DateSlashRegex = new(@"\b(?<d>\d{1,2})[/-](?<m>\d{1,2})(?:[/-](?<y>\d{2,4}))?\b", RegexOptions.Compiled);
    private static readonly Regex DateFrRegex = new(@"\b(?<d>\d{1,2})\s+(?<m>janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex HourRangeRegex = new(@"(?<start>\d{1,2}[:h]\d{2})\s*[-a]\s*(?<end>\d{1,2}[:h]\d{2})", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Dictionary<string, int> MonthMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["janvier"] = 1,
        ["fevrier"] = 2,
        ["mars"] = 3,
        ["avril"] = 4,
        ["mai"] = 5,
        ["juin"] = 6,
        ["juillet"] = 7,
        ["aout"] = 8,
        ["septembre"] = 9,
        ["octobre"] = 10,
        ["novembre"] = 11,
        ["decembre"] = 12,
    };

    public ChatService(
        PlanningStore planningStore,
        StaffStore staffStore,
        StructureStore structureStore,
        IOptions<ChatbotOptions> options,
        IWebHostEnvironment env,
        IHttpClientFactory httpClientFactory)
    {
        _planningStore = planningStore;
        _staffStore = staffStore;
        _structureStore = structureStore;
        _options = options;
        _httpClientFactory = httpClientFactory;
        _knowledge = LoadKnowledge(env.ContentRootPath);
    }

    public async Task<ChatResponse> HandleMessageAsync(ChatUserContext incomingContext, string message, string? conversationId, CancellationToken cancellationToken)
    {
        var conv = string.IsNullOrWhiteSpace(conversationId) ? Guid.NewGuid().ToString("N") : conversationId.Trim();
        var context = await ResolveContextAsync(incomingContext);
        var normalized = Normalize(message);
        var services = await _structureStore.GetServicesAsync();
        var parsed = ParseMessage(normalized, context, services);

        var response = parsed.Intent switch
        {
            ChatIntent.UserLookup => await BuildUserLookupResponseAsync(context, parsed, conv),
            ChatIntent.PersonalPlanning => await BuildPersonalPlanningResponseAsync(context, parsed, conv),
            ChatIntent.ServicePlanning => await BuildServicePlanningResponseAsync(context, parsed, services, conv),
            ChatIntent.Counters => await BuildCountersResponseAsync(context, conv),
            ChatIntent.Procedure => BuildProcedureResponse(normalized, conv),
            ChatIntent.RequestStatus => await BuildRequestStatusResponseAsync(context, parsed, conv),
            ChatIntent.AbsenceList => await BuildAbsenceListResponseAsync(context, parsed, services, conv),
            ChatIntent.Rules => BuildRulesResponse(conv),
            ChatIntent.Profile => await BuildProfileResponseAsync(context, conv),
            ChatIntent.Manager => await BuildManagerResponseAsync(context, services, conv),
            ChatIntent.AccessScope => await BuildAccessScopeResponseAsync(context, conv),
            ChatIntent.ServiceUsers => await BuildServiceUsersResponseAsync(context, parsed, services, conv),
            ChatIntent.NavigationHelp => BuildNavigationHelpResponse(context, normalized, conv),
            ChatIntent.DataCatalog => await BuildDataCatalogResponseAsync(context, conv),
            ChatIntent.PrepareCreateRequest => await PrepareCreateRequestResponseAsync(context, normalized, conv),
            ChatIntent.ConfirmCreateRequest => await ConfirmCreateRequestAsync(context, conv),
            _ => BuildFallbackResponse(context, conv)
        };

        if (response.Intent == "fallback" && _options.Value.UseAzureOpenAI)
        {
            var llmReply = await TryAskAzureOpenAIAsync(context, message, cancellationToken);
            if (!string.IsNullOrWhiteSpace(llmReply))
            {
                response.Reply = llmReply;
                response.Intent = "fallback_llm";
            }
        }

        return response;
    }

    private async Task<ChatUserContext> ResolveContextAsync(ChatUserContext incomingContext)
    {
        if (incomingContext.UserId <= 0)
            return incomingContext;

        var profile = ToElement(await _staffStore.GetByIdAsync(incomingContext.UserId));
        if (profile.ValueKind != JsonValueKind.Object)
            return incomingContext;

        var role = !string.IsNullOrWhiteSpace(incomingContext.Role)
            ? incomingContext.Role
            : GetString(profile, "role") ?? "staff";

        var serviceId = incomingContext.ServiceId
            ?? GetInt(profile, "serviceId")
            ?? GetInt(profile, "service_id");

        var poleId = incomingContext.PoleId
            ?? GetInt(profile, "poleId")
            ?? GetInt(profile, "pole_id");

        var specialite = incomingContext.Specialite ?? GetString(profile, "specialite");

        var displayName = incomingContext.UserName;
        if (string.IsNullOrWhiteSpace(displayName))
        {
            var prenom = GetString(profile, "prenom") ?? string.Empty;
            var nom = GetString(profile, "nom") ?? string.Empty;
            displayName = $"{prenom} {nom}".Trim();
        }

        return new ChatUserContext
        {
            UserId = incomingContext.UserId,
            Role = NormalizeRole(role),
            ServiceId = serviceId,
            PoleId = poleId,
            Specialite = specialite,
            UserName = string.IsNullOrWhiteSpace(displayName) ? null : displayName
        };
    }

    private static ParsedMessage ParseMessage(string normalized, ChatUserContext context, IReadOnlyList<ServiceMedical> services)
    {
        var detectedDate = TryExtractDate(normalized);
        var asksToday = normalized.Contains("aujourd");
        var asksTomorrow = normalized.Contains("demain");
        var asksWeek = normalized.Contains("semaine");
        var asksMyService = normalized.Contains("mon service") || normalized.Contains("ma service");
        var service = TryExtractService(normalized, services);

        if (ContainsCreateDemandPhrase(normalized))
            return new ParsedMessage(ChatIntent.PrepareCreateRequest, detectedDate, service, asksMyService);

        if (ContainsConfirmation(normalized))
            return new ParsedMessage(ChatIntent.ConfirmCreateRequest, detectedDate, service, asksMyService);

        if (ContainsAny(normalized, "combien", "solde", "rc+", "rc-", "heures rc"))
            return new ParsedMessage(ChatIntent.Counters, detectedDate, service, asksMyService);

        if (ContainsAny(normalized, "comment", "procedure") && ContainsAny(normalized, "absence", "demande", "recuperation", "recup"))
            return new ParsedMessage(ChatIntent.Procedure, detectedDate, service, asksMyService);

        if (IsProfileQuestion(normalized))
            return new ParsedMessage(ChatIntent.Profile, detectedDate, service, asksMyService);

        if (ContainsAny(normalized, "ou en est", "statut") && normalized.Contains("demande"))
            return new ParsedMessage(ChatIntent.RequestStatus, detectedDate, service, asksMyService);

        if (ContainsAny(normalized, "qui est en conge", "liste des absences", "absent", "en vacances", "en conge"))
            return new ParsedMessage(ChatIntent.AbsenceList, detectedDate, service, asksMyService);

        if (ContainsAny(normalized, "regle", "repos", "garde"))
            return new ParsedMessage(ChatIntent.Rules, detectedDate, service, asksMyService);

        if (IsManagerQuestion(normalized))
            return new ParsedMessage(ChatIntent.Manager, detectedDate, service, asksMyService);

        if (IsAccessScopeQuestion(normalized))
            return new ParsedMessage(ChatIntent.AccessScope, detectedDate, service, asksMyService);

        if (IsServiceUsersQuestion(normalized))
            return new ParsedMessage(ChatIntent.ServiceUsers, detectedDate, service, asksMyService);

        if (IsUserLookupQuestion(normalized))
        {
            var query = ExtractUserLookupTerm(normalized);
            var isCountQuestion = ContainsAny(normalized, "combien", "nombre") || normalized.StartsWith("existe", StringComparison.Ordinal);
            return new ParsedMessage(ChatIntent.UserLookup, detectedDate, service, asksMyService, false, query, isCountQuestion);
        }

        if (IsNavigationQuestion(normalized))
            return new ParsedMessage(ChatIntent.NavigationHelp, detectedDate, service, asksMyService);

        if (ContainsAny(normalized, "quelles informations", "quelles infos", "quelles donnees", "ce que tu connais", "tu connais quoi", "base de donnees", "dans la base", "tous les donnees", "toutes les donnees", "toutes les informations", "qu'est-ce qu'il y a dans la base", "qu est ce qu il y a dans la base"))
            return new ParsedMessage(ChatIntent.DataCatalog, detectedDate, service, asksMyService);

        if (normalized.Contains("planning"))
        {
            var requestsServicePlanning = service is not null
                || asksMyService
                || ContainsAny(normalized, "service", "equipe")
                || context.Role is "super-admin" or "admin-gta";

            if (requestsServicePlanning && !ContainsAny(normalized, "mon planning", "mes horaires", "moi"))
            {
                var date = asksToday ? DateTime.Today : asksTomorrow ? DateTime.Today.AddDays(1) : detectedDate;
                return new ParsedMessage(ChatIntent.ServicePlanning, date, service, asksMyService, asksWeek);
            }

            var personalDate = asksToday ? DateTime.Today : asksTomorrow ? DateTime.Today.AddDays(1) : detectedDate;
            return new ParsedMessage(ChatIntent.PersonalPlanning, personalDate, service, asksMyService, asksWeek);
        }

        return new ParsedMessage(ChatIntent.Fallback, detectedDate, service, asksMyService);
    }

    private async Task<ChatResponse> BuildPersonalPlanningResponseAsync(ChatUserContext context, ParsedMessage parsed, string conversationId)
    {
        var planningRaw = await _staffStore.GetUserPlanningAsync(context.UserId);
        var entries = planningRaw.Select(ToElement).ToList();

        if (entries.Count == 0)
        {
            return BuildSimpleResponse(conversationId, "personal_planning", "Je n'ai trouve aucune affectation de planning pour votre compte.", BuildSuggestionsByRole(context));
        }

        if (parsed.IsWeek)
        {
            var (weekStart, weekEnd) = CurrentWeekRange();
            var weekEntries = entries
                .Where(e => TryGetDate(e, "date", out var d) && d.Date >= weekStart.Date && d.Date <= weekEnd.Date)
                .OrderBy(e => GetDateOrMin(e, "date"))
                .Take(14)
                .ToList();

            if (weekEntries.Count == 0)
                return BuildSimpleResponse(conversationId, "personal_planning", "Aucune affectation sur votre planning pour cette semaine.", BuildSuggestionsByRole(context));

            var lines = weekEntries.Select(FormatPersonalPlanningLine);
            return BuildSimpleResponse(
                conversationId,
                "personal_planning",
                $"Votre planning personnel (semaine du {weekStart:dd/MM} au {weekEnd:dd/MM}) :\n" + string.Join("\n", lines),
                BuildSuggestionsByRole(context));
        }

        var targetDate = parsed.Date?.Date ?? DateTime.Today;
        var dayEntries = entries
            .Where(e => TryGetDate(e, "date", out var d) && d.Date == targetDate)
            .OrderBy(e => GetDateOrMin(e, "date"))
            .ToList();

        if (dayEntries.Count == 0)
            return BuildSimpleResponse(conversationId, "personal_planning", $"Aucune affectation trouvee pour le {targetDate:dd/MM/yyyy}.", BuildSuggestionsByRole(context));

        var reply = dayEntries.Count == 1
            ? BuildSinglePersonalPlanningSentence(dayEntries[0])
            : $"Pour le {targetDate:dd/MM/yyyy}, vous avez {dayEntries.Count} affectations:\n" + string.Join("\n", dayEntries.Select(FormatPersonalPlanningLine));

        return BuildSimpleResponse(conversationId, "personal_planning", reply, BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> BuildServicePlanningResponseAsync(ChatUserContext context, ParsedMessage parsed, IReadOnlyList<ServiceMedical> services, string conversationId)
    {
        var targetService = ResolveTargetService(context, parsed, services);
        if (targetService.Error is not null)
            return BuildSimpleResponse(conversationId, "service_planning", targetService.Error, BuildSuggestionsByRole(context));

        var service = targetService.Service!;
        if (parsed.IsWeek || parsed.Date is null)
        {
            var (weekStart, weekEnd) = CurrentWeekRange();
            var planning = await _planningStore.GetPlanningAsync(service.Id.ToString(CultureInfo.InvariantCulture), service.Nom, weekStart, weekEnd);
            var lines = FormatServicePlanningLines(planning, weekStart, weekEnd);

            if (lines.Count == 0)
                return BuildSimpleResponse(conversationId, "service_planning", $"Aucune affectation de planning trouvee pour le service {service.Nom} cette semaine.", BuildSuggestionsByRole(context));

            return BuildSimpleResponse(
                conversationId,
                "service_planning",
                $"Planning du service {service.Nom} (semaine du {weekStart:dd/MM} au {weekEnd:dd/MM}) :\n" + string.Join("\n", lines.Take(16)),
                BuildSuggestionsByRole(context));
        }

        var day = parsed.Date.Value.Date;
        var dayWeekStart = ToWeekMonday(day);
        var dayPlanning = await _planningStore.GetPlanningAsync(service.Id.ToString(CultureInfo.InvariantCulture), service.Nom, dayWeekStart, dayWeekStart.AddDays(6));
        var dayIndex = (int)(day - dayWeekStart).TotalDays;
        var dayAssignments = dayPlanning.Assignments.Where(a => a.Day == dayIndex).ToList();

        if (dayAssignments.Count == 0)
            return BuildSimpleResponse(conversationId, "service_planning", $"Aucune affectation trouvee le {day:dd/MM/yyyy} pour le service {service.Nom}.", BuildSuggestionsByRole(context));

        var personnelById = dayPlanning.Personnel.ToDictionary(p => p.Id, p => BuildDisplayName(p.Prenom, p.Nom), StringComparer.OrdinalIgnoreCase);
        var linesForDay = dayAssignments.Select(a =>
        {
            var name = ResolvePersonnelName(a.PersonnelId, personnelById);
            var poste = string.IsNullOrWhiteSpace(a.PosteLabel) ? a.ShiftType : a.PosteLabel;
            var h1 = string.IsNullOrWhiteSpace(a.StartTime) ? "--:--" : a.StartTime;
            var h2 = string.IsNullOrWhiteSpace(a.EndTime) ? "--:--" : a.EndTime;
            return $"- {name} : {poste} ({h1}-{h2})";
        });

        return BuildSimpleResponse(conversationId, "service_planning", $"Planning du service {service.Nom} pour le {day:dd/MM/yyyy} :\n" + string.Join("\n", linesForDay), BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> BuildCountersResponseAsync(ChatUserContext context, string conversationId)
    {
        var counters = await _planningStore.GetUserTimeCountersAsync(context.UserId);
        return BuildSimpleResponse(
            conversationId,
            "counters",
            $"Votre solde actuel est RC+ = {counters.SoldeRcPlus:0.##} h et RC- = {counters.SoldeRcMoins:0.##} h.",
            BuildSuggestionsByRole(context));
    }

    private ChatResponse BuildProcedureResponse(string normalized, string conversationId)
    {
        var key = normalized.Contains("recup") ? "recuperation" : "absence";
        var text = _knowledge.Procedures.TryGetValue(key, out var value)
            ? value
            : "Ouvrez Mon espace > Demandes, renseignez les informations, puis envoyez la demande pour validation.";

        return BuildSimpleResponse(
            conversationId,
            "procedure",
            text,
            ["Ou en est ma demande du 15 avril ?", "Quel est mon planning aujourd'hui ?", "Combien d'heures RC+ me reste-t-il ?"]);
    }

    private async Task<ChatResponse> BuildRequestStatusResponseAsync(ChatUserContext context, ParsedMessage parsed, string conversationId)
    {
        var targetDate = parsed.Date ?? DateTime.Today;
        var list = await _planningStore.GetUserPlanningRequestsAsync(context.UserId, targetDate.Date, targetDate.Date);

        if (list.Count == 0)
        {
            var latest = await _planningStore.GetUserPlanningRequestsAsync(context.UserId, DateTime.Today.AddMonths(-3), DateTime.Today.AddDays(1));
            if (latest.Count == 0)
                return BuildSimpleResponse(conversationId, "request_status", "Je n'ai trouve aucune demande sur les trois derniers mois.", BuildSuggestionsByRole(context));

            var lines = latest.Take(4).Select(r => $"- {r.Date:dd/MM}: {r.Type} ({r.Statut})");
            return BuildSimpleResponse(conversationId, "request_status", "Aucune demande a cette date. Dernieres demandes :\n" + string.Join("\n", lines), BuildSuggestionsByRole(context));
        }

        var responseLines = list.Select(r =>
        {
            var validator = string.IsNullOrWhiteSpace(r.ValideParNom) ? "-" : r.ValideParNom;
            return $"- {r.Date:dd/MM}: {r.Type} -> {r.Statut} (valideur: {validator})";
        });

        return BuildSimpleResponse(conversationId, "request_status", "Statut de vos demandes :\n" + string.Join("\n", responseLines), BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> BuildAbsenceListResponseAsync(ChatUserContext context, ParsedMessage parsed, IReadOnlyList<ServiceMedical> services, string conversationId)
    {
        if (context.Role == "staff")
            return BuildSimpleResponse(conversationId, "absence_list", "Vous ne pouvez consulter que vos propres donnees. Demandez plutot: 'Ou en est ma demande ?'", BuildSuggestionsByRole(context));

        var targetService = ResolveTargetService(context, parsed, services);
        if (targetService.Error is not null)
            return BuildSimpleResponse(conversationId, "absence_list", targetService.Error, BuildSuggestionsByRole(context));

        var service = targetService.Service!;
        var date = parsed.Date?.Date ?? DateTime.Today;

        var staff = await _staffStore.GetAllAsync(serviceId: service.Id);
        var absentNames = new List<string>();

        foreach (var person in staff)
        {
            var p = ToElement(person);
            var userId = GetInt(p, "id");
            if (!userId.HasValue || userId.Value <= 0)
                continue;

            var requests = await _planningStore.GetUserPlanningRequestsAsync(userId.Value, date, date);
            var isAbsent = requests.Any(r =>
                string.Equals(r.Statut, "APPROUVEE", StringComparison.OrdinalIgnoreCase)
                && (string.Equals(r.Type, "ABSENCE", StringComparison.OrdinalIgnoreCase)
                    || r.Type.Contains("CONGE", StringComparison.OrdinalIgnoreCase)));

            if (!isAbsent)
                continue;

            absentNames.Add(BuildDisplayName(GetString(p, "prenom"), GetString(p, "nom")));
        }

        if (absentNames.Count == 0)
            return BuildSimpleResponse(conversationId, "absence_list", $"Aucun agent en conge trouve pour le service {service.Nom} le {date:dd/MM/yyyy}.", BuildSuggestionsByRole(context));

        return BuildSimpleResponse(conversationId, "absence_list", $"Dans le service {service.Nom}, les agents suivants sont en conge le {date:dd/MM/yyyy} : {string.Join(", ", absentNames)}.", BuildSuggestionsByRole(context));
    }

    private ChatResponse BuildRulesResponse(string conversationId)
    {
        var restRule = _knowledge.Rules.TryGetValue("repos_garde", out var value)
            ? value
            : "Apres une garde, un repos minimal de 11 heures doit etre respecte.";

        return BuildSimpleResponse(
            conversationId,
            "rules",
            restRule,
            ["Comment faire une demande d'absence ?", "Quel est mon planning aujourd'hui ?", "Ou en est ma demande du 15 avril ?"]);
    }

    private async Task<ChatResponse> BuildManagerResponseAsync(ChatUserContext context, IReadOnlyList<ServiceMedical> services, string conversationId)
    {
        if (!context.ServiceId.HasValue)
            return BuildSimpleResponse(conversationId, "manager", "Je n'ai pas retrouve votre service. Impossible d'identifier votre chef de service.", BuildSuggestionsByRole(context));

        var service = services.FirstOrDefault(s => s.Id == context.ServiceId.Value);
        if (service is null || !service.ChefServiceId.HasValue)
            return BuildSimpleResponse(conversationId, "manager", "Aucun chef de service n'est configure pour votre service.", BuildSuggestionsByRole(context));

        var manager = ToElement(await _staffStore.GetByIdAsync(service.ChefServiceId.Value));
        var managerName = BuildDisplayName(GetString(manager, "prenom"), GetString(manager, "nom"));

        return BuildSimpleResponse(conversationId, "manager", $"Votre chef de service est {managerName} (service: {service.Nom}).", BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> BuildProfileResponseAsync(ChatUserContext context, string conversationId)
    {
        var profile = ToElement(await _staffStore.GetByIdAsync(context.UserId));
        var roleRaw = GetString(profile, "role") ?? context.Role;
        var specialite = GetString(profile, "specialite") ?? context.Specialite;
        var serviceName = context.ServiceId.HasValue
            ? (await _structureStore.GetServicesAsync()).FirstOrDefault(s => s.Id == context.ServiceId.Value)?.Nom
            : null;

        var details = new List<string>
        {
            $"Votre role est {FriendlyRoleLabel(roleRaw)}."
        };

        if (!string.IsNullOrWhiteSpace(specialite))
            details.Add($"Votre specialite est {specialite}.");
        else
            details.Add("Aucune specialite n'est renseignee pour votre compte.");

        if (!string.IsNullOrWhiteSpace(serviceName))
            details.Add($"Vous etes rattache(e) au service {serviceName}.");

        if (NormalizeRole(roleRaw) == "chef-service")
            details.Add("Vous etes bien chef de service pour votre service rattache.");

        return BuildSimpleResponse(conversationId, "profile", string.Join(" ", details), BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> BuildDataCatalogResponseAsync(ChatUserContext context, string conversationId)
    {
        var services = await _structureStore.GetServicesAsync();
        var poles = await _structureStore.GetPolesAsync();
        var staff = await _staffStore.GetAllAsync(
            serviceId: context.Role == "chef-service" ? context.ServiceId : null,
            poleId: context.Role == "chef-pole" ? context.PoleId : null);

        var scopeText = context.Role switch
        {
            "super-admin" or "admin-gta" => "périmètre global",
            "chef-service" => context.ServiceId.HasValue
                ? $"périmètre du service {services.FirstOrDefault(s => s.Id == context.ServiceId.Value)?.Nom ?? context.ServiceId.Value.ToString(CultureInfo.InvariantCulture)}"
                : "périmètre de votre service",
            "chef-pole" => context.PoleId.HasValue
                ? $"périmètre du pôle {poles.FirstOrDefault(p => p.Id == context.PoleId.Value)?.Nom ?? context.PoleId.Value.ToString(CultureInfo.InvariantCulture)}"
                : "périmètre de votre pôle",
            _ => "vos données personnelles"
        };

        var lines = new List<string>
        {
            $"Je peux consulter les données suivantes dans la base, selon votre rôle ({scopeText}) :",
            "- Profil utilisateur : rôle, spécialité, service, pôle, équipe",
            "- Planning personnel et planning de service",
            "- Compteurs RC+/RC-",
            "- Demandes d'absence / récupération et leur statut",
            "- Chef de service et responsables rattachés",
            "- Règles de repos, workflow et validations"
        };

        if (context.Role is "super-admin" or "admin-gta")
        {
            lines.Add($"- Référentiel structure: {poles.Count} pôles, {services.Count} services, {staff.Count} utilisateurs visibles");
        }
        else if (context.Role == "chef-service")
        {
            lines.Add($"- Votre service contient actuellement {staff.Count} utilisateur(s) visibles par votre périmètre");
        }
        else if (context.Role == "chef-pole")
        {
            lines.Add($"- Votre pôle contient actuellement {services.Count(s => s.PoleId == context.PoleId)} service(s) et {staff.Count} utilisateur(s) visibles par votre périmètre");
        }

        lines.Add("Posez une question précise, par exemple: 'Quel est mon planning aujourd'hui ?', 'Qui est en congé dans mon service ?' ou 'Quelles sont les règles de repos ?'.");

        return BuildSimpleResponse(conversationId, "data_catalog", string.Join("\n", lines), BuildSuggestionsByRole(context));
    }

    private Task<ChatResponse> BuildAccessScopeResponseAsync(ChatUserContext context, string conversationId)
    {
        var reply = context.Role switch
        {
            "super-admin" or "admin-gta" =>
                "Vous avez un acces global a l'application.\n" +
                "- Vous voyez tous les services, poles, utilisateurs et workflows\n" +
                "- Vous pouvez demander des listes par service/pole\n" +
                "- Vous pouvez consulter les plannings globaux\n" +
                "Exemple: 'Liste les utilisateurs du service Urgences'.",
            "chef-service" =>
                context.ServiceId.HasValue
                    ? "Vous avez un acces service.\n" +
                      "- Vous voyez les donnees de votre service uniquement\n" +
                      "- Vous pouvez lister les utilisateurs de votre service\n" +
                      "- Vous pouvez consulter planning, demandes et absences de votre service"
                    : "Vous avez acces a votre service uniquement, mais votre service n'a pas ete identifie.",
            "chef-pole" =>
                context.PoleId.HasValue
                    ? "Vous avez un acces pole.\n" +
                      "- Vous voyez les services de votre pole\n" +
                      "- Vous pouvez consulter leurs utilisateurs et plannings\n" +
                      "- Vous pouvez suivre les demandes visibles de votre pole"
                    : "Vous avez acces aux services de votre pole, mais le pole n'a pas ete identifie.",
            _ =>
                "Vous avez un acces personnel.\n" +
                "- Vos donnees de planning\n" +
                "- Vos demandes et compteurs RC\n" +
                "- Votre profil"
        };

        return Task.FromResult(BuildSimpleResponse(conversationId, "access_scope", reply, BuildSuggestionsByRole(context)));
    }

    private async Task<ChatResponse> BuildServiceUsersResponseAsync(ChatUserContext context, ParsedMessage parsed, IReadOnlyList<ServiceMedical> services, string conversationId)
    {
        var targetService = ResolveTargetService(context, parsed, services);
        if (targetService.Error is not null)
            return BuildSimpleResponse(conversationId, "service_users", targetService.Error, BuildSuggestionsByRole(context));

        var service = targetService.Service!;
        var users = (await _staffStore.GetAllAsync(serviceId: service.Id)).Select(ToElement).ToList();

        if (users.Count == 0)
            return BuildSimpleResponse(conversationId, "service_users", $"Je n'ai trouve aucun utilisateur pour le service {service.Nom}.", BuildSuggestionsByRole(context));

        var roleSummary = users
            .GroupBy(u => FriendlyRoleLabel(GetString(u, "role") ?? string.Empty))
            .OrderByDescending(g => g.Count())
            .Select(g => $"{g.Key}: {g.Count()}")
            .ToList();

        var displayUsers = users.Take(20).Select(FormatStaffDirectoryLine).ToList();
        var extra = users.Count > displayUsers.Count ? $"\n... et {users.Count - displayUsers.Count} autre(s) utilisateur(s)." : string.Empty;

        return BuildSimpleResponse(
            conversationId,
            "service_users",
            $"Utilisateurs du service {service.Nom} ({users.Count})\n" +
            $"Repartition: {string.Join(" | ", roleSummary)}\n\n" +
            string.Join("\n", displayUsers) +
            extra,
            BuildSuggestionsByRole(context));
    }

    private ChatResponse BuildNavigationHelpResponse(ChatUserContext context, string normalized, string conversationId)
    {
        var guide = ResolveNavigationGuide(normalized);
        var reply = guide is null
            ? "Je peux vous guider dans l'application. Dites-moi ce que vous voulez faire: planning, demandes, validation workflow, utilisateurs, structure, roles/permissions ou dashboard."
            : $"Pour {guide.Value.Topic}, allez dans: {guide.Value.Path}. {guide.Value.Extra}";

        return BuildSimpleResponse(conversationId, "navigation_help", reply, BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> BuildUserLookupResponseAsync(ChatUserContext context, ParsedMessage parsed, string conversationId)
    {
        var query = parsed.Query;
        if (string.IsNullOrWhiteSpace(query))
        {
            return BuildSimpleResponse(
                conversationId,
                "user_lookup",
                "Je peux chercher un utilisateur, mais j'ai besoin d'un nom. Exemple: 'Combien de Yassin j'ai dans mon app ?' ou 'Yassin est un utilisateur ?'.",
                BuildSuggestionsByRole(context));
        }

        var serviceScope = context.Role == "chef-service" ? context.ServiceId : null;
        var poleScope = context.Role == "chef-pole" ? context.PoleId : null;
        var userScope = context.Role == "staff" ? context.UserId.ToString(CultureInfo.InvariantCulture) : null;

        var users = (await _staffStore.GetAllAsync(serviceId: serviceScope, poleId: poleScope, userId: userScope))
            .Select(ToElement)
            .ToList();

        var matched = users.Where(u => UserMatchesQuery(u, query)).ToList();

        if (parsed.IsCountQuestion)
        {
            var perimeter = context.Role switch
            {
                "super-admin" or "admin-gta" => "dans toute l'application",
                "chef-service" => "dans votre service",
                "chef-pole" => "dans votre pôle",
                _ => "dans votre périmètre personnel"
            };

            return BuildSimpleResponse(
                conversationId,
                "user_lookup",
                $"J'ai trouvé {matched.Count} utilisateur(s) correspondant à '{query}' {perimeter}.",
                BuildSuggestionsByRole(context));
        }

        if (matched.Count == 0)
            return BuildSimpleResponse(conversationId, "user_lookup", $"Non, je n'ai trouvé aucun utilisateur correspondant à '{query}' dans votre périmètre.", BuildSuggestionsByRole(context));

        var top = matched.Take(5).Select(FormatStaffDirectoryLine).ToList();
        var extra = matched.Count > top.Count ? $"\n... et {matched.Count - top.Count} autre(s) résultat(s)." : string.Empty;

        return BuildSimpleResponse(
            conversationId,
            "user_lookup",
            $"Oui. J'ai trouvé {matched.Count} utilisateur(s) correspondant à '{query}' :\n" + string.Join("\n", top) + extra,
            BuildSuggestionsByRole(context));
    }

    private async Task<ChatResponse> PrepareCreateRequestResponseAsync(ChatUserContext context, string normalized, string conversationId)
    {
        if (!context.ServiceId.HasValue)
            return BuildSimpleResponse(conversationId, "prepare_create_request", "Impossible de creer une demande sans service utilisateur.", BuildSuggestionsByRole(context));

        var date = TryExtractDate(normalized);
        if (!date.HasValue)
        {
            return BuildSimpleResponse(
                conversationId,
                "prepare_create_request",
                "Pour creer la demande, j'ai besoin de la date (ex: 20/05 ou 20 mai).",
                ["Je veux une recuperation le 20/05", "Je veux une absence le 15 avril"]);
        }

        var counters = await _planningStore.GetUserTimeCountersAsync(context.UserId);
        var type = normalized.Contains("recup") || normalized.Contains("recuperation") ? "RECUPERATION" : "ABSENCE";
        var (hStart, hEnd) = TryExtractHours(normalized) ?? ("09:00", "16:00");

        _pendingByUser[context.UserId] = new PendingCreateRequest(new CreateUserPlanningRequestDto
        {
            UserId = context.UserId,
            ServiceId = context.ServiceId.Value,
            Date = date.Value,
            Type = type,
            HeureDebut = hStart,
            HeureFin = hEnd,
            Commentaire = "Cree depuis chatbot"
        });

        return new ChatResponse
        {
            ConversationId = conversationId,
            Intent = "prepare_create_request",
            ActionPending = true,
            Reply = $"Votre solde RC+ actuel est {counters.SoldeRcPlus:0.##} h. Je peux creer une demande {type.ToLowerInvariant()} le {date:dd/MM} ({hStart}-{hEnd}). Repondez 'oui' pour confirmer.",
            Suggestions = ["Oui", "Non, annuler"]
        };
    }

    private async Task<ChatResponse> ConfirmCreateRequestAsync(ChatUserContext context, string conversationId)
    {
        if (!_pendingByUser.TryRemove(context.UserId, out var pending))
            return BuildSimpleResponse(conversationId, "confirm_create_request", "Aucune creation en attente a confirmer.", BuildSuggestionsByRole(context));

        var created = await _planningStore.CreateUserPlanningRequestAsync(pending.Request);
        return BuildSimpleResponse(conversationId, "confirm_create_request", $"Demande creee avec succes (id: {created.Id}) et envoyee pour validation.", BuildSuggestionsByRole(context));
    }

    private ChatResponse BuildFallbackResponse(ChatUserContext context, string conversationId)
    {
        var perimeter = context.Role switch
        {
            "super-admin" or "admin-gta" => "Vous pouvez interroger tous les services et poles.",
            "chef-service" => "Vous pouvez interroger les donnees de votre service uniquement.",
            "chef-pole" => "Vous pouvez interroger les donnees des services de votre pole.",
            _ => "Vous pouvez interroger vos donnees personnelles (planning, RC, demandes)."
        };

        return BuildSimpleResponse(conversationId, "fallback", "Je n'ai pas bien compris votre question. " + perimeter, BuildSuggestionsByRole(context));
    }

    private async Task<string?> TryAskAzureOpenAIAsync(ChatUserContext context, string userMessage, CancellationToken cancellationToken)
    {
        var options = _options.Value;
        if (!options.UseAzureOpenAI || string.IsNullOrWhiteSpace(options.AzureOpenAIEndpoint) || string.IsNullOrWhiteSpace(options.AzureOpenAIKey) || string.IsNullOrWhiteSpace(options.AzureOpenAIDeployment))
            return null;

        try
        {
            var client = _httpClientFactory.CreateClient(nameof(ChatService));
            client.Timeout = TimeSpan.FromMilliseconds(Math.Max(300, options.TimeoutMs));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", options.AzureOpenAIKey);

            var uri = $"{options.AzureOpenAIEndpoint.TrimEnd('/')}/openai/deployments/{options.AzureOpenAIDeployment}/chat/completions?api-version=2024-10-21";
            var payload = new
            {
                messages = new object[]
                {
                    new { role = "system", content = "Tu es l'assistant MediPlan. Reponds en francais sans sortir du perimetre role utilisateur." },
                    new { role = "user", content = $"Role={context.Role}; userId={context.UserId}; serviceId={context.ServiceId}; poleId={context.PoleId}; question={userMessage}" }
                },
                max_tokens = 220,
                temperature = 0.2
            };

            var req = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };
            req.Headers.Add("api-key", options.AzureOpenAIKey);

            var res = await client.SendAsync(req, cancellationToken);
            if (!res.IsSuccessStatusCode)
                return null;

            await using var stream = await res.Content.ReadAsStreamAsync(cancellationToken);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            return doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString()?.Trim();
        }
        catch
        {
            return null;
        }
    }

    private static ChatResponse BuildSimpleResponse(string conversationId, string intent, string reply, List<string> suggestions)
    {
        return new ChatResponse
        {
            ConversationId = conversationId,
            Intent = intent,
            Reply = reply,
            Suggestions = suggestions
        };
    }

    private static (ServiceMedical? Service, string? Error) ResolveTargetService(ChatUserContext context, ParsedMessage parsed, IReadOnlyList<ServiceMedical> services)
    {
        ServiceMedical? target = parsed.Service;

        if (target is null && parsed.AsksMyService && context.ServiceId.HasValue)
            target = services.FirstOrDefault(s => s.Id == context.ServiceId.Value);

        if (target is null)
        {
            if (context.Role == "chef-service" && context.ServiceId.HasValue)
            {
                target = services.FirstOrDefault(s => s.Id == context.ServiceId.Value);
            }
            else if (context.Role == "chef-pole" && context.PoleId.HasValue)
            {
                var inPole = services.Where(s => s.PoleId == context.PoleId.Value).ToList();
                if (inPole.Count == 1)
                    target = inPole[0];
                else
                    return (null, "Precisez le service concerne dans votre pole (ex: service cardiologie). ");
            }
            else if (context.Role is "super-admin" or "admin-gta")
            {
                return (null, "Precisez le service concerne (ex: service urgences).");
            }
        }

        if (target is null)
            return (null, "Je n'ai pas pu determiner le service cible.");

        if (!IsAllowedForService(context, target))
            return (null, "Vous n'etes pas autorise a consulter ce service avec votre role.");

        return (target, null);
    }

    private static bool IsAllowedForService(ChatUserContext context, ServiceMedical service)
    {
        return context.Role switch
        {
            "super-admin" => true,
            "admin-gta" => true,
            "chef-service" => context.ServiceId.HasValue && context.ServiceId.Value == service.Id,
            "chef-pole" => context.PoleId.HasValue && context.PoleId.Value == service.PoleId,
            _ => false
        };
    }

    private static List<string> BuildSuggestionsByRole(ChatUserContext context)
    {
        return context.Role switch
        {
            "super-admin" or "admin-gta" =>
            [
                "Combien de Yassin j'ai dans mon app ?",
                "Quelles sont mes informations d'accès ?",
                "Liste les utilisateurs du service Urgences",
                "Affiche le planning du service Urgences cette semaine",
                "Où trouver le workflow de validation ?"
            ],
            "chef-service" =>
            [
                "Combien de Yassin j'ai dans mon service ?",
                "Quelles sont mes informations d'accès ?",
                "Liste les utilisateurs de mon service",
                "Affiche le planning de mon service cette semaine",
                "Qui est en conge aujourd'hui dans mon service ?",
                "Ou en est ma demande du 15 avril ?",
                "Où aller pour gérer les demandes ?"
            ],
            "chef-pole" =>
            [
                "Quelles sont mes informations d'accès ?",
                "Liste les utilisateurs du service Urgences",
                "Affiche le planning du service Cardiologie cette semaine",
                "Où trouver la structure des services ?"
            ],
            _ =>
            [
                "Yassin est un utilisateur ?",
                "Quelles sont mes informations d'accès ?",
                "Quel est mon planning aujourd'hui ?",
                "Combien d'heures RC+ me reste-t-il ?",
                "Ou en est ma demande du 15 avril ?",
                "Où trouver mes demandes ?"
            ]
        };
    }

    private static List<string> FormatServicePlanningLines(PlanningData planning, DateTime weekStart, DateTime weekEnd)
    {
        var personnelById = planning.Personnel.ToDictionary(p => p.Id, p => BuildDisplayName(p.Prenom, p.Nom), StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();

        foreach (var a in planning.Assignments.OrderBy(x => x.Day).ThenBy(x => x.StartTime))
        {
            var dayDate = weekStart.AddDays(Math.Clamp(a.Day, 0, 6));
            if (dayDate < weekStart || dayDate > weekEnd)
                continue;

            var name = ResolvePersonnelName(a.PersonnelId, personnelById);
            var poste = string.IsNullOrWhiteSpace(a.PosteLabel) ? a.ShiftType : a.PosteLabel;
            var h1 = string.IsNullOrWhiteSpace(a.StartTime) ? "--:--" : a.StartTime;
            var h2 = string.IsNullOrWhiteSpace(a.EndTime) ? "--:--" : a.EndTime;
            result.Add($"- {dayDate:dddd dd/MM}: {name} ({poste}, {h1}-{h2})");
        }

        return result;
    }

    private static string BuildSinglePersonalPlanningSentence(JsonElement entry)
    {
        var poste = GetString(entry, "poste") ?? "Affectation";
        var h1 = GetString(entry, "heureDebut") ?? "--:--";
        var h2 = GetString(entry, "heureFin") ?? "--:--";
        return $"Vous etes affecte(e) a {poste} de {h1} a {h2}.";
    }

    private static string FormatPersonalPlanningLine(JsonElement entry)
    {
        _ = TryGetDate(entry, "date", out var d);
        var poste = GetString(entry, "poste") ?? "Affectation";
        var h1 = GetString(entry, "heureDebut") ?? "--:--";
        var h2 = GetString(entry, "heureFin") ?? "--:--";
        return $"- {d:dddd dd/MM}: {poste} ({h1}-{h2})";
    }

    private static string ResolvePersonnelName(string? personnelId, IReadOnlyDictionary<string, string> personnelById)
    {
        if (!string.IsNullOrWhiteSpace(personnelId) && personnelById.TryGetValue(personnelId, out var name))
            return name;

        return string.IsNullOrWhiteSpace(personnelId) ? "Personnel non renseigne" : personnelId;
    }

    private static ServiceMedical? TryExtractService(string normalized, IReadOnlyList<ServiceMedical> services)
    {
        foreach (var service in services)
        {
            var serviceName = Normalize(service.Nom);
            if (!string.IsNullOrWhiteSpace(serviceName) && ServiceNameMatches(normalized, serviceName))
                return service;
        }

        return null;
    }

    private static bool ServiceNameMatches(string normalizedText, string normalizedServiceName)
    {
        if (normalizedText.Contains(normalizedServiceName, StringComparison.Ordinal))
            return true;

        var textNoPlural = normalizedText.Replace("services", "service", StringComparison.Ordinal);
        var serviceNoPlural = normalizedServiceName.EndsWith("s", StringComparison.Ordinal) && normalizedServiceName.Length > 1
            ? normalizedServiceName[..^1]
            : normalizedServiceName;

        return textNoPlural.Contains(serviceNoPlural, StringComparison.Ordinal)
            || normalizedText.Contains(serviceNoPlural, StringComparison.Ordinal)
            || normalizedServiceName.Contains(normalizedText, StringComparison.Ordinal);
    }

    private static bool ContainsAny(string text, params string[] snippets)
    {
        foreach (var snippet in snippets)
        {
            if (text.Contains(snippet, StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    private static bool IsAccessScopeQuestion(string normalized)
    {
        return ContainsAny(normalized,
            "j ai acces", "j ai l acces", "j ai acces a tous", "j ai acces a toute", "ai je acces", "ai-je acces",
            "a quoi j ai acces", "a quelles donnees j ai acces", "quel est mon perimetre", "mon perimetre", "que puis je voir", "qu est ce que je peux voir",
            "quelles sont mes informations d acces", "mes informations d acces", "informations d acces", "informations acces",
            "ou une partie", "toute l application", "tous l app", "tous l application", "toutes les donnees", "tous les services et poles",
            "est ce que j ai acces", "est-ce que j ai acces");
    }

    private static bool IsServiceUsersQuestion(string normalized)
    {
        return ContainsAny(normalized,
            "liste des users", "liste des utilisateurs", "donner liste", "donne la liste", "donne moi la liste", "donne la liste des users",
            "donne la liste des utilisateurs", "qui travaille dans", "qui sont dans", "utilisateurs du service", "users du service",
            "membres du service", "agents du service", "personnels du service", "personnes du service", "personnes dans service",
            "agents dans le service", "liste des personnes", "affiche les utilisateurs", "affiche les personnes");
    }

    private static bool IsUserLookupQuestion(string normalized)
    {
        if (normalized.Contains("@", StringComparison.Ordinal))
            return true;

        var hasUserWord = ContainsAny(normalized, "utilisateur", "user", "users", "agent", "personnel", "personne", "nom", "mail", "email");
        var hasLookupWord = ContainsAny(normalized, "combien", "nombre", "est un", "existe", "il y a", "y a", "appeler", "appelle", "comme", "avec le mail", "avec mail", "a le mail");
        return hasUserWord && hasLookupWord;
    }

    private static string? ExtractUserLookupTerm(string normalized)
    {
        var emailPattern = Regex.Match(normalized, @"(?<email>[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (emailPattern.Success)
            return NormalizeLookupTerm(emailPattern.Groups["email"].Value);

        var countPattern = Regex.Match(normalized, @"\b(?:combien de|nombre de|combien d|existe(?: un| une)? utilisateur(?:s)?(?: avec le mail)?|y a t il un utilisateur(?: avec le mail)?|y a-t-il un utilisateur(?: avec le mail)?)\s+(?<name>[a-z0-9._%+@-]{2,80})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (countPattern.Success)
        {
            var extracted = NormalizeLookupTerm(countPattern.Groups["name"].Value);
            if (!string.IsNullOrWhiteSpace(extracted))
                return extracted;
        }

        var isPattern = Regex.Match(normalized, @"\b(?<name>[a-z][a-z\-]{1,30})\s+est\s+un\s+utilisateur\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (isPattern.Success)
        {
            var extracted = NormalizeLookupTerm(isPattern.Groups["name"].Value);
            if (!string.IsNullOrWhiteSpace(extracted))
                return extracted;
        }

        var likePattern = Regex.Match(normalized, @"\b(?:nom comme|comme|appel(?:e|é|er)?|avec le mail|avec mail|mail)\s+(?<name>[a-z0-9._%+@-]{2,80})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (likePattern.Success)
        {
            var extracted = NormalizeLookupTerm(likePattern.Groups["name"].Value);
            if (!string.IsNullOrWhiteSpace(extracted))
                return extracted;
        }

        var trailingPattern = Regex.Match(normalized, @"\b(?:existe(?: un| une)? utilisateur(?:s)?|utilisateur(?:s)?|user(?:s)?|agent(?:s)?|personnel(?:s)?|personne(?:s)?)\s+(?<name>[a-z0-9._%+@-]{2,80})\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (trailingPattern.Success)
        {
            var extracted = NormalizeLookupTerm(trailingPattern.Groups["name"].Value);
            if (!string.IsNullOrWhiteSpace(extracted))
                return extracted;
        }

        var tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var ignored = new HashSet<string>(StringComparer.Ordinal)
        {
            "combien", "de", "d", "j", "ai", "dans", "mon", "app", "application", "est", "un", "utilisateur", "utilisateurs", "users", "user", "il", "y", "a", "nombre", "existe", "avec", "le", "la", "mail", "email", "nom", "comme", "appel", "appelle", "appeler", "qui"
        };

        var candidate = tokens.FirstOrDefault(t => t.Length >= 3 && !ignored.Contains(t));
        return NormalizeLookupTerm(candidate);
    }

    private static string? NormalizeLookupTerm(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var trimmed = value.Trim().Trim('.', ',', ';', ':', '!', '?', '"', '\'');
        while (trimmed.StartsWith("le ", StringComparison.Ordinal) || trimmed.StartsWith("la ", StringComparison.Ordinal) || trimmed.StartsWith("l ", StringComparison.Ordinal) || trimmed.StartsWith("un ", StringComparison.Ordinal) || trimmed.StartsWith("une ", StringComparison.Ordinal) || trimmed.StartsWith("de ", StringComparison.Ordinal) || trimmed.StartsWith("du ", StringComparison.Ordinal) || trimmed.StartsWith("des ", StringComparison.Ordinal) || trimmed.StartsWith("avec ", StringComparison.Ordinal) || trimmed.StartsWith("mail ", StringComparison.Ordinal) || trimmed.StartsWith("nom ", StringComparison.Ordinal) || trimmed.StartsWith("comme ", StringComparison.Ordinal) || trimmed.StartsWith("appel ", StringComparison.Ordinal) || trimmed.StartsWith("appeler ", StringComparison.Ordinal) || trimmed.StartsWith("appelle ", StringComparison.Ordinal) || trimmed.StartsWith("est ", StringComparison.Ordinal) || trimmed.StartsWith("existe ", StringComparison.Ordinal))
        {
            trimmed = trimmed[(trimmed.IndexOf(' ') + 1)..].Trim();
        }

        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static bool UserMatchesQuery(JsonElement user, string query)
    {
        var prenom = GetString(user, "prenom") ?? string.Empty;
        var nom = GetString(user, "nom") ?? string.Empty;
        var email = GetString(user, "email") ?? string.Empty;
        var display = BuildDisplayName(prenom, nom);

        var normalizedQuery = Normalize(query);
        var foldedQuery = FoldRepeatedLetters(normalizedQuery);
        var queryDigits = Normalize(query).Replace(" ", string.Empty);

        var candidates = new[]
        {
            Normalize(prenom),
            Normalize(nom),
            Normalize(display),
            Normalize(email),
            FoldRepeatedLetters(Normalize(prenom)),
            FoldRepeatedLetters(Normalize(nom)),
            FoldRepeatedLetters(Normalize(display)),
            FoldRepeatedLetters(Normalize(email))
        };

        return candidates.Any(c =>
            !string.IsNullOrWhiteSpace(c) &&
            (c.Contains(normalizedQuery, StringComparison.Ordinal)
             || normalizedQuery.Contains(c, StringComparison.Ordinal)
             || c.Contains(foldedQuery, StringComparison.Ordinal)
             || foldedQuery.Contains(c, StringComparison.Ordinal)
             || (!string.IsNullOrWhiteSpace(email) && email.Contains(query, StringComparison.OrdinalIgnoreCase))
             || (normalizedQuery.Contains("@", StringComparison.Ordinal) && c.Contains(queryDigits, StringComparison.OrdinalIgnoreCase))
             || EditDistanceWithin(c, foldedQuery, 2)));
    }

    private static bool EditDistanceWithin(string source, string target, int maxDistance)
    {
        if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(target))
            return false;

        if (Math.Abs(source.Length - target.Length) > maxDistance)
            return false;

        var previous = new int[target.Length + 1];
        var current = new int[target.Length + 1];

        for (var j = 0; j <= target.Length; j++)
            previous[j] = j;

        for (var i = 1; i <= source.Length; i++)
        {
            current[0] = i;
            var bestInRow = current[0];

            for (var j = 1; j <= target.Length; j++)
            {
                var cost = source[i - 1] == target[j - 1] ? 0 : 1;
                current[j] = Math.Min(
                    Math.Min(current[j - 1] + 1, previous[j] + 1),
                    previous[j - 1] + cost);

                if (current[j] < bestInRow)
                    bestInRow = current[j];
            }

            if (bestInRow > maxDistance)
                return false;

            (previous, current) = (current, previous);
        }

        return previous[target.Length] <= maxDistance;
    }

    private static string FoldRepeatedLetters(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return string.Empty;

        var sb = new StringBuilder(input.Length);
        char previous = '\0';
        foreach (var c in input)
        {
            if (c == previous)
                continue;

            sb.Append(c);
            previous = c;
        }

        return sb.ToString();
    }

    private static bool IsNavigationQuestion(string normalized)
    {
        return ContainsAny(normalized,
            "ou aller", "ou je vais", "ou trouver", "comment acceder", "comment aller", "dans quel menu", "quel menu",
            "ou est", "naviguer", "navigation", "ou se trouve", "je veux aller a", "je veux ouvrir", "ou ouvrir");
    }

    private static (string Topic, string Path, string Extra)? ResolveNavigationGuide(string normalized)
    {
        if (ContainsAny(normalized, "planning", "horaire", "garde"))
            return ("le planning", "Menu Planning > Vue semaine", "Vous pouvez ensuite filtrer par service, pôle ou agent.");

        if (ContainsAny(normalized, "demande", "absence", "recup", "recuperation"))
            return ("les demandes", "Menu Planning > Demandes utilisateur", "Vous pouvez créer, suivre ou valider selon votre rôle.");

        if (ContainsAny(normalized, "workflow", "validation", "approbation", "audit"))
            return ("la validation workflow", "Menu Workflow > Inbox de validation", "Utilisez les filtres pour voir les demandes en attente.");

        if (ContainsAny(normalized, "user", "utilisateur", "staff", "personnel"))
            return ("l'annuaire utilisateurs", "Menu Staff > Liste des utilisateurs", "Filtrez par service ou pôle pour trouver rapidement une personne.");

        if (ContainsAny(normalized, "service", "pole", "structure", "equipe"))
            return ("la structure", "Menu Structure > Pôles et services", "Vous pouvez y consulter l'arborescence et les responsables.");

        if (ContainsAny(normalized, "role", "permission", "droit", "acces"))
            return ("les rôles et permissions", "Menu Administration > Rôles et permissions", "Idéal pour vérifier qui a accès à quoi.");

        if (ContainsAny(normalized, "dashboard", "tableau de bord", "kpi", "statistique"))
            return ("le tableau de bord", "Menu Dashboard", "Vous y trouverez les indicateurs synthétiques de pilotage.");

        return null;
    }

    private static bool IsProfileQuestion(string normalized)
    {
        if (ContainsAny(normalized, "mon role", "quel est mon role", "quelle est mon role", "qu elle est mon role", "je peux comprendre mon role", "ma specialite", "quelle est ma specialite", "qu elle est ma specialite", "quel est ma specialite", "qu elle est ma specialite"))
            return true;

        return normalized.Contains("chef de service") && ContainsAny(normalized, "moi", "mon", "je suis", "suis je", "suis-je");
    }

    private static bool IsManagerQuestion(string normalized)
    {
        if (ContainsAny(normalized, "qui est mon chef de service", "quel est mon chef de service", "qui est le chef de service", "quel est le chef de service", "responsable du service", "qui est mon responsable"))
            return true;

        return normalized.Contains("chef de service") && !IsProfileQuestion(normalized);
    }

    private static bool ContainsCreateDemandPhrase(string normalized)
    {
        return (normalized.Contains("je veux") || normalized.Contains("cree") || normalized.Contains("creer") || normalized.Contains("demande"))
            && (normalized.Contains("absence") || normalized.Contains("recup") || normalized.Contains("recuperation"));
    }

    private static bool ContainsConfirmation(string normalized)
    {
        return normalized == "oui"
            || normalized.StartsWith("oui ", StringComparison.Ordinal)
            || normalized.Contains("confirme", StringComparison.Ordinal)
            || normalized.Contains("valide", StringComparison.Ordinal);
    }

    private static string Normalize(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return string.Empty;

        var lower = text.Trim().ToLowerInvariant();
        var formD = lower.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(formD.Length);
        foreach (var c in formD)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }

        var cleaned = sb.ToString()
            .Normalize(NormalizationForm.FormC)
            .Replace('’', ' ')
            .Replace('\'', ' ')
            .Replace('?', ' ')
            .Replace('!', ' ')
            .Replace('.', ' ')
            .Replace(',', ' ')
            .Replace(':', ' ')
            .Replace(';', ' ')
            .Replace("  ", " ");

        while (cleaned.Contains("  ", StringComparison.Ordinal))
            cleaned = cleaned.Replace("  ", " ");

        return cleaned.Trim();
    }

    private static DateTime? TryExtractDate(string text)
    {
        if (text.Contains("demain", StringComparison.Ordinal))
            return DateTime.Today.AddDays(1);
        if (text.Contains("aujourd", StringComparison.Ordinal))
            return DateTime.Today;

        var slash = DateSlashRegex.Match(text);
        if (slash.Success)
        {
            var d = int.Parse(slash.Groups["d"].Value, CultureInfo.InvariantCulture);
            var m = int.Parse(slash.Groups["m"].Value, CultureInfo.InvariantCulture);
            var yRaw = slash.Groups["y"].Value;
            var y = string.IsNullOrWhiteSpace(yRaw)
                ? DateTime.Today.Year
                : (yRaw.Length == 2 ? 2000 + int.Parse(yRaw, CultureInfo.InvariantCulture) : int.Parse(yRaw, CultureInfo.InvariantCulture));

            if (DateTime.TryParseExact($"{y:D4}-{m:D2}-{d:D2}", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                return parsed;
        }

        var fr = DateFrRegex.Match(text);
        if (fr.Success)
        {
            var d = int.Parse(fr.Groups["d"].Value, CultureInfo.InvariantCulture);
            if (MonthMap.TryGetValue(fr.Groups["m"].Value, out var m))
            {
                var y = DateTime.Today.Year;
                if (DateTime.TryParseExact($"{y:D4}-{m:D2}-{d:D2}", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                    return parsed;
            }
        }

        return null;
    }

    private static (string Start, string End)? TryExtractHours(string text)
    {
        var match = HourRangeRegex.Match(text);
        if (!match.Success)
            return null;

        return (NormalizeHour(match.Groups["start"].Value), NormalizeHour(match.Groups["end"].Value));
    }

    private static string NormalizeHour(string value)
    {
        var v = value.Replace('h', ':');
        if (TimeOnly.TryParse(v, CultureInfo.InvariantCulture, DateTimeStyles.None, out var t))
            return t.ToString("HH:mm", CultureInfo.InvariantCulture);

        return "09:00";
    }

    private static ChatKnowledge LoadKnowledge(string rootPath)
    {
        try
        {
            var path = Path.Combine(rootPath, "Chat", "chatbot-knowledge.json");
            if (!File.Exists(path))
                return new ChatKnowledge();

            var json = File.ReadAllText(path);
            var parsed = JsonSerializer.Deserialize<ChatKnowledge>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return parsed ?? new ChatKnowledge();
        }
        catch
        {
            return new ChatKnowledge();
        }
    }

    private static (DateTime Start, DateTime End) CurrentWeekRange()
    {
        var monday = ToWeekMonday(DateTime.Today);
        return (monday, monday.AddDays(6));
    }

    private static DateTime ToWeekMonday(DateTime date)
    {
        var diff = (7 + (date.DayOfWeek - DayOfWeek.Monday)) % 7;
        return date.AddDays(-diff).Date;
    }

    private static JsonElement ToElement(object? obj)
    {
        if (obj is null)
            return JsonDocument.Parse("null").RootElement;
        return JsonSerializer.SerializeToElement(obj);
    }

    private static bool TryGetDate(JsonElement element, string name, out DateTime value)
    {
        value = default;
        if (!TryGetProperty(element, name, out var prop))
            return false;

        if (prop.ValueKind == JsonValueKind.String && DateTime.TryParse(prop.GetString(), out value))
            return true;

        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt64(out var unix))
        {
            value = DateTimeOffset.FromUnixTimeSeconds(unix).DateTime;
            return true;
        }

        return false;
    }

    private static DateTime GetDateOrMin(JsonElement element, string name)
    {
        return TryGetDate(element, name, out var d) ? d : DateTime.MinValue;
    }

    private static int? GetInt(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var prop))
            return null;

        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var n))
            return n;

        if (prop.ValueKind == JsonValueKind.String && int.TryParse(prop.GetString(), out var parsed))
            return parsed;

        return null;
    }

    private static string? GetString(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var prop))
            return null;

        return prop.ValueKind == JsonValueKind.String ? prop.GetString() : prop.ToString();
    }

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in element.EnumerateObject())
            {
                if (string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = p.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    private static string NormalizeRole(string rawRole)
    {
        var v = Normalize(rawRole).Replace('_', '-').Trim();
        return v switch
        {
            "super admin" => "super-admin",
            "super-admin" => "super-admin",
            "superadmin" => "super-admin",
            "admin" => "admin-gta",
            "admin-gta" => "admin-gta",
            "chef" => "chef-service",
            "chef de service" => "chef-service",
            "chef-service" => "chef-service",
            "chef-de-service" => "chef-service",
            "chef de pole" => "chef-pole",
            "chef-pole" => "chef-pole",
            "chef-de-pole" => "chef-pole",
            _ => "staff"
        };
    }

    private static string FriendlyRoleLabel(string rawRole)
    {
        return NormalizeRole(rawRole) switch
        {
            "super-admin" => "Super Admin",
            "admin-gta" => "Admin GTA",
            "chef-pole" => "Chef de pôle",
            "chef-service" => "Chef de service",
            _ => "Staff"
        };
    }

    private static string BuildDisplayName(string? prenom, string? nom)
    {
        var full = $"{prenom ?? string.Empty} {nom ?? string.Empty}".Trim();
        return string.IsNullOrWhiteSpace(full) ? "Utilisateur" : full;
    }

    private static string FormatStaffDirectoryLine(JsonElement user)
    {
        var displayName = BuildDisplayName(GetString(user, "prenom"), GetString(user, "nom"));
        var role = FriendlyRoleLabel(GetString(user, "role") ?? string.Empty);
        var specialite = GetString(user, "specialite");

        return string.IsNullOrWhiteSpace(specialite)
            ? $"- {displayName} ({role})"
            : $"- {displayName} ({role}, {specialite})";
    }

    private sealed record PendingCreateRequest(CreateUserPlanningRequestDto Request);

    private sealed record ParsedMessage(
        ChatIntent Intent,
        DateTime? Date,
        ServiceMedical? Service,
        bool AsksMyService,
        bool IsWeek = false,
        string? Query = null,
        bool IsCountQuestion = false);

    private enum ChatIntent
    {
        Fallback,
        UserLookup,
        PersonalPlanning,
        ServicePlanning,
        Counters,
        Procedure,
        RequestStatus,
        AbsenceList,
        Rules,
        Profile,
        AccessScope,
        ServiceUsers,
        NavigationHelp,
        DataCatalog,
        Manager,
        PrepareCreateRequest,
        ConfirmCreateRequest
    }
}


