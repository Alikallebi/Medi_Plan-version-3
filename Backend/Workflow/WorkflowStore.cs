using System.Collections.Concurrent;
using Backend.Staff;
using Microsoft.EntityFrameworkCore;

namespace Backend.Workflow;

public class WorkflowStore
{
    private readonly StaffStore _staffStore;
    private readonly WorkflowDbContext _dbContext;
    private static readonly ConcurrentDictionary<int, PlanningWorkflow> _plannings = new();
    private static readonly List<ValidationHistoryItem> _history = new();
    private static readonly List<WorkflowComment> _comments = new();
    private static readonly List<WorkflowEtape> _etapes = new();
    private static readonly List<WorkflowNotification> _notifications = new();
    // Ajout : liste statique d'utilisateurs pour notification
    private static readonly List<Dictionary<string, object?>> _users = new()
    {
        new Dictionary<string, object?> { { "id", "U100" }, { "nom", "Validateur RH" }, { "role", "validateur-rh" } },
        new Dictionary<string, object?> { { "id", "U101" }, { "nom", "Admin GTA" }, { "role", "admin-gta" } },
        new Dictionary<string, object?> { { "id", "U102" }, { "nom", "Super Admin" }, { "role", "super-admin" } }
    };
    private static int _nextPlanningId = 1;
    private static int _nextHistoryId = 1;

    public WorkflowStore(WorkflowDbContext dbContext, StaffStore staffStore)
    {
        _dbContext = dbContext;
        _staffStore = staffStore;
    }

    static WorkflowStore()
    {
        InitializeEtapes();
        InitializeTestData();
    }

    private static void InitializeEtapes()
    {
        _etapes.AddRange(new[]
        {
            new WorkflowEtape
            {
                Id = 1,
                Name = "Validation RH",
                Order = 1,
                ValidatorRole = "validateur-rh",
                MaxDelayHours = 48,
                IsActive = true
            },
            new WorkflowEtape
            {
                Id = 2,
                Name = "Validation Super Admin",
                Order = 2,
                ValidatorRole = "super-admin",
                MaxDelayHours = 72,
                IsActive = true
            }
        });
    }

    private static void InitializeTestData()
    {
        var now = DateTime.UtcNow;

        // Planning en attente N+1
        _plannings[1] = new PlanningWorkflow
        {
            Id = 1,
            ServiceId = "S001",
            ServiceName = "Service Cardiologie",
            WeekStart = now.AddDays(7).Date,
            WeekEnd = now.AddDays(13).Date,
            Statut = WorkflowStatut.EN_ATTENTE_VALIDATION_N1,
            EtapeActuelle = 1,
            Assignments = new List<AssignmentItem>
            {
                new() { UserId = "U001", UserName = "Dr. Martin", Title = "Consultation", Start = now.AddDays(7).AddHours(9), End = now.AddDays(7).AddHours(12), Color = "#3b82f6" },
                new() { UserId = "U002", UserName = "Dr. Dubois", Title = "Chirurgie", Start = now.AddDays(8).AddHours(10), End = now.AddDays(8).AddHours(15), Color = "#ef4444" }
            },
            CreatedAt = now.AddDays(-2),
            CreatedBy = "Jean Dupont",
            SubmittedAt = now.AddDays(-1)
        };

        // Planning en attente N+2
        _plannings[2] = new PlanningWorkflow
        {
            Id = 2,
            ServiceId = "S002",
            ServiceName = "Service Urgences",
            WeekStart = now.AddDays(14).Date,
            WeekEnd = now.AddDays(20).Date,
            Statut = WorkflowStatut.EN_ATTENTE_VALIDATION_N2,
            EtapeActuelle = 2,
            Assignments = new List<AssignmentItem>
            {
                new() { UserId = "U003", UserName = "Dr. Bernard", Title = "Garde", Start = now.AddDays(14).AddHours(20), End = now.AddDays(15).AddHours(8), Color = "#8b5cf6" }
            },
            CreatedAt = now.AddDays(-5),
            CreatedBy = "Marie Leclerc",
            SubmittedAt = now.AddDays(-4)
        };

        // Planning validé
        _plannings[3] = new PlanningWorkflow
        {
            Id = 3,
            ServiceId = "S003",
            ServiceName = "Service Pédiatrie",
            WeekStart = now.AddDays(21).Date,
            WeekEnd = now.AddDays(27).Date,
            Statut = WorkflowStatut.VALIDE,
            EtapeActuelle = 3,
            Assignments = new List<AssignmentItem>(),
            CreatedAt = now.AddDays(-10),
            CreatedBy = "Sophie Martin",
            SubmittedAt = now.AddDays(-9)
        };

        // Planning en brouillon (pas encore soumis)
        _plannings[4] = new PlanningWorkflow
        {
            Id = 4,
            ServiceId = "S004",
            ServiceName = "Service Orthopédie",
            WeekStart = now.AddDays(28).Date,
            WeekEnd = now.AddDays(34).Date,
            Statut = WorkflowStatut.BROUILLON,
            EtapeActuelle = 0,
            Assignments = new List<AssignmentItem>
            {
                new() { UserId = "U005", UserName = "Dr. Rousseau", Title = "Consultation", Start = now.AddDays(28).AddHours(8), End = now.AddDays(28).AddHours(12), Color = "#10b981" }
            },
            CreatedAt = now.AddHours(-2),
            CreatedBy = "Chef Service Orthopédie",
            SubmittedAt = null
        };

        // Historique
        _history.Add(new ValidationHistoryItem
        {
            Id = 1,
            PlanningId = 1,
            EtapeOrdre = 0,
            Action = ActionType.SOUMISSION,
            ValidatorId = "U100",
            ValidatorName = "Jean Dupont",
            Commentaire = "Planning initial soumis",
            CreatedAt = now.AddDays(-1)
        });

        _history.Add(new ValidationHistoryItem
        {
            Id = 2,
            PlanningId = 2,
            EtapeOrdre = 1,
            Action = ActionType.APPROBATION,
            ValidatorId = "V001",
            ValidatorName = "Responsable Service",
            Commentaire = "Approuvé par N+1",
            CreatedAt = now.AddDays(-3)
        });

        _history.Add(new ValidationHistoryItem
        {
            Id = 3,
            PlanningId = 3,
            EtapeOrdre = 3,
            Action = ActionType.APPROBATION,
            ValidatorId = "V003",
            ValidatorName = "RH Admin",
            Commentaire = "Validation finale RH",
            CreatedAt = now.AddDays(-7)
        });

        _nextPlanningId = 5;
        _nextHistoryId = 4;
    }

    public IAsyncEnumerable<PlanningWorkflow> GetPlanningsAsync(WorkflowStatut? statut = null, string? serviceId = null, int? etapeActuelle = null)
    {
        var query = _plannings.Values.AsEnumerable();

        if (statut.HasValue)
            query = query.Where(p => p.Statut == statut.Value);

        if (!string.IsNullOrEmpty(serviceId))
            query = query.Where(p => p.ServiceId == serviceId);

        if (etapeActuelle.HasValue)
            query = query.Where(p => p.EtapeActuelle == etapeActuelle.Value);

        return query.OrderByDescending(p => p.SubmittedAt ?? p.CreatedAt).ToAsyncEnumerable();
    }

    public async Task<PlanningWorkflow?> GetPlanningDetailAsync(int planningId)
    {
        await Task.CompletedTask;
        return _plannings.GetValueOrDefault(planningId);
    }

    public async Task<PlanningWorkflow?> GetPlanningWorkflowAsync(string serviceId, DateTime weekStart)
    {
        await Task.CompletedTask;
        
        // Rechercher un planning qui correspond au serviceId et à la semaine
        var planning = _plannings.Values.FirstOrDefault(p => 
            p.ServiceId == serviceId && 
            p.WeekStart.Date == weekStart.Date);
        
        return planning;
    }

    public async Task<PlanningWorkflow?> ApprouverAsync(int planningId, ApprobationDTO dto, string validatorId, string validatorName)
    {
        if (!_plannings.TryGetValue(planningId, out var planning))
            return null;

        // Déterminer le nouveau statut et l'étape
        WorkflowStatut newStatut;
        int newEtape = planning.EtapeActuelle;

        if (planning.EtapeActuelle == 1)
        {
            // Étape 1 (RH) approuvée → passer à l'étape 2 (Super Admin)
            newStatut = WorkflowStatut.EN_ATTENTE_VALIDATION_N2;
            newEtape = 2;
            
            // Notifier les Super Admins
            var messageNextStep = $"Le planning {planning.ServiceName} (semaine du {planning.WeekStart:dd/MM/yyyy}) a été validé par {validatorName} (RH) et attend votre approbation";
            await CreateNotificationsForRoleAsync(planningId, "super-admin", NotificationType.WORKFLOW_SUBMITTED, messageNextStep);
        }
        else if (planning.EtapeActuelle == 2)
        {
            // Étape 2 (Super Admin) approuvée → planning validé
            newStatut = WorkflowStatut.VALIDE;
            newEtape = 2;
        }
        else
        {
            // Toutes les étapes sont déjà passées
            newStatut = WorkflowStatut.VALIDE;
        }

        var updatedPlanning = planning with
        {
            Statut = newStatut,
            EtapeActuelle = newEtape
        };

        _plannings[planningId] = updatedPlanning;

        _history.Add(new ValidationHistoryItem
        {
            Id = _nextHistoryId++,
            PlanningId = planningId,
            EtapeOrdre = planning.EtapeActuelle,
            Action = ActionType.APPROBATION,
            ValidatorId = validatorId,
            ValidatorName = validatorName,
            Commentaire = dto.Commentaire,
            CreatedAt = DateTime.UtcNow
        });

        // Créer notification si le planning est complètement validé
        if (newStatut == WorkflowStatut.VALIDE)
        {
            var message = $"Le planning {planning.ServiceName} (semaine du {planning.WeekStart:dd/MM/yyyy}) a été validé par {validatorName}";
            await CreateNotificationsForRoleAsync(planningId, "validateur-rh", NotificationType.WORKFLOW_APPROVED, message);
            await CreateNotificationsForRoleAsync(planningId, "super-admin", NotificationType.WORKFLOW_APPROVED, message);
            await CreateNotificationsForRoleAsync(planningId, "admin-gta", NotificationType.WORKFLOW_APPROVED, message);
        }

        await Task.CompletedTask;
        return updatedPlanning;
    }

    public async Task<PlanningWorkflow?> RejeterAsync(int planningId, RejetDTO dto, string validatorId, string validatorName)
    {
        if (!_plannings.TryGetValue(planningId, out var planning))
            return null;

        var updatedPlanning = planning with
        {
            Statut = WorkflowStatut.REJETE
        };

        _plannings[planningId] = updatedPlanning;

        _history.Add(new ValidationHistoryItem
        {
            Id = _nextHistoryId++,
            PlanningId = planningId,
            EtapeOrdre = planning.EtapeActuelle,
            Action = ActionType.REJET,
            ValidatorId = validatorId,
            ValidatorName = validatorName,
            Commentaire = $"{dto.Motif}: {dto.Commentaire}",
            CreatedAt = DateTime.UtcNow
        });

        // Créer notification de rejet
        var message = $"Le planning {planning.ServiceName} (semaine du {planning.WeekStart:dd/MM/yyyy}) a été rejeté par {validatorName}. Motif: {dto.Motif}";
        await CreateNotificationsForRoleAsync(planningId, "admin_rh", NotificationType.WORKFLOW_REJECTED, message);
        await CreateNotificationsForRoleAsync(planningId, "super_admin", NotificationType.WORKFLOW_REJECTED, message);
        await CreateNotificationsForRoleAsync(planningId, "admin_gta", NotificationType.WORKFLOW_REJECTED, message);

        await Task.CompletedTask;
        return updatedPlanning;
    }

    public async Task<PlanningWorkflow?> DemanderModificationAsync(int planningId, DemandeModificationDTO dto, string validatorId, string validatorName)
    {
        if (!_plannings.TryGetValue(planningId, out var planning))
            return null;

        var updatedPlanning = planning with
        {
            Statut = WorkflowStatut.EN_CORRECTION
        };

        _plannings[planningId] = updatedPlanning;

        _history.Add(new ValidationHistoryItem
        {
            Id = _nextHistoryId++,
            PlanningId = planningId,
            EtapeOrdre = planning.EtapeActuelle,
            Action = ActionType.RETOUR_CORRECTION,
            ValidatorId = validatorId,
            ValidatorName = validatorName,
            Commentaire = $"[{dto.Priorite}] {dto.Instructions}",
            CreatedAt = DateTime.UtcNow
        });

        await Task.CompletedTask;
        return updatedPlanning;
    }

    public async Task<DashboardStats> GetDashboardStatsAsync()
    {
        await Task.CompletedTask;

        var stats = new DashboardStats
        {
            PlanningsEnAttente = _plannings.Values.Count(p => 
                p.Statut == WorkflowStatut.EN_ATTENTE_VALIDATION_N1 ||
                p.Statut == WorkflowStatut.EN_ATTENTE_VALIDATION_N2 ||
                p.Statut == WorkflowStatut.EN_ATTENTE_VALIDATION_RH),
            PlanningsValides = _plannings.Values.Count(p => p.Statut == WorkflowStatut.VALIDE),
            PlanningsRejetes = _plannings.Values.Count(p => p.Statut == WorkflowStatut.REJETE),
            PlanningsBloques = _plannings.Values.Count(p => 
                (p.SubmittedAt.HasValue && (DateTime.UtcNow - p.SubmittedAt.Value).TotalHours > 72) &&
                p.Statut != WorkflowStatut.VALIDE && p.Statut != WorkflowStatut.REJETE),
            TempsMoyenValidation = 36.5,
            Evolution = new List<EvolutionPoint>
            {
                new() { Label = "Lun", Value = 5 },
                new() { Label = "Mar", Value = 8 },
                new() { Label = "Mer", Value = 6 },
                new() { Label = "Jeu", Value = 10 },
                new() { Label = "Ven", Value = 7 },
                new() { Label = "Sam", Value = 3 },
                new() { Label = "Dim", Value = 2 }
            }
        };

        return stats;
    }

    public async Task<List<ValidationHistoryItem>> GetHistoryAsync(int? planningId = null, int? etapeOrdre = null)
    {
        await Task.CompletedTask;

        var query = _history.AsEnumerable();

        if (planningId.HasValue)
            query = query.Where(h => h.PlanningId == planningId.Value);

        if (etapeOrdre.HasValue)
            query = query.Where(h => h.EtapeOrdre == etapeOrdre.Value);

        return query.OrderByDescending(h => h.CreatedAt).ToList();
    }

    public async Task<List<WorkflowComment>> GetCommentsAsync(int planningId)
    {
        await Task.CompletedTask;
        return _comments.Where(c => c.PlanningId == planningId.ToString()).OrderBy(c => c.CreatedAt).ToList();
    }

    public async Task<WorkflowComment> AddCommentAsync(int planningId, string message, string auteurNom, string auteurRole, int? etapeOrdre = null)
    {
        var comment = new WorkflowComment
        {
            Id = Guid.NewGuid().ToString(),
            PlanningId = planningId.ToString(),
            EtapeOrdre = etapeOrdre,
            AuteurNom = auteurNom,
            AuteurRole = auteurRole,
            Message = message,
            CreatedAt = DateTime.UtcNow
        };

        _comments.Add(comment);
        await Task.CompletedTask;
        return comment;
    }

    public async Task<List<WorkflowEtape>> GetEtapesAsync()
    {
        await Task.CompletedTask;
        return _etapes.OrderBy(e => e.Order).ToList();
    }

    // ========== MÉTHODES DE NOTIFICATION ==========

    public async Task<List<WorkflowNotification>> GetNotificationsForUserAsync(string userId, bool? unreadOnly = null)
    {
        var query = _dbContext.Notifications.Where(n => n.UserId == userId);
        if (unreadOnly == true)
            query = query.Where(n => !n.IsRead);
        return await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(query.OrderByDescending(n => n.CreatedAt));
    }


    // Correction : méthode async pour le nombre de notifications non lues
    public async Task<int> GetUnreadCountAsync(string userId)
    {
        return await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.CountAsync(
            _dbContext.Notifications.Where(n => n.UserId == userId && !n.IsRead));
    }

    public async Task<WorkflowNotification?> MarkNotificationAsReadAsync(string notificationId, string userId)
    {
        var notification = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(
            _dbContext.Notifications.Where(n => n.Id == notificationId && n.UserId == userId));
        if (notification == null || notification.IsRead)
            return notification;
        notification = notification with { IsRead = true, ReadAt = DateTime.UtcNow };
        _dbContext.Notifications.Update(notification);
        await _dbContext.SaveChangesAsync();
        return notification;
    }

    public async Task MarkAllAsReadAsync(string userId)
    {
        await Task.CompletedTask;
        var userNotifications = _notifications.Where(n => n.UserId == userId && !n.IsRead).ToList();

        foreach (var notification in userNotifications)
        {
            _notifications.Remove(notification);
            _notifications.Add(notification with { IsRead = true, ReadAt = DateTime.UtcNow });
        }
    }

    private async Task CreateNotificationsForRoleAsync(int planningId, string role, NotificationType type, string message)
    {
        // Récupérer les utilisateurs ayant ce rôle depuis la base de données
        var users = await _staffStore.GetAllAsync();
        
        // Mapping des rôles avec toutes les variantes possibles (underscore, hyphen, case)
        var roleMapping = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            // Validateur RH - plusieurs variantes
            ["validateur-rh"] = new[] { "validateur-rh", "validateur_rh", "Validateur RH", "RH", "Admin RH", "rh", "VALIDATEUR_RH", "ADMIN_RH", "admin_rh" },
            ["admin_rh"] = new[] { "validateur-rh", "validateur_rh", "Validateur RH", "RH", "Admin RH", "rh", "VALIDATEUR_RH", "ADMIN_RH", "admin_rh" },
            ["planificateur-rh"] = new[] { "planificateur-rh", "planificateur_rh", "Planificateur RH", "PLANIFICATEUR_RH", "VALIDATEUR_RH", "validateur-rh", "Admin RH", "admin_rh", "RH", "rh" },
            
            // Super Admin - plusieurs variantes
            ["super-admin"] = new[] { "super-admin", "super_admin", "Super Admin", "Administrateur", "superadmin", "SUPER_ADMIN", "super_admin" },
            ["super_admin"] = new[] { "super-admin", "super_admin", "Super Admin", "Administrateur", "superadmin", "SUPER_ADMIN", "super-admin" },
            
            // Admin GTA - plusieurs variantes
            ["admin-gta"] = new[] { "admin-gta", "admin_gta", "Admin GTA", "GTA", "ADMIN_GTA", "admin_gta" },
            ["admin_gta"] = new[] { "admin-gta", "admin_gta", "Admin GTA", "GTA", "ADMIN_GTA", "admin-gta" },
            
            // Chef Service - plusieurs variantes
            ["chef-service"] = new[] { "chef-service", "chef_service", "Chef Service", "CHEF_SERVICE", "CHEF DE SERVICE", "chef_service" },
            ["chef_service"] = new[] { "chef-service", "chef_service", "Chef Service", "CHEF_SERVICE", "CHEF DE SERVICE", "chef-service" },
            
            // Chef Pole - plusieurs variantes
            ["chef-pole"] = new[] { "chef-pole", "chef_pole", "Chef Pole", "CHEF_POLE", "CHEF DE POLE", "chef_pole" },
            ["chef_pole"] = new[] { "chef-pole", "chef_pole", "Chef Pole", "CHEF_POLE", "CHEF DE POLE", "chef-pole" }
        };

        // Normaliser le rôle pour la recherche
        var normalizedRole = role.ToLower().Replace("_", "-").Trim();
        
        // Essayer de trouver les rôles acceptés
        if (!roleMapping.TryGetValue(normalizedRole, out var acceptedRoles))
        {
            // Mode debug: logger le rôle non trouvé
            Console.WriteLine($"[WorkflowStore] Role mapping not found for: {role} (normalized: {normalizedRole})");
            acceptedRoles = Array.Empty<string>();
        }

        var userIds = new List<string>();
        foreach (var user in users)
        {
            if (user is IDictionary<string, object?> userDict &&
                userDict.TryGetValue("role", out var roleValue) &&
                roleValue is string userRole &&
                userDict.TryGetValue("id", out var idValue))
            {
                // Vérifier si le rôle de l'utilisateur correspond
                if (acceptedRoles.Any(r => userRole.Contains(r, StringComparison.OrdinalIgnoreCase)))
                {
                    userIds.Add(idValue?.ToString() ?? "");
                }
            }
        }

        // Créer une notification pour chaque utilisateur trouvé
        foreach (var userId in userIds)
        {
            var notification = new WorkflowNotification
            {
                UserId = userId,
                Type = (int)type,
                Titre = "Nouveau planning à valider",
                Message = message,
                PlanningId = planningId.ToString(),
                IsRead = false,
                CreatedAt = DateTime.UtcNow,
                Lien = $"/workflow/validation/{planningId}"
            };
            await AddNotificationAsync(notification);
        }
        
        Console.WriteLine($"[WorkflowStore] Created {userIds.Count} notifications for role '{role}' (normalized: {normalizedRole})");
    }

    // ========== SOUMISSION DE PLANNING ==========

    public async Task<PlanningWorkflow> SoumettreNouveauPlanningAsync(
        string serviceId,
        string serviceName,
        DateTime weekStart,
        DateTime? weekEnd,
        List<AssignmentItem>? assignments,
        string createdBy,
        string? operationContext = null)
    {
        var planningId = _nextPlanningId++;

        var newPlanning = new PlanningWorkflow
        {
            Id = planningId,
            ServiceId = serviceId,
            ServiceName = serviceName,
            WeekStart = weekStart,
            WeekEnd = weekEnd,
            Statut = WorkflowStatut.EN_ATTENTE_VALIDATION_RH,
            EtapeActuelle = 1,
            Assignments = assignments ?? new List<AssignmentItem>(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = createdBy,
            SubmittedAt = DateTime.UtcNow
        };

        _plannings[planningId] = newPlanning;

        // Ajouter l'événement de soumission dans l'historique
        _history.Add(new ValidationHistoryItem
        {
            Id = _nextHistoryId++,
            PlanningId = planningId,
            EtapeOrdre = 0,
            Action = ActionType.SOUMISSION,
            ValidatorId = createdBy,
            ValidatorName = createdBy,
            Commentaire = "Planning soumis pour validation",
            CreatedAt = DateTime.UtcNow
        });

        // Créer des notifications pour les validateurs RH
        var message = $"Nouveau planning créé par {createdBy} pour {serviceName} (semaine du {weekStart:dd/MM/yyyy})";
        if (!string.IsNullOrWhiteSpace(operationContext))
        {
            message += $" {operationContext}";
        }
        
        await CreateNotificationsForRoleAsync(planningId, "validateur-rh", NotificationType.WORKFLOW_SUBMITTED, message);
        await CreateNotificationsForRoleAsync(planningId, "super-admin", NotificationType.WORKFLOW_SUBMITTED, message);
        await CreateNotificationsForRoleAsync(planningId, "admin-gta", NotificationType.WORKFLOW_SUBMITTED, message);

        await Task.CompletedTask;
        return newPlanning;
    }

    public async Task<PlanningWorkflow?> SoumettreExistingPlanningAsync(
        int planningId,
        string submitterId,
        string submitterName,
        string? message)
    {
        if (!_plannings.TryGetValue(planningId, out var planning))
            return null;

        // Mettre à jour le planning pour le soumettre
        var updatedPlanning = planning with
        {
            Statut = WorkflowStatut.EN_ATTENTE_VALIDATION_N1,
            EtapeActuelle = 1,
            SubmittedAt = DateTime.UtcNow
        };

        _plannings[planningId] = updatedPlanning;

        // Ajouter l'événement de soumission dans l'historique
        _history.Add(new ValidationHistoryItem
        {
            Id = _nextHistoryId++,
            PlanningId = planningId,
            EtapeOrdre = 0,
            Action = ActionType.SOUMISSION,
            ValidatorId = submitterId,
            ValidatorName = submitterName,
            Commentaire = message ?? "Planning soumis pour validation",
            CreatedAt = DateTime.UtcNow
        });

        // Créer des notifications pour les admins (RH, Super Admin, GTA)
        var notificationMessage = $"Nouveau planning soumis par {submitterName} pour {planning.ServiceName} (semaine du {planning.WeekStart:dd/MM/yyyy})";
        
        await CreateNotificationsForRoleAsync(planningId, "admin_rh", NotificationType.WORKFLOW_SUBMITTED, notificationMessage);
        await CreateNotificationsForRoleAsync(planningId, "super_admin", NotificationType.WORKFLOW_SUBMITTED, notificationMessage);
        await CreateNotificationsForRoleAsync(planningId, "admin_gta", NotificationType.WORKFLOW_SUBMITTED, notificationMessage);

        await Task.CompletedTask;
        return updatedPlanning;
    }

    // ========== MÉTHODES PRIVÉES ==========

    private static WorkflowStatut GetStatutForEtape(int etape)
    {
        return etape switch
        {
            1 => WorkflowStatut.EN_ATTENTE_VALIDATION_N1,
            2 => WorkflowStatut.EN_ATTENTE_VALIDATION_N2,
            3 => WorkflowStatut.EN_ATTENTE_VALIDATION_RH,
            _ => WorkflowStatut.VALIDE
        };
    }

    public async Task<ValidationStatus> GetValidationStatusAsync(int planningId, string userRole)
    {
        var planning = await GetPlanningDetailAsync(planningId);
        if (planning == null)
        {
            return new ValidationStatus
            {
                CanApprove = false,
                CanReject = false,
                CanRequestChange = false,
                Message = "Planning introuvable"
            };
        }

        var etapeActuelle = _etapes.FirstOrDefault(e => e.Order == planning.EtapeActuelle);
        if (etapeActuelle == null)
        {
            return new ValidationStatus
            {
                CanApprove = false,
                CanReject = false,
                CanRequestChange = false,
                Message = "Étape invalide"
            };
        }

        var normalizedUserRole = userRole.ToLower().Replace("-", "_");
        var normalizedValidatorRole = etapeActuelle.ValidatorRole.ToLower().Replace("-", "_");
        var canValidate = normalizedUserRole == normalizedValidatorRole;

        return new ValidationStatus
        {
            CanApprove = canValidate && (planning.Statut != WorkflowStatut.VALIDE && planning.Statut != WorkflowStatut.REJETE),
            CanReject = canValidate && (planning.Statut != WorkflowStatut.VALIDE && planning.Statut != WorkflowStatut.REJETE),
            CanRequestChange = canValidate && (planning.Statut != WorkflowStatut.VALIDE && planning.Statut != WorkflowStatut.REJETE),
            Message = canValidate ? null : $"Vous n'avez pas les droits pour valider à cette étape (requis: {etapeActuelle.ValidatorRole})"
        };
    }

    public async Task AddNotificationAsync(WorkflowNotification notification)
    {
        _dbContext.Notifications.Add(notification);
        await _dbContext.SaveChangesAsync();
    }

    // ========== WORKFLOW CONFIG ==========

    public async Task<IReadOnlyList<WorkflowConfigItem>> GetAllConfigsAsync()
    {
        var configs = await _dbContext.WorkflowConfigs
            .Include(c => c.Etapes)
            .ToListAsync();
        return configs.Select(ToConfigItem).ToList().AsReadOnly();
    }

    public async Task<WorkflowConfigItem?> GetConfigByServiceAsync(int serviceId)
    {
        // Chercher d'abord la config active pour ce service
        var config = await _dbContext.WorkflowConfigs
            .Include(c => c.Etapes)
            .FirstOrDefaultAsync(c => c.ServiceId == serviceId && c.IsActive);
        // Fallback : prendre n'importe quelle config du service (même inactive)
        config ??= await _dbContext.WorkflowConfigs
            .Include(c => c.Etapes)
            .OrderByDescending(c => c.UpdatedAt ?? c.CreatedAt)
            .FirstOrDefaultAsync(c => c.ServiceId == serviceId);
        return config == null ? null : ToConfigItem(config);
    }

    public async Task<WorkflowConfigItem> CreateConfigAsync(CreateWorkflowConfigDTO dto)
    {
        var config = new WorkflowConfigDb
        {
            ServiceId = dto.ServiceId,
            ServiceName = dto.ServiceName,
            IsActive = dto.IsActive,
            Version = 1,
            SuperAdminFinalRequired = true,
            CreatedBy = "admin",
            CreatedAt = DateTime.UtcNow,
            Etapes = dto.Etapes.Select(e => new WorkflowConfigEtapeDb
            {
                Ordre = e.Ordre,
                Label = e.Label,
                RoleValidateur = e.RoleValidateur,
                ValidateurSpecifiqueId = e.ValidateurSpecifiqueId,
                DelaiMaxHeures = e.DelaiMaxHeures,
                IsFinalApproval = false,
                IsActive = true
            }).ToList()
        };
        _dbContext.WorkflowConfigs.Add(config);
        await _dbContext.SaveChangesAsync();
        return ToConfigItem(config);
    }

    public async Task<WorkflowConfigItem?> UpdateConfigAsync(int id, CreateWorkflowConfigDTO dto)
    {
        var config = await _dbContext.WorkflowConfigs
            .Include(c => c.Etapes)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (config == null) return null;

        _dbContext.WorkflowConfigEtapes.RemoveRange(config.Etapes);
        config.ServiceId = dto.ServiceId;
        if (!string.IsNullOrEmpty(dto.ServiceName))
            config.ServiceName = dto.ServiceName;
        config.IsActive = dto.IsActive;
        config.Version += 1;
        config.UpdatedBy = "admin";
        config.UpdatedAt = DateTime.UtcNow;
        config.Etapes = dto.Etapes.Select(e => new WorkflowConfigEtapeDb
        {
            Ordre = e.Ordre,
            Label = e.Label,
            RoleValidateur = e.RoleValidateur,
            ValidateurSpecifiqueId = e.ValidateurSpecifiqueId,
            DelaiMaxHeures = e.DelaiMaxHeures,
            IsFinalApproval = false,
            IsActive = true
        }).ToList();
        await _dbContext.SaveChangesAsync();
        return ToConfigItem(config);
    }

    public async Task<bool> DeleteConfigAsync(int id)
    {
        var config = await _dbContext.WorkflowConfigs.FindAsync(id);
        if (config == null) return false;
        _dbContext.WorkflowConfigs.Remove(config);
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task<WorkflowConfigItem?> ActivateConfigAsync(int id)
    {
        var config = await _dbContext.WorkflowConfigs
            .Include(c => c.Etapes)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (config == null) return null;
        config.IsActive = true;
        config.UpdatedBy = "admin";
        config.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return ToConfigItem(config);
    }

    private static readonly Dictionary<string, string> _roleLabels = new()
    {
        { "CHEF_SERVICE",           "Chef de Service" },
        { "CHEF_POLE",              "Chef de Pôle" },
        { "VALIDATEUR_RH",          "Validateur RH" },
        { "PLANIFICATEUR_RH",       "Planificateur RH" },
        { "PLANIFICATEUR_URGENCE",  "Planificateur urgence" },
        { "SUPERVISEUR_INTERNES",   "Superviseur internes" },
        { "ADMIN_GTA",              "Administrateur GTA" },
        { "SUPER_ADMIN",            "Super Administrateur" },
    };

    private static WorkflowConfigItem ToConfigItem(WorkflowConfigDb db) => new WorkflowConfigItem
    {
        Id = db.Id,
        ServiceId = db.ServiceId,
        ServiceName = db.ServiceName,
        IsActive = db.IsActive,
        Version = db.Version,
        SuperAdminFinalRequired = db.SuperAdminFinalRequired,
        CreatedBy = db.CreatedBy,
        UpdatedBy = db.UpdatedBy,
        CreatedAt = db.CreatedAt,
        UpdatedAt = db.UpdatedAt,
        Steps = db.Etapes.OrderBy(e => e.Ordre).Select(e => new WorkflowConfigEtapeItem
        {
            Id = e.Id,
            Order = e.Ordre,
            Label = !string.IsNullOrEmpty(e.Label) ? e.Label : _roleLabels.GetValueOrDefault(e.RoleValidateur, e.RoleValidateur),
            ValidatorRole = e.RoleValidateur,
            ValidatorUserId = e.ValidateurSpecifiqueId?.ToString(),
            MaxDelayHours = e.DelaiMaxHeures,
            IsFinalApproval = e.IsFinalApproval,
            IsActive = e.IsActive
        }).ToList()
    };
}
