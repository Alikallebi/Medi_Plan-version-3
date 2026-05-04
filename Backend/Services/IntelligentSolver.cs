using Backend.Planning;
using Google.OrTools.Sat;
using Microsoft.Extensions.Logging;

namespace MediPlan.Services;

public sealed class IntelligentSolver
{
    private const int PenaltyUncovered = 1_000_000;
    private const int PenaltyRelaxedQuota = 100;

    private readonly ILogger<IntelligentSolver> _logger;

    public IntelligentSolver(ILogger<IntelligentSolver>? logger = null)
    {
        _logger = logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<IntelligentSolver>.Instance;
    }

    /// <summary>
    /// Orchestrates validation, pre-diagnostics, model building, solving and response creation.
    /// </summary>
    public GeneratePlanningResponse Solve(SolverInput input)
    {
        try
        {
            var validation = ValidateInput(input);
            if (!validation.IsValid)
            {
                return new GeneratePlanningResponse
                {
                    Partial = true,
                    Message = "Entrée invalide. Voir conflicts pour le diagnostic.",
                    Conflicts = validation.Errors.ToList(),
                    QualityScore = 0
                };
            }

            var preDiagConflicts = PreDiagnose(input);
            var model = BuildModel(input, out var vars);
            var solver = new CpSolver();
            var status = RunSolver(model, solver);

            return BuildResponse(status, vars, solver, preDiagConflicts, input);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Solver failure for service {ServiceId}", input.ServiceId);
            return new GeneratePlanningResponse
            {
                Partial = true,
                Message = "Une erreur interne est survenue pendant l'optimisation.",
                Conflicts =
                [
                    new PlanningConflict
                    {
                        Id = "solver-exception",
                        Type = "solver",
                        Severity = "critical",
                        Description = "Exception inattendue du solveur.",
                        Details = ex.ToString(),
                        SuggestedFix = "Vérifier les données d'entrée et les logs serveur."
                    }
                ],
                QualityScore = 0
            };
        }
    }

    /// <summary>
    /// Validate the input data before model creation.
    /// </summary>
    private ValidationResult ValidateInput(SolverInput input)
    {
        var errors = new List<PlanningConflict>();

        if (input.Agents.Count == 0)
        {
            errors.Add(BuildGlobalConflict("no-agents", "Aucun agent", "La liste des agents est vide."));
        }

        if (input.Slots.Count == 0)
        {
            errors.Add(BuildGlobalConflict("no-slots", "Aucun slot", "La liste des slots est vide."));
        }

        foreach (var slot in input.Slots)
        {
            if (slot.End <= slot.Start)
            {
                errors.Add(new PlanningConflict
                {
                    Id = $"invalid-slot-{slot.Id}",
                    Type = "invalid_slot",
                    Severity = "critical",
                    Description = $"Slot {slot.Id} invalide.",
                    Details = "La date de fin doit être strictement supérieure à la date de début."
                });
            }

            if (slot.DurationMinutes <= 0)
            {
                errors.Add(new PlanningConflict
                {
                    Id = $"invalid-duration-{slot.Id}",
                    Type = "invalid_slot",
                    Severity = "critical",
                    Description = $"Slot {slot.Id} invalide.",
                    Details = "La durée du slot doit être positive."
                });
            }
        }

        return new ValidationResult(errors);
    }

    /// <summary>
    /// Pre-diagnose feasibility without invoking OR-Tools.
    /// </summary>
    private List<PlanningConflict> PreDiagnose(SolverInput input)
    {
        var conflicts = new List<PlanningConflict>();

        foreach (var slot in input.Slots)
        {
            var eligibleAgents = input.Agents.Where(agent => IsAgentEligibleForSlot(agent, slot)).ToList();
            _logger.LogInformation("Slot {SlotId}: {Count} agents éligibles", slot.Id, eligibleAgents.Count);

            if (eligibleAgents.Count == 0)
            {
                conflicts.Add(new PlanningConflict
                {
                    Id = $"pre-diag-{slot.Id}",
                    Type = "no-eligible-agent",
                    Severity = "critical",
                    Day = slot.DayIndex,
                    Description = $"Poste {slot.Label} du {slot.Start:yyyy-MM-dd HH:mm} : 0 agents qualifiés disponibles",
                    Details = $"Slot {slot.Id}, couverture requise {slot.RequiredCoverage}."
                });
            }

            foreach (var agent in input.Agents)
            {
                var quotaEstimate = agent.HistoricalNightGuardsInMonth + CountEligibleNightSlots(input, agent);
                if (quotaEstimate > 4)
                {
                    conflicts.Add(new PlanningConflict
                    {
                        Id = $"quota-exceeded-{agent.Id}-{slot.Id}",
                        Type = "quota-exceeded",
                        Severity = "warning",
                        PersonnelId = agent.Id.ToString(),
                        Day = slot.DayIndex,
                        Description = $"Quota mensuel potentiellement dépassé pour {agent.DisplayName}.",
                        Details = "Le cumul des gardes/nuits mensuelles dépasse le seuil recommandé de 4."
                    });
                }
            }
        }

        return conflicts;
    }

    /// <summary>
    /// Build the CP-SAT model with all requested constraints.
    /// </summary>
    private CpModel BuildModel(SolverInput input, out Dictionary<(int agentId, int slotId), BoolVar> vars)
    {
        var model = new CpModel();
        vars = new Dictionary<(int agentId, int slotId), BoolVar>();
        var eligibleAgentsBySlot = new Dictionary<int, List<SolverAgent>>();
        var dayWorkVars = new Dictionary<(int agentId, int dayIndex), BoolVar>();
        var objectiveVars = new List<LinearExpr>();
        var objectiveCoefficients = new List<long>();
        var varsMap = vars;

        foreach (var slot in input.Slots)
        {
            var eligibleAgents = input.Agents.Where(agent => IsAgentEligibleForSlot(agent, slot)).ToList();
            eligibleAgentsBySlot[slot.Id] = eligibleAgents;

            if (eligibleAgents.Count == 0)
            {
                continue;
            }

            foreach (var agent in eligibleAgents)
            {
                varsMap[(agent.Id, slot.Id)] = model.NewBoolVar($"x_{agent.Id}_{slot.Id}");
            }
        }

        // C10 – AFFECTATIONS VERROUILLÉES
        foreach (var slot in input.Slots.Where(slot => slot.LockedAgentId.HasValue))
        {
            foreach (var agent in eligibleAgentsBySlot[slot.Id])
            {
                if (!varsMap.TryGetValue((agent.Id, slot.Id), out var variable))
                {
                    continue;
                }

                if (agent.Id == slot.LockedAgentId!.Value)
                {
                    model.Add(variable == 1);
                }
                else
                {
                    model.Add(variable == 0);
                }
            }
        }

        // C1 – COUVERTURE DES POSTES
        foreach (var slot in input.Slots)
        {
            var uncovered = model.NewIntVar(0, slot.RequiredCoverage, $"uncovered_{slot.Id}");
            var assigned = LinearExpr.Sum(eligibleAgentsBySlot[slot.Id]
                .Where(agent => varsMap.ContainsKey((agent.Id, slot.Id)))
                .Select(agent => varsMap[(agent.Id, slot.Id)]));

            model.Add(assigned + uncovered == slot.RequiredCoverage);
            objectiveVars.Add(uncovered);
            objectiveCoefficients.Add(PenaltyUncovered);
        }

        // C2 – NON-CHEVAUCHEMENT TEMPOREL
        foreach (var (first, second) in GetOverlappingSlots(input.Slots))
        {
            foreach (var agent in input.Agents)
            {
                if (varsMap.TryGetValue((agent.Id, first.Id), out var left)
                    && varsMap.TryGetValue((agent.Id, second.Id), out var right))
                {
                    model.AddAtMostOne(new[] { left, right });
                }
            }
        }

        // C3 – COMPÉTENCES REQUISES
        // Already handled by IsAgentEligibleForSlot().

        // C4 – INDISPONIBILITÉS
        foreach (var agent in input.Agents)
        {
            foreach (var slot in input.Slots)
            {
                if (varsMap.TryGetValue((agent.Id, slot.Id), out var variable)
                    && HasBlockingUnavailableOverlap(agent, slot))
                {
                    model.Add(variable == 0);
                }
            }
        }

        // C5 – DURÉE MAX JOURNALIÈRE 12H
        foreach (var agent in input.Agents)
        {
            foreach (var dayGroup in input.Slots.GroupBy(slot => slot.DayIndex))
            {
                var dayVars = dayGroup
                    .Where(slot => varsMap.ContainsKey((agent.Id, slot.Id)))
                    .Select(slot => varsMap[(agent.Id, slot.Id)])
                    .ToList();

                if (dayVars.Count == 0)
                {
                    continue;
                }

                var totalMinutes = LinearExpr.Sum(dayGroup
                    .Where(slot => varsMap.ContainsKey((agent.Id, slot.Id)))
                    .Select(slot => slot.DurationMinutes * varsMap[(agent.Id, slot.Id)]));

                model.Add(totalMinutes <= 720);

                var works = model.NewBoolVar($"works_{agent.Id}_{dayGroup.Key}");
                dayWorkVars[(agent.Id, dayGroup.Key)] = works;

                foreach (var dayVar in dayVars)
                {
                    model.Add(works >= dayVar);
                }

                model.Add(works <= LinearExpr.Sum(dayVars));
            }
        }

        // C6 – REPOS APRÈS GARDE/NUIT
        foreach (var (garde, suivant) in GetPostGardeRestPairs(input.Slots))
        {
            foreach (var agent in input.Agents)
            {
                if (varsMap.TryGetValue((agent.Id, garde.Id), out var first)
                    && varsMap.TryGetValue((agent.Id, suivant.Id), out var next))
                {
                    model.AddImplication(first, next.Not());
                }
            }
        }

        // C7 – MAX 6 JOURS CONSÉCUTIFS
        var orderedDays = input.Slots.Select(slot => slot.DayIndex).Distinct().OrderBy(day => day).ToList();
        foreach (var agent in input.Agents)
        {
            if (orderedDays.Count >= 7)
            {
                for (var index = 0; index <= orderedDays.Count - 7; index++)
                {
                    var window = orderedDays
                        .Skip(index)
                        .Take(7)
                        .Where(day => dayWorkVars.TryGetValue((agent.Id, day), out _))
                        .Select(day => dayWorkVars[(agent.Id, day)])
                        .ToList();

                    if (window.Count > 0)
                    {
                        model.Add(LinearExpr.Sum(window) <= 6);
                    }
                }
            }
        }

        // C8 – REPOS HEBDOMADAIRE
        foreach (var agent in input.Agents)
        {
            var workedDays = orderedDays
                .Where(day => dayWorkVars.TryGetValue((agent.Id, day), out _))
                .Select(day => dayWorkVars[(agent.Id, day)])
                .ToList();

            if (workedDays.Count > 0)
            {
                model.Add(LinearExpr.Sum(workedDays) <= 6);
            }
        }

        // C9 – QUOTA NUITS/GARDES MENSUEL
        foreach (var agent in input.Agents)
        {
            var nightVars = input.Slots
                .Where(slot => slot.IsNight)
                .Where(slot => varsMap.ContainsKey((agent.Id, slot.Id)))
                .Select(slot => varsMap[(agent.Id, slot.Id)])
                .ToList();

            model.Add(agent.HistoricalNightGuardsInMonth + LinearExpr.Sum(nightVars) <= 4);
        }

        foreach (var slot in input.Slots)
        {
            foreach (var agent in input.Agents)
            {
                if (!varsMap.TryGetValue((agent.Id, slot.Id), out var variable))
                {
                    continue;
                }

                var preference = GetPreferenceWeight(agent, slot);
                if (preference != 0)
                {
                    objectiveVars.Add(variable);
                    objectiveCoefficients.Add(-preference);
                }
            }
        }

        model.Minimize(LinearExpr.WeightedSum(objectiveVars.ToArray(), objectiveCoefficients.ToArray()));
        return model;
    }

    /// <summary>
    /// Configure the solver and run it with a bounded search time.
    /// </summary>
    private CpSolverStatus RunSolver(CpModel model, CpSolver solver)
    {
        solver.StringParameters = "max_time_in_seconds:30.0,log_search_progress:false";
        return solver.Solve(model);
    }

    /// <summary>
    /// Build the final response with assignments and diagnostics.
    /// </summary>
    private GeneratePlanningResponse BuildResponse(
        CpSolverStatus status,
        Dictionary<(int agentId, int slotId), BoolVar> vars,
        CpSolver solver,
        List<PlanningConflict> preDiagConflicts,
        SolverInput input)
    {
        var conflicts = new List<PlanningConflict>(preDiagConflicts);
        var assignments = new List<PlanningAssignment>();

        if (status is CpSolverStatus.Optimal or CpSolverStatus.Feasible)
        {
            foreach (var entry in vars)
            {
                if (solver.Value(entry.Value) != 1)
                {
                    continue;
                }

                var agent = input.Agents.First(a => a.Id == entry.Key.agentId);
                var slot = input.Slots.First(s => s.Id == entry.Key.slotId);

                assignments.Add(new PlanningAssignment
                {
                    Id = $"AI-{agent.Id}-{slot.Id}",
                    PersonnelId = agent.Id.ToString(),
                    Day = slot.DayIndex,
                    ShiftType = slot.ShiftType,
                    PosteId = slot.PosteId?.ToString(),
                    PosteLabel = slot.Label,
                    StartTime = slot.Start.ToString("HH:mm"),
                    EndTime = slot.End.ToString("HH:mm"),
                    Note = slot.LockedAgentId.HasValue ? "Affectation verrouillée" : "Genere par solveur IA"
                });
            }

            var uncoveredCount = input.Slots.Sum(slot =>
            {
                var assigned = input.Agents.Count(agent => vars.TryGetValue((agent.Id, slot.Id), out var variable) && solver.Value(variable) == 1);
                return Math.Max(0, slot.RequiredCoverage - assigned);
            });

            if (uncoveredCount > 0)
            {
                conflicts.AddRange(input.Slots
                    .Where(slot =>
                    {
                        var assigned = input.Agents.Count(agent => vars.TryGetValue((agent.Id, slot.Id), out var variable) && solver.Value(variable) == 1);
                        return assigned < slot.RequiredCoverage;
                    })
                    .Select(slot => new PlanningConflict
                    {
                        Id = $"undercoverage-{slot.Id}",
                        Type = "undercoverage",
                        Severity = "warning",
                        Day = slot.DayIndex,
                        Description = $"Slot non totalement couvert: {slot.Label}.",
                        Details = $"{slot.RequiredCoverage} requis, couverture incomplète.",
                        SuggestedFix = "Ajuster les effectifs ou assouplir la couverture requise."
                    }));
            }

            return new GeneratePlanningResponse
            {
                Assignments = assignments,
                Partial = uncoveredCount > 0,
                Message = uncoveredCount > 0
                    ? $"Solution trouvée. {uncoveredCount} postes non pourvus."
                    : "Solution trouvée. Aucun poste non pourvu.",
                Conflicts = conflicts,
                QualityScore = ComputeQualityScore(assignments.Count, conflicts, input)
            };
        }

        conflicts.Add(new PlanningConflict
        {
            Id = "solver-infeasible",
            Type = "solver",
            Severity = "critical",
            Description = status == CpSolverStatus.Infeasible
                ? "Contraintes C7/C8 impossibles à satisfaire simultanément"
                : "Le solveur n'a pas pu certifier une solution dans le temps imparti.",
            Details = "Aucune solution faisable n'a pu être certifiée.",
            SuggestedFix = "Relâcher certaines contraintes ou corriger les données d'entrée."
        });

        return new GeneratePlanningResponse
        {
            Assignments = [],
            Partial = true,
            Message = "Aucune solution. Voir conflicts pour le diagnostic.",
            Conflicts = conflicts,
            QualityScore = 0
        };
    }

    private static int ComputeQualityScore(int assignmentCount, IReadOnlyCollection<PlanningConflict> conflicts, SolverInput input)
    {
        var critical = conflicts.Count(conflict => string.Equals(conflict.Severity, "critical", StringComparison.OrdinalIgnoreCase));
        var warnings = conflicts.Count(conflict => string.Equals(conflict.Severity, "warning", StringComparison.OrdinalIgnoreCase));
        var expected = Math.Max(1, input.Slots.Count);
        var coverage = Math.Min(1d, assignmentCount / (double)expected);
        var score = (int)Math.Round(coverage * 100d);
        score -= critical * 25;
        score -= warnings * 8;
        return Math.Clamp(score, 0, 100);
    }

    private static bool IsAgentEligibleForSlot(SolverAgent agent, SolverSlot slot)
    {
        if (slot.RequiredCompetenceIds.Count > 0 && !slot.RequiredCompetenceIds.IsSubsetOf(agent.CompetenceIds))
        {
            return false;
        }

        if (agent.Unavailabilities.Any(window => window.IsBlocking && Intersects(slot.Start, slot.End, window.Start, window.End)))
        {
            return false;
        }

        return true;
    }

    private static bool HasBlockingUnavailableOverlap(SolverAgent agent, SolverSlot slot)
        => agent.Unavailabilities.Any(window => window.IsBlocking && Intersects(slot.Start, slot.End, window.Start, window.End));

    private static IEnumerable<(SolverSlot First, SolverSlot Second)> GetOverlappingSlots(IReadOnlyList<SolverSlot> slots)
    {
        for (var i = 0; i < slots.Count; i++)
        {
            for (var j = i + 1; j < slots.Count; j++)
            {
                if (Intersects(slots[i].Start, slots[i].End, slots[j].Start, slots[j].End))
                {
                    yield return (slots[i], slots[j]);
                }
            }
        }
    }

    private static IEnumerable<(SolverSlot Garde, SolverSlot Suivant)> GetPostGardeRestPairs(IReadOnlyList<SolverSlot> slots)
    {
        foreach (var garde in slots.Where(slot => slot.IsGuard || slot.ShiftType.Equals("garde", StringComparison.OrdinalIgnoreCase) || slot.ShiftType.Equals("garde_nuit", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (var suivant in slots.Where(slot => slot.DayIndex == garde.DayIndex + 1))
            {
                if ((suivant.Start - garde.End).TotalHours < 11)
                {
                    yield return (garde, suivant);
                }
            }
        }
    }

    private static int CountEligibleNightSlots(SolverInput input, SolverAgent agent)
        => input.Slots.Count(slot => slot.IsNight && IsAgentEligibleForSlot(agent, slot));

    private static int GetPreferenceWeight(SolverAgent agent, SolverSlot slot)
    {
        var match = agent.Preferences.FirstOrDefault(preference => preference.DayIndex is null || preference.DayIndex == slot.DayIndex);
        return match?.Weight ?? 0;
    }

    private static PlanningConflict BuildGlobalConflict(string id, string description, string details)
        => new()
        {
            Id = id,
            Type = "solver",
            Severity = "critical",
            Description = description,
            Details = details
        };

    private static bool Intersects(DateTime aStart, DateTime aEnd, DateTime bStart, DateTime bEnd)
        => aStart < bEnd && bStart < aEnd;
}

public sealed record ValidationResult(IReadOnlyList<PlanningConflict> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

public sealed record SolverInput(
    int ServiceId,
    DateTime WeekStart,
    DateTime WeekEnd,
    IReadOnlyList<SolverAgent> Agents,
    IReadOnlyList<SolverSlot> Slots);

public sealed record SolverAgent(
    int Id,
    string DisplayName,
    HashSet<int> CompetenceIds,
    IReadOnlyList<UnavailabilityWindow> Unavailabilities,
    IReadOnlyList<PreferenceRule> Preferences,
    int HistoricalNightGuardsInMonth,
    int ConsecutiveWorkedDaysBeforeWeek,
    int ConsecutiveWorkedWeekendsBeforeWeek);

public sealed record SolverSlot(
    int Id,
    string Label,
    DateTime Start,
    DateTime End,
    int RequiredCoverage,
    HashSet<int> RequiredCompetenceIds,
    int? PosteId,
    string ShiftType,
    int DayIndex,
    int? LockedAgentId,
    bool IsNight,
    bool IsGuard,
    IReadOnlyList<UnavailabilityWindow>? Unavailabilities = null)
{
    public int DurationMinutes => (int)Math.Round((End - Start).TotalMinutes);
}

public sealed record UnavailabilityWindow(DateTime Start, DateTime End, string Type, bool IsBlocking = true);

public sealed record PreferenceRule(int? DayIndex, string? ShiftType, int Weight = 10);
