using MySqlConnector;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    public async Task<IReadOnlyList<DemandeTypeDefinition>> GetDemandeTypesAsync(bool requestableOnly = false)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT code, label, description, color, impact, is_requestable
FROM absence_types
WHERE (@requestableOnly = 0 OR is_requestable = 1)
ORDER BY
    CASE code
        WHEN 'VA' THEN 1
        WHEN 'AS' THEN 2
        WHEN 'AT' THEN 3
        WHEN 'AL' THEN 4
        WHEN 'JR' THEN 5
        WHEN 'HS' THEN 6
        WHEN 'RC+' THEN 7
        WHEN 'RC-' THEN 8
        WHEN 'ABSENCE' THEN 9
        WHEN 'ARRET' THEN 10
        ELSE 99
    END,
    code;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@requestableOnly", requestableOnly ? 1 : 0);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<DemandeTypeDefinition>();
        while (await reader.ReadAsync())
        {
            list.Add(new DemandeTypeDefinition
            {
                Code = reader.GetString("code"),
                Label = reader.GetString("label"),
                Description = reader.GetString("description"),
                Color = reader.GetString("color"),
                Impact = reader.GetString("impact"),
                IsRequestable = reader.GetBoolean("is_requestable")
            });
        }

        return list;
    }

    public async Task<UserTimeCounters> GetUserTimeCountersAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        await EnsureUserCounterRowAsync(connection, userId);

        const string sql = @"
SELECT user_id, solde_rc_plus, solde_rc_moins, updated_at
FROM compteurs_utilisateur
WHERE user_id = @userId
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new UserTimeCounters
            {
                UserId = userId,
                SoldeRcPlus = 0,
                SoldeRcMoins = 0,
                UpdatedAt = DateTime.UtcNow
            };
        }

        return new UserTimeCounters
        {
            UserId = reader.GetInt32("user_id"),
            SoldeRcPlus = reader.GetDecimal("solde_rc_plus"),
            SoldeRcMoins = reader.GetDecimal("solde_rc_moins"),
            UpdatedAt = reader.GetDateTime("updated_at")
        };
    }

    public async Task<IReadOnlyList<UserPlanningRequestItem>> GetUserPlanningRequestsAsync(int userId, DateTime? from = null, DateTime? to = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT d.id, d.user_id, d.service_id, d.date_evenement, d.date_fin_evenement, d.type_demande, d.heure_debut, d.heure_fin,
    d.duree_minutes, d.commentaire, d.statut, d.valide_par,
        TRIM(CONCAT(COALESCE(vp.prenom, ''), ' ', COALESCE(vp.nom, ''))) AS valide_par_nom,
        d.date_validation, d.motif_rejet, d.traite_par, d.traite_le,
        d.created_at, d.updated_at, d.source_assignment_id
FROM demandes_utilisateur d
LEFT JOIN staff_users vp ON vp.id = d.valide_par
WHERE d.user_id = @userId
    AND (@fromDate IS NULL OR d.date_evenement >= @fromDate)
    AND (@toDate IS NULL OR d.date_evenement <= @toDate)
ORDER BY d.date_evenement DESC, d.created_at DESC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@fromDate", from.HasValue ? from.Value.Date : DBNull.Value);
        cmd.Parameters.AddWithValue("@toDate", to.HasValue ? to.Value.Date : DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<UserPlanningRequestItem>();
        while (await reader.ReadAsync())
        {
            list.Add(MapRequest(reader));
        }

        return list;
    }

    public async Task<IReadOnlyList<UserPlanningRequestItem>> GetPendingUserPlanningRequestsAsync(int? serviceId = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT d.id, d.user_id, d.service_id, d.date_evenement, d.date_fin_evenement, d.type_demande, d.heure_debut, d.heure_fin,
        d.duree_minutes, d.commentaire, d.statut, d.valide_par,
        TRIM(CONCAT(COALESCE(vp.prenom, ''), ' ', COALESCE(vp.nom, ''))) AS valide_par_nom,
        d.date_validation, d.motif_rejet, d.traite_par, d.traite_le,
        d.created_at, d.updated_at, d.source_assignment_id
FROM demandes_utilisateur d
LEFT JOIN staff_users vp ON vp.id = d.valide_par
WHERE d.statut = 'EN_ATTENTE'
    AND (@serviceId IS NULL OR d.service_id = @serviceId)
ORDER BY d.created_at ASC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", serviceId.HasValue ? serviceId.Value : DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<UserPlanningRequestItem>();
        while (await reader.ReadAsync())
        {
            list.Add(MapRequest(reader));
        }

        return list;
    }

    public async Task<UserPlanningRequestItem> CreateUserPlanningRequestAsync(CreateUserPlanningRequestDto dto)
    {
        if (dto.UserId <= 0) throw new InvalidOperationException("Utilisateur invalide.");
        if (dto.ServiceId <= 0) throw new InvalidOperationException("Service invalide.");

        var normalizedType = NormalizeRequestType(dto.Type);
        if (!await IsRequestTypeAllowedForUserAsync(normalizedType))
        {
            throw new InvalidOperationException("Ce type n'est pas autorisé pour une demande directe. Contactez votre responsable RH.");
        }

        var startDate = dto.Date.Date;
        var endDate = (dto.DateFin ?? dto.Date).Date;
        var today = DateTime.Now.Date;
        var isInformationalType = normalizedType == "AT";
        var isRangeType = normalizedType is "VA" or "AS" or "AL" or "JR" or "ABSENCE";

        if (startDate < today || endDate < today)
        {
            throw new InvalidOperationException("Les demandes pour des jours deja passes ne sont pas autorisees.");
        }

        if (isRangeType && endDate < startDate)
        {
            throw new InvalidOperationException("La date de fin doit être postérieure ou égale à la date de début.");
        }

        if (normalizedType == "AT" && startDate != DateTime.Now.Date)
        {
            throw new InvalidOperationException("L'arrêt de travail ne peut être demandé que pour la date du jour.");
        }

        var usesExplicitTimeRange = UsesExplicitTimeRange(normalizedType, startDate, endDate, dto.HeureDebut, dto.HeureFin);
        var (start, end, durationMinutes) = usesExplicitTimeRange
            ? ValidateAndComputeDuration(dto.HeureDebut, dto.HeureFin)
            : isInformationalType
                ? ("00:00", "00:00", 0)
                : ("00:00", "00:00", Math.Max(1, (endDate - startDate).Days + 1) * 8 * 60);
        var now = DateTime.UtcNow;
        var localNow = DateTime.Now;

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        string? resolvedSourceAssignmentId = dto.SourceAssignmentId;
        if (!isInformationalType)
        {
            var validation = await ValidateRequestCreationAsync(
                connection,
                dto.UserId,
                normalizedType,
                startDate,
                endDate,
                start,
                end,
                usesExplicitTimeRange,
                localNow,
                sourceAssignmentId: resolvedSourceAssignmentId);
            resolvedSourceAssignmentId = validation.SourceAssignmentId ?? resolvedSourceAssignmentId;
        }

        int? validatorId = isInformationalType
            ? null
            : await ResolveResponsibleValidatorIdAsync(connection, dto.ServiceId, startDate)
                ?? throw new InvalidOperationException("Aucun responsable de planning trouvé pour cette demande.");

        var planningId = await ResolvePlanningWeekIdAsync(connection, dto.ServiceId, startDate);
        var requestStatus = isInformationalType ? "INFORMATIF" : "EN_ATTENTE";
        var endDateParameter = isInformationalType ? (object?)DBNull.Value : endDate;

        const string insertSql = @"
INSERT INTO demandes_utilisateur
        (user_id, planning_id, service_id, date_evenement, date_fin_evenement, type_demande, heure_debut, heure_fin, duree_minutes,
     commentaire, statut, valide_par, created_at, updated_at, source_assignment_id)
VALUES
    (@userId, @planningId, @serviceId, @dateEvenement, @dateFinEvenement, @typeDemande, @heureDebut, @heureFin, @dureeMinutes,
     @commentaire, @statut, @validePar, @createdAt, @updatedAt, @sourceAssignmentId);";

        await using (var cmd = new MySqlCommand(insertSql, connection))
        {
            cmd.Parameters.AddWithValue("@userId", dto.UserId);
            cmd.Parameters.AddWithValue("@planningId", (object?)planningId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@serviceId", dto.ServiceId);
            cmd.Parameters.AddWithValue("@dateEvenement", startDate);
            cmd.Parameters.AddWithValue("@dateFinEvenement", endDateParameter);
            cmd.Parameters.AddWithValue("@typeDemande", normalizedType);
            cmd.Parameters.AddWithValue("@heureDebut", start);
            cmd.Parameters.AddWithValue("@heureFin", end);
            cmd.Parameters.AddWithValue("@dureeMinutes", durationMinutes);
            cmd.Parameters.AddWithValue("@commentaire", (object?)dto.Commentaire ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@statut", requestStatus);
            cmd.Parameters.AddWithValue("@validePar", (object?)validatorId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@createdAt", now);
            cmd.Parameters.AddWithValue("@updatedAt", now);
            cmd.Parameters.AddWithValue("@sourceAssignmentId", (object?)resolvedSourceAssignmentId ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }

        var requestId = Convert.ToInt32(await new MySqlCommand("SELECT LAST_INSERT_ID();", connection).ExecuteScalarAsync());
        await AddDemandeHistoryAsync(connection, requestId, "CREATED", dto.UserId, "Utilisateur", isInformationalType
            ? "Arrêt de travail enregistré comme information"
            : "Demande envoyée au responsable");

        if (isInformationalType)
        {
            await InsertDemandeInfoNotificationAsync(
                connection,
                dto.UserId,
                requestId,
                planningId,
                dto.ServiceId,
                startDate,
                dto.Commentaire);
        }
        else
        {
            await InsertDemandeNotificationAsync(
                connection,
                validatorId!.Value,
                dto.UserId,
                requestId,
                planningId,
                dto.ServiceId,
                startDate,
                normalizedType,
                dto.Commentaire);
        }

        return await GetRequestByIdAsync(connection, requestId)
            ?? throw new InvalidOperationException("La demande a été créée mais introuvable.");
    }

    public async Task<IReadOnlyList<UserPlanningRequestItem>> GetPendingUserPlanningRequestsForValidatorAsync(int validatorId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT d.id, d.user_id, d.service_id, d.date_evenement, d.date_fin_evenement, d.type_demande, d.heure_debut, d.heure_fin,
             d.duree_minutes, d.commentaire, d.statut, d.valide_par,
             TRIM(CONCAT(COALESCE(vp.prenom, ''), ' ', COALESCE(vp.nom, ''))) AS valide_par_nom,
             d.date_validation, d.motif_rejet, d.traite_par, d.traite_le,
             d.created_at, d.updated_at, d.source_assignment_id
FROM demandes_utilisateur d
LEFT JOIN staff_users vp ON vp.id = d.valide_par
WHERE d.statut = 'EN_ATTENTE'
    AND d.valide_par = @validatorId
ORDER BY d.created_at ASC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@validatorId", validatorId);

        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<UserPlanningRequestItem>();
        while (await reader.ReadAsync())
        {
            list.Add(MapRequest(reader));
        }

        return list;
    }

    public async Task<IReadOnlyList<DemandeHistoriqueItem>> GetDemandeHistoriqueAsync(int demandeId, int actingUserId)
    {
        if (demandeId <= 0)
        {
            return Array.Empty<DemandeHistoriqueItem>();
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string accessSql = @"
SELECT user_id, valide_par, traite_par
FROM demandes_utilisateur
WHERE id = @id
LIMIT 1;";

        await using (var accessCmd = new MySqlCommand(accessSql, connection))
        {
            accessCmd.Parameters.AddWithValue("@id", demandeId);
            await using var accessReader = await accessCmd.ExecuteReaderAsync();
            if (!await accessReader.ReadAsync())
            {
                return Array.Empty<DemandeHistoriqueItem>();
            }

            var ownerId = accessReader.GetInt32("user_id");
            var validatorId = IsNull(accessReader, "valide_par") ? (int?)null : accessReader.GetInt32("valide_par");
            var processorId = IsNull(accessReader, "traite_par") ? (int?)null : accessReader.GetInt32("traite_par");

            var authorized = actingUserId > 0
                             && (actingUserId == ownerId
                                 || (validatorId.HasValue && actingUserId == validatorId.Value)
                                 || (processorId.HasValue && actingUserId == processorId.Value));

            if (!authorized)
            {
                throw new InvalidOperationException("Vous n'êtes pas autorisé à consulter l'historique de cette demande.");
            }
        }

        const string historySql = @"
SELECT id, demande_id, action, acteur_id, acteur_nom, commentaire, created_at
FROM demande_historique
WHERE demande_id = @demandeId
ORDER BY created_at ASC, id ASC;";

        await using var cmd = new MySqlCommand(historySql, connection);
        cmd.Parameters.AddWithValue("@demandeId", demandeId);

        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<DemandeHistoriqueItem>();
        while (await reader.ReadAsync())
        {
            list.Add(new DemandeHistoriqueItem
            {
                Id = reader.GetInt32("id"),
                DemandeId = reader.GetInt32("demande_id"),
                Action = reader.GetString("action"),
                ActeurId = IsNull(reader, "acteur_id") ? null : reader.GetInt32("acteur_id"),
                ActeurNom = IsNull(reader, "acteur_nom") ? null : reader.GetString("acteur_nom"),
                Commentaire = IsNull(reader, "commentaire") ? null : reader.GetString("commentaire"),
                CreatedAt = reader.GetDateTime("created_at")
            });
        }

        return list;
    }

    public async Task<UserPlanningRequestItem?> ApproveUserPlanningRequestAsync(int requestId, int validatorId, string validatorName)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var request = await GetRequestByIdAsync(connection, requestId, tx);
        if (request is null) return null;
        if (!string.Equals(request.Statut, "EN_ATTENTE", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Cette demande a déjà été traitée.");
        }
        if (request.ValidePar.HasValue && request.ValidePar.Value != validatorId)
        {
            throw new InvalidOperationException("Vous n'êtes pas autorisé à valider cette demande.");
        }

        await EnsureUserCounterRowAsync(connection, request.UserId, tx);

        var localNow = DateTime.Now;
        var normalizedType = NormalizeRequestType(request.Type);
        var approvalValidation = await ValidateRequestCreationAsync(
            connection,
            request.UserId,
            normalizedType,
            request.Date.Date,
            (request.DateFin ?? request.Date).Date,
            request.HeureDebut,
            request.HeureFin,
            UsesExplicitTimeRange(
                normalizedType,
                request.Date.Date,
                (request.DateFin ?? request.Date).Date,
                request.HeureDebut,
                request.HeureFin),
            localNow,
            excludeRequestId: request.Id,
            sourceAssignmentId: request.SourceAssignmentId);
        if (string.IsNullOrWhiteSpace(request.SourceAssignmentId) &&
            !string.IsNullOrWhiteSpace(approvalValidation.SourceAssignmentId))
        {
            request.SourceAssignmentId = approvalValidation.SourceAssignmentId;
        }

        var serviceName = await ResolveServiceNameByIdAsync(connection, request.ServiceId, tx) ?? $"Service {request.ServiceId}";
        var now = DateTime.UtcNow;

        await ApplyApprovedRequestToPlanningAsync(connection, tx, request, serviceName, now);
        await ApplyCountersOnApprovalAsync(connection, tx, request);

        const string updateSql = @"
UPDATE demandes_utilisateur
SET statut = 'APPROUVEE',
    traite_par = @traitePar,
    traite_le = @traiteLe,
    date_validation = @traiteLe,
    updated_at = @updatedAt,
    motif_rejet = NULL
WHERE id = @id;";

        await using (var cmd = new MySqlCommand(updateSql, connection, tx))
        {
            cmd.Parameters.AddWithValue("@id", requestId);
            cmd.Parameters.AddWithValue("@traitePar", validatorId);
            cmd.Parameters.AddWithValue("@traiteLe", now);
            cmd.Parameters.AddWithValue("@updatedAt", now);
            await cmd.ExecuteNonQueryAsync();
        }

        await AddDemandeHistoryAsync(connection, requestId, "APPROVED", validatorId, validatorName, "Demande approuvée", tx);

        await InsertDemandeDecisionNotificationAsync(
            connection,
            request.UserId,
            validatorId,
            validatorName,
            requestId,
            null,
            approved: true,
            motif: null,
            tx);

        await tx.CommitAsync();
        return await GetRequestByIdAsync(connection, requestId);
    }

    public async Task<UserPlanningRequestItem?> RejectUserPlanningRequestAsync(int requestId, int validatorId, string? motif)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var request = await GetRequestByIdAsync(connection, requestId);
        if (request is null) return null;
        if (!string.Equals(request.Statut, "EN_ATTENTE", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Cette demande a déjà été traitée.");
        }
        if (request.ValidePar.HasValue && request.ValidePar.Value != validatorId)
        {
            throw new InvalidOperationException("Vous n'êtes pas autorisé à rejeter cette demande.");
        }

        const string sql = @"
UPDATE demandes_utilisateur
SET statut = 'REJETEE',
    traite_par = @traitePar,
    traite_le = @traiteLe,
    date_validation = @traiteLe,
    motif_rejet = @motif,
    updated_at = @updatedAt
WHERE id = @id;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", requestId);
        cmd.Parameters.AddWithValue("@traitePar", validatorId);
        cmd.Parameters.AddWithValue("@traiteLe", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@motif", (object?)motif ?? "Rejetée par le validateur.");
        cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();

        await AddDemandeHistoryAsync(connection, requestId, "REJECTED", validatorId, null, motif ?? "Demande rejetée");

        await InsertDemandeDecisionNotificationAsync(
            connection,
            request.UserId,
            validatorId,
            $"Validateur #{validatorId}",
            requestId,
            null,
            approved: false,
            motif,
            tx: null);

        return await GetRequestByIdAsync(connection, requestId);
    }

    public async Task<UserPlanningRequestItem?> CancelUserPlanningRequestAsync(int requestId, int actingUserId, string? actorName = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var request = await GetRequestByIdAsync(connection, requestId, tx);
        if (request is null)
        {
            return null;
        }

        if (request.UserId != actingUserId)
        {
            throw new InvalidOperationException("Seul le créateur de la demande peut l'annuler.");
        }

        var status = (request.Statut ?? string.Empty).Trim().ToUpperInvariant();
        if (status == "ANNULEE")
        {
            return request;
        }

        if (status != "EN_ATTENTE" && status != "APPROUVEE" && status != "INFORMATIF")
        {
            throw new InvalidOperationException("Cette demande ne peut plus être annulée.");
        }

        var today = DateTime.Today;
        var requestEndDate = (request.DateFin ?? request.Date).Date;
        if (requestEndDate < today)
        {
            throw new InvalidOperationException("Seules les demandes du jour ou à venir peuvent être annulées.");
        }

        if (status == "APPROUVEE")
        {
            // Revert the side effects of approval so the cancellation is consistent.
            await RollbackApprovedRequestImpactAsync(connection, tx, request);
        }

        const string updateSql = @"
UPDATE demandes_utilisateur
SET statut = 'ANNULEE',
    traite_par = @traitePar,
    traite_le = @traiteLe,
    updated_at = @updatedAt,
    motif_rejet = @motif
WHERE id = @id;";

        var now = DateTime.UtcNow;
        await using (var cmd = new MySqlCommand(updateSql, connection, tx))
        {
            cmd.Parameters.AddWithValue("@id", requestId);
            cmd.Parameters.AddWithValue("@traitePar", actingUserId);
            cmd.Parameters.AddWithValue("@traiteLe", now);
            cmd.Parameters.AddWithValue("@updatedAt", now);
            cmd.Parameters.AddWithValue("@motif", "Demande annulée par le créateur.");
            await cmd.ExecuteNonQueryAsync();
        }

        await AddDemandeHistoryAsync(
            connection,
            requestId,
            "CANCELLED",
            actingUserId,
            string.IsNullOrWhiteSpace(actorName) ? "Utilisateur" : actorName,
            "Demande annulée par le créateur",
            tx);

        await tx.CommitAsync();
        return await GetRequestByIdAsync(connection, requestId);
    }

    private static UserPlanningRequestItem MapRequest(MySqlDataReader reader)
    {
        var minutes = reader.GetInt32("duree_minutes");
        return new UserPlanningRequestItem
        {
            Id = reader.GetInt32("id"),
            UserId = reader.GetInt32("user_id"),
            ServiceId = reader.GetInt32("service_id"),
            Date = reader.GetDateTime("date_evenement"),
            DateFin = IsNull(reader, "date_fin_evenement") ? null : reader.GetDateTime("date_fin_evenement"),
            Type = reader.GetString("type_demande"),
            HeureDebut = reader.GetString("heure_debut"),
            HeureFin = reader.GetString("heure_fin"),
            DureeHeures = Math.Round(minutes / 60m, 2),
            Commentaire = IsNull(reader, "commentaire") ? null : reader.GetString("commentaire"),
            Statut = reader.GetString("statut"),
            ValidePar = IsNull(reader, "valide_par") ? null : reader.GetInt32("valide_par"),
            ValideParNom = IsNull(reader, "valide_par_nom") ? null : reader.GetString("valide_par_nom"),
            DateValidation = IsNull(reader, "date_validation") ? null : reader.GetDateTime("date_validation"),
            MotifRejet = IsNull(reader, "motif_rejet") ? null : reader.GetString("motif_rejet"),
            TraitePar = IsNull(reader, "traite_par") ? null : reader.GetInt32("traite_par"),
            TraiteLe = IsNull(reader, "traite_le") ? null : reader.GetDateTime("traite_le"),
            CreatedAt = reader.GetDateTime("created_at"),
            UpdatedAt = reader.GetDateTime("updated_at"),
            SourceAssignmentId = IsNull(reader, "source_assignment_id") ? null : reader.GetString("source_assignment_id")
        };
    }

    private static string NormalizeRequestType(string type)
    {
        var normalized = (type ?? string.Empty).Trim().ToUpperInvariant();
        return normalized switch
        {
            "HS" => "HS",
            "RC+" or "RC_PLUS" => "RC+",
            "RC-" or "RC_MOINS" => "RC-",
            "ABSENCE" => "ABSENCE",
            "ARRET" => "ARRET",
            "VA" => "VA",
            "AS" => "AS",
            "AT" => "AT",
            "AL" => "AL",
            "JR" => "JR",
            _ => throw new InvalidOperationException("Type de demande invalide.")
        };
    }

    private async Task<bool> IsRequestTypeAllowedForUserAsync(string normalizedType)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT is_requestable
FROM absence_types
WHERE code = @code
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@code", normalizedType);
        var result = await cmd.ExecuteScalarAsync();
        if (result is null || result is DBNull)
        {
            return false;
        }

        return Convert.ToInt32(result) == 1;
    }

    private static (string Start, string End, int DurationMinutes) ValidateAndComputeDuration(string start, string end)
    {
        if (!TimeSpan.TryParse(start, out var startTs) || !TimeSpan.TryParse(end, out var endTs))
        {
            throw new InvalidOperationException("Heures invalides.");
        }

        var duration = endTs - startTs;
        if (duration <= TimeSpan.Zero)
        {
            throw new InvalidOperationException("L'heure de fin doit être après l'heure de début.");
        }

        var minutes = (int)Math.Round(duration.TotalMinutes);
        if (minutes <= 0)
        {
            throw new InvalidOperationException("Durée invalide.");
        }

        return (startTs.ToString(@"hh\:mm"), endTs.ToString(@"hh\:mm"), minutes);
    }

    private sealed class RequestValidationResult
    {
        public string? SourceAssignmentId { get; init; }
    }

    private sealed class PlanningSlot
    {
        public string AssignmentId { get; init; } = string.Empty;
        public string Start { get; init; } = string.Empty;
        public string End { get; init; } = string.Empty;
    }

    private sealed class ExistingRequestConflict
    {
        public int Id { get; init; }
        public string Type { get; init; } = string.Empty;
        public DateTime Date { get; init; }
        public DateTime EndDate { get; init; }
        public string Start { get; init; } = string.Empty;
        public string End { get; init; } = string.Empty;
    }

    private static bool UsesExplicitTimeRange(string normalizedType, DateTime startDate, DateTime endDate, string? start, string? end)
    {
        if (normalizedType is "HS" or "AS" or "RC+" or "RC-")
        {
            return true;
        }

        if (normalizedType is "ABSENCE" or "AL")
        {
            return startDate == endDate && HasMeaningfulTimeRange(start, end);
        }

        return false;
    }

    private static bool HasMeaningfulTimeRange(string? start, string? end)
    {
        var normalizedStart = NormalizeTimeText(start);
        var normalizedEnd = NormalizeTimeText(end);
        return normalizedStart != "00:00" || normalizedEnd != "00:00";
    }

    private async Task<RequestValidationResult> ValidateRequestCreationAsync(
        MySqlConnection connection,
        int userId,
        string normalizedType,
        DateTime startDate,
        DateTime endDate,
        string start,
        string end,
        bool usesExplicitTimeRange,
        DateTime localNow,
        int? excludeRequestId = null,
        string? sourceAssignmentId = null)
    {
        if (usesExplicitTimeRange && startDate != endDate)
        {
            throw new InvalidOperationException("Les demandes horaires doivent etre saisies sur une seule journee.");
        }

        var existingRequests = await GetActiveRequestConflictsAsync(connection, userId, startDate, endDate, excludeRequestId);

        if (!usesExplicitTimeRange)
        {
            await EnsurePlanningExistsOnRangeAsync(connection, userId, startDate, endDate, normalizedType);
            ValidateAgainstExistingRequests(existingRequests, startDate, start, end, usesExplicitTimeRange);
            return new RequestValidationResult
            {
                SourceAssignmentId = sourceAssignmentId
            };
        }

        var requestStart = ParseTimeOrThrow(start, "Heure de debut invalide.");
        var requestEnd = ParseTimeOrThrow(end, "Heure de fin invalide.");
        var nowTime = new TimeSpan(localNow.Hour, localNow.Minute, 0);

        if (startDate == localNow.Date)
        {
            if (requestStart < nowTime)
            {
                throw new InvalidOperationException("L'heure de debut doit etre posterieure a l'heure actuelle.");
            }

            if (requestEnd <= nowTime)
            {
                throw new InvalidOperationException("L'heure de fin doit etre posterieure a l'heure actuelle.");
            }
        }

        var planningSlots = await GetPlanningSlotsForDateAsync(connection, userId, startDate);
        if (planningSlots.Count == 0)
        {
            if (normalizedType != "AS")
            {
                throw new InvalidOperationException(
                    "Sur un jour sans planning, seule une demande d'astreinte est autorisee.");
            }
        }

        if (normalizedType == "HS")
        {
            ValidateHsAgainstPlanning(planningSlots, requestStart, requestEnd);
        }
        else if (normalizedType == "AS")
        {
            EnsureNoPlanningOverlap(planningSlots, requestStart, requestEnd, "Le creneau demande chevauche deja votre planning.");
        }
        else if (normalizedType is "RC+" or "RC-" or "ABSENCE" or "AL")
        {
            var matchingSlot = FindExactPlanningSlot(planningSlots, requestStart, requestEnd, sourceAssignmentId);
            if (matchingSlot is null)
            {
                throw new InvalidOperationException(
                    "Cette demande doit correspondre exactement a un creneau planifie existant.");
            }

            sourceAssignmentId = matchingSlot.AssignmentId;
        }

        ValidateAgainstExistingRequests(existingRequests, startDate, start, end, usesExplicitTimeRange);
        return new RequestValidationResult
        {
            SourceAssignmentId = sourceAssignmentId
        };
    }

    private async Task EnsurePlanningExistsOnRangeAsync(
        MySqlConnection connection,
        int userId,
        DateTime startDate,
        DateTime endDate,
        string normalizedType)
    {
        for (var currentDate = startDate.Date; currentDate <= endDate.Date; currentDate = currentDate.AddDays(1))
        {
            var planningSlots = await GetPlanningSlotsForDateAsync(connection, userId, currentDate);
            if (planningSlots.Count == 0)
            {
                throw new InvalidOperationException(
                    normalizedType == "AS"
                        ? $"L'astreinte doit etre saisie avec des horaires explicites le {currentDate:dd/MM/yyyy}."
                        : $"Le {currentDate:dd/MM/yyyy}, vous n'avez pas de planning: seule une demande d'astreinte est autorisee.");
            }
        }
    }

    private static TimeSpan ParseTimeOrThrow(string value, string message)
    {
        if (!TimeSpan.TryParse(value, out var result))
        {
            throw new InvalidOperationException(message);
        }

        return result;
    }

    private static string NormalizeTimeText(string? value)
    {
        if (TimeSpan.TryParse(value, out var parsed))
        {
            return parsed.ToString(@"hh\:mm");
        }

        return "00:00";
    }

    private static void ValidateHsAgainstPlanning(IReadOnlyList<PlanningSlot> planningSlots, TimeSpan requestStart, TimeSpan requestEnd)
    {
        if (planningSlots.Count == 0)
        {
            return;
        }

        var latestPlanningEnd = planningSlots
            .Select(slot => ParseTimeOrThrow(slot.End, "Heure de fin de planning invalide."))
            .Max();

        if (requestStart < latestPlanningEnd)
        {
            throw new InvalidOperationException(
                $"La demande HS doit commencer apres la fin de votre planning ({latestPlanningEnd:hh\\:mm}).");
        }

        EnsureNoPlanningOverlap(
            planningSlots,
            requestStart,
            requestEnd,
            "Le creneau HS chevauche deja votre planning du jour.");
    }

    private static void EnsureNoPlanningOverlap(
        IReadOnlyList<PlanningSlot> planningSlots,
        TimeSpan requestStart,
        TimeSpan requestEnd,
        string errorMessage)
    {
        foreach (var slot in planningSlots)
        {
            var slotStart = ParseTimeOrThrow(slot.Start, "Heure de debut de planning invalide.");
            var slotEnd = ParseTimeOrThrow(slot.End, "Heure de fin de planning invalide.");
            if (TimeRangesOverlap(requestStart, requestEnd, slotStart, slotEnd))
            {
                throw new InvalidOperationException(errorMessage);
            }
        }
    }

    private static PlanningSlot? FindExactPlanningSlot(
        IReadOnlyList<PlanningSlot> planningSlots,
        TimeSpan requestStart,
        TimeSpan requestEnd,
        string? preferredAssignmentId)
    {
        if (!string.IsNullOrWhiteSpace(preferredAssignmentId))
        {
            var preferred = planningSlots.FirstOrDefault(slot =>
                string.Equals(slot.AssignmentId, preferredAssignmentId, StringComparison.OrdinalIgnoreCase));
            if (preferred is not null)
            {
                return preferred;
            }
        }

        return planningSlots.FirstOrDefault(slot =>
            ParseTimeOrThrow(slot.Start, "Heure de debut de planning invalide.") == requestStart &&
            ParseTimeOrThrow(slot.End, "Heure de fin de planning invalide.") == requestEnd);
    }

    private static void ValidateAgainstExistingRequests(
        IReadOnlyList<ExistingRequestConflict> existingRequests,
        DateTime requestedDate,
        string start,
        string end,
        bool usesExplicitTimeRange)
    {
        if (existingRequests.Count == 0)
        {
            return;
        }

        if (!usesExplicitTimeRange)
        {
            throw new InvalidOperationException("Une autre demande active existe deja sur cette periode.");
        }

        var requestStart = ParseTimeOrThrow(start, "Heure de debut invalide.");
        var requestEnd = ParseTimeOrThrow(end, "Heure de fin invalide.");

        foreach (var existing in existingRequests)
        {
            if (existing.Date.Date != requestedDate.Date)
            {
                throw new InvalidOperationException("Une autre demande active existe deja sur cette periode.");
            }

            var existingUsesTimeRange = HasMeaningfulTimeRange(existing.Start, existing.End);
            if (!existingUsesTimeRange)
            {
                throw new InvalidOperationException("Une autre demande active couvre deja cette journee.");
            }

            var existingStart = ParseTimeOrThrow(existing.Start, "Heure de debut de demande invalide.");
            var existingEnd = ParseTimeOrThrow(existing.End, "Heure de fin de demande invalide.");
            if (TimeRangesOverlap(requestStart, requestEnd, existingStart, existingEnd))
            {
                throw new InvalidOperationException(
                    $"Le creneau demande chevauche deja une demande active ({NormalizeRequestType(existing.Type)}).");
            }
        }
    }

    private static bool TimeRangesOverlap(TimeSpan leftStart, TimeSpan leftEnd, TimeSpan rightStart, TimeSpan rightEnd)
    {
        return leftStart < rightEnd && leftEnd > rightStart;
    }

    private async Task<IReadOnlyList<PlanningSlot>> GetPlanningSlotsForDateAsync(MySqlConnection connection, int userId, DateTime date)
    {
        var identities = await ResolvePersonnelIdentifiersAsync(connection, userId);
        if (identities.Count == 0)
        {
            return Array.Empty<PlanningSlot>();
        }

        var conditions = new List<string>();
        await using var cmd = new MySqlCommand(string.Empty, connection);
        for (var i = 0; i < identities.Count; i++)
        {
            var key = $"@identity{i}";
            conditions.Add($"LOWER(REPLACE(TRIM(a.personnel_id), ' ', '')) = {key}");
            cmd.Parameters.AddWithValue(key, identities[i]);
        }

        cmd.CommandText = $@"
SELECT a.assignment_id, a.start_time, a.end_time
FROM planning_assignments a
INNER JOIN planning_weeks w ON w.id = a.planning_week_id
WHERE DATE_ADD(w.week_start, INTERVAL a.day_index DAY) = @targetDate
  AND ({string.Join(" OR ", conditions)})
ORDER BY a.start_time ASC, a.end_time ASC;";
        cmd.Parameters.AddWithValue("@targetDate", date.Date);

        var result = new List<PlanningSlot>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var slotStart = NormalizeTimeText(reader["start_time"]?.ToString());
            var slotEnd = NormalizeTimeText(reader["end_time"]?.ToString());
            if (slotStart == "00:00" && slotEnd == "00:00")
            {
                continue;
            }

            result.Add(new PlanningSlot
            {
                AssignmentId = reader["assignment_id"]?.ToString() ?? string.Empty,
                Start = slotStart,
                End = slotEnd
            });
        }

        return result;
    }

    private async Task<List<string>> ResolvePersonnelIdentifiersAsync(MySqlConnection connection, int userId)
    {
        const string sql = @"
SELECT id, email, matricule, nom, prenom
FROM staff_users
WHERE id = @id
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new List<string> { userId.ToString() };
        }

        var identifiers = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            userId.ToString().Trim().ToLowerInvariant()
        };

        void Add(string? raw)
        {
            var normalized = raw?.Trim();
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                identifiers.Add(normalized.Replace(" ", string.Empty, StringComparison.Ordinal).ToLowerInvariant());
            }
        }

        Add(reader["email"]?.ToString());
        Add(reader["matricule"]?.ToString());

        var nom = reader["nom"]?.ToString()?.Trim();
        var prenom = reader["prenom"]?.ToString()?.Trim();
        if (!string.IsNullOrWhiteSpace(prenom) && !string.IsNullOrWhiteSpace(nom))
        {
            Add($"{prenom} {nom}");
            Add($"{nom} {prenom}");
        }

        return identifiers.ToList();
    }

    private async Task<IReadOnlyList<ExistingRequestConflict>> GetActiveRequestConflictsAsync(
        MySqlConnection connection,
        int userId,
        DateTime startDate,
        DateTime endDate,
        int? excludeRequestId)
    {
        const string sql = @"
SELECT id, type_demande, date_evenement, date_fin_evenement, heure_debut, heure_fin
FROM demandes_utilisateur
WHERE user_id = @userId
  AND statut IN ('EN_ATTENTE', 'APPROUVEE', 'INFORMATIF')
  AND (@excludeRequestId IS NULL OR id <> @excludeRequestId)
  AND date_evenement <= @endDate
  AND COALESCE(date_fin_evenement, date_evenement) >= @startDate
ORDER BY date_evenement ASC, created_at ASC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@excludeRequestId", excludeRequestId.HasValue ? excludeRequestId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@startDate", startDate.Date);
        cmd.Parameters.AddWithValue("@endDate", endDate.Date);

        var result = new List<ExistingRequestConflict>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var currentStartDate = Convert.ToDateTime(reader["date_evenement"]).Date;
            result.Add(new ExistingRequestConflict
            {
                Id = Convert.ToInt32(reader["id"]),
                Type = reader["type_demande"]?.ToString() ?? string.Empty,
                Date = currentStartDate,
                EndDate = reader["date_fin_evenement"] is DBNull
                    ? currentStartDate
                    : Convert.ToDateTime(reader["date_fin_evenement"]).Date,
                Start = NormalizeTimeText(reader["heure_debut"]?.ToString()),
                End = NormalizeTimeText(reader["heure_fin"]?.ToString())
            });
        }

        return result;
    }

    private static DateTime ToMonday(DateTime date)
    {
        var day = date.Date;
        var offset = day.DayOfWeek switch
        {
            DayOfWeek.Sunday => -6,
            _ => 1 - (int)day.DayOfWeek
        };
        return day.AddDays(offset).Date;
    }

    private async Task<UserPlanningRequestItem?> GetRequestByIdAsync(MySqlConnection connection, int id, MySqlTransaction? tx = null)
    {
        const string sql = @"
SELECT d.id, d.user_id, d.service_id, d.date_evenement, d.date_fin_evenement, d.type_demande, d.heure_debut, d.heure_fin,
    d.duree_minutes, d.commentaire, d.statut, d.valide_par,
    TRIM(CONCAT(COALESCE(vp.prenom, ''), ' ', COALESCE(vp.nom, ''))) AS valide_par_nom,
    d.date_validation, d.motif_rejet, d.traite_par, d.traite_le,
    d.created_at, d.updated_at, d.source_assignment_id
FROM demandes_utilisateur d
LEFT JOIN staff_users vp ON vp.id = d.valide_par
WHERE d.id = @id
LIMIT 1;";

        await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
        cmd.Parameters.AddWithValue("@id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return MapRequest(reader);
    }

    private async Task EnsureUserCounterRowAsync(MySqlConnection connection, int userId, MySqlTransaction? tx = null)
    {
        const string sql = @"
INSERT INTO compteurs_utilisateur (user_id, solde_rc_plus, solde_rc_moins, updated_at)
VALUES (@userId, 0, 0, @updatedAt)
ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at);";

        await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task ApplyApprovedRequestToPlanningAsync(MySqlConnection connection, MySqlTransaction tx, UserPlanningRequestItem request, string serviceName, DateTime now)
    {
        var normalizedType = NormalizeRequestType(request.Type);
        var startDate = request.Date.Date;
        var endDate = (request.DateFin ?? request.Date).Date;

        if (endDate < startDate)
        {
            endDate = startDate;
        }

        for (var currentDate = startDate; currentDate <= endDate; currentDate = currentDate.AddDays(1))
        {
            var weekStart = ToMonday(currentDate);
            var weekEnd = weekStart.AddDays(6);
            var weekId = await EnsureWeekAsync(connection, request.ServiceId.ToString(), serviceName, weekStart, weekEnd, tx);
            var dayIndex = (int)(currentDate.Date - weekStart.Date).TotalDays;

            await ApplyApprovedRequestForDateAsync(connection, tx, weekId, request, dayIndex, now, normalizedType, currentDate);
        }
    }

    private async Task ApplyApprovedRequestForDateAsync(MySqlConnection connection, MySqlTransaction tx, string weekId, UserPlanningRequestItem request, int dayIndex, DateTime now, string normalizedType, DateTime currentDate)
    {

        if (normalizedType == "ARRET" || normalizedType == "AT")
        {
            const string deleteDayAssignmentsSql = @"
DELETE FROM planning_assignments
WHERE planning_week_id = @weekId
  AND personnel_id = @personnelId
  AND day_index = @dayIndex;";
            await using (var deleteCmd = new MySqlCommand(deleteDayAssignmentsSql, connection, tx))
            {
                deleteCmd.Parameters.AddWithValue("@weekId", weekId);
                deleteCmd.Parameters.AddWithValue("@personnelId", request.UserId.ToString());
                deleteCmd.Parameters.AddWithValue("@dayIndex", dayIndex);
                await deleteCmd.ExecuteNonQueryAsync();
            }

            var stopLabel = normalizedType == "AT" ? "AT" : "ARRET";
            await InsertPlanningAssignmentForRequestAsync(connection, tx, weekId, request, dayIndex, now, "arret", stopLabel);
            return;
        }

        if (!string.IsNullOrWhiteSpace(request.SourceAssignmentId) &&
            (normalizedType == "RC+" || normalizedType == "RC-" || normalizedType == "ABSENCE" || normalizedType == "AL"))
        {
            const string deleteSourceSql = @"
DELETE FROM planning_assignments
WHERE planning_week_id = @weekId
  AND assignment_id = @assignmentId;";
            await using var deleteSourceCmd = new MySqlCommand(deleteSourceSql, connection, tx);
            deleteSourceCmd.Parameters.AddWithValue("@weekId", weekId);
            deleteSourceCmd.Parameters.AddWithValue("@assignmentId", request.SourceAssignmentId);
            await deleteSourceCmd.ExecuteNonQueryAsync();
        }

        if (request.HeureDebut == "00:00" && request.HeureFin == "00:00" &&
            (normalizedType == "VA" || normalizedType == "JR" || normalizedType == "ABSENCE" ||
             normalizedType == "AL" || normalizedType == "RC+" || normalizedType == "RC-"))
        {
            const string deleteDayAssignmentsSql = @"
DELETE FROM planning_assignments
WHERE planning_week_id = @weekId
  AND personnel_id = @personnelId
  AND day_index = @dayIndex;";
            await using var deleteDayCmd = new MySqlCommand(deleteDayAssignmentsSql, connection, tx);
            deleteDayCmd.Parameters.AddWithValue("@weekId", weekId);
            deleteDayCmd.Parameters.AddWithValue("@personnelId", request.UserId.ToString());
            deleteDayCmd.Parameters.AddWithValue("@dayIndex", dayIndex);
            await deleteDayCmd.ExecuteNonQueryAsync();
        }

        var shiftType = normalizedType switch
        {
            "HS" => "hs",
            "RC+" => "rc_plus",
            "RC-" => "rc_moins",
            "ABSENCE" => "absence",
            "VA" => "conges",
            "AS" => "astreinte",
            "AL" => "absence",
            "JR" => "repos",
            _ => "jour"
        };

        var posteLabel = normalizedType switch
        {
            "HS" => "HS",
            "RC+" => "RC+",
            "RC-" => "RC-",
            "ABSENCE" => "Absence",
            "VA" => "VA",
            "AS" => "AS",
            "AL" => "AL",
            "JR" => "JR",
            _ => "Événement"
        };

        await InsertPlanningAssignmentForRequestAsync(connection, tx, weekId, request, dayIndex, now, shiftType, posteLabel);
    }

    private static async Task InsertPlanningAssignmentForRequestAsync(
        MySqlConnection connection,
        MySqlTransaction tx,
        string weekId,
        UserPlanningRequestItem request,
        int dayIndex,
        DateTime now,
        string shiftType,
        string posteLabel)
    {
        const string insertSql = @"
INSERT INTO planning_assignments
    (planning_week_id, assignment_id, personnel_id, day_index, shift_type, poste_label, start_time, end_time, note, created_at, updated_at)
VALUES
    (@planningWeekId, @assignmentId, @personnelId, @dayIndex, @shiftType, @posteLabel, @startTime, @endTime, @note, @createdAt, @updatedAt);";

        await using var cmd = new MySqlCommand(insertSql, connection, tx);
        cmd.Parameters.AddWithValue("@planningWeekId", weekId);
        cmd.Parameters.AddWithValue("@assignmentId", $"req-{request.Id}-{Guid.NewGuid():N}"[..24]);
        cmd.Parameters.AddWithValue("@personnelId", request.UserId.ToString());
        cmd.Parameters.AddWithValue("@dayIndex", dayIndex);
        cmd.Parameters.AddWithValue("@shiftType", shiftType);
        cmd.Parameters.AddWithValue("@posteLabel", posteLabel);
        cmd.Parameters.AddWithValue("@startTime", request.HeureDebut);
        cmd.Parameters.AddWithValue("@endTime", request.HeureFin);
        cmd.Parameters.AddWithValue("@note", (object?)request.Commentaire ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt", now);
        cmd.Parameters.AddWithValue("@updatedAt", now);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task RollbackApprovedRequestImpactAsync(MySqlConnection connection, MySqlTransaction tx, UserPlanningRequestItem request)
    {
        await RemoveRequestAssignmentsAsync(connection, tx, request);
        await RollbackCountersOnCancellationAsync(connection, tx, request);
    }

    private static async Task RemoveRequestAssignmentsAsync(MySqlConnection connection, MySqlTransaction tx, UserPlanningRequestItem request)
    {
        const string sql = @"
DELETE FROM planning_assignments
WHERE personnel_id = @personnelId
  AND assignment_id LIKE @assignmentPrefix;";

        await using var cmd = new MySqlCommand(sql, connection, tx);
        cmd.Parameters.AddWithValue("@personnelId", request.UserId.ToString());
        cmd.Parameters.AddWithValue("@assignmentPrefix", $"req-{request.Id}-%");
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task RollbackCountersOnCancellationAsync(MySqlConnection connection, MySqlTransaction tx, UserPlanningRequestItem request)
    {
        var normalizedType = NormalizeRequestType(request.Type);
        var hours = request.DureeHeures;

        const string lockSql = @"
SELECT solde_rc_plus, solde_rc_moins
FROM compteurs_utilisateur
WHERE user_id = @userId
FOR UPDATE;";

        decimal currentPlus;
        decimal currentMinus;
        await using (var lockCmd = new MySqlCommand(lockSql, connection, tx))
        {
            lockCmd.Parameters.AddWithValue("@userId", request.UserId);
            await using var reader = await lockCmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return;
            }

            currentPlus = reader.GetDecimal("solde_rc_plus");
            currentMinus = reader.GetDecimal("solde_rc_moins");
        }

        decimal nextPlus = currentPlus;
        decimal nextMinus = currentMinus;

        switch (normalizedType)
        {
            case "HS":
                nextPlus = Math.Max(0, currentPlus - hours);
                break;
            case "RC+":
                nextPlus = currentPlus + hours;
                break;
            case "RC-":
            case "ABSENCE":
                nextMinus = Math.Max(0, currentMinus - hours);
                break;
        }

        const string updateSql = @"
UPDATE compteurs_utilisateur
SET solde_rc_plus = @soldePlus,
    solde_rc_moins = @soldeMoins,
    updated_at = @updatedAt
WHERE user_id = @userId;";

        await using var updateCmd = new MySqlCommand(updateSql, connection, tx);
        updateCmd.Parameters.AddWithValue("@soldePlus", nextPlus);
        updateCmd.Parameters.AddWithValue("@soldeMoins", nextMinus);
        updateCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        updateCmd.Parameters.AddWithValue("@userId", request.UserId);
        await updateCmd.ExecuteNonQueryAsync();
    }

    private static async Task ApplyCountersOnApprovalAsync(MySqlConnection connection, MySqlTransaction tx, UserPlanningRequestItem request)
    {
        var normalizedType = NormalizeRequestType(request.Type);
        var hours = request.DureeHeures;

        const string lockSql = @"
SELECT solde_rc_plus, solde_rc_moins
FROM compteurs_utilisateur
WHERE user_id = @userId
FOR UPDATE;";

        decimal currentPlus;
        decimal currentMinus;
        await using (var lockCmd = new MySqlCommand(lockSql, connection, tx))
        {
            lockCmd.Parameters.AddWithValue("@userId", request.UserId);
            await using var reader = await lockCmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                throw new InvalidOperationException("Compteur utilisateur introuvable.");
            }
            currentPlus = reader.GetDecimal("solde_rc_plus");
            currentMinus = reader.GetDecimal("solde_rc_moins");
        }

        decimal nextPlus = currentPlus;
        decimal nextMinus = currentMinus;

        switch (normalizedType)
        {
            case "HS":
                nextPlus += hours;
                break;
            case "RC+":
                if (currentPlus < hours)
                {
                    throw new InvalidOperationException($"Solde RC+ insuffisant ({currentPlus:0.##}h disponibles, {hours:0.##}h demandées).");
                }
                nextPlus -= hours;
                break;
            case "RC-":
            case "ABSENCE":
                nextMinus += hours;
                break;
            case "ARRET":
            case "AT":
            case "VA":
            case "AS":
            case "AL":
            case "JR":
                break;
        }

        const string updateSql = @"
UPDATE compteurs_utilisateur
SET solde_rc_plus = @soldePlus,
    solde_rc_moins = @soldeMoins,
    updated_at = @updatedAt
WHERE user_id = @userId;";

        await using var updateCmd = new MySqlCommand(updateSql, connection, tx);
        updateCmd.Parameters.AddWithValue("@soldePlus", nextPlus);
        updateCmd.Parameters.AddWithValue("@soldeMoins", nextMinus);
        updateCmd.Parameters.AddWithValue("@updatedAt", DateTime.UtcNow);
        updateCmd.Parameters.AddWithValue("@userId", request.UserId);
        await updateCmd.ExecuteNonQueryAsync();
    }

    private static async Task<string?> ResolveServiceNameByIdAsync(MySqlConnection connection, int serviceId, MySqlTransaction? tx = null)
    {
        const string sql = "SELECT nom FROM services WHERE id = @id LIMIT 1;";
        await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
        cmd.Parameters.AddWithValue("@id", serviceId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null || result is DBNull ? null : result.ToString();
    }

    private static async Task<int?> ResolveResponsibleValidatorIdAsync(MySqlConnection connection, int serviceId, DateTime date)
    {
        // Priority 1: workflow step N1 (ordre=1) validator for this service.
        var workflowValidator = await ResolveWorkflowStepOneValidatorIdAsync(connection, serviceId);
        if (workflowValidator.HasValue)
        {
            return workflowValidator;
        }

        var monday = ToMonday(date);

        const string planningSql = @"
SELECT submitted_by
FROM planning_weeks
WHERE service_id = @serviceId
  AND week_start = @weekStart
LIMIT 1;";

        await using (var planningCmd = new MySqlCommand(planningSql, connection))
        {
            planningCmd.Parameters.AddWithValue("@serviceId", serviceId.ToString());
            planningCmd.Parameters.AddWithValue("@weekStart", monday.Date);
            var planningOwner = await planningCmd.ExecuteScalarAsync();
            if (planningOwner is not null && planningOwner is not DBNull && int.TryParse(planningOwner.ToString(), out var planningOwnerId))
            {
                return planningOwnerId;
            }
        }

        const string serviceSql = @"
SELECT chef_service_id
FROM services
WHERE id = @serviceId
LIMIT 1;";

        await using var serviceCmd = new MySqlCommand(serviceSql, connection);
        serviceCmd.Parameters.AddWithValue("@serviceId", serviceId);
        var serviceOwner = await serviceCmd.ExecuteScalarAsync();
        if (serviceOwner is null || serviceOwner is DBNull)
        {
            return null;
        }

        return Convert.ToInt32(serviceOwner);
    }

    private static async Task<int?> ResolveWorkflowStepOneValidatorIdAsync(MySqlConnection connection, int serviceId)
    {
        const string sql = @"
SELECT e.validateur_specifique_id, e.role
FROM workflow_configs c
INNER JOIN workflow_etapes e ON e.workflow_config_id = c.id
WHERE c.service_id = @serviceId
  AND e.ordre = 1
ORDER BY c.actif DESC, c.id DESC
LIMIT 1;";

        string? role = null;
        await using (var cmd = new MySqlCommand(sql, connection))
        {
            cmd.Parameters.AddWithValue("@serviceId", serviceId);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return null;
            }

            if (!IsNull(reader, "validateur_specifique_id"))
            {
                return reader.GetInt32("validateur_specifique_id");
            }

            role = IsNull(reader, "role") ? null : reader.GetString("role");
        }

        if (string.IsNullOrWhiteSpace(role))
        {
            return null;
        }

        return await ResolveValidatorByRoleForServiceAsync(connection, serviceId, role);
    }

    private static async Task<int?> ResolveValidatorByRoleForServiceAsync(MySqlConnection connection, int serviceId, string role)
    {
        int? poleId = null;
        await using (var poleCmd = new MySqlCommand("SELECT pole_id FROM services WHERE id = @serviceId LIMIT 1;", connection))
        {
            poleCmd.Parameters.AddWithValue("@serviceId", serviceId);
            var poleResult = await poleCmd.ExecuteScalarAsync();
            if (poleResult != null && poleResult != DBNull.Value)
            {
                poleId = Convert.ToInt32(poleResult);
            }
        }

        var roleVariants = BuildRoleVariants(role);
        var placeholders = string.Join(",", roleVariants.Select((_, i) => $"@r{i}"));

        async Task<int?> ExecuteSingleAsync(string sql, Action<MySqlCommand> bind)
        {
            await using var cmd = new MySqlCommand(sql, connection);
            for (var i = 0; i < roleVariants.Count; i++)
            {
                cmd.Parameters.AddWithValue($"@r{i}", roleVariants[i]);
            }

            bind(cmd);
            var result = await cmd.ExecuteScalarAsync();
            return result is null || result is DBNull ? null : Convert.ToInt32(result);
        }

        if (IsChefServiceRole(role))
        {
            var byService = await ExecuteSingleAsync(
                $"SELECT id FROM staff_users WHERE role IN ({placeholders}) AND service_id = @serviceId AND actif = 1 ORDER BY id ASC LIMIT 1;",
                cmd => cmd.Parameters.AddWithValue("@serviceId", serviceId));
            if (byService.HasValue) return byService;
        }

        if (IsChefPoleRole(role) && poleId.HasValue)
        {
            var byPole = await ExecuteSingleAsync(
                $"SELECT id FROM staff_users WHERE role IN ({placeholders}) AND pole_id = @poleId AND actif = 1 ORDER BY id ASC LIMIT 1;",
                cmd => cmd.Parameters.AddWithValue("@poleId", poleId.Value));
            if (byPole.HasValue) return byPole;
        }

        var byServiceGeneric = await ExecuteSingleAsync(
            $"SELECT id FROM staff_users WHERE role IN ({placeholders}) AND service_id = @serviceId AND actif = 1 ORDER BY id ASC LIMIT 1;",
            cmd => cmd.Parameters.AddWithValue("@serviceId", serviceId));
        if (byServiceGeneric.HasValue) return byServiceGeneric;

        if (poleId.HasValue)
        {
            var byPoleGeneric = await ExecuteSingleAsync(
                $"SELECT id FROM staff_users WHERE role IN ({placeholders}) AND pole_id = @poleId AND actif = 1 ORDER BY id ASC LIMIT 1;",
                cmd => cmd.Parameters.AddWithValue("@poleId", poleId.Value));
            if (byPoleGeneric.HasValue) return byPoleGeneric;
        }

        return await ExecuteSingleAsync(
            $"SELECT id FROM staff_users WHERE role IN ({placeholders}) AND actif = 1 ORDER BY id ASC LIMIT 1;",
            _ => { });
    }

    private static async Task<int?> ResolvePlanningWeekIdAsync(MySqlConnection connection, int serviceId, DateTime date)
    {
        var monday = ToMonday(date);

        const string sql = @"
SELECT id
FROM planning_weeks
WHERE service_id = @serviceId
  AND week_start = @weekStart
LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", serviceId.ToString());
        cmd.Parameters.AddWithValue("@weekStart", monday.Date);
        var result = await cmd.ExecuteScalarAsync();
        if (result is null || result is DBNull)
        {
            return null;
        }

        return Convert.ToInt32(result);
    }

    private static async Task AddDemandeHistoryAsync(
        MySqlConnection connection,
        int demandeId,
        string action,
        int? acteurId,
        string? acteurNom,
        string? commentaire,
        MySqlTransaction? tx = null)
    {
        const string sql = @"
INSERT INTO demande_historique (demande_id, action, acteur_id, acteur_nom, commentaire, created_at)
VALUES (@demandeId, @action, @acteurId, @acteurNom, @commentaire, @createdAt);";

        await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
        cmd.Parameters.AddWithValue("@demandeId", demandeId);
        cmd.Parameters.AddWithValue("@action", action);
        cmd.Parameters.AddWithValue("@acteurId", (object?)acteurId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@acteurNom", (object?)acteurNom ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@commentaire", (object?)commentaire ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task InsertDemandeNotificationAsync(
        MySqlConnection connection,
        int validatorId,
        int demandeurId,
        int demandeId,
        int? planningWeekId,
        int serviceId,
        DateTime dateEvenement,
        string typeDemande,
        string? commentaire)
    {
        var safeComment = string.IsNullOrWhiteSpace(commentaire)
            ? string.Empty
            : $" Commentaire: {commentaire.Trim()}";

        const string sql = @"
INSERT INTO notifications (user_id, type, titre, message, planning_id, planning_week_id, emetteur_id, lien, date_creation)
VALUES (@userId, @type, @titre, @message, @planningId, @planningWeekId, @emetteurId, @lien, @createdAt);";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", validatorId);
        cmd.Parameters.AddWithValue("@type", "DEMANDE_A_VALIDER");
        cmd.Parameters.AddWithValue("@titre", "Nouvelle demande en attente");
        cmd.Parameters.AddWithValue("@message", $"Demande #{demandeId} ({typeDemande}) soumise par utilisateur #{demandeurId} pour le service #{serviceId} le {dateEvenement:dd/MM/yyyy}.{safeComment}");
        cmd.Parameters.AddWithValue("@planningId", (object?)planningWeekId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@planningWeekId", (object?)planningWeekId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@emetteurId", demandeurId);
        cmd.Parameters.AddWithValue("@lien", "/pages/demandes-attente");
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task InsertDemandeDecisionNotificationAsync(
        MySqlConnection connection,
        int demandeurId,
        int validatorId,
        string validatorLabel,
        int demandeId,
        int? planningWeekId,
        bool approved,
        string? motif,
        MySqlTransaction? tx)
    {
        var type = approved ? "WORKFLOW_VALIDE" : "WORKFLOW_REJETE";
        var titre = approved ? "Votre demande a été validée" : "Votre demande a été rejetée";
        var decisionMessage = approved
            ? $"Votre demande #{demandeId} a été validée par {validatorLabel}."
            : $"Votre demande #{demandeId} a été rejetée par {validatorLabel}.";

        if (!approved && !string.IsNullOrWhiteSpace(motif))
        {
            decisionMessage += $" Motif: {motif.Trim()}";
        }

        const string sql = @"
INSERT INTO notifications (user_id, type, titre, message, planning_id, planning_week_id, emetteur_id, lien, date_creation)
VALUES (@userId, @type, @titre, @message, @planningId, @planningWeekId, @emetteurId, @lien, @createdAt);";

        await using var cmd = tx is null ? new MySqlCommand(sql, connection) : new MySqlCommand(sql, connection, tx);
        cmd.Parameters.AddWithValue("@userId", demandeurId);
        cmd.Parameters.AddWithValue("@type", type);
        cmd.Parameters.AddWithValue("@titre", titre);
        cmd.Parameters.AddWithValue("@message", decisionMessage);
        cmd.Parameters.AddWithValue("@planningId", (object?)planningWeekId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@planningWeekId", (object?)planningWeekId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@emetteurId", validatorId);
        cmd.Parameters.AddWithValue("@lien", "/pages/mon-espace");
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task InsertDemandeInfoNotificationAsync(
        MySqlConnection connection,
        int demandeurId,
        int demandeId,
        int? planningWeekId,
        int serviceId,
        DateTime dateEvenement,
        string? commentaire)
    {
        var safeComment = string.IsNullOrWhiteSpace(commentaire)
            ? string.Empty
            : $" Commentaire: {commentaire.Trim()}";

        const string sql = @"
INSERT INTO notifications (user_id, type, titre, message, planning_id, planning_week_id, emetteur_id, lien, date_creation)
VALUES (@userId, @type, @titre, @message, @planningId, @planningWeekId, @emetteurId, @lien, @createdAt);";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", demandeurId);
        cmd.Parameters.AddWithValue("@type", "ARRET_INFO");
        cmd.Parameters.AddWithValue("@titre", "Arrêt de travail enregistré");
        cmd.Parameters.AddWithValue("@message", $"Votre arrêt de travail #{demandeId} a été enregistré pour le {dateEvenement:dd/MM/yyyy} dans le service #{serviceId}.{safeComment}");
        cmd.Parameters.AddWithValue("@planningId", (object?)planningWeekId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@planningWeekId", (object?)planningWeekId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@emetteurId", demandeurId);
        cmd.Parameters.AddWithValue("@lien", "/pages/mon-espace");
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }
}
