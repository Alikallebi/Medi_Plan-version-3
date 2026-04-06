
using System.Text.Json.Serialization;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Backend.Workflow;

// ========== ENUMS ==========

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum WorkflowStatut
{
    BROUILLON,
    EN_ATTENTE_VALIDATION_N1,
    EN_ATTENTE_VALIDATION_N2,
    EN_ATTENTE_VALIDATION_RH,
    VALIDE,
    REJETE,
    EN_CORRECTION
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ActionType
{
    APPROBATION,
    REJET,
    RETOUR_CORRECTION,
    REASSIGNATION,
    SOUMISSION,
    CREATION,
    MODIFICATION
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NotificationType
{
    WORKFLOW_SUBMITTED,
    WORKFLOW_APPROVED,
    WORKFLOW_REJECTED,
    WORKFLOW_REMINDER,
    VERSION_CREATED,
    WORKFLOW_MODIFICATION_REQUESTED
}

// ========== ENTITES PRINCIPALES ==========

public record PlanningWorkflow
{
    public int Id { get; init; }
    public string ServiceId { get; init; } = string.Empty;
    public string ServiceName { get; init; } = string.Empty;
    public DateTime WeekStart { get; init; }
    public DateTime? WeekEnd { get; init; }
    public WorkflowStatut Statut { get; init; }
    public int EtapeActuelle { get; init; } = 1;
    public List<AssignmentItem>? Assignments { get; init; }
    public DateTime CreatedAt { get; init; }
    public string CreatedBy { get; init; } = string.Empty;
    public DateTime? SubmittedAt { get; init; }
}

public record AssignmentItem
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string UserId { get; init; } = string.Empty;
    public string UserName { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public DateTime Start { get; init; }
    public DateTime End { get; init; }
    public string? Color { get; init; }
    public string? PosteId { get; init; }
}

public record ValidationStatus
{
    public bool CanApprove { get; init; }
    public bool CanReject { get; init; }
    public bool CanRequestChange { get; init; }
    public string? Message { get; init; }
}

public record ValidationHistoryItem
{
    public int Id { get; init; }
    public int PlanningId { get; init; }
    public int EtapeOrdre { get; init; }
    public ActionType Action { get; init; }
    public string ValidatorId { get; init; } = string.Empty;
    public string ValidatorName { get; init; } = string.Empty;
    public string? Commentaire { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record WorkflowEtape
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int Order { get; init; }
    public string ValidatorRole { get; init; } = string.Empty;
    public int? MaxDelayHours { get; init; }
    public bool IsActive { get; init; } = true;
}

public record WorkflowComment
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string PlanningId { get; init; } = string.Empty;
    public int? EtapeOrdre { get; init; }
    public string AuteurNom { get; init; } = string.Empty;
    public string AuteurRole { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public record WorkflowAttachment
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string PlanningId { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public string FileType { get; init; } = string.Empty;
    public long Size { get; init; }
    public string UploadedBy { get; init; } = string.Empty;
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
    public string? DataUrl { get; init; }
}

// ========== DTOs ==========

public record ApprobationDTO
{
    public string Commentaire { get; init; } = string.Empty;
    public bool NotifierCreateur { get; init; }
    public bool NotifierAutresValidateurs { get; init; }
}

public record RejetDTO
{
    public string Motif { get; init; } = string.Empty;
    public string Commentaire { get; init; } = string.Empty;
    public DateTime? DateLimite { get; init; }
}

public record DemandeModificationDTO
{
    public string Instructions { get; init; } = string.Empty;
    public string Priorite { get; init; } = "normale";
    public DateTime? DateRetour { get; init; }
    public bool NotifierCreateur { get; init; } = true;
}

public record DashboardStats
{
    public int PlanningsEnAttente { get; init; }
    public int PlanningsValides { get; init; }
    public int PlanningsRejetes { get; init; }
    public int PlanningsBloques { get; init; }
    public double TempsMoyenValidation { get; init; }
    public List<EvolutionPoint> Evolution { get; init; } = new();
}

public record EvolutionPoint
{
    public string Label { get; init; } = string.Empty;
    public int Value { get; init; }
}

public record BlockedPlanning
{
    public int Id { get; init; }
    public string ServiceName { get; init; } = string.Empty;
    public DateTime WeekStart { get; init; }
    public int JoursBloques { get; init; }
    public string EtapeBloquee { get; init; } = string.Empty;
    public string? Motif { get; init; }
}

public record ValidatorPerformance
{
    public string Name { get; init; } = string.Empty;
    public int TotalValidations { get; init; }
    public double TempsMoyen { get; init; }
    public string Performance { get; init; } = "average";
}

public record AuditTrailEvent
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string Type { get; init; } = string.Empty;
    public string User { get; init; } = string.Empty;
    public string? PlanningId { get; init; }
    public string Description { get; init; } = string.Empty;
    public DateTime Timestamp { get; init; } = DateTime.UtcNow;
    public object? Details { get; init; }
}

public record WorkflowNotification
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Column("user_id")]
    public string UserId { get; set; } = string.Empty;

    [Column("type")]
    public int Type { get; set; } // Utiliser int pour enum

    [Column("titre")]
    public string? Titre { get; set; }

    [Column("message")]
    public string Message { get; set; } = string.Empty;

    [Column("planning_id")]
    public string PlanningId { get; set; } = string.Empty;

    [Column("lu")]
    public bool IsRead { get; set; } = false;

    [Column("date_creation")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("date_lecture")]
    public DateTime? ReadAt { get; set; }

    [Column("lien")]
    public string? Lien { get; set; }
}

// ========== WORKFLOW CONFIG ==========

public record WorkflowConfigEtapeItem
{
    public int Id { get; init; }
    public int Order { get; init; }
    public string Label { get; init; } = string.Empty;
    public string ValidatorRole { get; init; } = string.Empty;
    public string? ValidatorUserId { get; init; }
    public int? MaxDelayHours { get; init; }
    public bool IsFinalApproval { get; init; }
    public bool IsActive { get; init; } = true;
}

public record WorkflowConfigItem
{
    public int Id { get; init; }
    public int ServiceId { get; init; }
    public string ServiceName { get; init; } = string.Empty;
    public bool IsActive { get; init; } = true;
    public int Version { get; init; } = 1;
    public bool SuperAdminFinalRequired { get; init; } = true;
    public List<WorkflowConfigEtapeItem> Steps { get; init; } = new();
    public string CreatedBy { get; init; } = string.Empty;
    public string? UpdatedBy { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; init; }
}

public record WorkflowConfigEtapeDTO
{
    public int Ordre { get; init; }
    public string Label { get; init; } = string.Empty;
    public string RoleValidateur { get; init; } = string.Empty;
    public int? ValidateurSpecifiqueId { get; init; }
    public int? DelaiMaxHeures { get; init; }
}

public record CreateWorkflowConfigDTO
{
    public int ServiceId { get; init; }
    public string ServiceName { get; init; } = string.Empty;
    public List<WorkflowConfigEtapeDTO> Etapes { get; init; } = new();
    public bool IsActive { get; init; } = true;
}

// ========== EF CORE DB ENTITIES ==========

[Table("WorkflowConfigs")]
public class WorkflowConfigDb
{
    [Key]
    public int Id { get; set; }
    public int ServiceId { get; set; }
    public string ServiceName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public bool SuperAdminFinalRequired { get; set; } = true;
    public string CreatedBy { get; set; } = string.Empty;
    public string? UpdatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public List<WorkflowConfigEtapeDb> Etapes { get; set; } = new();
}

[Table("WorkflowConfigEtapes")]
public class WorkflowConfigEtapeDb
{
    [Key]
    public int Id { get; set; }
    public int WorkflowConfigId { get; set; }
    public int Ordre { get; set; }
    public string Label { get; set; } = string.Empty;
    public string RoleValidateur { get; set; } = string.Empty;
    public int? ValidateurSpecifiqueId { get; set; }
    public int? DelaiMaxHeures { get; set; }
    public bool IsFinalApproval { get; set; }
    public bool IsActive { get; set; } = true;
    [ForeignKey("WorkflowConfigId")]
    public WorkflowConfigDb? Config { get; set; }
}

