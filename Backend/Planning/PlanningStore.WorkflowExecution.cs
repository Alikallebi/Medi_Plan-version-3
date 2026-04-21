using MySqlConnector;
using System.Text.Json;
using System.Globalization;
using System.Text;
using Backend.Email;

namespace Backend.Planning;

/// <summary>
/// Gère l'exécution du workflow de validation à partir des données MySQL.
/// Connecte planning_weeks ↔ WorkflowConfigs (EF Core) ↔ validation_history (MySQL).
/// </summary>
public sealed partial class PlanningStore
{
    // ─────────────────────────────────────────────────────────────────────────
    // INITIALISATION DES TABLES DE WORKFLOW
    // ─────────────────────────────────────────────────────────────────────────

    public async Task InitializeWorkflowTablesAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        // ── 1. Ajouter les colonnes workflow à planning_weeks (compatible MySQL 5.7+)
        //    On utilise INFORMATION_SCHEMA pour éviter ADD COLUMN IF NOT EXISTS (MySQL 8.0 only)
        var newColumns = new[]
        {
            ("statut",                  "VARCHAR(50)  NULL DEFAULT 'BROUILLON'"),
            ("workflow_config_id",      "INT          NULL DEFAULT NULL"),
            ("etape_actuelle",          "INT          NOT NULL DEFAULT 0"),
            ("date_soumission",         "DATETIME     NULL DEFAULT NULL"),
            ("prochain_validateur_id",  "INT          NULL DEFAULT NULL"),
            ("soumis_par_id",           "INT          NULL DEFAULT NULL"),
            ("soumis_par_nom",          "VARCHAR(150) NULL DEFAULT NULL"),
            ("rejete_motif",            "TEXT         NULL"),
        };

        foreach (var (col, def) in newColumns)
        {
            // Vérifie si la colonne existe déjà
            const string checkSql = @"
SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planning_weeks' AND COLUMN_NAME = @col;";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@col", col);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (!exists)
            {
                await using var alterCmd = new MySqlCommand(
                    $"ALTER TABLE planning_weeks ADD COLUMN {col} {def};", connection);
                await alterCmd.ExecuteNonQueryAsync();
            }
        }

        // ── 2. Créer la table validation_history (idempotent)
        const string createHistory = @"
CREATE TABLE IF NOT EXISTS validation_history (
    id               INT          NOT NULL AUTO_INCREMENT,
    planning_week_id INT          NOT NULL,
    etape            INT          NOT NULL DEFAULT 0,
    validateur_id    INT          NULL,
    validateur_nom   VARCHAR(150) NULL,
    action           VARCHAR(50)  NOT NULL,
    commentaire      TEXT         NULL,
    date_action      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata         JSON         NULL,
    PRIMARY KEY (id),
    KEY idx_planning_week_id (planning_week_id),
    KEY idx_validateur_id (validateur_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        await using var histCmd = new MySqlCommand(createHistory, connection);
        await histCmd.ExecuteNonQueryAsync();

        // ── 3. Créer la table notifications (idempotent)
        const string createNotifs = @"
CREATE TABLE IF NOT EXISTS notifications (
    id               INT          NOT NULL AUTO_INCREMENT,
    user_id          INT          NOT NULL,
    type             VARCHAR(50)  NOT NULL,
    titre            VARCHAR(255) NOT NULL,
    message          TEXT         NOT NULL,
    planning_id      INT          NULL,
    planning_week_id INT          NULL,
    lu               TINYINT(1)   NOT NULL DEFAULT 0,
    date_creation    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_lecture     DATETIME     NULL,
    lien             VARCHAR(255) NULL,
    emetteur_id      INT          NULL,
    PRIMARY KEY (id),
    KEY idx_user_id (user_id),
    KEY idx_user_non_lues (user_id, lu),
    KEY idx_planning_week_id (planning_week_id),
    KEY idx_planning_id (planning_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        await using var notifCmd = new MySqlCommand(createNotifs, connection);
        await notifCmd.ExecuteNonQueryAsync();

        // ── 4. Ajouter la colonne planning_id si la table existait sans elle
        const string checkPlanningIdSql = @"
SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'planning_id';";
        await using var checkPiCmd = new MySqlCommand(checkPlanningIdSql, connection);
        var planningIdExists = Convert.ToInt32(await checkPiCmd.ExecuteScalarAsync()) > 0;
        if (!planningIdExists)
        {
            await using var addPiCmd = new MySqlCommand(
                "ALTER TABLE notifications ADD COLUMN planning_id INT NULL AFTER message;", connection);
            await addPiCmd.ExecuteNonQueryAsync();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SOUMISSION PAR WEEK-ID (utilisé par les endpoints frontend)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Retourne le workflow d'une semaine par serviceId + weekStart (pour l'endpoint GET /api/planning).</summary>
    public async Task<PlanningWeekWorkflow?> GetWeekWorkflowByServiceAsync(string serviceId, DateTime weekStart)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        return await GetWeekWorkflowAsync(conn, serviceId, weekStart);
    }

    public async Task<PlanningWeekWorkflow?> SubmitByWeekIdAsync(
        int weekId,
        int soumisParId,
        string soumisParNom,
        string? message,
        Func<string, Task<WorkflowConfigResult?>> getConfigByServiceId)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        var week = await GetWeekWorkflowByIdAsync(conn, weekId);
        if (week == null) return null;

        return await SubmitForValidationAsync(
            week.ServiceId,
            week.WeekStart,
            soumisParId,
            soumisParNom,
            message,
            getConfigByServiceId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SOUMISSION D'UN PLANNING POUR VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<PlanningWeekWorkflow?> SubmitForValidationAsync(
        string serviceId,
        DateTime weekStart,
        int soumisParId,
        string soumisParNom,
        string? message,
        Func<string, Task<WorkflowConfigResult?>> getConfigByServiceId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        // 1. Trouver le planning
        var week = await GetWeekWorkflowAsync(connection, serviceId, weekStart, tx);
        if (week == null) return null;

        // 2. Vérifier le statut
        // EN_ATTENTE_VALIDATION → déjà soumis, retourner l'état actuel (idempotent)
        if (week.Statut == "EN_ATTENTE_VALIDATION")
        {
            await tx.RollbackAsync();
            return week;
        }
        // VALIDE → vraiment bloquant (ne pas re-soumettre un planning déjà validé)
        if (week.Statut == "VALIDE")
        {
            throw new InvalidOperationException($"Ce planning ne peut pas être soumis (statut actuel : {week.Statut}).");
        }
        // BROUILLON ou REJETE → soumission autorisée (le chef de service corrige et re-soumet)

        // 3. Vérifier la présence d'affectations
        var assignCount = await CountAssignmentsAsync(connection, week.Id, tx);
        if (assignCount == 0)
        {
            throw new InvalidOperationException("Le planning est vide. Ajoutez des affectations avant de soumettre.");
        }

        // 4. Récupérer la config workflow du service (serviceId peut être numérique ou textuel)
        var config = await getConfigByServiceId(serviceId);
        if (config == null || !config.IsActive || config.Steps.Count == 0)
        {
            throw new InvalidOperationException("Aucune configuration de workflow active pour ce service. Configurez d'abord le circuit de validation.");
        }

        // 5. Déterminer l'étape correspondant au soumetteur (si présente dans le workflow)
        // puis auto-valider toutes les étapes jusqu'à cette étape incluse.
        var stepsOrdered = config.Steps.OrderBy(s => s.Order).ToList();
        int? finalValidateurId = null;
        int etapeEffective = 0;
        var serviceIdInt = int.TryParse(serviceId, out var sid) ? sid : 0;

        // Historique soumission
        await InsertHistoryAsync(connection, week.Id, 0, soumisParId, soumisParNom, "SOUMISSION", message, tx);

        // Fonction locale: le soumetteur peut-il valider cette étape ?
        async Task<bool> SubmitterCanValidateStepAsync(WorkflowConfigStepResult etape)
        {
            if (!string.IsNullOrEmpty(etape.ValidatorUserId) && int.TryParse(etape.ValidatorUserId, out var specificId))
            {
                // Validateur nommément désigné
                return specificId == soumisParId;
            }

            // Validateur par rôle : le soumetteur a-t-il ce rôle ?
            return await UserHasRoleAsync(connection, soumisParId, etape.ValidatorRole, serviceIdInt, tx);
        }

        // Trouver la plus haute étape que le soumetteur peut couvrir
        int submitterStepOrder = 0;
        foreach (var etape in stepsOrdered)
        {
            if (await SubmitterCanValidateStepAsync(etape))
            {
                submitterStepOrder = etape.Order;
            }
        }

        // Garde-fou métier: ne jamais auto-valider la dernière étape.
        // La validation finale doit toujours être faite explicitement
        // par le responsable de l'étape finale du service.
        var maxStepOrder = stepsOrdered.Count > 0 ? stepsOrdered.Max(s => s.Order) : 0;
        if (maxStepOrder > 0 && submitterStepOrder >= maxStepOrder)
        {
            submitterStepOrder = maxStepOrder - 1;
        }

        // Auto-valider toutes les étapes <= étape du soumetteur
        if (submitterStepOrder > 0)
        {
            foreach (var etape in stepsOrdered.Where(s => s.Order <= submitterStepOrder))
            {
                await InsertHistoryAsync(connection, week.Id, etape.Order, soumisParId, soumisParNom, "APPROUVE_AUTO",
                    "Étape auto-validée lors de la soumission (le soumetteur a le rôle requis)", tx);
            }
        }

        // Chercher la première étape restante après auto-validation
        var nextStep = stepsOrdered.FirstOrDefault(s => s.Order > submitterStepOrder);
        if (nextStep != null)
        {
            var vidCandidat = await FindValidateurIdAsync(connection, nextStep.ValidatorRole, nextStep.ValidatorUserId, serviceIdInt, tx);
            finalValidateurId = vidCandidat;
            etapeEffective = nextStep.Order;
        }

        // Si toutes les étapes sont auto-validées (cas edge) → planning directement validé
        if (etapeEffective == 0 && finalValidateurId == null)
        {
            const string validateAllSql = @"
UPDATE planning_weeks
SET statut                 = 'VALIDE',
    workflow_status        = 'VALIDE',
    workflow_config_id     = @configId,
    etape_actuelle         = @etape,
    date_soumission        = @now,
    prochain_validateur_id = NULL,
    soumis_par_id          = @soumisParId,
    soumis_par_nom         = @soumisParNom,
    rejete_motif           = NULL
WHERE id = @weekId;";
            await using var cmdAll = new MySqlCommand(validateAllSql, connection, tx);
            cmdAll.Parameters.AddWithValue("@configId", config.Id);
            cmdAll.Parameters.AddWithValue("@etape", stepsOrdered.Last().Order);
            cmdAll.Parameters.AddWithValue("@now", DateTime.UtcNow);
            cmdAll.Parameters.AddWithValue("@soumisParId", soumisParId);
            cmdAll.Parameters.AddWithValue("@soumisParNom", soumisParNom);
            cmdAll.Parameters.AddWithValue("@weekId", week.Id);
            await cmdAll.ExecuteNonQueryAsync();
            await tx.CommitAsync();
            await using var conn3 = new MySqlConnection(_connectionString);
            await conn3.OpenAsync();
            return await GetWeekWorkflowAsync(conn3, serviceId, weekStart);
        }

        // 7. Mettre à jour le planning vers la première étape non auto-validée
        const string updateSql = @"
UPDATE planning_weeks
SET statut                 = 'EN_ATTENTE_VALIDATION',
    workflow_status        = 'EN_ATTENTE_VALIDATION',
    workflow_config_id     = @configId,
    etape_actuelle         = @etape,
    date_soumission        = @now,
    prochain_validateur_id = @validateurId,
    soumis_par_id          = @soumisParId,
    soumis_par_nom         = @soumisParNom,
    rejete_motif           = NULL
WHERE id = @weekId;";
        await using var updateCmd = new MySqlCommand(updateSql, connection, tx);
        updateCmd.Parameters.AddWithValue("@configId", config.Id);
        updateCmd.Parameters.AddWithValue("@etape", etapeEffective);
        updateCmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
        updateCmd.Parameters.AddWithValue("@validateurId", finalValidateurId.HasValue ? finalValidateurId.Value : DBNull.Value);
        updateCmd.Parameters.AddWithValue("@soumisParId", soumisParId);
        updateCmd.Parameters.AddWithValue("@soumisParNom", soumisParNom);
        updateCmd.Parameters.AddWithValue("@weekId", week.Id);
        await updateCmd.ExecuteNonQueryAsync();

        // 9. Notification + e-mail au prochain validateur
        if (finalValidateurId.HasValue)
        {
            var operationSuffix = string.IsNullOrWhiteSpace(message) ? string.Empty : $" {message}";
            await InsertNotificationAsync(connection, finalValidateurId.Value, "WORKFLOW_SOUMIS",
                "Planning en attente de votre validation",
                $"{soumisParNom} a soumis le planning {week.ServiceName} (semaine du {weekStart:dd/MM/yyyy}) pour votre approbation.{operationSuffix}",
                week.Id, soumisParId, $"/workflow/validation/{week.Id}", tx);
        }

        await tx.CommitAsync();

        // E-mail au responsable de la 1ʳᵉ étape (après commit, best-effort)
        if (finalValidateurId.HasValue)
        {
            var (email, nom, _) = await GetUserEmailAsync(finalValidateurId.Value);
            if (!string.IsNullOrEmpty(email))
            {
                var weekLabel = $"du {weekStart:dd/MM/yyyy}";
                if (!string.IsNullOrWhiteSpace(message))
                {
                    weekLabel += $" • {message}";
                }
                var lien = $"/workflow/validation/{week.Id}";
                _ = _emailService.SendAsync(email, nom,
                    $"[Clinisys] Planning {week.ServiceName} — à valider",
                    EmailTemplates.ValidationDemandee(nom, week.ServiceName, weekLabel, soumisParNom, lien));
            }
        }

        // 10. Retourner le planning mis à jour
        await using var conn2 = new MySqlConnection(_connectionString);
        await conn2.OpenAsync();
        return await GetWeekWorkflowAsync(conn2, serviceId, weekStart);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // APPROBATION D'UNE ÉTAPE
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<PlanningWeekWorkflow?> ApprouverEtapeAsync(
        int weekId,
        int validateurId,
        string validateurNom,
        string? commentaire,
        Func<int, Task<WorkflowConfigResult?>> getConfigById,
        bool notifierCreateur = true,
        bool notifierAutresValidateurs = true)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var week = await GetWeekWorkflowByIdAsync(connection, weekId, tx);
        if (week == null) return null;

        if (week.Statut != "EN_ATTENTE_VALIDATION" && week.Statut != "EN_ATTENTE_VALIDATION_FINALE")
        {
            throw new InvalidOperationException("Ce planning n'est pas en attente de validation.");
        }

        // Enregistrer l'approbation dans l'historique
        await InsertHistoryAsync(connection, weekId, week.EtapeActuelle, validateurId, validateurNom, "APPROUVE", commentaire, tx);

        // Récupérer la config pour trouver l'étape suivante.
        // Priorité : WorkflowConfigId (stocké lors de la soumission, toujours fiable)
        // Fallback : ServiceIdInt (peut être 0 si service_id non numérique → config non trouvée)
        WorkflowConfigResult? config;
        if (week.WorkflowConfigId.HasValue)
        {
            var cfgItem = await GetWorkflowConfigByIdMySqlAsync(week.WorkflowConfigId.Value);
            config = ToWorkflowConfigResultInternal(cfgItem);
            Console.WriteLine($"[Approuver] weekId={weekId} → config via WorkflowConfigId={week.WorkflowConfigId}: {(config != null ? $"{config.Steps.Count} étape(s)" : "NULL ← PROBLÈME")}");
        }
        else
        {
            config = await getConfigById(week.ServiceIdInt);
            Console.WriteLine($"[Approuver] weekId={weekId} → config via ServiceIdInt={week.ServiceIdInt}: {(config != null ? $"{config.Steps.Count} étape(s)" : "NULL ← PROBLÈME")}");
        }

        var steps = config?.Steps.OrderBy(s => s.Order).ToList() ?? new List<WorkflowConfigStepResult>();
        Console.WriteLine($"[Approuver] weekId={weekId} etapeActuelle={week.EtapeActuelle} steps=[{string.Join(", ", steps.Select(s => $"order={s.Order}|role={s.ValidatorRole}"))}]");
        var prochainValidateurId = (int?)null;

        // Trouver l'étape suivante
        var etapesSuivantes = steps.Where(s => s.Order > week.EtapeActuelle).ToList();

        string nouveauStatut;
        int nouvelleEtape;

        if (etapesSuivantes.Count > 0)
        {
            // Il reste des étapes
            var prochaineEtape = etapesSuivantes.First();
            nouvelleEtape = prochaineEtape.Order;

            // Validation finale uniquement si la prochaine étape est réellement Super Admin.
            if (IsSuperAdminRole(prochaineEtape.ValidatorRole))
            {
                nouveauStatut = "EN_ATTENTE_VALIDATION_FINALE";
            }
            else
            {
                nouveauStatut = "EN_ATTENTE_VALIDATION";
            }

            prochainValidateurId = await FindValidateurIdAsync(connection, prochaineEtape.ValidatorRole, prochaineEtape.ValidatorUserId, week.ServiceIdInt, tx);
            Console.WriteLine($"[Approuver] prochaineEtape order={prochaineEtape.Order} role='{prochaineEtape.ValidatorRole}' userId='{prochaineEtape.ValidatorUserId}' serviceId={week.ServiceIdInt} → prochainValidateurId={prochainValidateurId?.ToString() ?? "null ← NOTIFICATION NON ENVOYÉE"}");

            // Si le prochain validateur est introuvable, bloquer l'approbation avec un message utile
            if (!prochainValidateurId.HasValue)
            {
                await tx.RollbackAsync();
                throw new InvalidOperationException(
                    $"Impossible de trouver un utilisateur avec le rôle '{prochaineEtape.ValidatorRole}' pour l'étape {prochaineEtape.Order}. " +
                    $"Vérifiez que ce rôle existe bien dans la table staff_users (actif=1) ou configurez un validateur spécifique. " +
                    $"Utilisez /api/workflow/debug/find-by-role?role={Uri.EscapeDataString(prochaineEtape.ValidatorRole)} pour diagnostiquer.");
            }
        }
        else if (week.Statut == "EN_ATTENTE_VALIDATION_FINALE")
        {
            // La validation finale Super Admin est déjà effectuée → planning VALIDE
            nouveauStatut = "VALIDE";
            nouvelleEtape = week.EtapeActuelle;
            Console.WriteLine($"[Approuver] weekId={weekId} → validation finale Super Admin approuvée, passage à VALIDE");
        }
        else
        {
            // Plus aucune étape dans la configuration active: le workflow est terminé.
            // Ne pas imposer automatiquement un passage supplémentaire Super Admin.
            nouveauStatut = "VALIDE";
            nouvelleEtape = week.EtapeActuelle;
            Console.WriteLine($"[Approuver] weekId={weekId} → dernière étape configurée validée, passage direct à VALIDE");
        }

        const string updateSql = @"
UPDATE planning_weeks
SET statut                 = @statut,
            workflow_status        = @statut,
    etape_actuelle         = @etape,
    prochain_validateur_id = @validateurId
WHERE id = @weekId;";
        await using var updateCmd = new MySqlCommand(updateSql, connection, tx);
        updateCmd.Parameters.AddWithValue("@statut", nouveauStatut);
        updateCmd.Parameters.AddWithValue("@etape", nouvelleEtape);
        updateCmd.Parameters.AddWithValue("@validateurId", prochainValidateurId.HasValue ? prochainValidateurId.Value : DBNull.Value);
        updateCmd.Parameters.AddWithValue("@weekId", weekId);
        await updateCmd.ExecuteNonQueryAsync();

        // Notifications in-app
        await UpdatePlanningNotificationAfterActionAsync(
            connection,
            validateurId,
            weekId,
            "WORKFLOW_VALIDE",
            "Planning validé",
            $"Vous avez validé le planning {week.ServiceName} (semaine du {week.WeekStart:dd/MM/yyyy}).",
            $"/workflow/validation/{weekId}",
            tx);

        if (nouveauStatut == "VALIDE")
        {
            // Notifier le créateur
            if (week.SoumisParId.HasValue)
            {
                await InsertNotificationAsync(connection, week.SoumisParId.Value, "WORKFLOW_VALIDE",
                    "Planning validé",
                    $"Votre planning {week.ServiceName} (semaine du {week.WeekStart:dd/MM/yyyy}) a été validé par {validateurNom}.",
                    weekId, validateurId, $"/pages/planning?service={week.ServiceId}", tx);
            }
        }
        else if (prochainValidateurId.HasValue)
        {
            // Notifier le prochain validateur
            await InsertNotificationAsync(connection, prochainValidateurId.Value, "WORKFLOW_SOUMIS",
                "Planning en attente de votre validation",
                $"Le planning {week.ServiceName} (semaine du {week.WeekStart:dd/MM/yyyy}) a été approuvé à l'étape précédente et attend votre validation.",
                weekId, validateurId, $"/workflow/validation/{weekId}", tx);
        }

        await tx.CommitAsync();

        // E-mails (après commit, best-effort) — respecte les choix de notification du validateur
        var weekLabelAppr = $"du {week.WeekStart:dd/MM/yyyy}";
        Console.WriteLine($"[Email] ApprouverEtape weekId={weekId} statut={nouveauStatut} notifierCreateur={notifierCreateur} notifierAutres={notifierAutresValidateurs}");

        // ── Confirmation au validateur lui-même (toujours, quel que soit les cases) ──
        {
            var (emailVal, nomVal, _) = await GetUserEmailAsync(validateurId, forcerEnvoi: true);
            if (!string.IsNullOrEmpty(emailVal))
            {
                var lienConf  = $"/pages/planning?service={week.ServiceId}";
                var estFinal  = nouveauStatut == "VALIDE";
                var etapLabel = estFinal ? "Validation finale" : $"Étape {nouvelleEtape}/{steps.Count}";
                _ = _emailService.SendAsync(emailVal, nomVal,
                    $"[Clinisys] Vous avez validé le planning {week.ServiceName} — {weekLabelAppr}",
                    EmailTemplates.ConfirmationValidation(nomVal, week.ServiceName, weekLabelAppr, etapLabel, estFinal, lienConf));
            }
        }

        if (nouveauStatut == "VALIDE")
        {
            // Validation finale : diffusion au service selon les cases cochées
            var lienPlanning = $"/pages/planning?service={week.ServiceId}";

            if (notifierCreateur && week.SoumisParId.HasValue)
            {
                // Créateur — forcé car coché explicitement
                var (emailC, nomC, _) = await GetUserEmailAsync(week.SoumisParId.Value, forcerEnvoi: true);
                if (!string.IsNullOrEmpty(emailC))
                    _ = _emailService.SendAsync(emailC, nomC,
                        $"[Clinisys] Planning {week.ServiceName} — entièrement validé ✅",
                        EmailTemplates.PlanningValideServiceBroadcast(nomC, week.ServiceName, weekLabelAppr, validateurNom, lienPlanning));
            }

            if (notifierAutresValidateurs)
            {
                // Tous les agents du service sauf le super admin valideur
                var serviceUsers = await GetServiceUsersEmailsAsync(week.ServiceIdInt, validateurId);
                // Exclure le créateur s'il a déjà été notifié
                var dejaNotifie = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (notifierCreateur && week.SoumisParId.HasValue)
                {
                    var (ecRef, _, _) = await GetUserEmailAsync(week.SoumisParId.Value, forcerEnvoi: true);
                    if (!string.IsNullOrEmpty(ecRef)) dejaNotifie.Add(ecRef);
                }
                foreach (var (emailUser, nomUser) in serviceUsers)
                {
                    if (dejaNotifie.Contains(emailUser)) continue;
                    _ = _emailService.SendAsync(emailUser, nomUser,
                        $"[Clinisys] Planning {week.ServiceName} — entièrement validé ✅",
                        EmailTemplates.PlanningValideServiceBroadcast(nomUser, week.ServiceName, weekLabelAppr, validateurNom, lienPlanning));
                }
            }
        }
        else if (prochainValidateurId.HasValue)
        {
            // Passage à l'étape suivante
            if (notifierAutresValidateurs)
            {
                // E-mail au responsable de l'étape suivante — forcé car coché explicitement
                var (emailNext, nomNext, _) = await GetUserEmailAsync(prochainValidateurId.Value, forcerEnvoi: true);
                if (!string.IsNullOrEmpty(emailNext))
                {
                    var lienValid = $"/workflow/validation/{weekId}";
                    _ = _emailService.SendAsync(emailNext, nomNext,
                        $"[Clinisys] Planning {week.ServiceName} — votre validation requise",
                        EmailTemplates.EtapeApprouvee(nomNext, week.ServiceName, weekLabelAppr, validateurNom, lienValid));
                }
            }

            if (notifierCreateur && week.SoumisParId.HasValue && week.SoumisParId.Value != prochainValidateurId.Value)
            {
                // E-mail au créateur : progression du workflow — forcé car coché explicitement
                var (emailC, nomC, _) = await GetUserEmailAsync(week.SoumisParId.Value, forcerEnvoi: true);
                if (!string.IsNullOrEmpty(emailC))
                {
                    var lienSuivi = $"/pages/planning?service={week.ServiceId}&weekId={weekId}";
                    _ = _emailService.SendAsync(emailC, nomC,
                        $"[Clinisys] Planning {week.ServiceName} — progression du workflow",
                        EmailTemplates.PlanningAvanceEtape(nomC, week.ServiceName, weekLabelAppr,
                            nouvelleEtape, steps.Count, validateurNom, lienSuivi));
                }
            }
        }

        await using var conn2 = new MySqlConnection(_connectionString);
        await conn2.OpenAsync();
        return await GetWeekWorkflowByIdAsync(conn2, weekId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REJET D'UN PLANNING
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<PlanningWeekWorkflow?> RejeterPlanningAsync(
        int weekId,
        int validateurId,
        string validateurNom,
        string motif,
        string? commentaire)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var week = await GetWeekWorkflowByIdAsync(connection, weekId, tx);
        if (week == null) return null;

        // Historique
        await InsertHistoryAsync(connection, weekId, week.EtapeActuelle, validateurId, validateurNom, "REJETE",
            $"Motif: {motif}. {commentaire}", tx);

        await UpdatePlanningNotificationAfterActionAsync(
            connection,
            validateurId,
            weekId,
            "WORKFLOW_REJETE",
            "Planning rejeté",
            $"Vous avez rejeté le planning {week.ServiceName} (semaine du {week.WeekStart:dd/MM/yyyy}).",
            $"/workflow/validation/{weekId}",
            tx);

        const string updateSql = @"
UPDATE planning_weeks
SET statut                 = 'REJETE',
    workflow_status        = 'REJETE',
    etape_actuelle         = 0,
    prochain_validateur_id = NULL,
    rejete_motif           = @motif
WHERE id = @weekId;";
        await using var updateCmd = new MySqlCommand(updateSql, connection, tx);
        updateCmd.Parameters.AddWithValue("@motif", motif);
        updateCmd.Parameters.AddWithValue("@weekId", weekId);
        await updateCmd.ExecuteNonQueryAsync();

        // Notifier le créateur (in-app)
        if (week.SoumisParId.HasValue)
        {
            await InsertNotificationAsync(connection, week.SoumisParId.Value, "WORKFLOW_REJETE",
                "Planning rejeté",
                $"Votre planning {week.ServiceName} (semaine du {week.WeekStart:dd/MM/yyyy}) a été rejeté par {validateurNom}. Motif : {motif}",
                weekId, validateurId, $"/pages/planning?service={week.ServiceId}&weekId={weekId}&weekStart={week.WeekStart:yyyy-MM-dd}", tx);
        }

        await tx.CommitAsync();

        // E-mail au créateur (best-effort)
        if (week.SoumisParId.HasValue)
        {
            var (emailCreateur, nomCreateur, _) = await GetUserEmailAsync(week.SoumisParId.Value);
            if (!string.IsNullOrEmpty(emailCreateur))
            {
                var weekLabel = $"du {week.WeekStart:dd/MM/yyyy}";
                var lien = $"/pages/planning?service={week.ServiceId}&weekId={weekId}&weekStart={week.WeekStart:yyyy-MM-dd}";
                _ = _emailService.SendAsync(emailCreateur, nomCreateur,
                    $"[Clinisys] Planning {week.ServiceName} — rejeté ❌",
                    EmailTemplates.PlanningRejete(nomCreateur, week.ServiceName, weekLabel, validateurNom, motif, lien));
            }
        }

        await using var conn2 = new MySqlConnection(_connectionString);
        await conn2.OpenAsync();
        return await GetWeekWorkflowByIdAsync(conn2, weekId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEMANDE DE MODIFICATION
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<PlanningWeekWorkflow?> DemanderModificationAsync(
        int weekId,
        int validateurId,
        string validateurNom,
        string instructions)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var week = await GetWeekWorkflowByIdAsync(connection, weekId, tx);
        if (week == null) return null;

        // Historique
        await InsertHistoryAsync(connection, weekId, week.EtapeActuelle, validateurId, validateurNom, "DEMANDE_MODIFICATION",
            instructions, tx);

        await UpdatePlanningNotificationAfterActionAsync(
            connection,
            validateurId,
            weekId,
            "WORKFLOW_REVISION",
            "Planning modifié",
            $"Vous avez demandé une modification pour le planning {week.ServiceName} (semaine du {week.WeekStart:dd/MM/yyyy}).",
            $"/workflow/validation/{weekId}",
            tx);

        const string updateSql = @"
UPDATE planning_weeks
SET statut                 = 'BROUILLON',
    workflow_status        = 'BROUILLON',
    etape_actuelle         = 0,
    prochain_validateur_id = NULL
WHERE id = @weekId;";
        await using var updateCmd = new MySqlCommand(updateSql, connection, tx);
        updateCmd.Parameters.AddWithValue("@weekId", weekId);
        await updateCmd.ExecuteNonQueryAsync();

        // Notifier le créateur (in-app)
        if (week.SoumisParId.HasValue)
        {
            await InsertNotificationAsync(connection, week.SoumisParId.Value, "WORKFLOW_REVISION",
                "Modifications demandées",
                $"{validateurNom} demande des modifications sur votre planning {week.ServiceName}. Instructions : {instructions}",
                weekId, validateurId, $"/pages/planning?service={week.ServiceId}&weekId={weekId}&weekStart={week.WeekStart:yyyy-MM-dd}", tx);
        }

        await tx.CommitAsync();

        // E-mail au créateur (best-effort)
        if (week.SoumisParId.HasValue)
        {
            var (emailCreateur, nomCreateur, _) = await GetUserEmailAsync(week.SoumisParId.Value);
            if (!string.IsNullOrEmpty(emailCreateur))
            {
                var weekLabel = $"du {week.WeekStart:dd/MM/yyyy}";
                var lien = $"/pages/planning?service={week.ServiceId}&weekId={weekId}&weekStart={week.WeekStart:yyyy-MM-dd}";
                _ = _emailService.SendAsync(emailCreateur, nomCreateur,
                    $"[Clinisys] Planning {week.ServiceName} — modifications demandées ✏️",
                    EmailTemplates.ModificationDemandee(nomCreateur, week.ServiceName, weekLabel, validateurNom, instructions, lien));
            }
        }

        await using var conn2 = new MySqlConnection(_connectionString);
        await conn2.OpenAsync();
        return await GetWeekWorkflowByIdAsync(conn2, weekId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RÉCUPÉRER UN PLANNING PAR ID (MySQL)
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Retourne les données workflow MySQL d'un planning par son week-ID.</summary>
    public async Task<PlanningWeekWorkflow?> GetPlanningWeekByIdAsync(int weekId)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        return await GetWeekWorkflowByIdAsync(conn, weekId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RÉCUPÉRER LES PLANNINGS (en attente, mes soumissions, etc.)
    // ─────────────────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<PlanningWeekWorkflow>> GetPlanningsWorkflowAsync(
        int? validateurId = null,
        int? soumisParId = null,
        string? statut = null,
        int? poleId = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var conditions = new List<string>();
        if (validateurId.HasValue) conditions.Add("w.prochain_validateur_id = @validateurId");
        if (soumisParId.HasValue) conditions.Add("w.soumis_par_id = @soumisParId");
        if (!string.IsNullOrEmpty(statut)) conditions.Add("w.statut = @statut");
        // Filtrage par pôle : join sur la table services pour récupérer pole_id
        var joinServices = poleId.HasValue
            ? "LEFT JOIN services svc ON CAST(svc.id AS CHAR) = w.service_id"
            : "";
        if (poleId.HasValue) conditions.Add("svc.pole_id = @poleId");

        var where = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

        var sql = $@"
SELECT w.id, w.service_id, w.service_name, w.week_start, w.week_end,
       w.statut, w.workflow_config_id, w.etape_actuelle, w.date_soumission,
       w.prochain_validateur_id, w.soumis_par_id, w.soumis_par_nom, w.rejete_motif,
       COUNT(a.id) AS assignments_count,
            CONCAT(u.prenom, ' ', u.nom) AS prochain_validateur_nom,
            u.role AS prochain_validateur_role
FROM planning_weeks w
{joinServices}
LEFT JOIN planning_assignments a ON a.planning_week_id = w.id
LEFT JOIN staff_users u ON u.id = w.prochain_validateur_id
{where}
GROUP BY w.id
ORDER BY w.date_soumission DESC;";

        await using var cmd = new MySqlCommand(sql, connection);
        if (validateurId.HasValue) cmd.Parameters.AddWithValue("@validateurId", validateurId.Value);
        if (soumisParId.HasValue) cmd.Parameters.AddWithValue("@soumisParId", soumisParId.Value);
        if (!string.IsNullOrEmpty(statut)) cmd.Parameters.AddWithValue("@statut", statut);
        if (poleId.HasValue) cmd.Parameters.AddWithValue("@poleId", poleId.Value);

        var result = new List<PlanningWeekWorkflow>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(MapWeekWorkflow(reader));
        }
        return result;
    }

    /// <summary>Récupère l'historique de validation d'un planning.</summary>
    public async Task<IReadOnlyList<ValidationHistoryEntry>> GetValidationHistoryAsync(int weekId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT h.id, h.planning_week_id, h.etape, h.validateur_id, h.validateur_nom,
       h.action, h.commentaire, h.date_action
FROM validation_history h
WHERE h.planning_week_id = @weekId
ORDER BY h.date_action ASC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@weekId", weekId);

        var result = new List<ValidationHistoryEntry>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new ValidationHistoryEntry(
                Id: reader.GetInt32("id"),
                PlanningWeekId: reader.GetInt32("planning_week_id"),
                Etape: reader.GetInt32("etape"),
                ValidateurId: reader.IsDBNull(reader.GetOrdinal("validateur_id")) ? null : reader.GetInt32("validateur_id"),
                ValidateurNom: reader.IsDBNull(reader.GetOrdinal("validateur_nom")) ? null : reader.GetString("validateur_nom"),
                Action: reader.GetString("action"),
                Commentaire: reader.IsDBNull(reader.GetOrdinal("commentaire")) ? null : reader.GetString("commentaire"),
                DateAction: reader.GetDateTime("date_action")
            ));
        }
        return result;
    }

    /// <summary>Récupère les notifications MySQL d'un utilisateur.</summary>
    public async Task<IReadOnlyList<NotificationItem>> GetNotificationsAsync(int userId, bool unreadOnly = false)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var sql = unreadOnly
            ? @"SELECT * FROM notifications WHERE user_id = @userId AND lu = 0 ORDER BY date_creation DESC LIMIT 50;"
            : @"SELECT * FROM notifications WHERE user_id = @userId ORDER BY date_creation DESC LIMIT 100;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);

        var result = new List<NotificationItem>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            // planning_id peut ne pas exister dans les tables créées avant la migration
            int planningIdOrdinal = -1;
            try { planningIdOrdinal = reader.GetOrdinal("planning_id"); } catch { /* colonne absente */ }

            result.Add(new NotificationItem(
                Id: reader.GetInt32("id"),
                UserId: reader.GetInt32("user_id"),
                Type: reader.GetString("type"),
                Titre: reader.GetString("titre"),
                Message: reader.GetString("message"),
                PlanningId: planningIdOrdinal >= 0 && !reader.IsDBNull(planningIdOrdinal) ? reader.GetInt32(planningIdOrdinal) : null,
                PlanningWeekId: reader.IsDBNull(reader.GetOrdinal("planning_week_id")) ? null : reader.GetInt32("planning_week_id"),
                Lu: reader.GetBoolean("lu"),
                DateCreation: reader.GetDateTime("date_creation"),
                DateLecture: reader.IsDBNull(reader.GetOrdinal("date_lecture")) ? null : reader.GetDateTime("date_lecture"),
                Lien: reader.IsDBNull(reader.GetOrdinal("lien")) ? null : reader.GetString("lien"),
                EmetteurId: reader.IsDBNull(reader.GetOrdinal("emetteur_id")) ? null : reader.GetInt32("emetteur_id")
            ));
        }

        // Pour les notifications déjà lues restées en "WORKFLOW_SOUMIS",
        // afficher l'action réellement choisie par le validateur.
        var weekIdsToResolve = result
            .Where(n => n.Type == "WORKFLOW_SOUMIS" && n.Lu && (n.PlanningWeekId.HasValue || n.PlanningId.HasValue))
            .Select(n => n.PlanningWeekId ?? n.PlanningId)
            .Where(v => v.HasValue)
            .Select(v => v!.Value)
            .Distinct()
            .ToList();

        if (weekIdsToResolve.Count == 0)
        {
            return result;
        }

        var latestActions = await GetLatestValidatorActionsByWeekAsync(connection, userId, weekIdsToResolve);
        for (var i = 0; i < result.Count; i++)
        {
            var item = result[i];
            if (item.Type != "WORKFLOW_SOUMIS" || !item.Lu)
            {
                continue;
            }

            var weekId = item.PlanningWeekId ?? item.PlanningId;
            if (!weekId.HasValue)
            {
                continue;
            }

            if (!latestActions.TryGetValue(weekId.Value, out var action))
            {
                continue;
            }

            result[i] = action switch
            {
                "APPROUVE" => item with
                {
                    Type = "WORKFLOW_VALIDE",
                    Titre = "Planning validé",
                    Message = "Action effectuée: vous avez validé ce planning."
                },
                "REJETE" => item with
                {
                    Type = "WORKFLOW_REJETE",
                    Titre = "Planning rejeté",
                    Message = "Action effectuée: vous avez rejeté ce planning."
                },
                "DEMANDE_MODIFICATION" => item with
                {
                    Type = "WORKFLOW_REVISION",
                    Titre = "Planning modifié",
                    Message = "Action effectuée: vous avez demandé une modification."
                },
                _ => item
            };
        }

        return result;
    }

    private static async Task<Dictionary<int, string>> GetLatestValidatorActionsByWeekAsync(
        MySqlConnection connection,
        int userId,
        IReadOnlyList<int> weekIds)
    {
        if (weekIds.Count == 0)
        {
            return new Dictionary<int, string>();
        }

        var weekParams = weekIds.Select((_, i) => $"@week{i}").ToList();
        var sql = $@"
SELECT h.planning_week_id, h.action, h.date_action
FROM validation_history h
WHERE h.validateur_id = @userId
    AND h.planning_week_id IN ({string.Join(",", weekParams)})
    AND h.action IN ('APPROUVE', 'REJETE', 'DEMANDE_MODIFICATION')
ORDER BY h.date_action DESC;";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);
        for (var i = 0; i < weekIds.Count; i++)
        {
            cmd.Parameters.AddWithValue(weekParams[i], weekIds[i]);
        }

        var result = new Dictionary<int, string>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var planningWeekId = reader.GetInt32("planning_week_id");
            if (result.ContainsKey(planningWeekId))
            {
                continue;
            }

            result[planningWeekId] = reader.GetString("action");
        }

        // Important: fermer explicitement le reader avant toute autre requête
        // sur la même connexion MySQL.
        await reader.CloseAsync();

        // Fallback: si aucune action n'est trouvée pour certaines notifications lues,
        // se baser sur le statut courant du planning.
        var missingWeeks = weekIds.Where(id => !result.ContainsKey(id)).Distinct().ToList();
        if (missingWeeks.Count > 0)
        {
            var statusParams = missingWeeks.Select((_, i) => $"@sid{i}").ToList();
            var statusSql = $@"
    SELECT id, statut, workflow_status, workflow_config_id, etape_actuelle,
         (SELECT COALESCE(MAX(e.ordre), 0) FROM workflow_etapes e WHERE e.workflow_config_id = w.workflow_config_id) AS max_ordre,
         EXISTS(
             SELECT 1 FROM workflow_etapes e2
             WHERE e2.workflow_config_id = w.workflow_config_id
             AND UPPER(REPLACE(REPLACE(e2.role, '-', '_'), ' ', '_')) LIKE '%SUPER_ADMIN%'
         ) AS has_super_admin
FROM planning_weeks
WHERE id IN ({string.Join(",", statusParams)});";

            await using var statusCmd = new MySqlCommand(statusSql, connection);
            for (var i = 0; i < missingWeeks.Count; i++)
            {
                statusCmd.Parameters.AddWithValue(statusParams[i], missingWeeks[i]);
            }

            await using var statusReader = await statusCmd.ExecuteReaderAsync();
            while (await statusReader.ReadAsync())
            {
                var wid = statusReader.GetInt32("id");
                var statut = statusReader.IsDBNull(statusReader.GetOrdinal("statut")) ? null : statusReader.GetString("statut");
                var legacy = statusReader.IsDBNull(statusReader.GetOrdinal("workflow_status")) ? null : statusReader.GetString("workflow_status");
                var effective = string.IsNullOrWhiteSpace(statut) ? legacy : statut;
                var etapeActuelle = statusReader.IsDBNull(statusReader.GetOrdinal("etape_actuelle")) ? 0 : statusReader.GetInt32("etape_actuelle");
                var maxOrdre = statusReader.IsDBNull(statusReader.GetOrdinal("max_ordre")) ? 0 : statusReader.GetInt32("max_ordre");
                var hasSuperAdmin = !statusReader.IsDBNull(statusReader.GetOrdinal("has_super_admin"))
                    && Convert.ToInt32(statusReader.GetValue(statusReader.GetOrdinal("has_super_admin"))) == 1;

                if (string.Equals(effective, "VALIDE", StringComparison.OrdinalIgnoreCase))
                {
                    result[wid] = "APPROUVE";
                }
                else if (string.Equals(effective, "REJETE", StringComparison.OrdinalIgnoreCase))
                {
                    result[wid] = "REJETE";
                }
                else if (string.Equals(effective, "BROUILLON", StringComparison.OrdinalIgnoreCase))
                {
                    result[wid] = "DEMANDE_MODIFICATION";
                }
                else if (string.Equals(effective, "EN_ATTENTE_VALIDATION_FINALE", StringComparison.OrdinalIgnoreCase)
                    && !hasSuperAdmin
                    && maxOrdre > 0
                    && etapeActuelle >= maxOrdre)
                {
                    result[wid] = "APPROUVE";
                }
            }
        }

        return result;
    }

    /// <summary>Nombre de notifications non lues pour un utilisateur.</summary>
    public async Task<int> GetUnreadCountAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "SELECT COUNT(*) FROM notifications WHERE user_id = @userId AND lu = 0;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);

        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    /// <summary>Marque une notification comme lue.</summary>
    public async Task<bool> MarkNotificationReadAsync(int notificationId, int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
UPDATE notifications SET lu = 1, date_lecture = @now
WHERE id = @id AND user_id = @userId;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@id", notificationId);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);

        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    /// <summary>Marque toutes les notifications comme lues.</summary>
    public async Task MarkAllNotificationsReadAsync(int userId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = "UPDATE notifications SET lu = 1, date_lecture = @now WHERE user_id = @userId AND lu = 0;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MÉTHODES PRIVÉES HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private static async Task<PlanningWeekWorkflow?> GetWeekWorkflowAsync(
        MySqlConnection conn, string serviceId, DateTime weekStart, MySqlTransaction? tx = null)
    {
        const string sql = @"
SELECT w.id, w.service_id, w.service_name, w.week_start, w.week_end,
       w.statut, w.workflow_config_id, w.etape_actuelle, w.date_soumission,
       w.prochain_validateur_id, w.soumis_par_id, w.soumis_par_nom, w.rejete_motif,
    0 AS assignments_count, NULL AS prochain_validateur_nom, NULL AS prochain_validateur_role
FROM planning_weeks w
WHERE w.service_id = @serviceId AND w.week_start = @weekStart
LIMIT 1;";
        await using var cmd = tx != null
            ? new MySqlCommand(sql, conn, tx)
            : new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@weekStart", weekStart.Date);

        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapWeekWorkflow(reader) : null;
    }

    private static async Task<PlanningWeekWorkflow?> GetWeekWorkflowByIdAsync(
        MySqlConnection conn, int weekId, MySqlTransaction? tx = null)
    {
        const string sql = @"
SELECT w.id, w.service_id, w.service_name, w.week_start, w.week_end,
       w.statut, w.workflow_config_id, w.etape_actuelle, w.date_soumission,
       w.prochain_validateur_id, w.soumis_par_id, w.soumis_par_nom, w.rejete_motif,
    0 AS assignments_count, NULL AS prochain_validateur_nom, NULL AS prochain_validateur_role
FROM planning_weeks w WHERE w.id = @weekId LIMIT 1;";
        await using var cmd = tx != null
            ? new MySqlCommand(sql, conn, tx)
            : new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@weekId", weekId);

        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapWeekWorkflow(reader) : null;
    }

    private static PlanningWeekWorkflow MapWeekWorkflow(MySqlDataReader r)
    {
        var serviceId = r.GetString("service_id");
        return new PlanningWeekWorkflow(
            Id: r.GetInt32("id"),
            ServiceId: serviceId,
            ServiceIdInt: int.TryParse(serviceId, out var sid) ? sid : 0,
            ServiceName: r.GetString("service_name"),
            WeekStart: r.GetDateTime("week_start"),
            WeekEnd: r.GetDateTime("week_end"),
            Statut: r.IsDBNull(r.GetOrdinal("statut")) ? "BROUILLON" : r.GetString("statut"),
            WorkflowConfigId: r.IsDBNull(r.GetOrdinal("workflow_config_id")) ? null : r.GetInt32("workflow_config_id"),
            EtapeActuelle: r.GetInt32("etape_actuelle"),
            DateSoumission: r.IsDBNull(r.GetOrdinal("date_soumission")) ? null : r.GetDateTime("date_soumission"),
            ProchainValidateurId: r.IsDBNull(r.GetOrdinal("prochain_validateur_id")) ? null : r.GetInt32("prochain_validateur_id"),
            ProchainValidateurNom: r.IsDBNull(r.GetOrdinal("prochain_validateur_nom")) ? null : r.GetString("prochain_validateur_nom"),
            ProchainValidateurRole: r.IsDBNull(r.GetOrdinal("prochain_validateur_role")) ? null : r.GetString("prochain_validateur_role"),
            SoumisParId: r.IsDBNull(r.GetOrdinal("soumis_par_id")) ? null : r.GetInt32("soumis_par_id"),
            SoumisParNom: r.IsDBNull(r.GetOrdinal("soumis_par_nom")) ? null : r.GetString("soumis_par_nom"),
            RejetMotif: r.IsDBNull(r.GetOrdinal("rejete_motif")) ? null : r.GetString("rejete_motif"),
            AssignmentsCount: r.GetInt32("assignments_count")
        );
    }

    private static async Task<int> CountAssignmentsAsync(MySqlConnection conn, int weekId, MySqlTransaction tx)
    {
        const string sql = "SELECT COUNT(*) FROM planning_assignments WHERE planning_week_id = @weekId;";
        await using var cmd = new MySqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@weekId", weekId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private static async Task InsertHistoryAsync(
        MySqlConnection conn, int weekId, int etape, int? validateurId, string? validateurNom,
        string action, string? commentaire, MySqlTransaction tx)
    {
        const string sql = @"
INSERT INTO validation_history (planning_week_id, etape, validateur_id, validateur_nom, action, commentaire, date_action)
VALUES (@weekId, @etape, @validateurId, @validateurNom, @action, @commentaire, @now);";
        await using var cmd = new MySqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@weekId", weekId);
        cmd.Parameters.AddWithValue("@etape", etape);
        cmd.Parameters.AddWithValue("@validateurId", validateurId.HasValue ? validateurId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@validateurNom", validateurNom ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@action", action);
        cmd.Parameters.AddWithValue("@commentaire", commentaire ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task InsertNotificationAsync(
        MySqlConnection conn, int userId, string type, string titre, string message,
        int? planningWeekId, int? emetteurId, string? lien, MySqlTransaction tx)
    {
        const string sql = @"
INSERT INTO notifications (user_id, type, titre, message, planning_id, planning_week_id, emetteur_id, lien, date_creation)
VALUES (@userId, @type, @titre, @message, @planningId, @planningWeekId, @emetteurId, @lien, @now);";
        await using var cmd = new MySqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@type", type);
        cmd.Parameters.AddWithValue("@titre", titre);
        cmd.Parameters.AddWithValue("@message", message);
        cmd.Parameters.AddWithValue("@planningId", planningWeekId.HasValue ? planningWeekId.Value : DBNull.Value);  // planning_id = même que planning_week_id
        cmd.Parameters.AddWithValue("@planningWeekId", planningWeekId.HasValue ? planningWeekId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@emetteurId", emetteurId.HasValue ? emetteurId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@lien", lien ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<bool> CreateArretNotificationAsync(
        int recipientUserId,
        string title,
        string message,
        int? planningWeekId,
        int? emetteurId = null,
        string? lien = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        await InsertNotificationAsync(connection, recipientUserId, "ARRET_INFO", title, message, planningWeekId, emetteurId, lien, (MySqlTransaction)tx);

        await tx.CommitAsync();
        return true;
    }

    private static async Task UpdatePlanningNotificationAfterActionAsync(
        MySqlConnection conn,
        int userId,
        int planningWeekId,
        string actionType,
        string actionTitle,
        string actionMessage,
        string? actionLink,
        MySqlTransaction tx)
    {
        const string sql = @"
UPDATE notifications
SET type = @actionType,
    titre = @actionTitle,
    message = @actionMessage,
    lien = @actionLink,
    lu = 1,
    date_lecture = COALESCE(date_lecture, @now)
WHERE user_id = @userId
    AND (planning_week_id = @planningWeekId OR planning_id = @planningWeekId)
  AND type = 'WORKFLOW_SOUMIS';";

        await using var cmd = new MySqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@planningWeekId", planningWeekId);
        cmd.Parameters.AddWithValue("@actionType", actionType);
        cmd.Parameters.AddWithValue("@actionTitle", actionTitle);
        cmd.Parameters.AddWithValue("@actionMessage", actionMessage);
        cmd.Parameters.AddWithValue("@actionLink", actionLink ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Retourne la liste des (email, nomComplet) de tous les utilisateurs actifs d'un service
    /// ayant un e-mail valide, en excluant un utilisateur spécifique.
    /// Le filtre notif_email est ignoré : la case cochée par le validateur vaut acceptation explicite.
    /// </summary>
    private async Task<List<(string Email, string FullName)>> GetServiceUsersEmailsAsync(int serviceId, int excludeUserId)
    {
        var result = new List<(string Email, string FullName)>();
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        const string sql = @"
            SELECT email, nom, prenom
            FROM staff_users
            WHERE service_id = @serviceId AND actif = 1
              AND id != @excludeId AND email IS NOT NULL AND email != ''
            ORDER BY nom, prenom;";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);
        cmd.Parameters.AddWithValue("@excludeId", excludeUserId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            string email  = reader.GetString("email");
            string nom    = reader.IsDBNull(reader.GetOrdinal("nom"))    ? "" : reader.GetString("nom");
            string prenom = reader.IsDBNull(reader.GetOrdinal("prenom")) ? "" : reader.GetString("prenom");
            result.Add((email, $"{prenom} {nom}".Trim()));
        }
        Console.WriteLine($"[Email] GetServiceUsersEmailsAsync service={serviceId} exclude={excludeUserId} → {result.Count} destinataire(s)");
        return result;
    }

    /// <summary>
    /// Retourne (email, nomComplet, notifEnabled) pour un utilisateur actif.
    /// Le paramètre forcerEnvoi = true ignore la préférence notif_email de l'utilisateur.
    /// </summary>
    private async Task<(string Email, string FullName, bool NotifEnabled)> GetUserEmailAsync(int userId, bool forcerEnvoi = false)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        const string sql = "SELECT email, nom, prenom, notif_email FROM staff_users WHERE id = @id AND actif = 1 LIMIT 1;";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@id", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            Console.WriteLine($"[Email] GetUserEmailAsync userId={userId} → utilisateur introuvable ou inactif");
            return (string.Empty, string.Empty, false);
        }

        // Utiliser Convert pour éviter l'exception de GetBoolean() sur TINYINT(1)
        bool notifEmail = !reader.IsDBNull(reader.GetOrdinal("notif_email"))
            && Convert.ToBoolean(reader.GetValue(reader.GetOrdinal("notif_email")));

        string email = !reader.IsDBNull(reader.GetOrdinal("email")) ? reader.GetString("email") : string.Empty;
        string nom    = reader.IsDBNull(reader.GetOrdinal("nom"))    ? "" : reader.GetString("nom");
        string prenom = reader.IsDBNull(reader.GetOrdinal("prenom")) ? "" : reader.GetString("prenom");
        string fullName = $"{prenom} {nom}".Trim();

        // Si forcerEnvoi, on ignore la préférence notif_email
        string emailRetourne = (notifEmail || forcerEnvoi) ? email : string.Empty;
        string statusEnvoi   = string.IsNullOrEmpty(emailRetourne) ? "BLOQUÉ (notif_email=0)" : emailRetourne;
        Console.WriteLine($"[Email] GetUserEmailAsync userId={userId} nom='{fullName}' email='{email}' notif_email={notifEmail} forcerEnvoi={forcerEnvoi} → envoi={statusEnvoi}");
        return (emailRetourne, fullName, notifEmail);
    }

    /// <summary>
    /// Vérifie si un utilisateur donné possède le rôle requis pour une étape.
    /// Utilisé pour décider si le soumetteur peut auto-valider l'étape.
    /// </summary>
    private static async Task<bool> UserHasRoleAsync(
        MySqlConnection conn, int userId, string role, int serviceId,
        MySqlTransaction? tx = null)
    {
        _ = serviceId; // réservé pour filtrage service futur

        // Lire le rôle réel stocké pour l'utilisateur, puis comparer en mode normalisé.
        const string sql = @"
SELECT role
FROM staff_users
WHERE id = @userId AND actif = 1
LIMIT 1;";

        await using var cmd = tx != null
            ? new MySqlCommand(sql, conn, tx)
            : new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@userId", userId);

        var dbRoleObj = await cmd.ExecuteScalarAsync();
        if (dbRoleObj == null || dbRoleObj == DBNull.Value)
            return false;

        var dbRole = dbRoleObj.ToString() ?? string.Empty;
        var dbRoleNorm = NormalizeRoleToken(dbRole);
        var variantsNorm = BuildRoleVariants(role)
            .Select(NormalizeRoleToken)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return variantsNorm.Contains(dbRoleNorm);
    }

    /// <summary>Trouve l'ID du validateur selon son rôle et son service.</summary>
    private static async Task<int?> FindValidateurIdAsync(
        MySqlConnection conn, string role, string? validatorUserId, int serviceId,
        MySqlTransaction? tx = null)
    {
        // Si un validateur spécifique est défini, l'utiliser en priorité
        if (!string.IsNullOrEmpty(validatorUserId) && int.TryParse(validatorUserId, out var specificId))
        {
            return specificId;
        }

        int? poleId = null;
        await using (var poleCmd = tx != null
            ? new MySqlCommand("SELECT pole_id FROM services WHERE id = @serviceId LIMIT 1;", conn, tx)
            : new MySqlCommand("SELECT pole_id FROM services WHERE id = @serviceId LIMIT 1;", conn))
        {
            poleCmd.Parameters.AddWithValue("@serviceId", serviceId);
            var poleResult = await poleCmd.ExecuteScalarAsync();
            if (poleResult != null && poleResult != DBNull.Value)
            {
                poleId = Convert.ToInt32(poleResult);
            }
        }

        // Construire toutes les variantes du rôle à tester
        // Ex: "CHEF_SERVICE" → ["CHEF_SERVICE", "Chef de Service", "Chef Service", "chef-service"]
        var roleVariants = BuildRoleVariants(role);
        var placeholders = string.Join(",", roleVariants.Select((_, i) => $"@r{i}"));

        async Task<int?> ExecuteSingleAsync(string sql, Action<MySqlCommand> bind)
        {
            await using var command = tx != null ? new MySqlCommand(sql, conn, tx) : new MySqlCommand(sql, conn);
            for (int i = 0; i < roleVariants.Count; i++)
                command.Parameters.AddWithValue($"@r{i}", roleVariants[i]);
            bind(command);
            var result = await command.ExecuteScalarAsync();
            return result != null && result != DBNull.Value ? Convert.ToInt32(result) : null;
        }

        if (IsChefServiceRole(role))
        {
            var chefService = await ExecuteSingleAsync(
                $@"
SELECT id FROM staff_users
WHERE role IN ({placeholders}) AND service_id = @serviceId AND actif = 1
ORDER BY id ASC LIMIT 1;",
                cmd => cmd.Parameters.AddWithValue("@serviceId", serviceId));
            if (chefService.HasValue) return chefService;
        }

        if (IsChefPoleRole(role) && poleId.HasValue)
        {
            var chefPole = await ExecuteSingleAsync(
                $@"
SELECT id FROM staff_users
WHERE role IN ({placeholders}) AND pole_id = @poleId AND actif = 1
ORDER BY id ASC LIMIT 1;",
                cmd => cmd.Parameters.AddWithValue("@poleId", poleId.Value));
            if (chefPole.HasValue) return chefPole;
        }

        // 1. Chercher par rôle dans le même service (toutes variantes)
        var sql = $@"
SELECT id FROM staff_users
WHERE role IN ({placeholders}) AND service_id = @serviceId AND actif = 1
ORDER BY id ASC LIMIT 1;";
        await using var cmd = tx != null
            ? new MySqlCommand(sql, conn, tx)
            : new MySqlCommand(sql, conn);
        for (int i = 0; i < roleVariants.Count; i++)
            cmd.Parameters.AddWithValue($"@r{i}", roleVariants[i]);
        cmd.Parameters.AddWithValue("@serviceId", serviceId);

        var result = await cmd.ExecuteScalarAsync();
        if (result != null && result != DBNull.Value) return Convert.ToInt32(result);

        if (poleId.HasValue)
        {
            var sqlPole = $@"
SELECT id FROM staff_users
WHERE role IN ({placeholders}) AND pole_id = @poleId AND actif = 1
ORDER BY id ASC LIMIT 1;";
            await using var cmdPole = tx != null
                ? new MySqlCommand(sqlPole, conn, tx)
                : new MySqlCommand(sqlPole, conn);
            for (int i = 0; i < roleVariants.Count; i++)
                cmdPole.Parameters.AddWithValue($"@r{i}", roleVariants[i]);
            cmdPole.Parameters.AddWithValue("@poleId", poleId.Value);

            var resultPole = await cmdPole.ExecuteScalarAsync();
            if (resultPole != null && resultPole != DBNull.Value) return Convert.ToInt32(resultPole);
        }

        // 2. Fallback : chercher dans tout le staff sans filtre service
        var sql2 = $"SELECT id FROM staff_users WHERE role IN ({placeholders}) AND actif = 1 ORDER BY id ASC LIMIT 1;";
        await using var cmd2 = tx != null
            ? new MySqlCommand(sql2, conn, tx)
            : new MySqlCommand(sql2, conn);
        for (int i = 0; i < roleVariants.Count; i++)
            cmd2.Parameters.AddWithValue($"@r{i}", roleVariants[i]);

        var result2 = await cmd2.ExecuteScalarAsync();
        return result2 != null && result2 != DBNull.Value ? Convert.ToInt32(result2) : null;
    }

    /// <summary>
    /// Normalise un rôle pour comparaison robuste :
    /// - suppression des accents
    /// - suppression des séparateurs (espace, tiret, underscore)
    /// - conservation lettres/chiffres uniquement, en minuscule
    /// Ex: "Chef de Pôle" == "CHEF_POLE" == "chef-pole".
    /// </summary>
    private static string NormalizeRoleToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var formD = value.Normalize(NormalizationForm.FormD);
        var chars = formD
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            .Where(char.IsLetterOrDigit)
            .Select(char.ToLowerInvariant)
            .ToArray();

        return new string(chars);
    }

    private static bool IsSuperAdminRole(string? role)
    {
        var normalized = NormalizeRoleToken(role);
        return normalized.Contains("superadmin", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Convertit un WorkflowConfigItem (couche Workflow) en WorkflowConfigResult (couche Planning)
    /// sans dépendre du helper ToWorkflowConfigResult défini dans Program.cs.
    /// </summary>
    private static WorkflowConfigResult? ToWorkflowConfigResultInternal(Backend.Workflow.WorkflowConfigItem? item) =>
        item is null ? null : new WorkflowConfigResult(
            item.Id, item.ServiceId, item.IsActive,
            item.Steps.Select(s => new WorkflowConfigStepResult(
                s.Id, s.Order, s.Label ?? s.ValidatorRole, s.ValidatorRole,
                s.ValidatorUserId, s.MaxDelayHours, s.IsFinalApproval, s.IsActive)).ToList());

    // ─────────────────────────────────────────────────────────────────────────
    // DIAGNOSTIC
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne les informations de débogage pour un planning donné :
    /// état workflow, config utilisée, prochain validateur, notifications insérées.
    /// À utiliser uniquement pour le diagnostic — ne pas exposer en production.
    /// </summary>
    public async Task<object?> GetPlanningDiagnosticAsync(int weekId)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();

        var week = await GetWeekWorkflowByIdAsync(conn, weekId);
        if (week == null) return null;

        // Récupérer la config utilisée
        Backend.Workflow.WorkflowConfigItem? configItem = null;
        if (week.WorkflowConfigId.HasValue)
            configItem = await GetWorkflowConfigByIdMySqlAsync(week.WorkflowConfigId.Value);

        // Notifications pour le prochain validateur
        List<object> notifRows = [];
        if (week.ProchainValidateurId.HasValue)
        {
            const string notifSql = @"
SELECT id, user_id, type, titre, lu, date_creation
FROM notifications WHERE user_id = @uid ORDER BY date_creation DESC LIMIT 10;";
            await using var cmd = new MySqlCommand(notifSql, conn);
            cmd.Parameters.AddWithValue("@uid", week.ProchainValidateurId.Value);
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                notifRows.Add(new
                {
                    id        = r.GetInt32("id"),
                    userId    = r.GetInt32("user_id"),
                    type      = r.GetString("type"),
                    titre     = r.GetString("titre"),
                    lu        = r.GetBoolean("lu"),
                    dateCreation = r.GetDateTime("date_creation").ToString("o")
                });
        }

        return new
        {
            weekId,
            serviceId        = week.ServiceId,
            serviceIdInt     = week.ServiceIdInt,
            workflowConfigId = week.WorkflowConfigId,
            statut           = week.Statut,
            etapeActuelle    = week.EtapeActuelle,
            prochainValidateurId = week.ProchainValidateurId,
            soumisParId      = week.SoumisParId,
            configFound      = configItem != null,
            configSteps      = configItem?.Steps.Select(s => new
            {
                s.Order, s.ValidatorRole, s.ValidatorUserId, s.IsFinalApproval
            }).ToList(),
            notificationsForProchainValidateur = notifRows
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEBUG : trouve les utilisateurs correspondant à un rôle donné
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Retourne tous les utilisateurs qui correspondent au rôle donné
    /// (via BuildRoleVariants), avec ou sans filtre sur le service.
    /// Utile pour diagnostiquer pourquoi FindValidateurIdAsync retourne null.
    /// </summary>
    public async Task<List<object>> FindUsersByRoleDebugAsync(string role, int serviceId = 0)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();

        var roleVariants = BuildRoleVariants(role);
        var placeholders = string.Join(",", roleVariants.Select((_, i) => $"@r{i}"));

        var sql = $@"
SELECT id, nom, prenom, email, role, service_id, actif
FROM staff_users
WHERE role IN ({placeholders})
ORDER BY actif DESC, id ASC
LIMIT 20;";

        await using var cmd = new MySqlCommand(sql, conn);
        for (int i = 0; i < roleVariants.Count; i++)
            cmd.Parameters.AddWithValue($"@r{i}", roleVariants[i]);

        var result = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new
            {
                id        = reader.GetInt32("id"),
                nom       = reader.IsDBNull(reader.GetOrdinal("nom")) ? null : reader.GetString("nom"),
                prenom    = reader.IsDBNull(reader.GetOrdinal("prenom")) ? null : reader.GetString("prenom"),
                email     = reader.IsDBNull(reader.GetOrdinal("email")) ? null : reader.GetString("email"),
                role      = reader.GetString("role"),
                serviceId = reader.IsDBNull(reader.GetOrdinal("service_id")) ? (int?)null : reader.GetInt32("service_id"),
                actif     = reader.GetBoolean("actif"),
                matchedVariants = roleVariants
            });
        }

        // Si aucun résultat, chercher TOUS les rôles distincts pour aider au diagnostic
        if (result.Count == 0)
        {
            var allRolesSql = "SELECT DISTINCT role FROM staff_users ORDER BY role;";
            await using var allCmd = new MySqlCommand(allRolesSql, conn);
            var allRoles = new List<string>();
            await using var allReader = await allCmd.ExecuteReaderAsync();
            while (await allReader.ReadAsync())
                allRoles.Add(allReader.GetString(0));

            result.Add(new
            {
                id        = -1,
                nom       = (string?)"AUCUN utilisateur trouvé pour ce rôle",
                prenom    = (string?)null,
                email     = (string?)null,
                role      = role,
                serviceId = (int?)null,
                actif     = false,
                matchedVariants = roleVariants,
                allDistinctRolesInDb = allRoles
            });
        }

        return result;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODÈLES DE RETOUR DU WORKFLOW EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

public sealed record PlanningWeekWorkflow(
    int Id,
    string ServiceId,
    int ServiceIdInt,
    string ServiceName,
    DateTime WeekStart,
    DateTime WeekEnd,
    string Statut,
    int? WorkflowConfigId,
    int EtapeActuelle,
    DateTime? DateSoumission,
    int? ProchainValidateurId,
    string? ProchainValidateurNom,
    string? ProchainValidateurRole,
    int? SoumisParId,
    string? SoumisParNom,
    string? RejetMotif,
    int AssignmentsCount
);

public sealed record ValidationHistoryEntry(
    int Id,
    int PlanningWeekId,
    int Etape,
    int? ValidateurId,
    string? ValidateurNom,
    string Action,
    string? Commentaire,
    DateTime DateAction
);

public sealed record NotificationItem(
    int Id,
    int UserId,
    string Type,
    string Titre,
    string Message,
    int? PlanningId,
    int? PlanningWeekId,
    bool Lu,
    DateTime DateCreation,
    DateTime? DateLecture,
    string? Lien,
    int? EmetteurId
);

// DTOs pour les configs (retour du WorkflowStore)
public sealed record WorkflowConfigResult(
    int Id,
    int ServiceId,
    bool IsActive,
    List<WorkflowConfigStepResult> Steps
);

public sealed record WorkflowConfigStepResult(
    int Id,
    int Order,
    string Label,
    string ValidatorRole,
    string? ValidatorUserId,
    int? MaxDelayHours,
    bool IsFinalApproval,
    bool IsActive
);

// DTOs de requête
public sealed record SubmitForValidationRequest(
    string ServiceId,
    string ServiceName,
    string WeekStart,
    string? Message
);

public sealed record ApprouverRequest(string? Commentaire);
public sealed record RejeterRequest(string Motif, string? Commentaire);
public sealed record ModificationRequest(string Instructions);
