using Backend.Email;
using Backend.Chat;
using Backend.Competence;
using Backend.Metier;
using Backend.Planning;
using Backend.Poste;
using Backend.RolesPermissions;
using Backend.Staff;
using Backend.Structure;
using Backend.Workflow;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Configure JSON serialization options for case-insensitive property matching
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    // Allow reading enum values as strings (e.g., "ACTIF", "INACTIF", "SUSPENDU")
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false));
});

builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontDev", policy =>
    {
        policy
            .WithOrigins("http://localhost:4200", "https://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddSingleton<StaffStore>();
builder.Services.AddSingleton<StructureStore>();
builder.Services.AddSingleton<RolesPermissionsStore>();
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();
builder.Services.AddSingleton<PlanningStore>();
builder.Services.AddSingleton<PosteStore>();
builder.Services.AddSingleton<CompetenceStore>();
builder.Services.AddSingleton<MetierStore>();
builder.Services.AddScoped<WorkflowStore>();
builder.Services.Configure<ChatbotOptions>(builder.Configuration.GetSection("Chatbot"));
builder.Services.AddSingleton<ChatService>();

builder.Services.AddDbContext<WorkflowDbContext>(options =>
    options.UseSqlite("Data Source=workflow.db"));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("FrontDev");
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");

    // Créer les tables si elles n'existent pas (SQLite)
    var db = scope.ServiceProvider.GetRequiredService<WorkflowDbContext>();
    await db.Database.EnsureCreatedAsync();
    await db.Database.ExecuteSqlRawAsync(@"
        CREATE TABLE IF NOT EXISTS WorkflowConfigs (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            ServiceId INTEGER NOT NULL,
            ServiceName TEXT NOT NULL DEFAULT '',
            IsActive INTEGER NOT NULL DEFAULT 1,
            Version INTEGER NOT NULL DEFAULT 1,
            SuperAdminFinalRequired INTEGER NOT NULL DEFAULT 1,
            CreatedBy TEXT NOT NULL DEFAULT '',
            UpdatedBy TEXT,
            CreatedAt TEXT NOT NULL,
            UpdatedAt TEXT
        );
        CREATE TABLE IF NOT EXISTS WorkflowConfigEtapes (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            WorkflowConfigId INTEGER NOT NULL,
            Ordre INTEGER NOT NULL,
            Label TEXT NOT NULL DEFAULT '',
            RoleValidateur TEXT NOT NULL DEFAULT '',
            ValidateurSpecifiqueId INTEGER,
            DelaiMaxHeures INTEGER,
            IsFinalApproval INTEGER NOT NULL DEFAULT 0,
            IsActive INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (WorkflowConfigId) REFERENCES WorkflowConfigs(Id) ON DELETE CASCADE
        );
    ");
    logger.LogInformation("Tables WorkflowConfigs et WorkflowConfigEtapes vérifiées/créées.");

    // Ajouter la colonne Label si elle n'existe pas encore (migration en ligne)
    await db.Database.OpenConnectionAsync();
    await using var checkLabelColumnCommand = db.Database.GetDbConnection().CreateCommand();
    checkLabelColumnCommand.CommandText = "SELECT 1 FROM pragma_table_info('WorkflowConfigEtapes') WHERE name = 'Label' LIMIT 1;";
    var labelColumnExists = await checkLabelColumnCommand.ExecuteScalarAsync() is not null;

    if (!labelColumnExists)
    {
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE WorkflowConfigEtapes ADD COLUMN Label TEXT NOT NULL DEFAULT '';");
        logger.LogInformation("Colonne Label ajoutée à WorkflowConfigEtapes.");
    }
    await db.Database.CloseConnectionAsync();

    async Task TryInitAsync(string storeName, Func<Task> init)
    {
        try
        {
            await init();
            logger.LogInformation("{StoreName} initialized", storeName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "{StoreName} initialization failed", storeName);
        }
    }

    var staffStore = scope.ServiceProvider.GetRequiredService<StaffStore>();
    var structureStore = scope.ServiceProvider.GetRequiredService<StructureStore>();
    var rolesPermissionsStore = scope.ServiceProvider.GetRequiredService<RolesPermissionsStore>();
    var planningStore = scope.ServiceProvider.GetRequiredService<PlanningStore>();
    var posteStore = scope.ServiceProvider.GetRequiredService<PosteStore>();
    var competenceStore = scope.ServiceProvider.GetRequiredService<CompetenceStore>();
    var metierStore = scope.ServiceProvider.GetRequiredService<MetierStore>();

    await TryInitAsync(nameof(StaffStore), staffStore.InitializeAsync);
    await TryInitAsync(nameof(StructureStore), structureStore.InitializeAsync);
    await TryInitAsync(nameof(RolesPermissionsStore), rolesPermissionsStore.InitializeAsync);
    await TryInitAsync(nameof(PlanningStore), planningStore.InitializeAsync);
    await TryInitAsync(nameof(PosteStore), posteStore.InitializeAsync);
    await TryInitAsync(nameof(CompetenceStore), competenceStore.InitializeAsync);
    await TryInitAsync(nameof(MetierStore), metierStore.InitializeAsync);
    // Créer/mettre à jour les tables MySQL de workflow execution
    await TryInitAsync("WorkflowTables", planningStore.InitializeWorkflowTablesAsync);
    await TryInitAsync("WorkflowValidatorBackfill", async () =>
    {
        var updatedSteps = await planningStore.BackfillExistingWorkflowValidatorIdsAsync();
        logger.LogInformation("Workflow validator backfill completed: {UpdatedSteps} step(s) updated.", updatedSteps);
    });
}

async Task<bool> IsExistingServiceIdAsync(string? serviceId, StructureStore structureStore)
{
    if (string.IsNullOrWhiteSpace(serviceId))
        return false;

    if (!int.TryParse(serviceId.Trim(), out var numericServiceId) || numericServiceId <= 0)
        return false;

    var services = await structureStore.GetServicesAsync();
    return services.Any(s => s.Id == numericServiceId);
}

app.MapGet("/api/structure/poles", async (StructureStore store) => Results.Ok(await store.GetPolesAsync()));
app.MapPost("/api/structure/poles", async (Backend.Structure.Pole payload, StructureStore store) =>
{
    var created = await store.CreatePoleAsync(payload);
    return Results.Ok(created);
});
app.MapDelete("/api/structure/poles/{id:int}", async (int id, StructureStore store) =>
{
    var deleted = await store.DeletePoleAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/services", async (StructureStore store) => Results.Ok(await store.GetServicesAsync()));
app.MapGet("/api/structure/services", async (StructureStore store) => Results.Ok(await store.GetServicesAsync()));
app.MapGet("/api/structure/services/{id:int}", async (int id, StructureStore store) =>
{
    var service = (await store.GetServicesAsync()).FirstOrDefault(s => s.Id == id);
    return service is null ? Results.NotFound() : Results.Ok(service);
});
app.MapPost("/api/structure/services", async (Backend.Structure.ServiceMedical payload, StructureStore store) =>
{
    var created = await store.CreateServiceAsync(payload);
    return created is null ? Results.BadRequest() : Results.Ok(created);
});
app.MapPut("/api/structure/services/{id:int}", async (int id, Backend.Structure.ServiceMedical payload, StructureStore store) =>
{
    var updated = await store.UpdateServiceAsync(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/structure/services/{id:int}", async (int id, StructureStore store) =>
{
    var deleted = await store.DeleteServiceAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/structure/equipes", async (StructureStore store) => Results.Ok(await store.GetEquipesAsync()));
app.MapPost("/api/structure/equipes", async (Backend.Structure.Equipe payload, StructureStore store) =>
{
    var created = await store.CreateEquipeAsync(payload);
    return created is null ? Results.BadRequest() : Results.Ok(created);
});
app.MapPut("/api/structure/equipes/{id:int}", async (int id, Backend.Structure.Equipe payload, StructureStore store) =>
{
    var updated = await store.UpdateEquipeAsync(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/structure/equipes/{id:int}", async (int id, StructureStore store) =>
{
    var deleted = await store.DeleteEquipeAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/structure/utilisateurs", async (StructureStore store) => Results.Ok(await store.GetUtilisateursAsync()));

app.MapGet("/api/structure/statistiques", async (StructureStore store) => Results.Ok(await store.GetStatistiquesAsync()));

app.MapGet("/api/structure/tree", async (StructureStore store) => Results.Ok(await store.BuildTreeAsync()));

app.MapGet("/api/roles-permissions/roles", async (RolesPermissionsStore store) => Results.Ok(await store.GetRolesAsync()));
app.MapGet("/api/roles-permissions/roles/{roleId}", async (string roleId, RolesPermissionsStore store) =>
{
    var role = await store.GetRoleByIdAsync(roleId);
    return role is null ? Results.NotFound() : Results.Ok(role);
});
app.MapPost("/api/roles-permissions/roles", async (Backend.RolesPermissions.CreateRoleRequest payload, RolesPermissionsStore store) =>
{
    var created = await store.CreateRoleAsync(payload);
    return Results.Ok(created);
});
app.MapPut("/api/roles-permissions/roles/{roleId}", async (string roleId, Backend.RolesPermissions.UpdateRoleRequest payload, RolesPermissionsStore store) =>
{
    var updated = await store.UpdateRoleAsync(roleId, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapPost("/api/roles-permissions/roles/{roleId}/duplicate", async (string roleId, RolesPermissionsStore store) =>
{
    var duplicated = await store.DuplicateRoleAsync(roleId, "Admin GTA");
    return duplicated is null ? Results.NotFound() : Results.Ok(duplicated);
});
app.MapDelete("/api/roles-permissions/roles/{roleId}", async (string roleId, RolesPermissionsStore store) =>
{
    var (success, error) = await store.DeleteRoleAsync(roleId);
    return success ? Results.NoContent() : Results.BadRequest(new { error });
});

app.MapGet("/api/roles-permissions/roles/{roleId}/users", async (string roleId, RolesPermissionsStore store) => Results.Ok(await store.GetRoleUsersAsync(roleId)));
app.MapGet("/api/roles-permissions/roles/{roleId}/history", async (string roleId, RolesPermissionsStore store) => Results.Ok(await store.GetRoleHistoryAsync(roleId)));
app.MapDelete("/api/roles-permissions/roles/{roleId}/users/{userId}", async (string roleId, string userId, RolesPermissionsStore store) =>
{
    var success = await store.RemoveUserFromRoleAsync(roleId, userId, "Admin GTA");
    return success ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/roles-permissions/permission-categories", async (RolesPermissionsStore store) => Results.Ok(await store.GetPermissionCategoriesAsync()));
app.MapGet("/api/roles-permissions/user/{userId:int}/permissions", async (int userId, RolesPermissionsStore store) =>
{
    var perms = await store.GetUserPermissionsAsync(userId);
    return Results.Ok(perms);
});
app.MapPut("/api/roles-permissions/roles/{roleId}/permissions/{permissionId}", async (string roleId, string permissionId, Backend.RolesPermissions.SetPermissionLevelRequest request, RolesPermissionsStore store) =>
{
    var success = await store.SetPermissionLevelAsync(roleId, permissionId, request.Level, request.UpdatedBy ?? "Admin GTA");
    return success ? Results.NoContent() : Results.NotFound();
});
app.MapPut("/api/roles-permissions/roles/{roleId}/permissions", async (string roleId, Backend.RolesPermissions.SetAllPermissionsRequest request, RolesPermissionsStore store) =>
{
    var success = await store.SetAllPermissionsAsync(roleId, request.Level, request.UpdatedBy ?? "Admin GTA");
    return success ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/roles-permissions/export", async (RolesPermissionsStore store) =>
{
    var result = await store.ExportRolesCsvAsync();
    return Results.Ok(result);
});

app.MapGet("/api/metiers", async (MetierStore store) => Results.Ok(await store.GetAllAsync()));
app.MapGet("/api/metiers/{id:int}", async (int id, MetierStore store) =>
{
    var metier = await store.GetByIdAsync(id);
    return metier is null ? Results.NotFound() : Results.Ok(metier);
});
app.MapPost("/api/metiers", async (Backend.Metier.MetierItem payload, MetierStore store) =>
    Results.Ok(await store.CreateAsync(payload)));
app.MapPut("/api/metiers/{id:int}", async (int id, Backend.Metier.MetierItem payload, MetierStore store) =>
{
    var updated = await store.UpdateAsync(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/metiers/{id:int}", async (int id, MetierStore store) =>
{
    var deleted = await store.DeleteAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/postes", async (PosteStore store) => Results.Ok(await store.GetAllAsync()));
app.MapGet("/api/postes/{id:int}", async (int id, PosteStore store) =>
{
    var poste = await store.GetByIdAsync(id);
    return poste is null ? Results.NotFound() : Results.Ok(poste);
});
app.MapPost("/api/postes", async (Backend.Poste.PosteItem payload, PosteStore store) => Results.Ok(await store.CreateAsync(payload)));
app.MapPut("/api/postes/{id:int}", async (int id, Backend.Poste.PosteItem payload, PosteStore store) =>
{
    var updated = await store.UpdateAsync(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/postes/{id:int}", async (int id, PosteStore store) =>
{
    var deleted = await store.DeleteAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/users/{userId:int}/context", async (int userId, StaffStore staffStore) =>
{
    try
    {
        var staff = await staffStore.GetByIdAsync(userId);
        if (staff == null)
        {
            return Results.NotFound(new { error = "User not found" });
        }
        
        if (staff is not IDictionary<string, object?> staffDict)
        {
            return Results.Problem("Invalid staff data format");
        }
        
        var nom = staffDict.TryGetValue("nom", out var nomVal) ? nomVal?.ToString() : "";
        var prenom = staffDict.TryGetValue("prenom", out var prenomVal) ? prenomVal?.ToString() : "";
        var serviceId = staffDict.TryGetValue("serviceId", out var svcVal) ? svcVal : null;
        var serviceNom = staffDict.TryGetValue("service_nom", out var svcNomVal) ? svcNomVal?.ToString() : null;
        var poleId = staffDict.TryGetValue("poleId", out var poleVal) ? poleVal : null;
        var poleNom = staffDict.TryGetValue("pole_nom", out var poleNomVal) ? poleNomVal?.ToString() : null;
        var equipeId = staffDict.TryGetValue("equipeId", out var eqVal) ? eqVal : null;
        var equipeNom = staffDict.TryGetValue("equipe_nom", out var eqNomVal) ? eqNomVal?.ToString() : null;
        var fonction = staffDict.TryGetValue("fonction", out var foncVal) ? foncVal?.ToString() : null;
        var role = staffDict.TryGetValue("role", out var roleVal) ? roleVal?.ToString() : "";
        
        return Results.Ok(new 
        {
            id = userId,
            userId = userId,
            nom = nom,
            prenom = prenom,
            nomComplet = $"{prenom} {nom}",
            serviceId = serviceId,
            service_id = serviceId,
            service_nom = serviceNom,
            poleId = poleId,
            pole_id = poleId,
            pole_nom = poleNom,
            equipeId = equipeId,
            equipe_id = equipeId,
            equipe_nom = equipeNom,
            fonction = fonction,
            role = role
        });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Error fetching user context: {ex.Message}");
    }
});

app.MapGet("/api/planning", async (
    string serviceId,
    string? serviceName,
    DateTime weekStart,
    DateTime? weekEnd,
    int? poleId,
    int? equipeId,
    string? userId,
    PlanningStore store,
    StructureStore structureStore) =>
{
    if (string.IsNullOrWhiteSpace(serviceId) || serviceId.Trim().Equals("all", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "Veuillez sélectionner un service spécifique." });

    if (!await IsExistingServiceIdAsync(serviceId, structureStore))
        return Results.BadRequest(new { message = "Service invalide. Veuillez sélectionner un service existant." });

    var planning = await store.GetPlanningAsync(
        serviceId, 
        string.IsNullOrWhiteSpace(serviceName) ? serviceId : serviceName, 
        weekStart, 
        weekEnd,
        poleId,
        equipeId,
        userId);

    var weekWorkflow = await store.GetWeekWorkflowByServiceAsync(serviceId, weekStart);
    if (weekWorkflow != null)
    {
        planning.WorkflowStatus = weekWorkflow.Statut ?? "BROUILLON";
        planning.WeekWorkflowId = weekWorkflow.Id;
    }

    return Results.Ok(planning);
});

app.MapPost("/api/planning/assignments", async (SaveAssignmentRequest request, PlanningStore store, StructureStore structureStore) =>
{
    if (string.IsNullOrWhiteSpace(request.ServiceId) || request.ServiceId.Trim().Equals("all", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "Veuillez sélectionner un service spécifique avant d'enregistrer des affectations." });

    if (!await IsExistingServiceIdAsync(request.ServiceId, structureStore))
        return Results.BadRequest(new { message = "Service invalide. Enregistrement annulé." });

    var saved = await store.SaveAssignmentAsync(
        request.ServiceId,
        string.IsNullOrWhiteSpace(request.ServiceName) ? request.ServiceId : request.ServiceName,
        request.WeekStart,
        request.WeekEnd,
        request.Assignment);

    return Results.Ok(saved);
});

app.MapDelete("/api/planning/assignments/{assignmentId}", async (
    string assignmentId,
    string? serviceId,
    DateTime? weekStart,
    PlanningStore store) =>
{
    if (string.IsNullOrWhiteSpace(serviceId) || !weekStart.HasValue)
    {
        return Results.BadRequest(new { message = "Query params 'serviceId' and 'weekStart' are required." });
    }

    var deleted = await store.DeleteAssignmentAsync(serviceId, weekStart.Value, assignmentId);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapPut("/api/planning/assignments", async (ReplaceAssignmentsRequest request, PlanningStore store, StructureStore structureStore) =>
{
    if (string.IsNullOrWhiteSpace(request.ServiceId) || request.ServiceId.Trim().Equals("all", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "Veuillez sélectionner un service spécifique avant d'enregistrer des affectations." });

    if (!await IsExistingServiceIdAsync(request.ServiceId, structureStore))
        return Results.BadRequest(new { message = "Service invalide. Mise à jour annulée." });

    await store.ReplaceAssignmentsAsync(
        request.ServiceId,
        string.IsNullOrWhiteSpace(request.ServiceName) ? request.ServiceId : request.ServiceName,
        request.WeekStart,
        request.WeekEnd,
        request.Assignments);

    return Results.NoContent();
});

app.MapPost("/api/planning/validate", async (ValidatePlanningRequest request, PlanningStore store, StructureStore structureStore) =>
{
    if (string.IsNullOrWhiteSpace(request.ServiceId) || request.ServiceId.Trim().Equals("all", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "Veuillez sélectionner un service spécifique avant la validation." });

    if (!await IsExistingServiceIdAsync(request.ServiceId, structureStore))
        return Results.BadRequest(new { message = "Service invalide. Validation annulée." });

    if (request.Assignments is { Count: > 0 })
    {
        await store.ReplaceAssignmentsAsync(
            request.ServiceId,
            string.IsNullOrWhiteSpace(request.ServiceName) ? request.ServiceId : request.ServiceName,
            request.WeekStart,
            request.WeekEnd,
            request.Assignments);
    }

    var conflicts = await store.ValidatePlanningAsync(
        request.ServiceId,
        string.IsNullOrWhiteSpace(request.ServiceName) ? request.ServiceId : request.ServiceName,
        request.WeekStart,
        request.WeekEnd);
    return Results.Ok(new
    {
        valid = conflicts.Count == 0,
        conflicts
    });
});

app.MapGet("/api/planning/export", async (
    string serviceId,
    string? serviceName,
    DateTime weekStart,
    DateTime? weekEnd,
    string format,
    PlanningStore store) =>
{
    var normalizedServiceName = string.IsNullOrWhiteSpace(serviceName) ? serviceId : serviceName;
    var normalizedFormat = (format ?? string.Empty).Trim().ToLowerInvariant();

    return normalizedFormat switch
    {
        "csv" =>
            Results.Ok(await store.ExportCsvAsync(serviceId, normalizedServiceName, weekStart, weekEnd) is var csv
                ? new { fileName = csv.FileName, content = csv.Content, mimeType = "text/csv", isBase64 = false }
                : null),
        "excel" or "xls" =>
            Results.Ok(await store.ExportExcelAsync(serviceId, normalizedServiceName, weekStart, weekEnd) is var xls
                ? new { fileName = xls.FileName, content = xls.Content, mimeType = "application/vnd.ms-excel", isBase64 = false }
                : null),
        "pdf" =>
            Results.Ok(await store.ExportPdfAsync(serviceId, normalizedServiceName, weekStart, weekEnd) is var pdf
                ? new { fileName = pdf.FileName, content = Convert.ToBase64String(pdf.Content), mimeType = "application/pdf", isBase64 = true }
                : null),
        "html" =>
            Results.Ok(await store.ExportHtmlAsync(serviceId, normalizedServiceName, weekStart, weekEnd) is var html
                ? new { fileName = html.FileName, content = html.Content, mimeType = "text/html", isBase64 = false }
                : null),
        _ => Results.BadRequest(new { message = "Unsupported format. Use: pdf, html, excel, csv." })
    };
});

app.MapGet("/api/planning/overview", async (string? serviceId, DateTime? weekStart, bool? onlyValidated, PlanningStore store) =>
{
    var overviews = await store.GetOverviewAsync(serviceId, weekStart, onlyValidated ?? false);
    
    return Results.Ok(overviews);
});

app.MapPost("/api/planning/versions", async (SavePlanningVersionRequest request, PlanningStore store) =>
    Results.Ok(await store.SaveVersionAsync(request)));

app.MapGet("/api/planning/versions", async (string serviceId, DateTime weekStart, DateTime? weekEnd, PlanningStore store) =>
    Results.Ok(await store.GetVersionsAsync(serviceId, weekStart, weekEnd)));

app.MapPost("/api/planning/submit", async (JsonElement payload, PlanningStore planningStore, StructureStore structureStore) =>
{
    try
    {
        var serviceId = payload.GetProperty("serviceId").GetString() ?? "";
        var serviceName = payload.GetProperty("serviceName").GetString() ?? "";
        var weekStartStr = payload.GetProperty("weekStart").GetString() ?? "";
        var weekStart = DateTime.Parse(weekStartStr);
        
        DateTime? weekEnd = null;
        if (payload.TryGetProperty("weekEnd", out var weekEndProp) && weekEndProp.ValueKind != JsonValueKind.Null)
        {
            var weekEndStr = weekEndProp.GetString();
            if (!string.IsNullOrEmpty(weekEndStr))
                weekEnd = DateTime.Parse(weekEndStr);
        }

        if (string.IsNullOrWhiteSpace(serviceId) || serviceId.Trim().Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { success = false, message = "Veuillez sélectionner un service spécifique avant la soumission." });
        }

        if (!await IsExistingServiceIdAsync(serviceId, structureStore))
        {
            return Results.BadRequest(new { success = false, message = "Service invalide. Soumission annulée." });
        }

        var createdBy = payload.GetProperty("createdBy").GetString() ?? "Chef de service";
        var createdById = payload.TryGetProperty("createdById", out var idProp) ? idProp.GetString() ?? "USER_001" : "USER_001";
        var submitMessage = payload.TryGetProperty("message", out var messageProp) && messageProp.ValueKind != JsonValueKind.Null
            ? messageProp.GetString()
            : null;

        if (payload.TryGetProperty("assignments", out var assignmentsProp) && assignmentsProp.ValueKind == JsonValueKind.Array)
        {
            var jsonOptions = new JsonSerializerOptions 
            { 
                PropertyNameCaseInsensitive = true 
            };
            var payloadAssignments = JsonSerializer.Deserialize<List<PlanningAssignment>>(assignmentsProp.GetRawText(), jsonOptions) ?? new List<PlanningAssignment>();
            if (payloadAssignments.Count > 0)
            {
                await planningStore.ReplaceAssignmentsAsync(serviceId, serviceName, weekStart, weekEnd, payloadAssignments);
            }
        }

        var planning = await planningStore.GetPlanningAsync(serviceId, serviceName, weekStart, weekEnd);
        
        if (planning.Assignments.Count == 0)
        {
            return Results.BadRequest(new { success = false, message = "Le planning est vide. Ajoutez des affectations avant de soumettre." });
        }

        var blockedStatuses = new[] { "EN_ATTENTE_VALIDATION", "EN_ATTENTE_VALIDATION_RH", "VALIDE" };
        if (!string.IsNullOrEmpty(planning.WorkflowStatus) && blockedStatuses.Contains(planning.WorkflowStatus))
        {
            return Results.BadRequest(new { success = false, message = $"Ce planning a déjà été soumis (Statut: {planning.WorkflowStatus})." });
        }

        if (planning.Conflicts.Count > 0)
        {
            return Results.BadRequest(new { success = false, message = $"Le planning contient {planning.Conflicts.Count} conflit(s). Résolvez-les avant de soumettre." });
        }

        var assignments = planning.Assignments.Select(a => new AssignmentItem
        {
            Id = a.Id,
            UserId = a.PersonnelId,
            UserName = a.PersonnelId,
            Title = a.PosteLabel ?? a.ShiftType,
            Start = planning.WeekStart.AddDays(a.Day),
            End = planning.WeekStart.AddDays(a.Day).AddHours(12),
            Color = a.ShiftType switch
            {
                "jour" => "#3b82f6",
                "nuit" => "#1e3a8a",
                "garde" => "#dc2626",
                "repos" => "#22c55e",
                "formation" => "#f59e0b",
                _ => "#6b7280"
            },
            PosteId = a.PosteId
        }).ToList();

        var sqlWeekId = await planningStore.SubmitPlanningToWorkflowAsync(
            serviceId,
            serviceName,
            weekStart,
            weekEnd
        );

        return Results.Ok(new 
        { 
            success = true, 
            workflowId = sqlWeekId,
            weekId = sqlWeekId,
            message = "Planning prêt pour soumission au workflow."
        });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { success = false, message = $"Erreur lors de la soumission: {ex.Message}" });
    }
});

app.MapGet("/api/staff", async (int? serviceId, int? poleId, int? equipeId, string? userId, StaffStore store) =>
    Results.Ok(await store.GetAllAsync(serviceId, poleId, equipeId, userId)));
app.MapGet("/api/staff/{id:int}", async (int id, StaffStore store) =>
{
    var user = await store.GetByIdAsync(id);
    return user is null ? Results.NotFound() : Results.Ok(user);
});
app.MapPost("/api/staff", async (StaffUser payload, StaffStore store) => Results.Ok(await store.CreateAsync(payload)));
app.MapPut("/api/staff/{id:int}", async (int id, StaffUser payload, StaffStore store) =>
{
    var updated = await store.UpdateAsync(id, payload);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapPut("/api/staff/{id:int}/photo", async (int id, UpdateStaffPhotoRequest payload, StaffStore store) =>
{
    var updated = await store.UpdatePhotoAsync(id, payload.Photo);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});
app.MapDelete("/api/staff/{id:int}", async (int id, StaffStore store) =>
{
    var deleted = await store.DeleteAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});
app.MapDelete("/api/staff/purge/backend-created", async (StaffStore store) =>
{
    var deleted = await store.DeleteBackendCreatedUsersAsync();
    return Results.Ok(new { deleted });
});
app.MapDelete("/api/staff/purge/all", async (StaffStore store) =>
{
    var deleted = await store.DeleteAllUsersAsync();
    return Results.Ok(new { deleted });
});

app.MapGet("/api/competences", async (CompetenceStore store) => Results.Ok(await store.GetActiveCompetencesAsync()));
app.MapGet("/api/competences/domaines", async (CompetenceStore store) => Results.Ok(await store.GetDomainesAsync()));
app.MapPost("/api/competences", async (CompetenceUpsertRequest payload, CompetenceStore store) =>
{
    try
    {
        var created = await store.CreateCompetenceAsync(payload);
        return Results.Ok(created);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});
app.MapPut("/api/competences/{id:int}", async (int id, CompetenceUpsertRequest payload, CompetenceStore store) =>
{
    try
    {
        var updated = await store.UpdateCompetenceAsync(id, payload);
        return updated is null ? Results.NotFound() : Results.Ok(updated);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});
app.MapDelete("/api/competences/{id:int}", async (int id, CompetenceStore store) =>
{
    var deleted = await store.DeleteCompetenceAsync(id);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/planning/utilisateurs-disponibles", async (int posteId, CompetenceStore store) =>
{
    if (posteId <= 0)
    {
        return Results.BadRequest(new { message = "posteId invalide." });
    }

    var users = await store.GetUtilisateursDisponiblesForPosteAsync(posteId);
    return Results.Ok(users);
});
app.MapGet("/api/staff/{id:int}/planning", async (int id, StaffStore store) => Results.Ok(await store.GetUserPlanningAsync(id)));
app.MapGet("/api/staff/{id:int}/history", async (int id, StaffStore store) => Results.Ok(await store.GetUserHistoryAsync(id)));
app.MapGet("/api/staff/{id:int}/affectations", async (int id, StaffStore store) => Results.Ok(await store.GetUserAffectationsAsync(id)));
app.MapGet("/api/staff/{id:int}/roles", async (int id, StaffStore store) => Results.Ok(await store.GetUserRolesAsync(id)));
app.MapPost("/api/staff/{id:int}/affectations", async (int id, UserAffectationRequest payload, StaffStore store) =>
    Results.Ok(await store.AddUserAffectationAsync(id, payload)));
app.MapDelete("/api/staff/{id:int}/affectations/{affectationId:int}", async (int id, int affectationId, StaffStore store) =>
{
    var deleted = await store.DeleteUserAffectationAsync(id, affectationId);
    return deleted ? Results.NoContent() : Results.NotFound();
});

static int ResolveActingUserId(HttpContext httpContext, int? bodyActingUserId = null)
{
    if (bodyActingUserId.HasValue && bodyActingUserId.Value > 0)
    {
        return bodyActingUserId.Value;
    }

    if (httpContext.Request.Headers.TryGetValue("X-User-Id", out var userIdHeader)
        && int.TryParse(userIdHeader.ToString(), out var headerUserId)
        && headerUserId > 0)
    {
        return headerUserId;
    }

    if (httpContext.Request.Query.TryGetValue("actingUserId", out var actingUserIdQuery)
        && int.TryParse(actingUserIdQuery.ToString(), out var queryActingUserId)
        && queryActingUserId > 0)
    {
        return queryActingUserId;
    }

    if (httpContext.Request.Query.TryGetValue("userId", out var userIdQuery)
        && int.TryParse(userIdQuery.ToString(), out var queryUserId)
        && queryUserId > 0)
    {
        return queryUserId;
    }

    return 0;
}

app.MapGet("/api/mon-planning/compteurs", async (int userId, PlanningStore planningStore) =>
{
    if (userId <= 0)
        return Results.BadRequest(new { message = "userId invalide." });

    var counters = await planningStore.GetUserTimeCountersAsync(userId);
    return Results.Ok(counters);
});

app.MapGet("/api/compteurs/{userId:int}", async (int userId, PlanningStore planningStore) =>
{
    if (userId <= 0)
        return Results.BadRequest(new { message = "userId invalide." });

    var counters = await planningStore.GetUserTimeCountersAsync(userId);
    return Results.Ok(counters);
});

app.MapGet("/api/mon-planning/demandes", async (int userId, DateTime? from, DateTime? to, PlanningStore planningStore) =>
{
    if (userId <= 0)
        return Results.BadRequest(new { message = "userId invalide." });

    var requests = await planningStore.GetUserPlanningRequestsAsync(userId, from, to);
    return Results.Ok(requests);
});

app.MapPost("/api/mon-planning/demandes", async (CreateUserPlanningRequestDto dto, PlanningStore planningStore) =>
{
    try
    {
        var created = await planningStore.CreateUserPlanningRequestAsync(dto);
        return Results.Ok(created);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/demandes", async (DemandeCreateApiDto payload, HttpContext httpContext, PlanningStore planningStore) =>
{
    try
    {
        var actingUserId = ResolveActingUserId(httpContext, payload.ActingUserId);
        if (actingUserId <= 0)
            return Results.BadRequest(new { message = "Utilisateur connecté introuvable." });

        if (payload.Demande is null)
            return Results.BadRequest(new { message = "Le contenu de la demande est requis." });

        payload.Demande.UserId = actingUserId;
        var created = await planningStore.CreateUserPlanningRequestAsync(payload.Demande);
        return Results.Ok(created);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapGet("/api/mon-planning/demandes/en-attente", async (int? serviceId, PlanningStore planningStore) =>
{
    var list = await planningStore.GetPendingUserPlanningRequestsAsync(serviceId);
    return Results.Ok(list);
});

app.MapGet("/api/demandes/mes-demandes", async (DateTime? from, DateTime? to, HttpContext httpContext, PlanningStore planningStore) =>
{
    var actingUserId = ResolveActingUserId(httpContext);
    if (actingUserId <= 0)
        return Results.BadRequest(new { message = "Utilisateur connecté introuvable." });

    var requests = await planningStore.GetUserPlanningRequestsAsync(actingUserId, from, to);
    return Results.Ok(requests);
});

app.MapGet("/api/demandes/types", async (bool? requestableOnly, PlanningStore planningStore) =>
{
    var types = await planningStore.GetDemandeTypesAsync(requestableOnly ?? false);
    return Results.Ok(types);
});

app.MapGet("/api/demandes/a-valider", async (HttpContext httpContext, PlanningStore planningStore) =>
{
    var actingUserId = ResolveActingUserId(httpContext);
    if (actingUserId <= 0)
        return Results.BadRequest(new { message = "Utilisateur connecté introuvable." });

    var list = await planningStore.GetPendingUserPlanningRequestsForValidatorAsync(actingUserId);
    return Results.Ok(list);
});

app.MapGet("/api/demandes/{id:int}/historique", async (int id, HttpContext httpContext, PlanningStore planningStore) =>
{
    try
    {
        var actingUserId = ResolveActingUserId(httpContext);
        if (actingUserId <= 0)
            return Results.BadRequest(new { message = "Utilisateur connecté introuvable." });

        var history = await planningStore.GetDemandeHistoriqueAsync(id, actingUserId);
        return Results.Ok(history);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/mon-planning/demandes/{id:int}/approuver", async (int id, UserPlanningRequestActionDto dto, PlanningStore planningStore) =>
{
    try
    {
        var approved = await planningStore.ApproveUserPlanningRequestAsync(id, dto.ValidatorId, dto.ValidatorName);
        return approved is null ? Results.NotFound() : Results.Ok(approved);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPut("/api/demandes/{id:int}/valider", async (int id, DemandeActionApiDto payload, HttpContext httpContext, PlanningStore planningStore) =>
{
    try
    {
        var actingUserId = ResolveActingUserId(httpContext, payload.ActingUserId);
        if (actingUserId <= 0)
            return Results.BadRequest(new { message = "Utilisateur connecté introuvable." });

        var validatorName = string.IsNullOrWhiteSpace(payload.Action?.ValidatorName)
            ? "Responsable"
            : payload.Action.ValidatorName;

        var approved = await planningStore.ApproveUserPlanningRequestAsync(id, actingUserId, validatorName);
        return approved is null ? Results.NotFound() : Results.Ok(approved);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/mon-planning/demandes/{id:int}/rejeter", async (int id, UserPlanningRequestActionDto dto, PlanningStore planningStore) =>
{
    try
    {
        var rejected = await planningStore.RejectUserPlanningRequestAsync(id, dto.ValidatorId, dto.Motif);
        return rejected is null ? Results.NotFound() : Results.Ok(rejected);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPut("/api/demandes/{id:int}/rejeter", async (int id, DemandeActionApiDto payload, HttpContext httpContext, PlanningStore planningStore) =>
{
    try
    {
        var actingUserId = ResolveActingUserId(httpContext, payload.ActingUserId);
        if (actingUserId <= 0)
            return Results.BadRequest(new { message = "Utilisateur connecté introuvable." });

        var rejected = await planningStore.RejectUserPlanningRequestAsync(id, actingUserId, payload.Action?.Motif);
        return rejected is null ? Results.NotFound() : Results.Ok(rejected);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/auth/login", async (LoginRequest payload, StaffStore store) =>
{
    var login = await store.LoginAsync(payload);
    return login is null ? Results.Unauthorized() : Results.Ok(login);
});
app.MapPost("/api/auth/register", async (JsonElement payload, StaffStore store) => Results.Ok(await store.RegisterAsync(payload)));
app.MapPost("/api/auth/reset-password", async (JsonElement payload, StaffStore store) =>
{
    var ok = await store.ResetPasswordAsync(payload);
    return ok ? Results.Ok(new { success = true }) : Results.BadRequest(new { success = false });
});

app.MapGet("/api/workflow/plannings", async (WorkflowStore store, WorkflowStatut? statut, string? serviceId, int? etapeActuelle) =>
{
    var plannings = await store.GetPlanningsAsync(statut, serviceId, etapeActuelle).ToListAsync();
    return Results.Ok(plannings);
});

app.MapGet("/api/workflow/plannings/{id:int}", async (int id, PlanningStore planningStore, WorkflowStore wfStore) =>
{
    var week = await planningStore.GetPlanningWeekByIdAsync(id);
    if (week is null)
        return Results.NotFound(new { message = "Planning introuvable" });

    var historique = await planningStore.GetValidationHistoryAsync(id);

    var planningData = await planningStore.GetPlanningAsync(
        week.ServiceId,
        week.ServiceName ?? week.ServiceId,
        week.WeekStart,
        week.WeekEnd);

    Backend.Workflow.WorkflowConfigItem? config = null;
    if (week.WorkflowConfigId.HasValue)
        config = await planningStore.GetWorkflowConfigByIdMySqlAsync(week.WorkflowConfigId.Value);
    if (config == null && week.ServiceIdInt > 0)
        config = await wfStore.GetConfigByServiceAsync(week.ServiceIdInt);

    var frontendStatus = (week.Statut ?? "BROUILLON", week.EtapeActuelle) switch
    {
        ("VALIDE", _)                       => "VALIDE",
        ("REJETE", _)                       => "REJETE",
        ("EN_ATTENTE_VALIDATION", 1)        => "EN_ATTENTE_N1",
        ("EN_ATTENTE_VALIDATION", _)        => "EN_ATTENTE_N2",
        ("EN_ATTENTE_VALIDATION_FINALE", _) => "EN_ATTENTE_N2",
        _                                   => "BROUILLON"
    };

    static string MapHistoAction(string a) => a switch
    {
        "SOUMIS"               => "SOUMISSION",
        "APPROUVE"             => "APPROBATION",
        "APPROUVE_AUTO"        => "APPROBATION",
        "REJETE"               => "REJET",
        "DEMANDE_MODIFICATION" => "RETOUR_CORRECTION",
        _                      => "APPROBATION"
    };

    var lastHistory = historique.Count > 0 ? historique[^1] : null;

    return Results.Ok(new
    {
        planning = new
        {
            id             = week.Id.ToString(),
            serviceId      = week.ServiceId,
            serviceIdInt   = week.ServiceIdInt,
            serviceName    = week.ServiceName,
            weekStart      = week.WeekStart,
            weekEnd        = week.WeekEnd,
            workflowConfigId   = week.WorkflowConfigId?.ToString() ?? "",
            workflowStatus     = frontendStatus,
            statut             = week.Statut,
            etapeActuelle      = week.EtapeActuelle,
            dateSoumission     = week.DateSoumission,
            prochainValidateurId  = week.ProchainValidateurId,
            prochainValidateurNom = week.ProchainValidateurNom,
            prochainValidateurRole = week.ProchainValidateurRole,
            soumisParId    = week.SoumisParId,
            soumisParNom   = week.SoumisParNom,
            rejeteMotif    = week.RejetMotif,
            assignmentsCount   = week.AssignmentsCount,
            validationHistory  = Array.Empty<object>(),
            currentVersionId   = "1",
            lockVersion        = 0,
            assignments        = planningData.Assignments.Select(a => new
            {
                id          = a.Id,
                personnelId = a.PersonnelId,
                day         = a.Day,
                shiftType   = a.ShiftType,
                posteId     = a.PosteId,
                posteLabel  = a.PosteLabel,
                startTime   = a.StartTime,
                endTime     = a.EndTime,
                note        = a.Note
            }).ToList(),
            personnel          = (await planningStore.GetPersonnelByIdsAsync(
                planningData.Assignments.Select(a => a.PersonnelId).Distinct())
            ).Select(p => new
            {
                id     = p.Id,
                nom    = p.Nom,
                prenom = p.Prenom
            }).ToList(),
            rules              = Array.Empty<object>(),
            conflicts          = Array.Empty<object>(),
            history            = historique.Select(h => new
            {
                id     = h.Id.ToString(),
                at     = h.DateAction.ToString("O"),
                author = h.ValidateurNom ?? week.SoumisParNom ?? "Inconnu",
                action = MapHistoAction(h.Action),
                details = h.Commentaire ?? ""
            }).ToList()
        },
        validationStatus = new
        {
            status           = frontendStatus,
            currentStepIndex = Math.Max(0, week.EtapeActuelle - 1),
            changedAt        = (lastHistory?.DateAction ?? week.DateSoumission ?? DateTime.UtcNow).ToString("O"),
            changedBy        = lastHistory?.ValidateurNom ?? week.SoumisParNom ?? "Inconnu"
        },
        historique = historique.Select(h => new
        {
            id          = h.Id.ToString(),
            planningId  = h.PlanningWeekId.ToString(),
            stepId      = h.Etape.ToString(),
            action      = MapHistoAction(h.Action),
            actorUserId = h.ValidateurId?.ToString() ?? "0",
            actorRole   = h.ValidateurNom ?? "Inconnu",
            comment     = h.Commentaire,
            createdAt   = h.DateAction.ToString("O")
        }).ToList(),
        etapes = (config?.Steps ?? new List<Backend.Workflow.WorkflowConfigEtapeItem>())
            .OrderBy(s => s.Order)
            .Select(s => new
            {
                id             = s.Id.ToString(),
                order          = s.Order,
                label          = s.Label,
                validatorRole  = s.ValidatorRole,
                validatorUserId = s.ValidatorUserId,
                maxDelayHours  = s.MaxDelayHours,
                isFinalApproval = s.IsFinalApproval,
                isActive       = s.IsActive
            }).ToList()
    });
});

app.MapGet("/api/workflow/plannings/{id:int}/status", async (int id, string role, WorkflowStore store) =>
{
    var status = await store.GetValidationStatusAsync(id, role);
    return Results.Ok(status);
});

static object MapWeekWorkflowForFrontend(PlanningWeekWorkflow p)
{
    var frontendStatus = (p.Statut, p.EtapeActuelle) switch
    {
        ("VALIDE", _)                       => "VALIDE",
        ("REJETE", _)                       => "REJETE",
        ("EN_ATTENTE_VALIDATION", 1)        => "EN_ATTENTE_N1",
        ("EN_ATTENTE_VALIDATION", _)        => "EN_ATTENTE_N2",
        ("EN_ATTENTE_VALIDATION_FINALE", _) => "EN_ATTENTE_N2",
        _                                   => "BROUILLON"
    };

    var historyEntry = !string.IsNullOrEmpty(p.SoumisParNom)
        ? new object[]
          {
              new
              {
                  id      = $"subm-{p.Id}",
                  at      = (p.DateSoumission ?? DateTime.UtcNow).ToString("O"),
                  author  = p.SoumisParNom,
                  action  = "SOUMISSION",
                  details = ""
              }
          }
        : Array.Empty<object>();

    return new
    {
        id                    = p.Id.ToString(),
        serviceId             = p.ServiceId,
        serviceIdInt          = p.ServiceIdInt,
        serviceName           = p.ServiceName,
        weekStart             = p.WeekStart,
        weekEnd               = p.WeekEnd,
        workflowConfigId      = p.WorkflowConfigId?.ToString() ?? "",
        workflowStatus        = frontendStatus,
        statut                = p.Statut,
        etapeActuelle         = p.EtapeActuelle,
        dateSoumission        = p.DateSoumission,
        prochainValidateurId  = p.ProchainValidateurId,
        prochainValidateurNom = p.ProchainValidateurNom,
        prochainValidateurRole = p.ProchainValidateurRole,
        soumisParId           = p.SoumisParId,
        soumisParNom          = p.SoumisParNom,
        rejeteMotif           = p.RejetMotif,
        assignmentsCount      = p.AssignmentsCount,
        history               = historyEntry,
        validationHistory     = Array.Empty<object>(),
        currentVersionId      = "1",
        lockVersion           = 0,
        assignments           = Array.Empty<object>(),
        personnel             = Array.Empty<object>(),
        rules                 = Array.Empty<object>(),
        conflicts             = Array.Empty<object>()
    };
}

static WorkflowConfigResult? ToWorkflowConfigResult(Backend.Workflow.WorkflowConfigItem? config) =>
    config is null ? null : new WorkflowConfigResult(
        config.Id, config.ServiceId, config.IsActive,
        config.Steps.Select(s => new WorkflowConfigStepResult(
            s.Id, s.Order, s.Label ?? s.ValidatorRole, s.ValidatorRole,
            s.ValidatorUserId, s.MaxDelayHours, s.IsFinalApproval, s.IsActive)).ToList());

static string MapWfNotificationType(string mysqlType) => mysqlType switch
{
    "WORKFLOW_SOUMIS"    => "WORKFLOW_SUBMITTED",
    "WORKFLOW_VALIDE"    => "WORKFLOW_APPROVED",
    "WORKFLOW_REJETE"    => "WORKFLOW_REJECTED",
    "WORKFLOW_REVISION"  => "WORKFLOW_MODIFICATION_REQUESTED",
    _                   => mysqlType
};

static (int userId, string userName) GetCurrentUser(HttpRequest request, JsonElement? body = null)
{
    if (request.Headers.TryGetValue("X-User-Id", out var userIdHeader) &&
        int.TryParse(userIdHeader.FirstOrDefault(), out var uidFromHeader))
    {
        var name = request.Headers.TryGetValue("X-User-Name", out var nameHeader)
            ? nameHeader.FirstOrDefault() ?? "Utilisateur"
            : "Utilisateur";
        return (uidFromHeader, name);
    }

    if (body.HasValue)
    {
        if (body.Value.TryGetProperty("userId", out var uidProp) && uidProp.TryGetInt32(out var uid))
        {
            var name = body.Value.TryGetProperty("userName", out var nameProp)
                ? nameProp.GetString() ?? "Utilisateur"
                : "Utilisateur";
            return (uid, name);
        }
        if (body.Value.TryGetProperty("soumisParId", out var sprop) && sprop.TryGetInt32(out var suid))
        {
            var name = body.Value.TryGetProperty("soumisParNom", out var nameProp)
                ? nameProp.GetString() ?? "Utilisateur"
                : "Utilisateur";
            return (suid, name);
        }
    }

    return (0, "Utilisateur");
}

app.MapPost("/api/workflow/plannings/{id:int}/approuver", async (
    int id, JsonElement payload, HttpRequest request,
    PlanningStore planningStore, WorkflowStore wfStore) =>
{
    var (uid, uname) = GetCurrentUser(request, payload);
    var commentaire = payload.TryGetProperty("commentaire", out var cp) ? cp.GetString() : null;
    var notifierCreateur = !payload.TryGetProperty("notifierCreateur", out var ncProp) || ncProp.GetBoolean();
    var notifierAutres   = !payload.TryGetProperty("notifierAutresValidateurs", out var navProp) || navProp.GetBoolean();

    try
    {
        var result = await planningStore.ApprouverEtapeAsync(id, uid, uname, commentaire,
            async serviceId =>
                ToWorkflowConfigResult(
                    await planningStore.GetWorkflowConfigByServiceMySqlAsync(serviceId)),
            notifierCreateur, notifierAutres);
        return result is null
            ? Results.NotFound(new { message = "Planning introuvable" })
            : Results.Ok(new { success = true, planning = result });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { success = false, message = ex.Message });
    }
});

app.MapPost("/api/workflow/plannings/{id:int}/rejeter", async (
    int id, JsonElement payload, HttpRequest request,
    PlanningStore planningStore) =>
{
    var (uid, uname) = GetCurrentUser(request, payload);
    var motif = payload.TryGetProperty("motif", out var mp) ? mp.GetString() ?? "Non précisé" : "Non précisé";
    var commentaire = payload.TryGetProperty("commentaire", out var cp) ? cp.GetString() : null;

    try
    {
        var result = await planningStore.RejeterPlanningAsync(id, uid, uname, motif, commentaire);
        return result is null
            ? Results.NotFound(new { message = "Planning introuvable" })
            : Results.Ok(new { success = true, planning = result });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { success = false, message = ex.Message });
    }
});

app.MapPost("/api/workflow/plannings/{id:int}/demander-modification", async (
    int id, JsonElement payload, HttpRequest request,
    PlanningStore planningStore) =>
{
    var (uid, uname) = GetCurrentUser(request, payload);

    string instructions = "Non précisé";
    if (payload.TryGetProperty("instructions", out var ip) && ip.ValueKind != JsonValueKind.Null)
        instructions = ip.GetString() ?? instructions;
    else if (payload.TryGetProperty("motif", out var mp2) && mp2.ValueKind != JsonValueKind.Null)
        instructions = mp2.GetString() ?? instructions;

    var result = await planningStore.DemanderModificationAsync(id, uid, uname, instructions);
    return result is null
        ? Results.NotFound(new { message = "Planning introuvable" })
        : Results.Ok(new { success = true, planning = result });
});

app.MapPost("/api/workflow/plannings/{id:int}/soumettre", async (
    int id, JsonElement payload, HttpRequest request,
    PlanningStore planningStore, WorkflowStore wfStore) =>
{
    var (uid, uname) = GetCurrentUser(request, payload);
    var message = payload.TryGetProperty("message", out var mp) && mp.ValueKind != JsonValueKind.Null ? mp.GetString() : null;

    try
    {
        var result = await planningStore.SubmitByWeekIdAsync(id, uid, uname, message,
            async serviceId =>
                ToWorkflowConfigResult(
                    await planningStore.GetWorkflowConfigByServiceStrAsync(serviceId)));
        return result is null
            ? Results.NotFound(new { message = "Planning introuvable" })
            : Results.Ok(new { success = true, planning = result, message = "Planning soumis pour validation." });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { success = false, message = ex.Message });
    }
});

app.MapGet("/api/workflow/plannings/mes-soumissions", async (
    HttpRequest request, int? poleId, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid == 0) return Results.Unauthorized();
    var result = poleId.HasValue
        ? await planningStore.GetPlanningsWorkflowAsync(poleId: poleId)
        : await planningStore.GetPlanningsWorkflowAsync(soumisParId: uid);
    return Results.Ok(result.Select(p => MapWeekWorkflowForFrontend(p)));
});

app.MapGet("/api/workflow/plannings/en-attente", async (
    HttpRequest request, int? poleId, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid == 0) return Results.Unauthorized();
    var result = poleId.HasValue
        ? await planningStore.GetPlanningsWorkflowAsync(poleId: poleId)
        : await planningStore.GetPlanningsWorkflowAsync(validateurId: uid);
    return Results.Ok(result.Select(p => MapWeekWorkflowForFrontend(p)));
});

app.MapGet("/api/workflow/plannings/{id:int}/historique", async (
    int id, PlanningStore planningStore) =>
{
    var result = await planningStore.GetValidationHistoryAsync(id);
    return Results.Ok(result);
});



app.MapGet("/api/workflow/dashboard", async (WorkflowStore store) =>
{
    var stats = await store.GetDashboardStatsAsync();
    return Results.Ok(stats);
});

// Récupérer uniquement les plannings validés (pour affichage public)
app.MapGet("/api/workflow/plannings/validated", async (WorkflowStore store) =>
{
    var plannings = await store.GetPlanningsAsync(WorkflowStatut.VALIDE).ToListAsync();
    return Results.Ok(plannings);
});

// Récupérer l'historique de validation
app.MapGet("/api/workflow/history", async (WorkflowStore store, int? planningId, int? etapeOrdre) =>
{
    var history = await store.GetHistoryAsync(planningId, etapeOrdre);
    return Results.Ok(history);
});

// Récupérer les commentaires d'un planning
app.MapGet("/api/workflow/comments/{planningId:int}", async (int planningId, WorkflowStore store) =>
{
    var comments = await store.GetCommentsAsync(planningId);
    return Results.Ok(comments);
});

// Ajouter un commentaire
app.MapPost("/api/workflow/comments/{planningId:int}", async (int planningId, JsonElement payload, WorkflowStore store) =>
{
    var message = payload.GetProperty("message").GetString() ?? "";
    var auteurNom = payload.GetProperty("auteurNom").GetString() ?? "Anonyme";
    var auteurRole = payload.GetProperty("auteurRole").GetString() ?? "utilisateur";
    
    int? etapeOrdre = null;
    if (payload.TryGetProperty("etapeOrdre", out var etapeProp))
    {
        etapeOrdre = etapeProp.GetInt32();
    }

    var comment = await store.AddCommentAsync(planningId, message, auteurNom, auteurRole, etapeOrdre);
    return Results.Ok(comment);
});

// Récupérer les étapes du workflow
app.MapGet("/api/workflow/etapes", async (WorkflowStore store) =>
{
    var etapes = await store.GetEtapesAsync();
    return Results.Ok(etapes);
});

// ========== COMMENTS (alias URL attendu par le frontend) ==========

app.MapGet("/api/workflow/plannings/{id:int}/comments", async (int id, WorkflowStore store) =>
{
    var comments = await store.GetCommentsAsync(id);
    return Results.Ok(comments.Select(c => new
    {
        id = c.Id,
        planningId = c.PlanningId,
        etapeOrdre = c.EtapeOrdre,
        auteurNom = c.AuteurNom,
        auteurRole = c.AuteurRole,
        message = c.Message,
        createdAt = c.CreatedAt,
        attachments = (object?[])[]
    }));
});

app.MapPost("/api/workflow/plannings/{id:int}/comments", async (int id, JsonElement payload, HttpRequest request, WorkflowStore store) =>
{
    var message = payload.TryGetProperty("message", out var mp) ? mp.GetString() ?? "" : "";
    var (uid, uname) = GetCurrentUser(request, payload);
    var auteurNom = uname.Length > 0 ? uname : (payload.TryGetProperty("auteurNom", out var anp) ? anp.GetString() ?? "Utilisateur" : "Utilisateur");
    var auteurRole = payload.TryGetProperty("auteurRole", out var arp) ? arp.GetString() ?? "utilisateur" : "utilisateur";
    int? etapeOrdre = null;
    if (payload.TryGetProperty("etapeOrdre", out var ep) && ep.ValueKind == JsonValueKind.Number)
        etapeOrdre = ep.GetInt32();

    var comment = await store.AddCommentAsync(id, message, auteurNom, auteurRole, etapeOrdre);
    return Results.Ok(new
    {
        id = comment.Id,
        planningId = comment.PlanningId,
        etapeOrdre = comment.EtapeOrdre,
        auteurNom = comment.AuteurNom,
        auteurRole = comment.AuteurRole,
        message = comment.Message,
        createdAt = comment.CreatedAt,
        attachments = (object?[])[]
    });
});

// ========== ATTACHMENTS ==========

var attachmentsDir = Path.Combine(AppContext.BaseDirectory, "attachments");
Directory.CreateDirectory(attachmentsDir);

app.MapGet("/api/workflow/plannings/{id:int}/attachments", (int id) =>
{
    var planningDir = Path.Combine(attachmentsDir, id.ToString());
    var metaFile = Path.Combine(planningDir, "_meta.json");
    if (!File.Exists(metaFile)) return Results.Ok(Array.Empty<object>());
    var json = File.ReadAllText(metaFile);
    return Results.Content(json, "application/json");
});

app.MapPost("/api/workflow/plannings/{id:int}/attachments", async (int id, HttpRequest request) =>
{
    if (!request.HasFormContentType || !request.Form.Files.Any())
        return Results.BadRequest(new { message = "Aucun fichier fourni." });

    var file = request.Form.Files[0];
    if (file.Length == 0)
        return Results.BadRequest(new { message = "Fichier vide." });

    var planningDir = Path.Combine(attachmentsDir, id.ToString());
    Directory.CreateDirectory(planningDir);
    var metaFile = Path.Combine(planningDir, "_meta.json");

    var attachmentId = Guid.NewGuid().ToString("N");
    // Sanitize filename to prevent path traversal
    var safeFileName = Path.GetFileName(file.FileName);
    var storedFileName = $"{attachmentId}_{safeFileName}";
    var filePath = Path.Combine(planningDir, storedFileName);

    await using (var stream = File.Create(filePath))
        await file.CopyToAsync(stream);

    // Lire la liste existante
    List<System.Text.Json.Nodes.JsonObject> metas;
    if (File.Exists(metaFile))
    {
        try { metas = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.Nodes.JsonObject>>(File.ReadAllText(metaFile)) ?? []; }
        catch { metas = []; }
    }
    else { metas = []; }

    var uploadedBy = request.Headers.TryGetValue("X-User-Name", out var unh) ? unh.ToString() : "Utilisateur";
    var newMeta = new System.Text.Json.Nodes.JsonObject
    {
        ["id"] = attachmentId,
        ["fileName"] = safeFileName,
        ["fileType"] = file.ContentType,
        ["size"] = file.Length,
        ["uploadedAt"] = DateTime.UtcNow.ToString("o"),
        ["uploadedBy"] = uploadedBy,
        ["storedFileName"] = storedFileName
    };
    metas.Add(newMeta);
    File.WriteAllText(metaFile, System.Text.Json.JsonSerializer.Serialize(metas));

    return Results.Ok(newMeta);
});

app.MapDelete("/api/workflow/plannings/{id:int}/attachments/{attachmentId}", (int id, string attachmentId) =>
{
    var planningDir = Path.Combine(attachmentsDir, id.ToString());
    var metaFile = Path.Combine(planningDir, "_meta.json");
    if (!File.Exists(metaFile)) return Results.NotFound();

    List<System.Text.Json.Nodes.JsonObject> metas;
    try { metas = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.Nodes.JsonObject>>(File.ReadAllText(metaFile)) ?? []; }
    catch { return Results.Ok(); }

    var entry = metas.FirstOrDefault(m => m["id"]?.GetValue<string>() == attachmentId);
    if (entry != null)
    {
        metas.Remove(entry);
        var storedName = entry["storedFileName"]?.GetValue<string>();
        if (!string.IsNullOrEmpty(storedName))
        {
            var filePath = Path.Combine(planningDir, storedName);
            if (File.Exists(filePath)) File.Delete(filePath);
        }
        File.WriteAllText(metaFile, System.Text.Json.JsonSerializer.Serialize(metas));
    }
    return Results.Ok();
});

// ========== DIAGNOSTIC (dev/admin only) ==========

// Diagnostic complet d'un planning workflow : config, étapes, validateur, notifications
app.MapGet("/api/workflow/plannings/{id:int}/diagnostic", async (int id, PlanningStore planningStore) =>
{
    var diag = await planningStore.GetPlanningDiagnosticAsync(id);
    return diag is null
        ? Results.NotFound(new { message = "Planning introuvable" })
        : Results.Ok(diag);
});

// Chercher les utilisateurs ayant un rôle donné (pour déboguer FindValidateurIdAsync)
app.MapGet("/api/workflow/debug/find-by-role", async (string role, int? serviceId, PlanningStore planningStore) =>
{
    var users = await planningStore.FindUsersByRoleDebugAsync(role, serviceId ?? 0);
    return Results.Ok(new { role, serviceId, users });
});

// ========== NOTIFICATIONS ==========

// Récupérer les notifications d'un utilisateur (lit depuis MySQL via PlanningStore)
app.MapGet("/api/workflow/notifications", async (HttpRequest request, bool? unreadOnly, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid <= 0) return Results.Unauthorized();
    var items = await planningStore.GetNotificationsAsync(uid, unreadOnly ?? false);
    return Results.Ok(items.Select(n => new
    {
        id = n.Id.ToString(),
        userId = n.UserId.ToString(),
        type = MapWfNotificationType(n.Type),
        planningId = n.PlanningWeekId?.ToString() ?? "",
        titre = n.Titre,
        message = n.Message,
        actionUrl = n.Lien,
        isRead = n.Lu,
        createdAt = n.DateCreation,
        readAt = n.DateLecture
    }));
});

// Récupérer le nombre de notifications non lues
app.MapGet("/api/workflow/notifications/unread-count", async (HttpRequest request, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid <= 0) return Results.Unauthorized();
    var count = await planningStore.GetUnreadCountAsync(uid);
    return Results.Ok(new { count });
});

// Marquer une notification comme lue
app.MapPost("/api/workflow/notifications/{notificationId:int}/read", async (int notificationId, HttpRequest request, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid <= 0) return Results.Unauthorized();
    var success = await planningStore.MarkNotificationReadAsync(notificationId, uid);
    return success
        ? Results.Ok(new { success = true })
        : Results.NotFound(new { message = "Notification introuvable" });
});

// Marquer toutes les notifications comme lues
app.MapPost("/api/workflow/notifications/read-all", async (HttpRequest request, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid <= 0) return Results.Unauthorized();
    await planningStore.MarkAllNotificationsReadAsync(uid);
    return Results.Ok(new { success = true });
});

// ========== SOUMISSION DE PLANNING ==========

// Soumettre un nouveau planning (créé par chef de service ou chef de pôle)
app.MapPost("/api/workflow/plannings/submit", async (JsonElement payload, WorkflowStore store) =>
{
    try
    {
        var serviceId = payload.GetProperty("serviceId").GetString() ?? "";
        var serviceName = payload.GetProperty("serviceName").GetString() ?? "";
        var weekStartStr = payload.GetProperty("weekStart").GetString() ?? "";
        var weekStart = DateTime.Parse(weekStartStr);
        
        DateTime? weekEnd = null;
        if (payload.TryGetProperty("weekEnd", out var weekEndProp) && weekEndProp.ValueKind != JsonValueKind.Null)
        {
            var weekEndStr = weekEndProp.GetString();
            if (!string.IsNullOrEmpty(weekEndStr))
                weekEnd = DateTime.Parse(weekEndStr);
        }

        var createdBy = payload.GetProperty("createdBy").GetString() ?? "Utilisateur inconnu";

        // Récupérer les assignments (facultatif)
        List<AssignmentItem>? assignments = null;
        if (payload.TryGetProperty("assignments", out var assignmentsProp) && assignmentsProp.ValueKind == JsonValueKind.Array)
        {
            assignments = new List<AssignmentItem>();
            foreach (var item in assignmentsProp.EnumerateArray())
            {
                assignments.Add(new AssignmentItem
                {
                    Id = item.TryGetProperty("id", out var idP) ? idP.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString(),
                    UserId = item.GetProperty("userId").GetString() ?? "",
                    UserName = item.GetProperty("userName").GetString() ?? "",
                    Title = item.GetProperty("title").GetString() ?? "",
                    Start = DateTime.Parse(item.GetProperty("start").GetString() ?? ""),
                    End = DateTime.Parse(item.GetProperty("end").GetString() ?? ""),
                    Color = item.TryGetProperty("color", out var colorP) ? colorP.GetString() : null,
                    PosteId = item.TryGetProperty("posteId", out var posteP) ? posteP.GetString() : null
                });
            }
        }

        var newPlanning = await store.SoumettreNouveauPlanningAsync(serviceId, serviceName, weekStart, weekEnd, assignments, createdBy);
        return Results.Ok(new { success = true, planning = newPlanning, message = "Planning soumis avec succès. Les administrateurs ont été notifiés." });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { success = false, message = $"Erreur lors de la soumission: {ex.Message}" });
    }
});

// ========== NOTIFICATIONS MySQL (nouvelles routes) ==========

// Notifications de l'utilisateur courant (MySQL)
app.MapGet("/api/notifications", async (HttpRequest request, PlanningStore planningStore, bool? unreadOnly) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid == 0) return Results.Unauthorized();
    var notifications = await planningStore.GetNotificationsAsync(uid, unreadOnly ?? false);
    return Results.Ok(notifications);
});

// Nombre de notifications non lues (MySQL)
app.MapGet("/api/notifications/count", async (HttpRequest request, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid == 0) return Results.Ok(new { count = 0 });
    var count = await planningStore.GetUnreadCountAsync(uid);
    return Results.Ok(new { count });
});

// Marquer une notification comme lue (MySQL)
app.MapPost("/api/notifications/{id:int}/lire", async (
    int id, HttpRequest request, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid == 0) return Results.Unauthorized();
    var ok = await planningStore.MarkNotificationReadAsync(id, uid);
    return ok ? Results.Ok(new { success = true }) : Results.NotFound();
});

// Marquer toutes les notifications comme lues (MySQL)
app.MapPost("/api/notifications/lire-tout", async (HttpRequest request, PlanningStore planningStore) =>
{
    var (uid, _) = GetCurrentUser(request);
    if (uid == 0) return Results.Unauthorized();
    await planningStore.MarkAllNotificationsReadAsync(uid);
    return Results.Ok(new { success = true });
});

app.MapPost("/api/notifications/arret", async (JsonElement payload, HttpRequest request, PlanningStore planningStore) =>
{
    var (senderId, senderName) = GetCurrentUser(request, payload);

    var recipientId = senderId;
    if (payload.TryGetProperty("recipientId", out var recipientProp) && int.TryParse(recipientProp.GetString(), out var parsedRecipient) && parsedRecipient > 0)
    {
        recipientId = parsedRecipient;
    }

    var employeeId = payload.TryGetProperty("employeeId", out var employeeProp)
        ? employeeProp.GetString() ?? senderName
        : senderName;

    var title = payload.TryGetProperty("title", out var titleProp) && !string.IsNullOrWhiteSpace(titleProp.GetString())
        ? titleProp.GetString()!
        : "Arrêt de travail";

    var startDate = payload.TryGetProperty("startDate", out var startDateProp) ? startDateProp.GetString() ?? "" : "";
    var endDate = payload.TryGetProperty("endDate", out var endDateProp) ? endDateProp.GetString() ?? startDate : startDate;
    var message = payload.TryGetProperty("message", out var messageProp) && !string.IsNullOrWhiteSpace(messageProp.GetString())
        ? messageProp.GetString()!
        : $"Arrêt enregistré pour {employeeId} du {startDate} au {endDate}.";

    int? planningWeekId = null;
    if (payload.TryGetProperty("planningWeekId", out var planningWeekIdProp) && planningWeekIdProp.TryGetInt32(out var parsedPlanningWeekId))
    {
        planningWeekId = parsedPlanningWeekId;
    }

    var ok = await planningStore.CreateArretNotificationAsync(recipientId, title, message, planningWeekId, senderId, null);
    return ok ? Results.Ok(new { success = true }) : Results.BadRequest(new { success = false });
});

// ========== WORKFLOW CONFIG (MySQL : workflow_configs + workflow_etapes) ==========
app.MapGet("/api/workflow/configs", async (PlanningStore planningStore) =>
    Results.Ok(await planningStore.GetAllWorkflowConfigsMySqlAsync()));

app.MapGet("/api/workflow/configs/service/{serviceId:int}", async (int serviceId, PlanningStore planningStore) =>
{
    var config = await planningStore.GetWorkflowConfigByServiceMySqlAsync(serviceId);
    return config is null
        ? Results.NotFound(new { message = "Aucune configuration pour ce service." })
        : Results.Ok(config);
});

app.MapPost("/api/workflow/configs", async (CreateWorkflowConfigDTO dto, PlanningStore planningStore) =>
    Results.Ok(await planningStore.CreateWorkflowConfigMySqlAsync(dto)));

app.MapPut("/api/workflow/configs/{id:int}", async (int id, CreateWorkflowConfigDTO dto, PlanningStore planningStore) =>
{
    var updated = await planningStore.UpdateWorkflowConfigMySqlAsync(id, dto);
    return updated is null
        ? Results.NotFound(new { message = "Configuration introuvable." })
        : Results.Ok(updated);
});

app.MapDelete("/api/workflow/configs/{id:int}", async (int id, PlanningStore planningStore) =>
{
    var deleted = await planningStore.DeleteWorkflowConfigMySqlAsync(id);
    return deleted
        ? Results.Ok(new { message = "Configuration supprimée avec succès." })
        : Results.NotFound(new { message = "Configuration introuvable." });
});

app.MapPost("/api/workflow/configs/{id:int}/activate", async (int id, PlanningStore planningStore) =>
{
    var activated = await planningStore.ActivateWorkflowConfigMySqlAsync(id);
    return activated is null
        ? Results.NotFound(new { message = "Configuration introuvable." })
        : Results.Ok(activated);
});

app.Run();
