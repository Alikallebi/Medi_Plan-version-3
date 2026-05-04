using Google.OrTools.Sat;

namespace Backend.Planning;

/// <summary>
/// Solveur hebdomadaire OR-Tools CP-SAT pour MediPlan.
/// Il est volontairement autonome afin d'etre branche facilement depuis PlanningStore.GeneratePlanningAsync.
/// </summary>
public sealed class IntelligentSolver
{
    public GeneratePlanningResponse Solve(
        GeneratePlanningRequest request,
        List<Agent> agents,
        List<Slot> slots)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(agents);
        ArgumentNullException.ThrowIfNull(slots);

        var response = new GeneratePlanningResponse();

        if (request.ServiceId <= 0)
        {
            response.Partial = true;
            response.Message = "Service invalide pour le solveur intelligent.";
            response.Conflicts.Add(BuildGlobalConflict(
                "service-invalid",
                "Service invalide",
                "Aucun service valide n'a ete fourni au solveur."));
            return response;
        }

        if (agents.Count == 0)
        {
            response.Partial = true;
            response.Message = "Aucun agent disponible pour le solveur intelligent.";
            response.Conflicts.Add(BuildGlobalConflict(
                "agents-missing",
                "Aucun agent",
                "Le solveur ne peut pas generer un planning sans agents."));
            return response;
        }

        if (slots.Count == 0)
        {
            response.Partial = true;
            response.Message = "Aucun slot a couvrir sur la periode demandee.";
            return response;
        }

        var weekStart = request.WeekStart.Date;
        var weekEnd = request.WeekEnd.Date >= weekStart
            ? request.WeekEnd.Date
            : weekStart.AddDays(6);

        var slotInfos = slots
            .Select((slot, index) => BuildSlotInfo(slot, index, weekStart))
            .OrderBy(s => s.Start)
            .ToList();

        var precheckConflicts = RunFeasibilityPrechecks(request, agents, slotInfos);
        response.Conflicts.AddRange(precheckConflicts);

        var model = new CpModel();

        var assignmentVars = new Dictionary<(string AgentId, string SlotId), BoolVar>();
        var slotCoverageVars = new Dictionary<string, List<BoolVar>>();
        var uncoveredVars = new Dictionary<string, IntVar>();
        var worksVars = new Dictionary<(string AgentId, int Day), BoolVar>();
        var dayMinutesVars = new Dictionary<(string AgentId, int Day), IntVar>();
        var nightCountVars = new Dictionary<string, IntVar>();
        var guardCountVars = new Dictionary<string, IntVar>();
        var weekendCountVars = new Dictionary<string, IntVar>();
        var weekendWorkedVars = new Dictionary<string, BoolVar>();
        var objectiveVars = new List<IntVar>();
        var objectiveCoefficients = new List<long>();
        var preserveLockedAssignments = request.Constraints.PreserveLockedAssignments;

        foreach (var slot in slotInfos)
        {
            slotCoverageVars[slot.Id] = new List<BoolVar>();
        }

        // 1. Variables d'affectation x[p,s]
        foreach (var agent in agents)
        {
            foreach (var slot in slotInfos)
            {
                var eligibility = EvaluateEligibility(request, agent, slot);
                if (!eligibility.CanAssign)
                {
                    continue;
                }

                var variable = model.NewBoolVar($"x_{Sanitize(agent.Id)}_{Sanitize(slot.Id)}");
                assignmentVars[(agent.Id, slot.Id)] = variable;
                slotCoverageVars[slot.Id].Add(variable);

                if (preserveLockedAssignments && slot.LockedPersonnelId == agent.Id)
                {
                    model.Add(variable == 1);
                    model.AddHint(variable, 1);
                }
                else if (preserveLockedAssignments && !string.IsNullOrWhiteSpace(slot.LockedPersonnelId))
                {
                    model.Add(variable == 0);
                    model.AddHint(variable, 0);
                }
                else if (agent.SuggestedSlotIds.Contains(slot.Id))
                {
                    model.AddHint(variable, 1);
                }

                var preferenceWeight = ComputePreferenceWeight(agent, slot);
                if (preferenceWeight != 0)
                {
                    objectiveVars.Add(variable);
                    objectiveCoefficients.Add(preferenceWeight);
                }

                if (request.Constraints.PrioriserDisponibilites && eligibility.HasSoftUnavailability)
                {
                    objectiveVars.Add(variable);
                    objectiveCoefficients.Add(-5_000L);
                }
            }
        }

        // 2. Couverture des slots avec variable "uncovered" pour permettre un planning partiel
        foreach (var slot in slotInfos)
        {
            var uncovered = model.NewIntVar(0, slot.RequiredCoverage, $"uncovered_{Sanitize(slot.Id)}");
            uncoveredVars[slot.Id] = uncovered;

            var slotVars = slotCoverageVars[slot.Id];
            if (slotVars.Count == 0)
            {
                model.Add(uncovered == slot.RequiredCoverage);
            }
            else
            {
                model.Add(LinearExpr.Sum(slotVars) + uncovered == slot.RequiredCoverage);
            }

            if (request.Constraints.RequirePostCoverage)
            {
                model.Add(uncovered == 0);
            }

            objectiveVars.Add(uncovered);
            objectiveCoefficients.Add(-100_000L);
        }

        // 3. Variables works[p,d] et minutesWorked[p,d]
        foreach (var agent in agents)
        {
            for (var day = 0; day <= (weekEnd - weekStart).Days; day++)
            {
                var works = model.NewBoolVar($"works_{Sanitize(agent.Id)}_{day}");
                worksVars[(agent.Id, day)] = works;

                var dayVars = slotInfos
                    .Where(s => s.DayIndex == day)
                    .Select(s => assignmentVars.TryGetValue((agent.Id, s.Id), out var v) ? v : null)
                    .Where(v => v is not null)
                    .Cast<BoolVar>()
                    .ToArray();

                if (dayVars.Length == 0)
                {
                    model.Add(works == 0);
                    dayMinutesVars[(agent.Id, day)] = model.NewIntVar(0, 0, $"minutes_{Sanitize(agent.Id)}_{day}");
                    continue;
                }

                foreach (var dayVar in dayVars)
                {
                    model.Add(works >= dayVar);
                }

                model.Add(works <= LinearExpr.Sum(dayVars));

                var maxDayMinutes = Math.Min(
                    720,
                    slotInfos
                        .Where(s => s.DayIndex == day)
                        .Sum(s => s.DurationMinutes));

                var minutesVar = model.NewIntVar(0, Math.Max(maxDayMinutes, 1), $"minutes_{Sanitize(agent.Id)}_{day}");
                dayMinutesVars[(agent.Id, day)] = minutesVar;

                var durations = slotInfos
                    .Where(s => s.DayIndex == day)
                    .Select(s => assignmentVars.TryGetValue((agent.Id, s.Id), out var v) ? (Var: v, Slot: s) : (Var: null, Slot: s))
                    .Where(x => x.Var is not null)
                    .Select(x => (Var: x.Var!, Duration: (long)x.Slot.DurationMinutes))
                    .ToArray();

                model.Add(minutesVar == LinearExpr.WeightedSum(
                    durations.Select(x => x.Var).ToArray(),
                    durations.Select(x => x.Duration).ToArray()));

                if (request.Constraints.EnforceMaxDailyDuration12h)
                {
                    model.Add(minutesVar <= 720);
                }
            }
        }

        // 4. Incompatibilites de slots (chevauchement, repos de 11h apres garde/nuit)
        foreach (var agent in agents)
        {
            for (var i = 0; i < slotInfos.Count; i++)
            {
                for (var j = i + 1; j < slotInfos.Count; j++)
                {
                    var first = slotInfos[i];
                    var second = slotInfos[j];

                    if (!assignmentVars.TryGetValue((agent.Id, first.Id), out var x1) ||
                        !assignmentVars.TryGetValue((agent.Id, second.Id), out var x2))
                    {
                        continue;
                    }

                    if (AreSlotsInConflict(request, first, second))
                    {
                        model.Add(x1 + x2 <= 1);
                    }
                }
            }
        }

        // 5. Max 6 jours consecutifs
        if (request.Constraints.EnforceMaxConsecutiveDays6)
        {
            foreach (var agent in agents)
            {
                if ((weekEnd - weekStart).Days + 1 >= 7)
                {
                    for (var startDay = 0; startDay <= ((weekEnd - weekStart).Days + 1) - 7; startDay++)
                    {
                        var window = Enumerable.Range(startDay, 7)
                            .Select(day => worksVars[(agent.Id, day)])
                            .ToArray();

                        model.Add(LinearExpr.Sum(window) <= 6);
                    }
                }

                var historicalConsecutiveDays = Math.Min(agent.ConsecutiveWorkedDaysBeforeWeek, 6);
                if (historicalConsecutiveDays > 0)
                {
                    var availableDays = Math.Max(0, 7 - historicalConsecutiveDays);
                    if (availableDays > 0)
                    {
                        var firstWindow = Enumerable.Range(0, availableDays)
                            .Select(day => worksVars[(agent.Id, day)])
                            .ToArray();

                        model.Add(LinearExpr.Sum(firstWindow) <= 6 - historicalConsecutiveDays);
                    }
                    else
                    {
                        response.Conflicts.Add(new PlanningConflict
                        {
                            Id = $"consecutive-history-{agent.Id}",
                            Type = "repos_insuffisant",
                            Severity = "critical",
                            PersonnelId = agent.Id,
                            Description = $"L'agent {agent.DisplayName} a deja atteint la limite de jours consecutifs avant la semaine.",
                            Details = "Historique incompatible avec une nouvelle affectation sans repos."
                        });
                    }
                }
            }
        }

        // 6. Repos hebdomadaire simplifie : au moins deux jours complets sans affectation
        if (request.Constraints.EnforceWeeklyRest35hSimplified)
        {
            foreach (var agent in agents)
            {
                var weekWorks = Enumerable.Range(0, (weekEnd - weekStart).Days + 1)
                    .Select(day => worksVars[(agent.Id, day)])
                    .ToArray();

                var minRestDays = 2;
                model.Add(LinearExpr.Sum(weekWorks) <= weekWorks.Length - minRestDays);
            }
        }

        // 7. Compteurs penibles / quotas mensuels
        foreach (var agent in agents)
        {
            var nightVars = slotInfos
                .Where(s => s.IsNight)
                .Select(s => assignmentVars.TryGetValue((agent.Id, s.Id), out var v) ? v : null)
                .Where(v => v is not null)
                .Cast<BoolVar>()
                .ToArray();

            var guardVars = slotInfos
                .Where(s => s.IsGuard)
                .Select(s => assignmentVars.TryGetValue((agent.Id, s.Id), out var v) ? v : null)
                .Where(v => v is not null)
                .Cast<BoolVar>()
                .ToArray();

            var weekendVars = slotInfos
                .Where(s => s.IsWeekend)
                .Select(s => assignmentVars.TryGetValue((agent.Id, s.Id), out var v) ? v : null)
                .Where(v => v is not null)
                .Cast<BoolVar>()
                .ToArray();

            var nightCount = model.NewIntVar(0, Math.Max(1, nightVars.Length), $"night_count_{Sanitize(agent.Id)}");
            var guardCount = model.NewIntVar(0, Math.Max(1, guardVars.Length), $"guard_count_{Sanitize(agent.Id)}");
            var weekendCount = model.NewIntVar(0, Math.Max(1, weekendVars.Length), $"weekend_count_{Sanitize(agent.Id)}");

            nightCountVars[agent.Id] = nightCount;
            guardCountVars[agent.Id] = guardCount;
            weekendCountVars[agent.Id] = weekendCount;

            if (nightVars.Length == 0)
            {
                model.Add(nightCount == 0);
            }
            else
            {
                model.Add(nightCount == LinearExpr.Sum(nightVars));
            }

            if (guardVars.Length == 0)
            {
                model.Add(guardCount == 0);
            }
            else
            {
                model.Add(guardCount == LinearExpr.Sum(guardVars));
            }

            if (weekendVars.Length == 0)
            {
                model.Add(weekendCount == 0);
            }
            else
            {
                model.Add(weekendCount == LinearExpr.Sum(weekendVars));
            }

            if (request.Constraints.EnforceMonthlyNightQuota)
            {
                var maxNightShifts = Math.Clamp(request.Constraints.MaxMonthlyNightShifts, 0, 31);
                model.Add(agent.HistoricalNightGuardsInMonth + nightCount <= maxNightShifts);
            }

            var weekendWorked = model.NewBoolVar($"weekend_worked_{Sanitize(agent.Id)}");
            weekendWorkedVars[agent.Id] = weekendWorked;

            if (weekendVars.Length == 0)
            {
                model.Add(weekendWorked == 0);
            }
            else
            {
                foreach (var weekendVar in weekendVars)
                {
                    model.Add(weekendWorked >= weekendVar);
                }

                model.Add(weekendWorked <= LinearExpr.Sum(weekendVars));
            }

            model.Add(weekendWorked + agent.ConsecutiveWorkedWeekendsBeforeWeek <= 2);
        }

        // 8. Equite sur charge penible
        var penibleCounts = new List<IntVar>();
        foreach (var agent in agents)
        {
            var upperBound = Math.Max(1, slotInfos.Count * 3);
            var penible = model.NewIntVar(0, upperBound, $"penible_{Sanitize(agent.Id)}");
            model.Add(penible == nightCountVars[agent.Id] + guardCountVars[agent.Id] + weekendCountVars[agent.Id]);
            penibleCounts.Add(penible);
        }

        var maxPenible = model.NewIntVar(0, Math.Max(1, slotInfos.Count * 3), "max_penible");
        var minPenible = model.NewIntVar(0, Math.Max(1, slotInfos.Count * 3), "min_penible");
        model.AddMaxEquality(maxPenible, penibleCounts);
        model.AddMinEquality(minPenible, penibleCounts);

        objectiveVars.Add(maxPenible);
        objectiveCoefficients.Add(-1_500L);
        objectiveVars.Add(minPenible);
        objectiveCoefficients.Add(1_500L);

        foreach (var agent in agents)
        {
            objectiveVars.Add(nightCountVars[agent.Id]);
            objectiveCoefficients.Add(-100L);
            objectiveVars.Add(guardCountVars[agent.Id]);
            objectiveCoefficients.Add(-75L);
            objectiveVars.Add(weekendCountVars[agent.Id]);
            objectiveCoefficients.Add(-60L);
        }

        // 9. Maximiser l'affectation de vrais slots
        foreach (var entry in assignmentVars)
        {
            var slot = slotInfos.First(s => s.Id == entry.Key.SlotId);
            var bonus = (slot.IsGuard || slot.IsNight) ? 15_000L : 10_000L;
            objectiveVars.Add(entry.Value);
            objectiveCoefficients.Add(bonus);
        }

        model.Maximize(LinearExpr.WeightedSum(objectiveVars.ToArray(), objectiveCoefficients.ToArray()));

        var solver = new CpSolver
        {
            StringParameters = BuildSolverParameters()
        };

        var status = solver.Solve(model);

        if (status is CpSolverStatus.Optimal or CpSolverStatus.Feasible)
        {
            response.Assignments = BuildAssignmentsFromSolution(solver, assignmentVars, slotInfos, agents, weekStart, weekEnd);
            var uncoveredBySlot = uncoveredVars.ToDictionary(entry => entry.Key, entry => (int)solver.Value(entry.Value));
            response.Conflicts.AddRange(BuildCoverageConflictsFromSolution(uncoveredBySlot, slotInfos));

            var uncoveredSlotIds = uncoveredBySlot
                .Where(entry => entry.Value > 0)
                .Select(entry => entry.Key)
                .ToHashSet(StringComparer.Ordinal);

            response.Conflicts.AddRange(BuildEligibilityDiagnostics(request, agents, slotInfos, uncoveredSlotIds));

            response.Partial = uncoveredSlotIds.Count > 0;
            response.Message = response.Partial
                ? $"Planning genere partiellement: {response.Assignments.Count} affectation(s), avec quelques slots non couverts."
                : $"Planning genere avec succes: {response.Assignments.Count} affectation(s).";
            return response;
        }

        response.Partial = true;
        response.Message = status switch
        {
            CpSolverStatus.Infeasible => "Le solveur intelligent n'a pas pu certifier une solution stricte.",
            CpSolverStatus.ModelInvalid => "Le modele OR-Tools est invalide.",
            _ => "Le solveur n'a pas pu certifier une solution dans le temps imparti."
        };

        if (response.Conflicts.Count == 0)
        {
            response.Conflicts.Add(BuildGlobalConflict(
                $"solver-{status.ToString().ToLowerInvariant()}",
                "Echec solveur",
                response.Message));
        }

        return response;
    }

    private static SlotInfo BuildSlotInfo(Slot slot, int index, DateTime weekStart)
    {
        var slotId = string.IsNullOrWhiteSpace(slot.Id)
            ? $"slot-{slot.DayIndex}-{slot.PosteId ?? "np"}-{index}"
            : slot.Id;

        var start = CombineDateAndTime(weekStart.AddDays(slot.DayIndex), slot.StartTime);
        var end = CombineDateAndTime(weekStart.AddDays(slot.DayIndex), slot.EndTime);
        if (end <= start)
        {
            end = end.AddDays(1);
        }

        var duration = (int)Math.Round((end - start).TotalMinutes);
        var normalizedType = NormalizeShiftType(slot.ShiftType);
        var normalizedLabel = string.IsNullOrWhiteSpace(slot.PosteLabel)
            ? string.Empty
            : slot.PosteLabel.Trim().ToLowerInvariant();
        var typeAndLabel = $"{normalizedType} {normalizedLabel}";
        var crossesMidnight = end.Date > start.Date;
        var startsLate = start.TimeOfDay >= TimeSpan.FromHours(20);
        var endsEarly = end.TimeOfDay <= TimeSpan.FromHours(8);
        var isNight = typeAndLabel.Contains("nuit", StringComparison.OrdinalIgnoreCase)
            || (crossesMidnight && (startsLate || endsEarly || duration >= 8 * 60));
        var isGuard = typeAndLabel.Contains("garde", StringComparison.OrdinalIgnoreCase)
            || duration >= 24 * 60;

        return new SlotInfo(
            slotId,
            slot.DayIndex,
            slot.PosteId,
            slot.PosteLabel ?? slot.PosteId ?? "Poste",
            normalizedType,
            start,
            end,
            duration,
            slot.RequiredCoverage <= 0 ? 1 : slot.RequiredCoverage,
            slot.RequiredCompetenceIds.Distinct().ToHashSet(),
            slot.LockedPersonnelId,
                isNight,
                isGuard,
            slot.DayIndex is 5 or 6);
    }

    private static EligibilityResult EvaluateEligibility(GeneratePlanningRequest request, Agent agent, SlotInfo slot)
    {
        if (request.Constraints.PreserveLockedAssignments &&
            !string.IsNullOrWhiteSpace(slot.LockedPersonnelId) &&
            slot.LockedPersonnelId != agent.Id)
        {
            return EligibilityResult.Blocked("Slot verrouille pour un autre agent.");
        }

        if (request.Constraints.PreserveLockedAssignments &&
            !string.IsNullOrWhiteSpace(slot.LockedPersonnelId) &&
            slot.LockedPersonnelId == agent.Id)
        {
            return EligibilityResult.Allowed(false);
        }

        if (request.Constraints.CompetencesObligatoires &&
            slot.RequiredCompetenceIds.Count > 0 &&
            !slot.RequiredCompetenceIds.All(agent.CompetenceIds.Contains))
        {
            return EligibilityResult.Blocked("Competences requises manquantes.");
        }

        var hasBlockingUnavailability = request.Constraints.EnforceBlockingUnavailabilities &&
            agent.Unavailabilities.Any(u =>
                u.IsBlocking &&
                Intersects(slot.Start, slot.End, u.Start, u.End));

        if (hasBlockingUnavailability)
        {
            return EligibilityResult.Blocked("Indisponibilite bloquante.");
        }

        var hasSoftUnavailability = agent.Unavailabilities.Any(u =>
            !u.IsBlocking &&
            Intersects(slot.Start, slot.End, u.Start, u.End));

        return EligibilityResult.Allowed(hasSoftUnavailability);
    }

    private static bool AreSlotsInConflict(GeneratePlanningRequest request, SlotInfo first, SlotInfo second)
    {
        if (!request.Constraints.EnforceSlotIncompatibilities)
        {
            return false;
        }

        if (Intersects(first.Start, first.End, second.Start, second.End))
        {
            return true;
        }

        // Regle metier stricte: apres une garde, l'agent doit etre en repos tout le lendemain.
        if (request.Constraints.EnforceSecurityRestAfterGuardOrNight)
        {
            if (first.IsGuard && second.DayIndex == first.DayIndex + 1)
            {
                return true;
            }

            if (second.IsGuard && first.DayIndex == second.DayIndex + 1)
            {
                return true;
            }
        }

        if (first.End <= second.Start)
        {
            var restMinutes = (int)(second.Start - first.End).TotalMinutes;
            if (request.Constraints.RespectReposLegaux && restMinutes < 11 * 60)
            {
                return true;
            }

            if (request.Constraints.EnforceSecurityRestAfterGuardOrNight && (first.IsGuard || first.IsNight) && restMinutes < 11 * 60)
            {
                return true;
            }
        }

        if (second.End <= first.Start)
        {
            var restMinutes = (int)(first.Start - second.End).TotalMinutes;
            if (request.Constraints.RespectReposLegaux && restMinutes < 11 * 60)
            {
                return true;
            }

            if (request.Constraints.EnforceSecurityRestAfterGuardOrNight && (second.IsGuard || second.IsNight) && restMinutes < 11 * 60)
            {
                return true;
            }
        }

        return false;
    }

    private static int ComputePreferenceWeight(Agent agent, SlotInfo slot)
    {
        var weight = 0;
        foreach (var preference in agent.Preferences)
        {
            if (preference.DayIndex.HasValue && preference.DayIndex.Value != slot.DayIndex)
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(preference.ShiftType) &&
                !string.Equals(NormalizeShiftType(preference.ShiftType), slot.ShiftType, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            weight += preference.Kind switch
            {
                AgentPreferenceKind.Prefer => Math.Max(1, preference.Weight),
                AgentPreferenceKind.Avoid => -Math.Max(1, preference.Weight),
                _ => 0
            };
        }

        return weight;
    }

    private static List<PlanningConflict> RunFeasibilityPrechecks(
        GeneratePlanningRequest request,
        IReadOnlyList<Agent> agents,
        IReadOnlyList<SlotInfo> slots)
    {
        var conflicts = new List<PlanningConflict>();

        foreach (var slot in slots)
        {
            var eligibleAgents = agents
                .Where(agent => EvaluateEligibility(request, agent, slot).CanAssign)
                .ToList();

            if (eligibleAgents.Count == 0)
            {
                conflicts.Add(new PlanningConflict
                {
                    Id = $"precheck-no-agent-{slot.Id}",
                    Type = "competence_manquante",
                    Severity = "critical",
                    Day = slot.DayIndex,
                    Description = $"Aucun agent eligibile pour le slot {slot.Label}.",
                    Details = $"Jour {slot.DayIndex}, type {slot.ShiftType}, couverture requise {slot.RequiredCoverage}.",
                    SuggestedFix = "Verifier les competences, indisponibilites et effectifs du service."
                });
            }
            else if (eligibleAgents.Count < slot.RequiredCoverage)
            {
                conflicts.Add(new PlanningConflict
                {
                    Id = $"precheck-understaffed-{slot.Id}",
                    Type = "quota_depasse",
                    Severity = "warning",
                    Day = slot.DayIndex,
                    Description = $"Capacite insuffisante pour couvrir {slot.Label}.",
                    Details = $"{eligibleAgents.Count} agent(s) eligibile(s) pour {slot.RequiredCoverage} poste(s).",
                    SuggestedFix = "Autoriser plus d'agents, baisser la couverture ou detendre certaines contraintes."
                });
            }
        }

        return conflicts;
    }

    private static List<PlanningAssignment> BuildAssignmentsFromSolution(
        CpSolver solver,
        IReadOnlyDictionary<(string AgentId, string SlotId), BoolVar> assignmentVars,
        IReadOnlyList<SlotInfo> slots,
        IReadOnlyList<Agent> agents,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var slotById = slots.ToDictionary(s => s.Id, s => s);
        var now = DateTime.UtcNow;
        var assignments = new List<PlanningAssignment>();

        foreach (var entry in assignmentVars)
        {
            if (solver.Value(entry.Value) != 1)
            {
                continue;
            }

            var slot = slotById[entry.Key.SlotId];
            assignments.Add(new PlanningAssignment
            {
                Id = $"ORT-{entry.Key.AgentId}-{slot.DayIndex}-{slot.PosteId ?? slot.Id}",
                PersonnelId = entry.Key.AgentId,
                Day = slot.DayIndex,
                ShiftType = slot.ShiftType,
                PosteId = slot.PosteId,
                PosteLabel = slot.Label,
                StartTime = slot.Start.ToString("HH:mm"),
                EndTime = slot.End.ToString("HH:mm"),
                Note = "Genere par solveur OR-Tools",
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        var assignedKeys = new HashSet<(string AgentId, int Day)>(
            assignments.Select(a => (a.PersonnelId, a.Day)));

        for (var day = 0; day <= (weekEnd - weekStart).Days; day++)
        {
            foreach (var agent in agents)
            {
                if (assignedKeys.Contains((agent.Id, day)))
                {
                    continue;
                }

                assignments.Add(new PlanningAssignment
                {
                    Id = $"REPOS-{agent.Id}-{day}",
                    PersonnelId = agent.Id,
                    Day = day,
                    ShiftType = "repos",
                    PosteLabel = "Repos",
                    StartTime = "00:00",
                    EndTime = "00:00",
                    Note = "Jour de repos",
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }

        return assignments
            .OrderBy(a => a.Day)
            .ThenBy(a => a.PersonnelId, StringComparer.Ordinal)
            .ThenBy(a => a.StartTime, StringComparer.Ordinal)
            .ToList();
    }

    private static IEnumerable<PlanningConflict> BuildCoverageConflictsFromSolution(
        IReadOnlyDictionary<string, int> uncoveredBySlot,
        IReadOnlyList<SlotInfo> slots)
    {
        var slotById = slots.ToDictionary(s => s.Id, s => s);

        foreach (var entry in uncoveredBySlot)
        {
            var uncovered = entry.Value;
            if (uncovered <= 0)
            {
                continue;
            }

            var slot = slotById[entry.Key];
            yield return new PlanningConflict
            {
                Id = $"undercoverage-{slot.Id}",
                Type = "undercoverage",
                Severity = "warning",
                Day = slot.DayIndex,
                Description = $"Slot non totalement couvert: {slot.Label}.",
                Details = $"{uncovered} couverture(s) manquante(s) sur {slot.RequiredCoverage}.",
                SuggestedFix = "Ajuster les quotas ou completer manuellement ce creneau."
            };
        }
    }

    private static IEnumerable<PlanningConflict> BuildEligibilityDiagnostics(
        GeneratePlanningRequest request,
        IReadOnlyList<Agent> agents,
        IReadOnlyList<SlotInfo> slots,
        IReadOnlySet<string> targetSlotIds)
    {
        if (targetSlotIds.Count == 0)
        {
            yield break;
        }

        foreach (var slot in slots)
        {
            if (!targetSlotIds.Contains(slot.Id))
            {
                continue;
            }

            var evaluations = agents
                .Select(agent => (Agent: agent, Eligibility: EvaluateEligibility(request, agent, slot)))
                .ToList();

            var eligibleAgents = evaluations
                .Where(x => x.Eligibility.CanAssign)
                .Select(x => x.Agent.DisplayName)
                .ToList();

            var blockedByReason = evaluations
                .Where(x => !x.Eligibility.CanAssign)
                .GroupBy(x => string.IsNullOrWhiteSpace(x.Eligibility.Reason)
                    ? "Regle bloquante non detaillee"
                    : x.Eligibility.Reason!)
                .Select(group =>
                {
                    var names = group
                        .Select(x => x.Agent.DisplayName)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    var preview = string.Join(", ", names.Take(4));
                    if (names.Count > 4)
                    {
                        preview += ", ...";
                    }

                    return $"{group.Key}: {group.Count()} agent(s) [{preview}]";
                })
                .ToList();

            var details = $"Slot {slot.Label} (jour {slot.DayIndex}, {slot.Start:HH:mm}-{slot.End:HH:mm}). "
                + $"Eligibles: {eligibleAgents.Count}/{agents.Count}.";

            if (eligibleAgents.Count > 0)
            {
                details += " Agents eligibles: " + string.Join(", ", eligibleAgents.Take(6));
                if (eligibleAgents.Count > 6)
                {
                    details += ", ...";
                }
                details += ".";
            }

            if (blockedByReason.Count > 0)
            {
                details += " Blocages: " + string.Join(" | ", blockedByReason) + ".";
            }

            var reasonText = string.Join(" ", blockedByReason).ToLowerInvariant();
            var suggestedFix = reasonText.Contains("competence")
                ? "Verifier la competence requise du poste et les competences des agents du service."
                : reasonText.Contains("indisponibilite")
                    ? "Verifier conges/formations et disponibilites des agents sur ce creneau."
                    : reasonText.Contains("verrouille")
                        ? "Verifier les affectations verrouillees deja presentes sur le planning."
                        : "Ajuster les contraintes, les effectifs ou le parametrage des postes puis relancer.";

            yield return new PlanningConflict
            {
                Id = $"eligibility-diagnostic-{slot.Id}",
                Type = "eligibility_diagnostic",
                Severity = eligibleAgents.Count > 0 ? "warning" : "critical",
                Day = slot.DayIndex,
                Description = $"Diagnostic de faisabilite pour {slot.Label}.",
                Details = details,
                SuggestedFix = suggestedFix
            };
        }
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

    private static DateTime CombineDateAndTime(DateTime date, string time)
    {
        if (!TimeSpan.TryParse(time, out var parsed))
        {
            parsed = TimeSpan.FromHours(8);
        }

        return date.Date.Add(parsed);
    }

    private static bool Intersects(DateTime aStart, DateTime aEnd, DateTime bStart, DateTime bEnd)
        => aStart < bEnd && bStart < aEnd;

    private static string NormalizeShiftType(string? raw)
        => string.IsNullOrWhiteSpace(raw) ? "jour" : raw.Trim().ToLowerInvariant();

    private static string Sanitize(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "na";
        }

        var chars = value.Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray();
        return new string(chars);
    }

    private static string BuildSolverParameters()
        => string.Join(" ",
            "max_time_in_seconds:20",
            "num_search_workers:8",
            "random_seed:42",
            "log_search_progress:false",
            "cp_model_presolve:true");

    public sealed class Agent
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public HashSet<int> CompetenceIds { get; set; } = [];
        public List<UnavailabilityWindow> Unavailabilities { get; set; } = [];
        public List<PreferenceRule> Preferences { get; set; } = [];
        public HashSet<string> SuggestedSlotIds { get; set; } = [];
        public int HistoricalNightGuardsInMonth { get; set; }
        public int ConsecutiveWorkedWeekendsBeforeWeek { get; set; }
        public int ConsecutiveWorkedDaysBeforeWeek { get; set; }
    }

    public sealed class Slot
    {
        public string Id { get; set; } = string.Empty;
        public int DayIndex { get; set; }
        public string? PosteId { get; set; }
        public string? PosteLabel { get; set; }
        public string ShiftType { get; set; } = "jour";
        public string StartTime { get; set; } = "08:00";
        public string EndTime { get; set; } = "16:00";
        public int RequiredCoverage { get; set; } = 1;
        public HashSet<int> RequiredCompetenceIds { get; set; } = [];
        public string? LockedPersonnelId { get; set; }
    }

    public sealed class UnavailabilityWindow
    {
        public DateTime Start { get; set; }
        public DateTime End { get; set; }
        public bool IsBlocking { get; set; } = true;
        public string? Reason { get; set; }
    }

    public sealed class PreferenceRule
    {
        public int? DayIndex { get; set; }
        public string? ShiftType { get; set; }
        public int Weight { get; set; } = 10;
        public AgentPreferenceKind Kind { get; set; } = AgentPreferenceKind.Prefer;
    }

    public enum AgentPreferenceKind
    {
        Prefer = 1,
        Avoid = 2
    }

    private sealed record SlotInfo(
        string Id,
        int DayIndex,
        string? PosteId,
        string Label,
        string ShiftType,
        DateTime Start,
        DateTime End,
        int DurationMinutes,
        int RequiredCoverage,
        HashSet<int> RequiredCompetenceIds,
        string? LockedPersonnelId,
        bool IsNight,
        bool IsGuard,
        bool IsWeekend);

    private sealed record EligibilityResult(bool CanAssign, bool HasSoftUnavailability, string? Reason)
    {
        public static EligibilityResult Allowed(bool hasSoftUnavailability)
            => new(true, hasSoftUnavailability, null);

        public static EligibilityResult Blocked(string reason)
            => new(false, false, reason);
    }
}
