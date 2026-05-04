namespace Backend.Planning;

public sealed class PlanningAssignment
{
    public string Id { get; set; } = string.Empty;
    public string PersonnelId { get; set; } = string.Empty;
    public int Day { get; set; }
    public string ShiftType { get; set; } = "jour";
    public string? PosteId { get; set; }
    public string? PosteLabel { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public string? Note { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public sealed class PersonnelInfo
{
    public string Id { get; set; } = string.Empty;
    public string Nom { get; set; } = string.Empty;
    public string Prenom { get; set; } = string.Empty;
    public string Poste { get; set; } = "Personnel";
    public string? Specialite { get; set; }
    public string? Photo { get; set; }
    public List<int> CompetenceIds { get; set; } = [];
}

public sealed class PlanningRule
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public object? Value { get; set; }
    public bool Active { get; set; }
}

public sealed class PlanningConflict
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "double_affectation";
    public string Description { get; set; } = string.Empty;
    public string Severity { get; set; } = "warning";
    public List<string> Assignments { get; set; } = [];
    public string? PersonnelId { get; set; }
    public int? Day { get; set; }
    public string? SuggestedFix { get; set; }
    public string? Details { get; set; }
}

public sealed class PlanningVersion
{
    public string Id { get; set; } = string.Empty;
    /// <summary>Alias for Id (GUID from version_id column)</summary>
    public string VersionId { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public string ServiceId { get; set; } = string.Empty;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string VersionLabel { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string Author { get; set; } = "Gestionnaire";
    public int AssignmentsCount { get; set; }
    public string? Comment { get; set; }
}

public sealed class PlanningHistoryEntry
{
    public string Id { get; set; } = string.Empty;
    public DateTime At { get; set; }
    public string Author { get; set; } = "Système";
    public string Action { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
}

public sealed class PlanningData
{
    public string Id { get; set; } = string.Empty;
    public string ServiceId { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public DateTime WeekStart { get; set; }
    public DateTime WeekEnd { get; set; }
    public string? WorkflowStatus { get; set; }
    public int? WorkflowId { get; set; }
    public int? WeekWorkflowId { get; set; }
    public bool CanSubmit { get; set; } = true;
    public string? SubmittedBy { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public List<PlanningAssignment> Assignments { get; set; } = [];
    public List<PersonnelInfo> Personnel { get; set; } = [];
    public List<PlanningRule> Rules { get; set; } = [];
    public List<PlanningConflict> Conflicts { get; set; } = [];
    public List<PlanningHistoryEntry> History { get; set; } = [];
}

public sealed class SaveAssignmentRequest
{
    public string ServiceId { get; set; } = string.Empty;
    public string? ServiceName { get; set; }
    public DateTime WeekStart { get; set; }
    public DateTime? WeekEnd { get; set; }
    public PlanningAssignment Assignment { get; set; } = new();
}

public sealed class ReplaceAssignmentsRequest
{
    public string ServiceId { get; set; } = string.Empty;
    public string? ServiceName { get; set; }
    public DateTime WeekStart { get; set; }
    public DateTime? WeekEnd { get; set; }
    public List<PlanningAssignment> Assignments { get; set; } = [];
}

public sealed class ValidatePlanningRequest
{
    public string ServiceId { get; set; } = string.Empty;
    public string? ServiceName { get; set; }
    public DateTime WeekStart { get; set; }
    public DateTime? WeekEnd { get; set; }
    public List<PlanningAssignment>? Assignments { get; set; }
}

public sealed class SavePlanningVersionRequest
{
    public string ServiceId { get; set; } = string.Empty;
    public string? ServiceName { get; set; }
    public DateTime WeekStart { get; set; }
    public DateTime? WeekEnd { get; set; }
    public string? Author { get; set; }
    public string? Comment { get; set; }
    public int AssignmentsCount { get; set; }
}

public sealed class GeneratePlanningConstraints
{
    public bool UserAcceptedMandatoryRules { get; set; }
    public DateTime? UserAcceptedAtUtc { get; set; }

    public bool RequirePostCoverage { get; set; } = false;
    public bool EnforceSlotIncompatibilities { get; set; } = true;
    public bool RespectReposLegaux { get; set; } = true;
    public bool CompetencesObligatoires { get; set; } = true;
    public bool EnforceBlockingUnavailabilities { get; set; } = true;
    public bool EnforceMaxDailyDuration12h { get; set; } = true;
    public bool EnforceSecurityRestAfterGuardOrNight { get; set; } = true;
    public bool EnforceMaxConsecutiveDays6 { get; set; } = true;
    public bool EnforceWeeklyRest35hSimplified { get; set; } = true;
    public bool EnforceMonthlyNightQuota { get; set; } = true;
    public bool PreserveLockedAssignments { get; set; } = true;
    public int MaxMonthlyNightShifts { get; set; } = 4;
    public bool PrioriserDisponibilites { get; set; } = true;

    public List<string> GetUnacceptedMandatoryRules()
    {
        var missing = new List<string>();

        if (!UserAcceptedMandatoryRules)
        {
            missing.Add("user_accepted_mandatory_rules");
        }
        else if (!UserAcceptedAtUtc.HasValue)
        {
            missing.Add("user_accepted_at_utc");
        }

        if (!RequirePostCoverage)
        {
            missing.Add("require_post_coverage");
        }

        if (!EnforceSlotIncompatibilities)
        {
            missing.Add("enforce_slot_incompatibilities");
        }

        if (!CompetencesObligatoires)
        {
            missing.Add("competences_obligatoires");
        }

        if (!EnforceBlockingUnavailabilities)
        {
            missing.Add("enforce_blocking_unavailabilities");
        }

        if (!EnforceMaxDailyDuration12h)
        {
            missing.Add("enforce_max_daily_duration_12h");
        }

        if (!EnforceSecurityRestAfterGuardOrNight)
        {
            missing.Add("enforce_security_rest_after_guard_or_night");
        }

        if (!EnforceMaxConsecutiveDays6)
        {
            missing.Add("enforce_max_consecutive_days_6");
        }

        if (!EnforceWeeklyRest35hSimplified)
        {
            missing.Add("enforce_weekly_rest_35h_simplified");
        }

        if (!EnforceMonthlyNightQuota)
        {
            missing.Add("enforce_monthly_night_quota");
        }

        if (!PreserveLockedAssignments)
        {
            missing.Add("preserve_locked_assignments");
        }

        return missing;
    }
}

public sealed class GeneratePlanningRequest
{
    public int ServiceId { get; set; }
    public DateTime WeekStart { get; set; }
    public DateTime WeekEnd { get; set; }
    public GeneratePlanningConstraints Constraints { get; set; } = new();
}

public sealed class GeneratePlanningResponse
{
    public List<PlanningAssignment> Assignments { get; set; } = [];
    public bool Partial { get; set; }
    public string? Message { get; set; }
    public List<PlanningConflict> Conflicts { get; set; } = [];
    public int QualityScore { get; set; }
}

public sealed class PlanningOverviewRow
{
    public string PlanningId { get; set; } = string.Empty;
    public int PlanningWeekId { get; set; }
    public string ServiceId { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public DateTime WeekStart { get; set; }
    public DateTime WeekEnd { get; set; }
    public int? DbAssignmentPk { get; set; }
    public string? AssignmentId { get; set; }
    public string? PersonnelId { get; set; }
    public int? DayIndex { get; set; }
    public string? ShiftType { get; set; }
    public string? PosteId { get; set; }
    public string? PosteLabel { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public string? Note { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public sealed class UserTimeCounters
{
    public int UserId { get; set; }
    public decimal SoldeRcPlus { get; set; }
    public decimal SoldeRcMoins { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class CreateUserPlanningRequestDto
{
    public int UserId { get; set; }
    public int ServiceId { get; set; }
    public DateTime Date { get; set; }
    public DateTime? DateFin { get; set; }
    public string Type { get; set; } = string.Empty;
    public string HeureDebut { get; set; } = string.Empty;
    public string HeureFin { get; set; } = string.Empty;
    public string? Commentaire { get; set; }
    public string? SourceAssignmentId { get; set; }
}

public sealed class UserPlanningRequestActionDto
{
    public int ValidatorId { get; set; }
    public string ValidatorName { get; set; } = string.Empty;
    public string? Motif { get; set; }
}

public sealed class DemandeApiAccessDto
{
    public int ActingUserId { get; set; }
}

public sealed class DemandeCreateApiDto
{
    public int ActingUserId { get; set; }
    public CreateUserPlanningRequestDto Demande { get; set; } = new();
}

public sealed class DemandeActionApiDto
{
    public int ActingUserId { get; set; }
    public UserPlanningRequestActionDto Action { get; set; } = new();
}

public sealed class UserPlanningRequestItem
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int ServiceId { get; set; }
    public DateTime Date { get; set; }
    public DateTime? DateFin { get; set; }
    public string Type { get; set; } = string.Empty;
    public string HeureDebut { get; set; } = string.Empty;
    public string HeureFin { get; set; } = string.Empty;
    public decimal DureeHeures { get; set; }
    public string? Commentaire { get; set; }
    public string Statut { get; set; } = string.Empty;
    public string? MotifRejet { get; set; }
    public int? TraitePar { get; set; }
    public DateTime? TraiteLe { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? SourceAssignmentId { get; set; }
    public int? ValidePar { get; set; }
    public string? ValideParNom { get; set; }
    public DateTime? DateValidation { get; set; }
}

public sealed class DemandeHistoriqueItem
{
    public int Id { get; set; }
    public int DemandeId { get; set; }
    public string Action { get; set; } = string.Empty;
    public int? ActeurId { get; set; }
    public string? ActeurNom { get; set; }
    public string? Commentaire { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class DemandeTypeDefinition
{
    public string Code { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Color { get; set; } = "#64748b";
    public string Impact { get; set; } = "neutral";
    public bool IsRequestable { get; set; }
}
