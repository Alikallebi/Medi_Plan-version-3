using MySqlConnector;
using Backend.Workflow;

namespace Backend.Planning;

/// <summary>
/// Gère le CRUD des configurations de workflow dans les tables MySQL
/// workflow_configs et workflow_etapes.
/// Ces méthodes remplacent le stockage SQLite (EF Core) de WorkflowStore
/// pour que toute la persistance workflow soit dans la même base MySQL.
/// </summary>
public sealed partial class PlanningStore
{
    // ─────────────────────────────────────────────────────────────────────────
    // LECTURE
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Retourne toutes les configurations de workflow (actives et inactives).</summary>
    public async Task<List<WorkflowConfigItem>> GetAllWorkflowConfigsMySqlAsync()
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        return await LoadConfigsAsync(conn, serviceId: null, id: null);
    }

    /// <summary>Retourne la configuration active d'un service (404 si aucune).</summary>
    public async Task<WorkflowConfigItem?> GetWorkflowConfigByServiceMySqlAsync(int serviceId)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        var list = await LoadConfigsAsync(conn, serviceId: serviceId, id: null, activeOnly: true);
        // Si aucune config active, essayer sans filtre actif (para compat)
        if (list.Count == 0)
            list = await LoadConfigsAsync(conn, serviceId: serviceId, id: null, activeOnly: false);
        return list.FirstOrDefault();
    }

    /// <summary>
    /// Recherche une config de workflow par service_id (entier OU chaîne comme "cardiologie").
    /// Essaie d'abord la clé numérique, puis cherche par service_nom.
    /// </summary>
    public async Task<WorkflowConfigItem?> GetWorkflowConfigByServiceStrAsync(string serviceId)
    {
        // 1. Si l'ID est numérique, utiliser la méthode standard
        if (int.TryParse(serviceId, out var sid))
            return await GetWorkflowConfigByServiceMySqlAsync(sid);

        // 2. Sinon, chercher par service_nom (ex. "cardiologie")
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        var list = await LoadConfigsByNameAsync(conn, serviceId, activeOnly: true);
        if (list.Count == 0)
            list = await LoadConfigsByNameAsync(conn, serviceId, activeOnly: false);
        return list.FirstOrDefault();
    }

    private static async Task<List<WorkflowConfigItem>> LoadConfigsByNameAsync(
        MySqlConnection conn, string serviceName, bool activeOnly = false)
    {
        var activeClause = activeOnly ? " AND c.actif = 1" : string.Empty;
        var sql = $@"
SELECT
    c.id,
    c.service_id,
    c.service_nom,
    c.actif,
    c.created_at,
    c.updated_at,
    e.id         AS etape_id,
    e.ordre,
    e.role,
    e.label,
    e.validateur_specifique_id,
    e.delai_heures
FROM workflow_configs c
LEFT JOIN workflow_etapes e ON e.workflow_config_id = c.id
WHERE (LOWER(c.service_nom) = LOWER(@nom) OR LOWER(c.service_nom) LIKE LOWER(@nomLike)){activeClause}
ORDER BY c.id DESC, e.ordre ASC;";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@nom", serviceName);
        cmd.Parameters.AddWithValue("@nomLike", $"%{serviceName}%");
        return await ReadConfigsFromReaderAsync(cmd);
    }

    /// <summary>Retourne une configuration par son identifiant interne.</summary>
    public async Task<WorkflowConfigItem?> GetWorkflowConfigByIdMySqlAsync(int id)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        var list = await LoadConfigsAsync(conn, serviceId: null, id: id);
        return list.FirstOrDefault();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRÉATION
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Crée une nouvelle configuration de workflow pour un service.
    /// Désactive automatiquement les configs précédentes du même service.
    /// </summary>
    public async Task<WorkflowConfigItem> CreateWorkflowConfigMySqlAsync(CreateWorkflowConfigDTO dto)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        // 1. Désactiver les anciennes configs du même service
        await using (var deactivate = new MySqlCommand(
            "UPDATE workflow_configs SET actif = 0, updated_at = @now WHERE service_id = @sid;", conn, tx))
        {
            deactivate.Parameters.AddWithValue("@sid", dto.ServiceId);
            deactivate.Parameters.AddWithValue("@now", DateTime.UtcNow);
            await deactivate.ExecuteNonQueryAsync();
        }

        // 2. Insérer la nouvelle config
        const string insertConfig = @"
INSERT INTO workflow_configs (service_id, service_nom, actif, created_at, updated_at)
VALUES (@sid, @nom, @actif, @now, @now);
SELECT LAST_INSERT_ID();";
        int configId;
        await using (var cmd = new MySqlCommand(insertConfig, conn, tx))
        {
            cmd.Parameters.AddWithValue("@sid", dto.ServiceId);
            cmd.Parameters.AddWithValue("@nom", dto.ServiceName);
            cmd.Parameters.AddWithValue("@actif", dto.IsActive ? 1 : 0);
            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
            configId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }

        // 3. Résoudre les validateurs réels puis insérer les étapes
        var resolvedEtapes = await ResolveWorkflowEtapesAsync(conn, tx, dto.ServiceId, dto.Etapes);
        await InsertEtapesMySqlAsync(conn, tx, configId, resolvedEtapes);

        await tx.CommitAsync();

        return (await GetWorkflowConfigByIdMySqlAsync(configId))!;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MISE À JOUR
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Met à jour la configuration (en-tête + étapes).
    /// Les anciennes étapes sont supprimées et remplacées par les nouvelles.
    /// Retourne null si l'id n'existe pas.
    /// </summary>
    public async Task<WorkflowConfigItem?> UpdateWorkflowConfigMySqlAsync(int id, CreateWorkflowConfigDTO dto)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        // 1. Mettre à jour l'en-tête
        const string updateConfig = @"
UPDATE workflow_configs
SET service_nom = @nom, actif = @actif, updated_at = @now
WHERE id = @id;";
        await using (var cmd = new MySqlCommand(updateConfig, conn, tx))
        {
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@nom", dto.ServiceName);
            cmd.Parameters.AddWithValue("@actif", dto.IsActive ? 1 : 0);
            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
            var affected = await cmd.ExecuteNonQueryAsync();
            if (affected == 0)
            {
                await tx.RollbackAsync();
                return null;
            }
        }

        // 2. Supprimer les anciennes étapes
        await using (var cmd = new MySqlCommand(
            "DELETE FROM workflow_etapes WHERE workflow_config_id = @id;", conn, tx))
        {
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        // 3. Réinsérer les nouvelles étapes avec les validateurs résolus
        var resolvedEtapes = await ResolveWorkflowEtapesAsync(conn, tx, dto.ServiceId, dto.Etapes);
        await InsertEtapesMySqlAsync(conn, tx, id, resolvedEtapes);

        await tx.CommitAsync();
        return await GetWorkflowConfigByIdMySqlAsync(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPPRESSION
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Supprime une configuration et toutes ses étapes (CASCADE).
    /// Retourne false si l'id n'existe pas.
    /// </summary>
    public async Task<bool> DeleteWorkflowConfigMySqlAsync(int id)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();

        // Les étapes sont supprimées en cascade via la FK (ON DELETE CASCADE)
        await using var cmd = new MySqlCommand(
            "DELETE FROM workflow_configs WHERE id = @id;", conn);
        cmd.Parameters.AddWithValue("@id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVATION / DÉSACTIVATION
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Active une configuration et désactive les autres configs du même service.
    /// Retourne null si la config n'existe pas.
    /// </summary>
    public async Task<WorkflowConfigItem?> ActivateWorkflowConfigMySqlAsync(int id)
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        // Trouver le service_id
        int serviceId;
        await using (var cmd = new MySqlCommand(
            "SELECT service_id FROM workflow_configs WHERE id = @id;", conn, tx))
        {
            cmd.Parameters.AddWithValue("@id", id);
            var result = await cmd.ExecuteScalarAsync();
            if (result == null || result == DBNull.Value)
            {
                await tx.RollbackAsync();
                return null;
            }
            serviceId = Convert.ToInt32(result);
        }

        // Désactiver toutes les configs du même service
        await using (var cmd = new MySqlCommand(
            "UPDATE workflow_configs SET actif = 0, updated_at = @now WHERE service_id = @sid;", conn, tx))
        {
            cmd.Parameters.AddWithValue("@sid", serviceId);
            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync();
        }

        // Activer uniquement cette config
        await using (var cmd = new MySqlCommand(
            "UPDATE workflow_configs SET actif = 1, updated_at = @now WHERE id = @id;", conn, tx))
        {
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return await GetWorkflowConfigByIdMySqlAsync(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVÉS
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Charge les configs depuis MySQL en une seule requête (JOIN configs + étapes).
    /// </summary>
    private static async Task<List<WorkflowConfigItem>> LoadConfigsAsync(
        MySqlConnection conn,
        int? serviceId,
        int? id,
        bool activeOnly = false)
    {
        var conditions = new List<string>();
        if (serviceId.HasValue) conditions.Add("c.service_id = @serviceId");
        if (id.HasValue)        conditions.Add("c.id = @id");
        if (activeOnly)         conditions.Add("c.actif = 1");

        var where = conditions.Count > 0
            ? "WHERE " + string.Join(" AND ", conditions)
            : string.Empty;

        var sql = $@"
SELECT
    c.id,
    c.service_id,
    c.service_nom,
    c.actif,
    c.created_at,
    c.updated_at,
    e.id         AS etape_id,
    e.ordre,
    e.role,
    e.label,
    e.validateur_specifique_id,
    e.delai_heures
FROM workflow_configs c
LEFT JOIN workflow_etapes e ON e.workflow_config_id = c.id
{where}
ORDER BY c.id DESC, e.ordre ASC;";

        await using var cmd = new MySqlCommand(sql, conn);
        if (serviceId.HasValue) cmd.Parameters.AddWithValue("@serviceId", serviceId.Value);
        if (id.HasValue)        cmd.Parameters.AddWithValue("@id", id.Value);

        return await ReadConfigsFromReaderAsync(cmd);
    }

    /// <summary>
    /// Lit le résultat d'une requête JOIN configs+étapes et construit les WorkflowConfigItem.
    /// </summary>
    private static async Task<List<WorkflowConfigItem>> ReadConfigsFromReaderAsync(MySqlCommand cmd)
    {
        // Dictionnaire ordonné pour conserver l'ordre DESC des configs
        var configs = new Dictionary<int, WorkflowConfigItem>();
        var stepsMap = new Dictionary<int, List<WorkflowConfigEtapeItem>>();

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var cid = reader.GetInt32("id");

            if (!configs.ContainsKey(cid))
            {
                var steps = new List<WorkflowConfigEtapeItem>();
                stepsMap[cid] = steps;
                configs[cid] = new WorkflowConfigItem
                {
                    Id            = cid,
                    ServiceId     = reader.GetInt32("service_id"),
                    ServiceName   = reader.IsDBNull(reader.GetOrdinal("service_nom"))
                                        ? string.Empty
                                        : reader.GetString("service_nom"),
                    IsActive      = reader.GetBoolean("actif"),
                    Version       = 1,
                    SuperAdminFinalRequired = true,
                    CreatedBy     = "système",
                    CreatedAt     = reader.GetDateTime("created_at"),
                    UpdatedAt     = reader.IsDBNull(reader.GetOrdinal("updated_at"))
                                        ? null
                                        : reader.GetDateTime("updated_at"),
                    Steps         = steps           // liste mutable — on la remplit ci-dessous
                };
            }

            // Étape (NULL si config sans étapes → LEFT JOIN)
            if (!reader.IsDBNull(reader.GetOrdinal("etape_id")))
            {
                var role = reader.IsDBNull(reader.GetOrdinal("role"))
                    ? string.Empty
                    : reader.GetString("role");

                var isFinal =
                    role.Contains("SUPER_ADMIN",   StringComparison.OrdinalIgnoreCase) ||
                    role.Contains("super-admin",   StringComparison.OrdinalIgnoreCase) ||
                    role.Contains("SUPER ADMIN",   StringComparison.OrdinalIgnoreCase);

                stepsMap[cid].Add(new WorkflowConfigEtapeItem
                {
                    Id              = reader.GetInt32("etape_id"),
                    Order           = reader.GetInt32("ordre"),
                    Label           = reader.IsDBNull(reader.GetOrdinal("label"))
                                          ? role
                                          : reader.GetString("label"),
                    ValidatorRole   = role,
                    ValidatorUserId = reader.IsDBNull(reader.GetOrdinal("validateur_specifique_id"))
                                          ? null
                                          : reader.GetInt32("validateur_specifique_id").ToString(),
                    MaxDelayHours   = reader.IsDBNull(reader.GetOrdinal("delai_heures"))
                                          ? null
                                          : reader.GetInt32("delai_heures"),
                    IsFinalApproval = isFinal,
                    IsActive        = true
                });
            }
        }

        return configs.Values
                      .Select(c => c with { Steps = stepsMap[c.Id] })
                      .ToList();
    }

    /// <summary>Insère une liste d'étapes pour une configuration donnée.</summary>
    private static async Task InsertEtapesMySqlAsync(
        MySqlConnection conn,
        MySqlTransaction tx,
        int configId,
        IEnumerable<WorkflowConfigEtapeDTO> etapes)
    {
        const string sql = @"
INSERT INTO workflow_etapes
    (workflow_config_id, ordre, role, label, validateur_specifique_id, delai_heures, created_at, updated_at)
VALUES
    (@configId, @ordre, @role, @label, @validateurId, @delai, @now, @now);";

        foreach (var e in etapes)
        {
            await using var cmd = new MySqlCommand(sql, conn, tx);
            cmd.Parameters.AddWithValue("@configId",    configId);
            cmd.Parameters.AddWithValue("@ordre",       e.Ordre);
            cmd.Parameters.AddWithValue("@role",        e.RoleValidateur);
            cmd.Parameters.AddWithValue("@label",       e.Label);
            cmd.Parameters.AddWithValue("@validateurId",
                e.ValidateurSpecifiqueId.HasValue
                    ? e.ValidateurSpecifiqueId.Value
                    : DBNull.Value);
            cmd.Parameters.AddWithValue("@delai",
                e.DelaiMaxHeures.HasValue
                    ? e.DelaiMaxHeures.Value
                    : DBNull.Value);
            cmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    /// <summary>
    /// Résout automatiquement l'ID du validateur pour chaque étape selon son rôle,
    /// le service sélectionné et le pôle associé au service.
    /// </summary>
    private static async Task<List<WorkflowConfigEtapeDTO>> ResolveWorkflowEtapesAsync(
        MySqlConnection conn,
        MySqlTransaction tx,
        int serviceId,
        IEnumerable<WorkflowConfigEtapeDTO> etapes)
    {
        int? poleId = null;
        await using (var poleCmd = new MySqlCommand("SELECT pole_id FROM services WHERE id = @serviceId LIMIT 1;", conn, tx))
        {
            poleCmd.Parameters.AddWithValue("@serviceId", serviceId);
            var result = await poleCmd.ExecuteScalarAsync();
            if (result != null && result != DBNull.Value)
            {
                poleId = Convert.ToInt32(result);
            }
        }

        var resolved = new List<WorkflowConfigEtapeDTO>();
        foreach (var etape in etapes)
        {
            var validatorId = etape.ValidateurSpecifiqueId ?? await ResolveValidatorIdAsync(conn, tx, etape.RoleValidateur, serviceId, poleId);
            resolved.Add(etape with { ValidateurSpecifiqueId = validatorId });
        }

        return resolved;
    }

    /// <summary>
    /// Trouve l'utilisateur responsable d'un rôle pour un service donné.
    /// CHEF_SERVICE → staff affecté au service.
    /// CHEF_POLE → staff affecté au pôle du service.
    /// Fallback → premier staff actif du rôle.
    /// </summary>
    private static async Task<int?> ResolveValidatorIdAsync(
        MySqlConnection conn,
        MySqlTransaction tx,
        string role,
        int serviceId,
        int? poleId)
    {
        var roleVariants = BuildRoleVariants(role);
        var placeholders = string.Join(",", roleVariants.Select((_, i) => $"@r{i}"));

        async Task<int?> ExecuteSingleAsync(string sql, Action<MySqlCommand> bind)
        {
            await using var cmd = new MySqlCommand(sql, conn, tx);
            for (int i = 0; i < roleVariants.Count; i++)
            {
                cmd.Parameters.AddWithValue($"@r{i}", roleVariants[i]);
            }
            bind(cmd);
            var result = await cmd.ExecuteScalarAsync();
            return result != null && result != DBNull.Value ? Convert.ToInt32(result) : null;
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

    private static bool IsChefServiceRole(string role)
    {
        return role.Contains("CHEF_SERVICE", StringComparison.OrdinalIgnoreCase)
            || role.Contains("CHEF SERVICE", StringComparison.OrdinalIgnoreCase)
            || role.Contains("Chef de Service", StringComparison.OrdinalIgnoreCase)
            || role.Contains("chef-service", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsChefPoleRole(string role)
    {
        return role.Contains("CHEF_POLE", StringComparison.OrdinalIgnoreCase)
            || role.Contains("CHEF POLE", StringComparison.OrdinalIgnoreCase)
            || role.Contains("Chef de Pôle", StringComparison.OrdinalIgnoreCase)
            || role.Contains("Chef de Pole", StringComparison.OrdinalIgnoreCase)
            || role.Contains("chef-pole", StringComparison.OrdinalIgnoreCase);
    }

    private static List<string> BuildRoleVariants(string role)
    {
        var variants = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            role,
            role.ToUpper().Replace("-", "_").Replace(" ", "_"),
            role.ToLower().Replace("_", "-").Replace(" ", "-"),
            role.Replace("_", " "),
            role.Replace("_", " ").Replace("de ", "de "),
        };

        if (role.Equals("CHEF_SERVICE", StringComparison.OrdinalIgnoreCase))
        {
            variants.Add("Chef de Service");
            variants.Add("Chef Service");
        }

        if (role.Equals("CHEF_POLE", StringComparison.OrdinalIgnoreCase))
        {
            variants.Add("Chef de Pôle");
            variants.Add("Chef de Pole");
            variants.Add("Chef Pole");
        }

        return variants.Where(v => !string.IsNullOrWhiteSpace(v)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>
    /// Backfill les étapes existantes qui n'ont pas encore d'ID de validateur spécifique.
    /// Utile pour les configs déjà enregistrées avant la résolution automatique.
    /// </summary>
    public async Task<int> BackfillExistingWorkflowValidatorIdsAsync()
    {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        // Charger d'abord les configs hors transaction pour éviter le conflit
        // "command transaction is not the connection's active transaction"
        // sur MySqlConnector lors d'un ExecuteReader concurrent.
        var configs = await LoadConfigsAsync(conn, serviceId: null, id: null, activeOnly: false);

        await using var tx = await conn.BeginTransactionAsync();
        var updatedCount = 0;

        foreach (var config in configs)
        {
            int? poleId = null;
            await using (var poleCmd = new MySqlCommand("SELECT pole_id FROM services WHERE id = @serviceId LIMIT 1;", conn, tx))
            {
                poleCmd.Parameters.AddWithValue("@serviceId", config.ServiceId);
                var poleResult = await poleCmd.ExecuteScalarAsync();
                if (poleResult != null && poleResult != DBNull.Value)
                {
                    poleId = Convert.ToInt32(poleResult);
                }
            }

            foreach (var step in config.Steps)
            {
                if (!string.IsNullOrWhiteSpace(step.ValidatorUserId))
                {
                    continue;
                }

                var resolvedId = await ResolveValidatorIdAsync(
                    conn,
                    tx,
                    step.ValidatorRole,
                    config.ServiceId,
                    poleId);

                if (!resolvedId.HasValue)
                {
                    continue;
                }

                await using var updateCmd = new MySqlCommand(@"
UPDATE workflow_etapes
SET validateur_specifique_id = @validateurId,
    updated_at = @now
WHERE id = @id;", conn, tx);
                updateCmd.Parameters.AddWithValue("@validateurId", resolvedId.Value);
                updateCmd.Parameters.AddWithValue("@now", DateTime.UtcNow);
                updateCmd.Parameters.AddWithValue("@id", step.Id);
                updatedCount += await updateCmd.ExecuteNonQueryAsync();
            }
        }

        await tx.CommitAsync();
        return updatedCount;
    }
}
