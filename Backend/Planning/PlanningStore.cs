using MySqlConnector;
using Backend.Email;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    private readonly string _connectionString;
    private readonly IEmailService _emailService;

    public PlanningStore(IConfiguration configuration, IEmailService emailService)
    {
        _connectionString = configuration.GetConnectionString("ClinisysDb")
            ?? throw new InvalidOperationException("Connection string 'ClinisysDb' is missing.");
        _emailService = emailService;
    }

    // ─── helpers notifications ────────────────────────────────────────────────

    /// <summary>
    /// Envoie un e-mail de modification de planning à l'agent si ses préférences
    /// NotifEmail ET NotifModifications sont activées.
    /// </summary>
    private async Task NotifyPlanningModifiedAsync(
        MySqlConnection connection,
        string personnelId,
        string serviceName,
        string weekLabel,
        MySqlTransaction? tx = null)
    {
        if (!int.TryParse(personnelId, out var uid)) return;

        const string sql = @"
SELECT nom, prenom, email, notif_email, notif_modifications
FROM staff_users WHERE id = @id LIMIT 1;";

        await using var cmd = tx is null
            ? new MySqlCommand(sql, connection)
            : new MySqlCommand(sql, connection, tx);

        cmd.Parameters.AddWithValue("@id", uid);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return;

        var notifEmail = reader.GetBoolean("notif_email");
        var notifModif = reader.GetBoolean("notif_modifications");

        if (!notifEmail || !notifModif) return;

        var nom    = reader.IsDBNull(reader.GetOrdinal("nom"))    ? "" : reader.GetString("nom");
        var prenom = reader.IsDBNull(reader.GetOrdinal("prenom")) ? "" : reader.GetString("prenom");
        var email  = reader.IsDBNull(reader.GetOrdinal("email"))  ? "" : reader.GetString("email");
        await reader.CloseAsync();

        if (string.IsNullOrWhiteSpace(email)) return;

        var fullName = $"{prenom} {nom}".Trim();
        var lien     = $"/pages/planning";
        var html     = EmailTemplates.PlanningModifie(fullName, serviceName, weekLabel, lien);

        _ = _emailService.SendAsync(email, fullName, "Votre planning a été modifié", html);
    }

    // ─── fin helpers notifications ────────────────────────────────────────────

    /// <summary>Charge le nom/prénom des agents à partir de leurs IDs (staff_users).</summary>
    public async Task<IReadOnlyList<PersonnelInfo>> GetPersonnelByIdsAsync(IEnumerable<string> ids)
    {
        var idList = ids.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToList();
        if (idList.Count == 0) return [];

        // Build IN clause safely using positional parameters
        var paramNames = idList.Select((_, i) => $"@id{i}").ToList();
        var sql = $"SELECT id, nom, prenom, NULLIF(TRIM(photo), '') AS photo FROM staff_users WHERE id IN ({string.Join(',', paramNames)}) ORDER BY nom, prenom;";

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var cmd = new MySqlCommand(sql, connection);
        for (int i = 0; i < idList.Count; i++)
            cmd.Parameters.AddWithValue(paramNames[i], idList[i]);

        await using var reader = await cmd.ExecuteReaderAsync();
        var result = new List<PersonnelInfo>();
        while (await reader.ReadAsync())
        {
            result.Add(new PersonnelInfo
            {
                Id     = reader["id"]?.ToString() ?? string.Empty,
                Nom    = reader.IsDBNull(reader.GetOrdinal("nom"))    ? string.Empty : reader.GetString("nom"),
                Prenom = reader.IsDBNull(reader.GetOrdinal("prenom")) ? string.Empty : reader.GetString("prenom"),
                Photo  = reader.IsDBNull(reader.GetOrdinal("photo"))  ? null : reader.GetString("photo")
            });
        }
        return result;
    }

    public async Task InitializeAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string ddl = @"
CREATE TABLE IF NOT EXISTS planning_weeks (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    service_id VARCHAR(120) NOT NULL,
    service_name VARCHAR(150) NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    workflow_status VARCHAR(50) NULL DEFAULT NULL,
    workflow_id INT NULL DEFAULT NULL,
    can_submit TINYINT(1) NOT NULL DEFAULT 1,
    submitted_by VARCHAR(120) NULL DEFAULT NULL,
    submitted_at DATETIME NULL DEFAULT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_planning_week (service_id, week_start)
);

CREATE TABLE IF NOT EXISTS planning_versions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id VARCHAR(80) NOT NULL,
    service_id VARCHAR(120) NOT NULL,
    service_name VARCHAR(150) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    version_label VARCHAR(24) NOT NULL,
    author_name VARCHAR(120) NOT NULL,
    assignments_count INT NOT NULL,
    version_comment VARCHAR(300) NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uk_planning_version (version_id),
    INDEX ix_planning_versions_service_period (service_id, period_start)
);

CREATE TABLE IF NOT EXISTS planning_assignments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    planning_week_id INT NOT NULL,
    assignment_id VARCHAR(150) NOT NULL,
    personnel_id VARCHAR(120) NOT NULL,
    day_index INT NOT NULL,
    shift_type VARCHAR(40) NOT NULL,
    poste_id VARCHAR(120) NULL,
    poste_label VARCHAR(200) NULL,
    start_time VARCHAR(10) NULL,
    end_time VARCHAR(10) NULL,
    note TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_week_assignment (planning_week_id, assignment_id),
    CONSTRAINT fk_planning_assignments_week FOREIGN KEY (planning_week_id) REFERENCES planning_weeks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS planning (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    planning_id VARCHAR(180) NOT NULL,
    planning_week_id INT NOT NULL,
    service_id VARCHAR(120) NOT NULL,
    service_name VARCHAR(150) NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    assignment_id VARCHAR(150) NULL,
    personnel_id VARCHAR(120) NULL,
    day_index INT NULL,
    shift_type VARCHAR(40) NULL,
    poste_id VARCHAR(120) NULL,
    poste_label VARCHAR(200) NULL,
    start_time VARCHAR(10) NULL,
    end_time VARCHAR(10) NULL,
    note TEXT NULL,
    created_at DATETIME NULL,
    updated_at DATETIME NULL,
    INDEX ix_planning_service_week (service_id, week_start),
    INDEX ix_planning_week_id (planning_week_id)
);

CREATE TABLE IF NOT EXISTS demandes_utilisateur (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    planning_id INT NULL,
    service_id INT NOT NULL,
    date_evenement DATE NOT NULL,
    date_fin_evenement DATE NULL DEFAULT NULL,
    type_demande VARCHAR(20) NOT NULL,
    heure_debut VARCHAR(5) NOT NULL,
    heure_fin VARCHAR(5) NOT NULL,
    duree_minutes INT NOT NULL,
    commentaire TEXT NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE',
    valide_par INT NULL,
    date_validation DATETIME NULL,
    motif_rejet TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    traite_par INT NULL,
    traite_le DATETIME NULL,
    source_assignment_id VARCHAR(150) NULL,
    INDEX ix_demandes_user_date (user_id, date_evenement),
    INDEX ix_demandes_service_statut (service_id, statut),
    INDEX ix_demandes_statut_created (statut, created_at)
);

CREATE TABLE IF NOT EXISTS compteurs_utilisateur (
    user_id INT NOT NULL PRIMARY KEY,
    solde_rc_plus DECIMAL(10,2) NOT NULL DEFAULT 0,
    solde_rc_moins DECIMAL(10,2) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS absence_types (
    code VARCHAR(20) NOT NULL PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    description VARCHAR(400) NOT NULL,
    color VARCHAR(20) NOT NULL,
    impact VARCHAR(20) NOT NULL,
    is_requestable TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS demande_historique (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    demande_id INT NOT NULL,
    action VARCHAR(30) NOT NULL,
    acteur_id INT NULL,
    acteur_nom VARCHAR(200) NULL,
    commentaire TEXT NULL,
    created_at DATETIME NOT NULL,
    INDEX ix_demande_historique_demande (demande_id, created_at),
    CONSTRAINT fk_demande_historique_demande FOREIGN KEY (demande_id) REFERENCES demandes_utilisateur(id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW planning_overview AS
SELECT
    CONCAT(w.service_id, '-', DATE_FORMAT(w.week_start, '%Y%m%d')) AS planning_id,
    w.id AS planning_week_id,
    w.service_id,
    w.service_name,
    w.week_start,
    w.week_end,
    a.id AS db_assignment_pk,
    a.assignment_id,
    a.personnel_id,
    a.day_index,
    a.shift_type,
    a.poste_id,
    a.poste_label,
    a.start_time,
    a.end_time,
    a.note,
    a.created_at,
    a.updated_at
FROM planning_weeks w
LEFT JOIN planning_assignments a ON a.planning_week_id = w.id;";

        await using var cmd = new MySqlCommand(ddl, connection);
        await cmd.ExecuteNonQueryAsync();

        await EnsureDemandesSchemaAsync(connection);
        await EnsureDemandeTypesSeedAsync(connection);

        // Ajouter l'index sur planning_week_id si absent (base existante sans ix_planning_week_id)
        const string checkIdxSql = @"
SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'planning'
  AND INDEX_NAME   = 'ix_planning_week_id';";
        await using var checkIdxCmd = new MySqlCommand(checkIdxSql, connection);
        var idxExists = Convert.ToInt32(await checkIdxCmd.ExecuteScalarAsync()) > 0;
        if (!idxExists)
        {
            await using var addIdxCmd = new MySqlCommand(
                "ALTER TABLE planning ADD INDEX ix_planning_week_id (planning_week_id);", connection);
            await addIdxCmd.ExecuteNonQueryAsync();
        }

        // Reconstruire la table planning depuis zéro pour purger les doublons et données obsolètes
        await SyncPlanningTableAsync(connection);
        
        // Seed test planning data for Service Urgences (serviceId=1)
        await SeedTestPlanningDataAsync(connection);
    }

    private static async Task EnsureDemandesSchemaAsync(MySqlConnection connection)
    {
        async Task EnsureColumnAsync(string columnName, string alterSql)
        {
            const string checkSql = @"
SELECT COUNT(*)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'demandes_utilisateur'
  AND COLUMN_NAME = @columnName;";

            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@columnName", columnName);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
            if (exists)
            {
                return;
            }

            await using var alterCmd = new MySqlCommand(alterSql, connection);
            await alterCmd.ExecuteNonQueryAsync();
        }

        await EnsureColumnAsync("planning_id", "ALTER TABLE demandes_utilisateur ADD COLUMN planning_id INT NULL AFTER user_id;");
        await EnsureColumnAsync("date_fin_evenement", "ALTER TABLE demandes_utilisateur ADD COLUMN date_fin_evenement DATE NULL AFTER date_evenement;");
        await EnsureColumnAsync("valide_par", "ALTER TABLE demandes_utilisateur ADD COLUMN valide_par INT NULL AFTER statut;");
        await EnsureColumnAsync("date_validation", "ALTER TABLE demandes_utilisateur ADD COLUMN date_validation DATETIME NULL AFTER valide_par;");
    }

    private static async Task EnsureDemandeTypesSeedAsync(MySqlConnection connection)
    {
        var now = DateTime.UtcNow;

        const string hasColumnSql = @"
SELECT COUNT(*)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'absence_types'
  AND COLUMN_NAME = 'is_requestable';";
        await using (var hasColumnCmd = new MySqlCommand(hasColumnSql, connection))
        {
            var exists = Convert.ToInt32(await hasColumnCmd.ExecuteScalarAsync()) > 0;
            if (!exists)
            {
                await using var alterCmd = new MySqlCommand("ALTER TABLE absence_types ADD COLUMN is_requestable TINYINT(1) NOT NULL DEFAULT 1 AFTER impact;", connection);
                await alterCmd.ExecuteNonQueryAsync();
            }
        }

        const string upsertSql = @"
INSERT INTO absence_types (code, label, description, color, impact, is_requestable, created_at, updated_at)
VALUES (@code, @label, @description, @color, @impact, @isRequestable, @createdAt, @updatedAt)
ON DUPLICATE KEY UPDATE
    label = VALUES(label),
    description = VALUES(description),
    color = VALUES(color),
    impact = VALUES(impact),
    is_requestable = VALUES(is_requestable),
    updated_at = VALUES(updated_at);";

        var rows = new[]
        {
            new { Code = "HS", Label = "Heures supplémentaires", Description = "Heures travaillées au-delà de l'horaire planifié.", Color = "#2563eb", Impact = "positive", IsRequestable = true },
            new { Code = "RC+", Label = "Récupération positive", Description = "Utilisation d'heures RC+ acquises précédemment.", Color = "#16a34a", Impact = "neutral", IsRequestable = false },
            new { Code = "RC-", Label = "Récupération négative", Description = "Heures à récupérer ou déficit horaire à compenser.", Color = "#f59e0b", Impact = "negative", IsRequestable = false },
            new { Code = "ABSENCE", Label = "Absence", Description = "Absence déclarée pendant un créneau planifié.", Color = "#f97316", Impact = "negative", IsRequestable = true },
            new { Code = "ARRET", Label = "Arrêt", Description = "Arrêt de travail validé.", Color = "#ef4444", Impact = "negative", IsRequestable = false },
            new { Code = "VA", Label = "Vacances annuelles", Description = "Congé annuel payé pris par l'employé.", Color = "#0ea5e9", Impact = "neutral", IsRequestable = true },
            new { Code = "AS", Label = "Astreinte", Description = "Astreinte: l'employé reste disponible en cas de besoin.", Color = "#7c3aed", Impact = "positive", IsRequestable = true },
            new { Code = "AT", Label = "Arrêt de travail", Description = "Arrêt maladie ou congé médical avec justificatif.", Color = "#dc2626", Impact = "negative", IsRequestable = false },
            new { Code = "AL", Label = "Autorisation légale", Description = "Autorisation de sortie ou absence légale durant les heures de travail.", Color = "#d97706", Impact = "neutral", IsRequestable = true },
            new { Code = "JR", Label = "Jour de repos", Description = "Jour de repos sans travail planifié.", Color = "#64748b", Impact = "neutral", IsRequestable = true }
        };

        foreach (var row in rows)
        {
            await using var cmd = new MySqlCommand(upsertSql, connection);
            cmd.Parameters.AddWithValue("@code", row.Code);
            cmd.Parameters.AddWithValue("@label", row.Label);
            cmd.Parameters.AddWithValue("@description", row.Description);
            cmd.Parameters.AddWithValue("@color", row.Color);
            cmd.Parameters.AddWithValue("@impact", row.Impact);
            cmd.Parameters.AddWithValue("@isRequestable", row.IsRequestable ? 1 : 0);
            cmd.Parameters.AddWithValue("@createdAt", now);
            cmd.Parameters.AddWithValue("@updatedAt", now);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task<PlanningData> GetPlanningAsync(
        string serviceId, 
        string serviceName, 
        DateTime weekStart, 
        DateTime? weekEnd = null,
        int? poleId = null,
        int? equipeId = null,
        string? userId = null)
    {
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        // Résoudre le vrai nom du service depuis la BD (affichage uniquement, pas d'enregistrement)
        var dbServiceName = await ResolveServiceNameFromDbAsync(connection, serviceId);
        if (!string.IsNullOrWhiteSpace(dbServiceName))
            serviceName = dbServiceName;

        // Lecture seule : ne PAS créer de ligne planning_weeks si elle n'existe pas encore.
        // Les lignes sont créées uniquement lors d'une sauvegarde d'affectation (SaveAssignmentAsync, etc.)
        var weekId = await FindWeekIdAsync(connection, serviceId, start, end);

        // Si pas de semaine pour ce service ET qu'un poleId est fourni (Chef de Pôle),
        // on continue quand même pour charger les affectations des autres services du pôle.
        if (string.IsNullOrEmpty(weekId) && !poleId.HasValue)
        {
            var emptyPersonnel = await GetPersonnelByServiceAsync(connection, serviceId, poleId, equipeId, userId);
            return new PlanningData
            {
                Id = BuildPlanningId(serviceId, start),
                ServiceId = serviceId,
                ServiceName = serviceName,
                WeekStart = start,
                WeekEnd = end,
                WorkflowStatus = null,
                WorkflowId = null,
                CanSubmit = true,
                Assignments = [],
                Personnel = emptyPersonnel.ToList(),
                Rules = DefaultRules(),
                Conflicts = [],
                History = []
            };
        }

        // Try to get workflow info, but don't fail if columns don't exist yet
        WeekInfo? weekInfo = null;
        try
        {
            weekInfo = await GetWeekInfoAsync(serviceId, start);
        }
        catch (MySqlException ex) when (ex.Message.Contains("Unknown column"))
        {
            // Workflow columns don't exist yet - migration needed
            Console.WriteLine("âš ï¸  Workflow columns not found in database. Run migration script: Backend/scripts/add_workflow_columns_to_planning.sql");
        }

        // Quand un poleId est fourni (Chef de Pôle), charger les affectations de TOUS les services du pôle
        // pour que le Chef de Pôle voie qui est planifié quel que soit le service sélectionné.
        IReadOnlyList<PlanningAssignment> assignments;
        if (poleId.HasValue)
        {
            assignments = await GetAssignmentsByPoleAsync(connection, poleId.Value, start);
        }
        else
        {
            assignments = await GetAssignmentsAsync(connection, weekId);
        }

        var personnel = await GetPersonnelByServiceAsync(connection, serviceId, poleId, equipeId, userId);
        var conflicts = DetectConflicts(assignments);

        return new PlanningData
        {
            Id = BuildPlanningId(serviceId, start),
            ServiceId = serviceId,
            ServiceName = serviceName,
            WeekStart = start,
            WeekEnd = end,
            WorkflowStatus = weekInfo?.WorkflowStatus,
            WorkflowId = null,
            CanSubmit = true,
            SubmittedBy = null,
            SubmittedAt = weekInfo?.WorkflowSubmittedAt,
            Assignments = assignments.ToList(),
            Personnel = personnel.ToList(),
            Rules = DefaultRules(),
            Conflicts = conflicts.ToList(),
            History =
            [
                new PlanningHistoryEntry
                {
                    Id = $"init-{DateTime.UtcNow.Ticks}",
                    At = DateTime.UtcNow,
                    Author = "SystÃ¨me",
                    Action = "INIT",
                    Details = "Planning backend chargÃ©"
                }
            ]
        };
    }


    public async Task<PlanningAssignment> SaveAssignmentAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd, PlanningAssignment assignment)
    {
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var weekId = await EnsureWeekAsync(connection, serviceId, serviceName, start, end);

        if (string.IsNullOrWhiteSpace(assignment.Id))
        {
            assignment.Id = $"{assignment.PersonnelId}-{assignment.Day}";
        }

        var now = DateTime.UtcNow;
        const string upsertSql = @"
INSERT INTO planning_assignments (planning_week_id, assignment_id, personnel_id, day_index, shift_type, poste_id, poste_label, start_time, end_time, note, created_at, updated_at)
VALUES (@weekId, @assignmentId, @personnelId, @dayIndex, @shiftType, @posteId, @posteLabel, @startTime, @endTime, @note, @createdAt, @updatedAt)
ON DUPLICATE KEY UPDATE
    personnel_id = VALUES(personnel_id),
    day_index = VALUES(day_index),
    shift_type = VALUES(shift_type),
    poste_id = VALUES(poste_id),
    poste_label = VALUES(poste_label),
    start_time = VALUES(start_time),
    end_time = VALUES(end_time),
    note = VALUES(note),
    updated_at = VALUES(updated_at);";

        await using var cmd = new MySqlCommand(upsertSql, connection);
        cmd.Parameters.AddWithValue("@weekId", weekId);
        cmd.Parameters.AddWithValue("@assignmentId", assignment.Id);
        cmd.Parameters.AddWithValue("@personnelId", assignment.PersonnelId);
        cmd.Parameters.AddWithValue("@dayIndex", assignment.Day);
        cmd.Parameters.AddWithValue("@shiftType", assignment.ShiftType);
        cmd.Parameters.AddWithValue("@posteId", (object?)assignment.PosteId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@posteLabel", (object?)assignment.PosteLabel ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@startTime", (object?)assignment.StartTime ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@endTime", (object?)assignment.EndTime ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@note", (object?)assignment.Note ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt", assignment.CreatedAt ?? now);
        cmd.Parameters.AddWithValue("@updatedAt", now);
        await cmd.ExecuteNonQueryAsync();

        // Sync uniquement la semaine concernée pour éviter les doublons et le mélange de service_id
        await SyncPlanningTableAsync(connection, weekId: weekId);

        assignment.CreatedAt ??= now;
        assignment.UpdatedAt = now;

        // Notifier l'agent si ses préférences le demandent
        var weekLabel = $"Semaine du {start:dd/MM/yyyy}";
        await NotifyPlanningModifiedAsync(connection, assignment.PersonnelId, serviceName, weekLabel);

        return assignment;
    }

    public async Task<bool> DeleteAssignmentAsync(string serviceId, DateTime weekStart, string assignmentId)
    {
        var start = NormalizeDate(weekStart);

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var weekId = await FindWeekIdAsync(connection, serviceId, start);
        if (string.IsNullOrEmpty(weekId))
        {
            return false;
        }

        const string sql = @"
DELETE FROM planning_assignments
WHERE planning_week_id = @weekId AND assignment_id = @assignmentId;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@weekId", weekId);
        cmd.Parameters.AddWithValue("@assignmentId", assignmentId);
        var deleted = await cmd.ExecuteNonQueryAsync() > 0;
        if (deleted)
        {
            // Sync uniquement la semaine concernée pour éviter les doublons et le mélange de service_id
            await SyncPlanningTableAsync(connection, weekId: weekId);
        }

        return deleted;
    }

    public async Task ReplaceAssignmentsAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd, IReadOnlyList<PlanningAssignment> assignments)
    {
        var (start, end) = NormalizePeriod(weekStart, weekEnd);

        const int maxAttempts = 3;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            await using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            try
            {
                await using var tx = await connection.BeginTransactionAsync();

                var weekId = await EnsureWeekAsync(connection, serviceId, serviceName, start, end, tx);

                const string deleteSql = "DELETE FROM planning_assignments WHERE planning_week_id = @weekId;";
                await using (var deleteCmd = new MySqlCommand(deleteSql, connection, tx))
                {
                    deleteCmd.Parameters.AddWithValue("@weekId", weekId);
                    await deleteCmd.ExecuteNonQueryAsync();
                }

                var now = DateTime.UtcNow;
                const string insertSql = @"
INSERT INTO planning_assignments (planning_week_id, assignment_id, personnel_id, day_index, shift_type, poste_id, poste_label, start_time, end_time, note, created_at, updated_at)
VALUES (@weekId, @assignmentId, @personnelId, @dayIndex, @shiftType, @posteId, @posteLabel, @startTime, @endTime, @note, @createdAt, @updatedAt);";

                foreach (var assignment in assignments)
                {
                    var assignmentId = string.IsNullOrWhiteSpace(assignment.Id)
                        ? $"{assignment.PersonnelId}-{assignment.Day}"
                        : assignment.Id;

                    await using var cmd = new MySqlCommand(insertSql, connection, tx);
                    cmd.Parameters.AddWithValue("@weekId", weekId);
                    cmd.Parameters.AddWithValue("@assignmentId", assignmentId);
                    cmd.Parameters.AddWithValue("@personnelId", assignment.PersonnelId);
                    cmd.Parameters.AddWithValue("@dayIndex", assignment.Day);
                    cmd.Parameters.AddWithValue("@shiftType", assignment.ShiftType);
                    cmd.Parameters.AddWithValue("@posteId", (object?)assignment.PosteId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@posteLabel", (object?)assignment.PosteLabel ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@startTime", (object?)assignment.StartTime ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@endTime", (object?)assignment.EndTime ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@note", (object?)assignment.Note ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@createdAt", assignment.CreatedAt ?? now);
                    cmd.Parameters.AddWithValue("@updatedAt", now);
                    await cmd.ExecuteNonQueryAsync();
                }

                // Sync uniquement la semaine concernée pour éviter les doublons et le mélange de service_id
                await SyncPlanningTableAsync(connection, tx, weekId);

                await tx.CommitAsync();

                // Notifier chaque agent unique concerné (après commit, hors transaction)
                var weekLabel = $"Semaine du {start:dd/MM/yyyy}";
                var uniqueUsers = assignments
                    .Select(a => a.PersonnelId)
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Distinct();

                foreach (var uid in uniqueUsers)
                {
                    await NotifyPlanningModifiedAsync(connection, uid, serviceName, weekLabel);
                }

                return;
            }
            catch (MySqlException ex) when ((ex.Number == 1213 || ex.Number == 1205) && attempt < maxAttempts)
            {
                // Deadlock/lock wait timeout transitoire: backoff court puis retry.
                await Task.Delay(120 * attempt);
            }
        }

        throw new InvalidOperationException("Échec de sauvegarde du planning après plusieurs tentatives (deadlock persistant).");
    }


    public async Task<IReadOnlyList<PlanningOverviewRow>> GetOverviewAsync(string? serviceId = null, DateTime? weekStart = null, bool onlyValidated = false)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = @"
SELECT o.planning_id, o.planning_week_id, o.service_id, o.service_name, o.week_start, o.week_end,
       o.db_assignment_pk, o.assignment_id, o.personnel_id, o.day_index, o.shift_type,
       o.poste_id, o.poste_label, o.start_time, o.end_time, o.note, o.created_at, o.updated_at
FROM planning_overview o
INNER JOIN planning_weeks w ON w.id = o.planning_week_id
WHERE (@serviceId IS NULL OR o.service_id = @serviceId)
    AND (@weekStart IS NULL OR o.week_start = @weekStart)
    AND (
        @onlyValidated = 0
        OR COALESCE(w.statut, w.workflow_status) = 'VALIDE'
    )
ORDER BY o.week_start DESC, o.service_id, o.day_index, o.personnel_id;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@serviceId", string.IsNullOrWhiteSpace(serviceId) ? DBNull.Value : serviceId);
        cmd.Parameters.AddWithValue("@weekStart", weekStart.HasValue ? weekStart.Value.Date : DBNull.Value);
        cmd.Parameters.AddWithValue("@onlyValidated", onlyValidated ? 1 : 0);

        await using var reader = await cmd.ExecuteReaderAsync();
        var rows = new List<PlanningOverviewRow>();

        while (await reader.ReadAsync())
        {
            rows.Add(new PlanningOverviewRow
            {
                PlanningId = reader.GetString("planning_id"),
                PlanningWeekId = reader.GetInt32("planning_week_id"),
                ServiceId = reader.GetString("service_id"),
                ServiceName = reader.GetString("service_name"),
                WeekStart = reader.GetDateTime("week_start"),
                WeekEnd = reader.GetDateTime("week_end"),
                DbAssignmentPk = IsNull(reader, "db_assignment_pk") ? null : reader.GetInt32("db_assignment_pk"),
                AssignmentId = IsNull(reader, "assignment_id") ? null : reader.GetString("assignment_id"),
                PersonnelId = IsNull(reader, "personnel_id") ? null : reader.GetString("personnel_id"),
                DayIndex = IsNull(reader, "day_index") ? null : reader.GetInt32("day_index"),
                ShiftType = IsNull(reader, "shift_type") ? null : reader.GetString("shift_type"),
                PosteId = IsNull(reader, "poste_id") ? null : reader.GetString("poste_id"),
                PosteLabel = IsNull(reader, "poste_label") ? null : reader.GetString("poste_label"),
                StartTime = IsNull(reader, "start_time") ? null : reader.GetString("start_time"),
                EndTime = IsNull(reader, "end_time") ? null : reader.GetString("end_time"),
                Note = IsNull(reader, "note") ? null : reader.GetString("note"),
                CreatedAt = IsNull(reader, "created_at") ? null : reader.GetDateTime("created_at"),
                UpdatedAt = IsNull(reader, "updated_at") ? null : reader.GetDateTime("updated_at")
            });
        }

        return rows;
    }

    public async Task<(string DatabaseName, IReadOnlyList<string> Tables)> GetPlanningSchemaInfoAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var databaseName = connection.Database;

        const string sql = @"
SELECT table_name
FROM information_schema.tables
WHERE table_schema = @databaseName
    AND (table_name = 'planning' OR table_name = 'planning_weeks' OR table_name = 'planning_assignments' OR table_name = 'planning_overview')
ORDER BY table_name;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@databaseName", databaseName);

        await using var reader = await cmd.ExecuteReaderAsync();
        var tables = new List<string>();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString("table_name"));
        }

        return (databaseName, tables);
    }

    public async Task<(string DatabaseName, IReadOnlyList<string> Tables)> GetAllSchemaTablesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var databaseName = connection.Database;

        const string sql = @"
SELECT table_name
FROM information_schema.tables
WHERE table_schema = @databaseName
ORDER BY table_name;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@databaseName", databaseName);

        await using var reader = await cmd.ExecuteReaderAsync();
        var tables = new List<string>();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString("table_name"));
        }

        return (databaseName, tables);
    }
}
