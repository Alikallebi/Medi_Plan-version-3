using MySqlConnector;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    private sealed record PosteTemplate(
        int Id,
        string Nom,
        string ShiftType,
        string HeureDebut,
        string HeureFin,
        bool JourSuivant,
        int RequiredCoverage,
        List<int> ServicesAutorises,
        List<int> RequiredCompetenceIds);

    public async Task<GeneratePlanningResponse> GeneratePlanningAsync(GeneratePlanningRequest request)
    {
        request.Constraints ??= new GeneratePlanningConstraints();

        var missingMandatoryRules = request.Constraints.GetUnacceptedMandatoryRules();
        if (missingMandatoryRules.Count > 0)
        {
            return new GeneratePlanningResponse
            {
                Partial = true,
                Message = "Vous devez accepter toutes les conditions obligatoires avant le remplissage IA du planning.",
                Conflicts =
                [
                    new PlanningConflict
                    {
                        Id = "mandatory-rules-not-accepted",
                        Type = "mandatory_rules",
                        Severity = "critical",
                        Description = "Conditions obligatoires non acceptees.",
                        Details = $"Regles manquantes: {string.Join(", ", missingMandatoryRules)}",
                        SuggestedFix = "Accepter toutes les contraintes obligatoires dans la fenetre de securite IA, puis relancer l'optimisation."
                    }
                ]
            };
        }

        var strictMandatoryMode = request.Constraints.UserAcceptedMandatoryRules;

        if (request.ServiceId <= 0)
        {
            return new GeneratePlanningResponse
            {
                Partial = true,
                Message = "Service invalide pour la generation IA."
            };
        }

        var start = NormalizeDate(request.WeekStart);
        var end = NormalizeDate(request.WeekEnd);
        if (end < start)
        {
            end = start.AddDays(6);
        }

        var totalDays = (int)(end - start).TotalDays + 1;
        if (totalDays <= 0)
        {
            totalDays = 7;
        }

        var serviceId = request.ServiceId.ToString();
        var planning = await GetPlanningAsync(serviceId, serviceId, start, end);

        if (planning.Personnel.Count == 0)
        {
            return new GeneratePlanningResponse
            {
                Partial = true,
                Message = "Aucun personnel disponible pour ce service."
            };
        }

        var postes = await GetCandidatePostesAsync(request.ServiceId);
        if (postes.Count == 0)
        {
            postes =
            [
                new PosteTemplate(0, "Poste standard", "jour", "08:00", "16:00", false, 1, [], [])
            ];
        }

        GeneratePlanningResponse? intelligentResult = null;
        try
        {
            intelligentResult = await TryGenerateWithIntelligentSolverAsync(request, planning, postes);
            if (intelligentResult is { Assignments.Count: > 0 })
            {
                EnforceAutomaticRestAndFillGaps(
                    request,
                    intelligentResult.Assignments,
                    planning.Personnel.Select(p => p.Id),
                    totalDays);
                ApplyQualityScore(intelligentResult, planning.Personnel.Count, totalDays);

                if (!strictMandatoryMode && _aiPlanningOptions.Enabled && !string.IsNullOrWhiteSpace(_aiPlanningOptions.Endpoint))
                {
                    try
                    {
                        var externalCandidate = await TryGenerateWithExternalSolverAsync(request, planning, postes);
                        if (externalCandidate is { Assignments.Count: > 0 })
                        {
                            EnforceAutomaticRestAndFillGaps(
                                request,
                                externalCandidate.Assignments,
                                planning.Personnel.Select(p => p.Id),
                                totalDays);
                            ApplyQualityScore(externalCandidate, planning.Personnel.Count, totalDays);
                            if (IsBetterPlanningResult(externalCandidate, intelligentResult))
                            {
                                externalCandidate.Partial = externalCandidate.Partial || intelligentResult.Partial;
                                externalCandidate.Conflicts.Add(new PlanningConflict
                                {
                                    Id = "candidate-selected-external",
                                    Type = "optimization",
                                    Severity = "info",
                                    Description = "La meilleure proposition a ete retenue apres comparaison des solveurs.",
                                    Details = "Le solveur externe a fourni un planning juge meilleur que la proposition locale."
                                });
                                return externalCandidate;
                            }
                        }
                    }
                    catch
                    {
                        // Si la comparaison externe echoue, on conserve le resultat local deja obtenu.
                    }
                }

                return intelligentResult;
            }

            if (strictMandatoryMode && intelligentResult is not null)
            {
                var bestEffortAttempts = BuildStrictBestEffortAttempts(request);
                GeneratePlanningResponse? bestEffortCandidate = null;
                int? bestEffortAttemptNumber = null;
                for (var attemptIndex = 0; attemptIndex < bestEffortAttempts.Count; attemptIndex++)
                {
                    var attempt = bestEffortAttempts[attemptIndex];
                    var bestEffortResult = await TryGenerateWithIntelligentSolverAsync(attempt.Request, planning, postes);

                    if (bestEffortResult is null or { Assignments.Count: 0 })
                    {
                        if (_aiPlanningOptions.Enabled && !string.IsNullOrWhiteSpace(_aiPlanningOptions.Endpoint))
                        {
                            bestEffortResult = await TryGenerateWithExternalSolverAsync(attempt.Request, planning, postes);
                        }
                    }

                    if (bestEffortResult is { Assignments.Count: > 0 })
                    {
                        EnforceAutomaticRestAndFillGaps(
                            attempt.Request,
                            bestEffortResult.Assignments,
                            planning.Personnel.Select(p => p.Id),
                            totalDays);
                        bestEffortResult.Partial = true;
                        bestEffortResult.Message = attempt.Message;
                        ApplyQualityScore(bestEffortResult, planning.Personnel.Count, totalDays);
                        bestEffortResult.Conflicts.Add(new PlanningConflict
                        {
                            Id = $"strict-best-effort-{attemptIndex + 1}",
                            Type = "undercoverage",
                            Severity = "warning",
                            Description = "Le remplissage complet est impossible avec les ressources actuelles.",
                            Details = attempt.Details,
                            SuggestedFix = "Ajouter du personnel disponible ou diminuer la couverture requise sur certains postes."
                        });

                        if (IsBetterPlanningResult(bestEffortResult, bestEffortCandidate))
                        {
                            bestEffortCandidate = bestEffortResult;
                            bestEffortAttemptNumber = attemptIndex + 1;
                        }
                    }
                }

                if (bestEffortCandidate is not null)
                {
                    if (bestEffortAttemptNumber.HasValue)
                    {
                        bestEffortCandidate.Conflicts.Add(new PlanningConflict
                        {
                            Id = "strict-best-effort-selected",
                            Type = "optimization",
                            Severity = "info",
                            Description = "La meilleure tentative de secours a ete retenue.",
                            Details = $"Tentative selectionnee: niveau {bestEffortAttemptNumber.Value}.",
                            SuggestedFix = "Conserver ce planning puis ajuster manuellement les creneaux restants non couverts."
                        });
                    }

                    return bestEffortCandidate;
                }

                var strictFallback = BuildFallbackAssignments(planning.Personnel, postes, totalDays);
                EnforceAutomaticRestAndFillGaps(
                    request,
                    strictFallback,
                    planning.Personnel.Select(p => p.Id),
                    totalDays);
                if (strictFallback.Count > 0)
                {
                    var strictFallbackResponse = new GeneratePlanningResponse
                    {
                        Assignments = strictFallback,
                        Partial = true,
                        Message = "Aucune solution faisable n'a ete trouvee par le solveur. Un planning partiel de secours a ete genere.",
                        Conflicts =
                        [
                            new PlanningConflict
                            {
                                Id = "strict-fallback-generated",
                                Type = "solver",
                                Severity = "warning",
                                Description = "Generation de secours activee.",
                                Details = "Le solveur est reste infaisable meme apres assouplissements progressifs. Un planning partiel heuristique a ete produit.",
                                SuggestedFix = "Verifier les contraintes fortes (competences, indisponibilites bloquantes, verrous) pour ameliorer le resultat IA."
                            }
                        ]
                    };

                    ApplyQualityScore(strictFallbackResponse, planning.Personnel.Count, totalDays);

                    return strictFallbackResponse;
                }

                intelligentResult.Partial = true;
                intelligentResult.Message ??= "Aucune solution stricte n'a ete trouvee, meme en tentative de meilleur planning partiel.";
                return intelligentResult;
            }
        }
        catch (Exception ex)
        {
            if (strictMandatoryMode)
            {
                return new GeneratePlanningResponse
                {
                    Partial = true,
                    Message = $"Echec du solveur strict: {ex.Message}",
                    Conflicts =
                    [
                        new PlanningConflict
                        {
                            Id = "strict-solver-failure",
                            Type = "solver",
                            Severity = "critical",
                            Description = "Le solveur strict n'a pas pu traiter la demande.",
                            Details = ex.Message,
                            SuggestedFix = "Verifier les donnees de base (competences, postes, indisponibilites) puis relancer."
                        }
                    ]
                };
            }

            if (!_aiPlanningOptions.Enabled && !_aiPlanningOptions.UseFallbackOnFailure)
            {
                return new GeneratePlanningResponse
                {
                    Partial = true,
                    Message = $"Echec du solveur intelligent local: {ex.Message}",
                    Conflicts =
                    [
                        new PlanningConflict
                        {
                            Id = "intelligent-solver-failure",
                            Type = "solver",
                            Severity = "critical",
                            Description = "Le solveur intelligent local a echoue.",
                            Details = ex.Message
                        }
                    ]
                };
            }
        }

        if (!strictMandatoryMode && _aiPlanningOptions.Enabled && !string.IsNullOrWhiteSpace(_aiPlanningOptions.Endpoint))
        {
            try
            {
                var solverResult = await TryGenerateWithExternalSolverAsync(request, planning, postes);
                if (solverResult is { Assignments.Count: > 0 })
                {
                    EnforceAutomaticRestAndFillGaps(
                        request,
                        solverResult.Assignments,
                        planning.Personnel.Select(p => p.Id),
                        totalDays);
                    ApplyQualityScore(solverResult, planning.Personnel.Count, totalDays);
                    return solverResult;
                }
            }
            catch (Exception ex)
            {
                if (!_aiPlanningOptions.UseFallbackOnFailure)
                {
                    return new GeneratePlanningResponse
                    {
                        Partial = true,
                        Message = $"Echec de l'appel au solveur IA: {ex.Message}"
                    };
                }
            }
        }

        if (strictMandatoryMode)
        {
            var strictFallback = BuildFallbackAssignments(planning.Personnel, postes, totalDays);
            EnforceAutomaticRestAndFillGaps(
                request,
                strictFallback,
                planning.Personnel.Select(p => p.Id),
                totalDays);

            var strictFallbackResponse = new GeneratePlanningResponse
            {
                Assignments = strictFallback,
                Partial = true,
                Message = "Le solveur n'a pas pu certifier une solution stricte; un planning de secours a ete genere.",
                Conflicts =
                [
                    new PlanningConflict
                    {
                        Id = "strict-fallback-final",
                        Type = "solver",
                        Severity = "warning",
                        Description = "Generation de secours activee apres echec du solveur strict.",
                        Details = "Le solveur strict n'a pas trouve de solution certifiee, mais le moteur a produit une proposition de secours exploitable.",
                        SuggestedFix = "Ajuster les effectifs, les competences requises ou les indisponibilites puis relancer."
                    }
                ]
            };

            ApplyQualityScore(strictFallbackResponse, planning.Personnel.Count, totalDays);
            return strictFallbackResponse;
        }

        var fallback = BuildFallbackAssignments(planning.Personnel, postes, totalDays);

        var fallbackMessage = _aiPlanningOptions.Enabled
            ? $"Solveur IA indisponible, generation locale appliquee ({fallback.Count} affectations)."
            : $"Generation locale appliquee ({fallback.Count} affectations).";

        EnforceAutomaticRestAndFillGaps(
            request,
            fallback,
            planning.Personnel.Select(p => p.Id),
            totalDays);

        var fallbackResponse = new GeneratePlanningResponse
        {
            Assignments = fallback,
            Partial = false,
            Message = fallbackMessage
        };

        ApplyQualityScore(fallbackResponse, planning.Personnel.Count, totalDays);

        return fallbackResponse;
    }

    private static void EnforceAutomaticRestAndFillGaps(
        GeneratePlanningRequest request,
        List<PlanningAssignment> assignments,
        IEnumerable<string> personnelIds,
        int totalDays)
    {
        if (assignments.Count == 0 || totalDays <= 0)
        {
            return;
        }

        static string BuildCellKey(string personnelId, int day)
            => $"{personnelId}|{day}";

        var occupiedCells = new HashSet<string>(StringComparer.Ordinal);
        foreach (var assignment in assignments)
        {
            if (!string.IsNullOrWhiteSpace(assignment.PersonnelId) && assignment.Day >= 0)
            {
                occupiedCells.Add(BuildCellKey(assignment.PersonnelId, assignment.Day));
            }
        }

        var allPersonnelIds = personnelIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var id in assignments.Select(a => a.PersonnelId).Where(id => !string.IsNullOrWhiteSpace(id)))
        {
            if (!allPersonnelIds.Contains(id, StringComparer.OrdinalIgnoreCase))
            {
                allPersonnelIds.Add(id);
            }
        }

        var now = DateTime.UtcNow;

        if (request.Constraints.EnforceSecurityRestAfterGuardOrNight)
        {
            var restAssignments = new List<PlanningAssignment>();
            foreach (var assignment in assignments)
            {
                if (!IsGuardOrNightAssignment(assignment))
                {
                    continue;
                }

                var nextDay = assignment.Day + 1;
                if (nextDay < 0 || nextDay >= totalDays)
                {
                    continue;
                }

                var nextDayCell = BuildCellKey(assignment.PersonnelId, nextDay);
                if (occupiedCells.Contains(nextDayCell))
                {
                    continue;
                }

                restAssignments.Add(new PlanningAssignment
                {
                    Id = $"AUTO-REST-{assignment.PersonnelId}-{nextDay}",
                    PersonnelId = assignment.PersonnelId,
                    Day = nextDay,
                    ShiftType = "repos",
                    PosteLabel = "Repos",
                    StartTime = "00:00",
                    EndTime = "00:00",
                    Note = "Repos automatique apres garde ou nuit",
                    CreatedAt = now,
                    UpdatedAt = now
                });
                occupiedCells.Add(nextDayCell);
            }

            if (restAssignments.Count > 0)
            {
                assignments.AddRange(restAssignments);
            }
        }

        // Fill every empty employee/day cell with a rest assignment to avoid blank grid cells.
        var filledRestAssignments = new List<PlanningAssignment>();
        foreach (var personnelId in allPersonnelIds)
        {
            for (var day = 0; day < totalDays; day++)
            {
                var key = BuildCellKey(personnelId, day);
                if (occupiedCells.Contains(key))
                {
                    continue;
                }

                filledRestAssignments.Add(new PlanningAssignment
                {
                    Id = $"AUTO-EMPTY-REST-{personnelId}-{day}",
                    PersonnelId = personnelId,
                    Day = day,
                    ShiftType = "repos",
                    PosteLabel = "Repos",
                    StartTime = "00:00",
                    EndTime = "00:00",
                    Note = "Repos automatique (case vide)",
                    CreatedAt = now,
                    UpdatedAt = now
                });
                occupiedCells.Add(key);
            }
        }

        if (filledRestAssignments.Count > 0)
        {
            assignments.AddRange(filledRestAssignments);
        }

        EnsureTwoRestDaysPerEmployee(assignments, allPersonnelIds, totalDays, now);

        assignments.Sort(static (left, right) =>
        {
            var dayComparison = left.Day.CompareTo(right.Day);
            if (dayComparison != 0)
            {
                return dayComparison;
            }

            var personnelComparison = string.Compare(left.PersonnelId, right.PersonnelId, StringComparison.Ordinal);
            if (personnelComparison != 0)
            {
                return personnelComparison;
            }

            return string.Compare(left.StartTime, right.StartTime, StringComparison.Ordinal);
        });
    }

    private static bool IsGuardOrNightAssignment(PlanningAssignment assignment)
    {
        var shiftType = assignment.ShiftType?.Trim();
        if (!string.IsNullOrWhiteSpace(shiftType) &&
            (shiftType.Contains("garde", StringComparison.OrdinalIgnoreCase)
             || shiftType.Contains("nuit", StringComparison.OrdinalIgnoreCase)
             || shiftType.Contains("night", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var posteLabel = assignment.PosteLabel?.Trim();
        return !string.IsNullOrWhiteSpace(posteLabel)
            && (posteLabel.Contains("garde", StringComparison.OrdinalIgnoreCase)
                || posteLabel.Contains("nuit", StringComparison.OrdinalIgnoreCase)
                || posteLabel.Contains("night", StringComparison.OrdinalIgnoreCase));
    }

    private static void EnsureTwoRestDaysPerEmployee(
        List<PlanningAssignment> assignments,
        IReadOnlyList<string> personnelIds,
        int totalDays,
        DateTime now)
    {
        if (totalDays <= 0)
        {
            return;
        }

        foreach (var personnelId in personnelIds)
        {
            if (string.IsNullOrWhiteSpace(personnelId))
            {
                continue;
            }

            var normalizedId = personnelId.Trim();
            var personAssignments = assignments
                .Where(a => string.Equals(a.PersonnelId, normalizedId, StringComparison.OrdinalIgnoreCase)
                            && a.Day >= 0
                            && a.Day < totalDays)
                .ToList();

            var restDays = personAssignments
                .Where(IsRestAssignment)
                .Select(a => a.Day)
                .Distinct()
                .ToHashSet();

            if (restDays.Count >= 2)
            {
                continue;
            }

            var daysByPriority = Enumerable.Range(0, totalDays)
                .OrderByDescending(day => day)
                .ToList();

            foreach (var day in daysByPriority)
            {
                if (restDays.Count >= 2)
                {
                    break;
                }

                if (restDays.Contains(day))
                {
                    continue;
                }

                var dayAssignments = personAssignments.Where(a => a.Day == day).ToList();
                if (dayAssignments.Count == 0)
                {
                    var created = new PlanningAssignment
                    {
                        Id = $"AUTO-REST-MIN2-{normalizedId}-{day}",
                        PersonnelId = normalizedId,
                        Day = day,
                        ShiftType = "repos",
                        PosteLabel = "Repos",
                        StartTime = "00:00",
                        EndTime = "00:00",
                        Note = "Repos automatique (minimum hebdomadaire)",
                        CreatedAt = now,
                        UpdatedAt = now
                    };
                    assignments.Add(created);
                    personAssignments.Add(created);
                    restDays.Add(day);
                    continue;
                }

                if (dayAssignments.Any(IsRestAssignment))
                {
                    restDays.Add(day);
                    continue;
                }

                var replaceable = dayAssignments
                    .Where(a => !IsGuardOrNightAssignment(a))
                    .OrderBy(a => a.StartTime, StringComparer.Ordinal)
                    .FirstOrDefault();

                if (replaceable is null)
                {
                    replaceable = dayAssignments
                        .OrderBy(a => a.StartTime, StringComparer.Ordinal)
                        .First();
                }

                replaceable.ShiftType = "repos";
                replaceable.PosteId = null;
                replaceable.PosteLabel = "Repos";
                replaceable.StartTime = "00:00";
                replaceable.EndTime = "00:00";
                replaceable.Note = "Repos automatique (minimum 2 jours/semaine)";
                replaceable.UpdatedAt = now;

                foreach (var extra in dayAssignments.Where(a => !ReferenceEquals(a, replaceable)).ToList())
                {
                    assignments.Remove(extra);
                    personAssignments.Remove(extra);
                }

                restDays.Add(day);
            }
        }
    }

    private static bool IsRestAssignment(PlanningAssignment assignment)
    {
        return string.Equals(assignment.ShiftType?.Trim(), "repos", StringComparison.OrdinalIgnoreCase)
               || string.Equals(assignment.PosteLabel?.Trim(), "repos", StringComparison.OrdinalIgnoreCase);
    }

    private static void ApplyQualityScore(GeneratePlanningResponse response, int personnelCount, int totalDays)
    {
        if (personnelCount <= 0 || totalDays <= 0)
        {
            response.QualityScore = 0;
            return;
        }

        var expectedAssignments = personnelCount * totalDays;
        var coverageRatio = expectedAssignments <= 0
            ? 0d
            : Math.Min(1d, response.Assignments.Count / (double)expectedAssignments);

        var criticalCount = response.Conflicts.Count(conflict => string.Equals(conflict.Severity, "critical", StringComparison.OrdinalIgnoreCase));
        var warningCount = response.Conflicts.Count(conflict => string.Equals(conflict.Severity, "warning", StringComparison.OrdinalIgnoreCase));

        var score = (int)Math.Round(coverageRatio * 100d);
        score -= criticalCount * 25;
        score -= warningCount * 8;

        if (response.Partial)
        {
            score -= 10;
        }

        response.QualityScore = Math.Clamp(score, 0, 100);
    }

    private static bool IsBetterPlanningResult(GeneratePlanningResponse candidate, GeneratePlanningResponse? baseline)
    {
        if (baseline is null)
        {
            return true;
        }

        var candidateAssignments = candidate.Assignments.Count;
        var baselineAssignments = baseline.Assignments.Count;
        if (candidateAssignments != baselineAssignments)
        {
            return candidateAssignments > baselineAssignments;
        }

        var candidateCritical = candidate.Conflicts.Count(conflict => string.Equals(conflict.Severity, "critical", StringComparison.OrdinalIgnoreCase));
        var baselineCritical = baseline.Conflicts.Count(conflict => string.Equals(conflict.Severity, "critical", StringComparison.OrdinalIgnoreCase));
        if (candidateCritical != baselineCritical)
        {
            return candidateCritical < baselineCritical;
        }

        var candidateWarnings = candidate.Conflicts.Count(conflict => string.Equals(conflict.Severity, "warning", StringComparison.OrdinalIgnoreCase));
        var baselineWarnings = baseline.Conflicts.Count(conflict => string.Equals(conflict.Severity, "warning", StringComparison.OrdinalIgnoreCase));
        return candidateWarnings < baselineWarnings;
    }

    private sealed record BestEffortAttempt(
        GeneratePlanningRequest Request,
        string Message,
        string Details);

    private static List<BestEffortAttempt> BuildStrictBestEffortAttempts(GeneratePlanningRequest request)
    {
        return
        [
            new BestEffortAttempt(
                CloneRequestWithRelaxedCoverage(request),
                "Couverture complete impossible: meilleur planning partiel genere en conservant les regles de securite obligatoires.",
                "Assouplissement applique: couverture complete non obligatoire."),
            new BestEffortAttempt(
                CloneRequestWithRelaxedCoverageAndUnlockedAssignments(request),
                "Meilleur planning partiel genere apres assouplissement des verrous incompatibles.",
                "Assouplissements appliques: couverture complete non obligatoire et verrous non bloquants."),
            new BestEffortAttempt(
                CloneRequestWithFairnessRelaxed(request),
                "Meilleur planning partiel genere apres assouplissement des contraintes d'equite.",
                "Assouplissements appliques: couverture/verrous + limites de consecutif, repos hebdomadaire simplifie et quota nuit mensuel.")
        ];
    }

    private static GeneratePlanningRequest CloneRequestWithRelaxedCoverage(GeneratePlanningRequest request)
    {
        return new GeneratePlanningRequest
        {
            ServiceId = request.ServiceId,
            WeekStart = request.WeekStart,
            WeekEnd = request.WeekEnd,
            Constraints = new GeneratePlanningConstraints
            {
                UserAcceptedMandatoryRules = request.Constraints.UserAcceptedMandatoryRules,
                UserAcceptedAtUtc = request.Constraints.UserAcceptedAtUtc,
                RequirePostCoverage = false,
                EnforceSlotIncompatibilities = request.Constraints.EnforceSlotIncompatibilities,
                RespectReposLegaux = request.Constraints.RespectReposLegaux,
                CompetencesObligatoires = request.Constraints.CompetencesObligatoires,
                EnforceBlockingUnavailabilities = request.Constraints.EnforceBlockingUnavailabilities,
                EnforceMaxDailyDuration12h = request.Constraints.EnforceMaxDailyDuration12h,
                EnforceSecurityRestAfterGuardOrNight = request.Constraints.EnforceSecurityRestAfterGuardOrNight,
                EnforceMaxConsecutiveDays6 = request.Constraints.EnforceMaxConsecutiveDays6,
                EnforceWeeklyRest35hSimplified = request.Constraints.EnforceWeeklyRest35hSimplified,
                EnforceMonthlyNightQuota = request.Constraints.EnforceMonthlyNightQuota,
                PreserveLockedAssignments = request.Constraints.PreserveLockedAssignments,
                MaxMonthlyNightShifts = request.Constraints.MaxMonthlyNightShifts,
                PrioriserDisponibilites = request.Constraints.PrioriserDisponibilites
            }
        };
    }

    private static GeneratePlanningRequest CloneRequestWithRelaxedCoverageAndUnlockedAssignments(GeneratePlanningRequest request)
    {
        var clone = CloneRequestWithRelaxedCoverage(request);
        clone.Constraints.PreserveLockedAssignments = false;
        return clone;
    }

    private static GeneratePlanningRequest CloneRequestWithFairnessRelaxed(GeneratePlanningRequest request)
    {
        var clone = CloneRequestWithRelaxedCoverageAndUnlockedAssignments(request);
        clone.Constraints.EnforceMaxConsecutiveDays6 = false;
        clone.Constraints.EnforceWeeklyRest35hSimplified = true;
        clone.Constraints.EnforceMonthlyNightQuota = false;
        return clone;
    }

    private async Task<GeneratePlanningResponse?> TryGenerateWithIntelligentSolverAsync(
        GeneratePlanningRequest request,
        PlanningData planning,
        List<PosteTemplate> postes)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var agents = await BuildSolverAgentsAsync(connection, request.ServiceId, request.WeekStart, request.WeekEnd);
        if (agents.Count == 0)
        {
            return null;
        }

        var slots = BuildSolverSlots(request, postes, planning.Assignments);
        if (slots.Count == 0)
        {
            return null;
        }

        var solverInput = BuildSolverInput(request, agents, slots, out var agentLookup, out var slotLookup);
        var solver = new MediPlan.Services.IntelligentSolver();
        var result = solver.Solve(solverInput);

        foreach (var assignment in result.Assignments)
        {
            if (int.TryParse(assignment.PersonnelId, out var agentInternalId)
                && agentLookup.TryGetValue(agentInternalId, out var originalAgentId))
            {
                assignment.PersonnelId = originalAgentId;
            }

            if (int.TryParse(assignment.Id.Split('-').ElementAtOrDefault(2), out var slotInternalId)
                && slotLookup.TryGetValue(slotInternalId, out var originalSlot))
            {
                assignment.Id = $"AI-{assignment.PersonnelId}-{originalSlot.Id}";
                assignment.PosteId = originalSlot.PosteId;
                assignment.PosteLabel = originalSlot.PosteLabel;
                assignment.ShiftType = originalSlot.ShiftType;
                assignment.StartTime = originalSlot.StartTime;
                assignment.EndTime = originalSlot.EndTime;
            }
        }

        if (result.Assignments.Count > 0)
        {
            result.Message ??= $"Planning genere par solveur OR-Tools ({result.Assignments.Count} affectations).";
        }

        return result;
    }

    private static MediPlan.Services.SolverInput BuildSolverInput(
        GeneratePlanningRequest request,
        IReadOnlyList<IntelligentSolver.Agent> agents,
        IReadOnlyList<IntelligentSolver.Slot> slots,
        out Dictionary<int, string> agentLookup,
        out Dictionary<int, IntelligentSolver.Slot> slotLookup)
    {
        var agentLookupLocal = new Dictionary<int, string>();
        var slotLookupLocal = new Dictionary<int, IntelligentSolver.Slot>();

        var agentMap = agents.Select((agent, index) => new { agent, index }).ToDictionary(item => item.agent.Id, item => item.index + 1, StringComparer.OrdinalIgnoreCase);
        var slotMap = slots.Select((slot, index) => new { slot, index }).ToDictionary(item => item.slot.Id, item => item.index + 1, StringComparer.OrdinalIgnoreCase);

        var solverAgents = agents.Select(agent =>
        {
            var internalId = agentMap[agent.Id];
            agentLookupLocal[internalId] = agent.Id;

            return new MediPlan.Services.SolverAgent(
                internalId,
                agent.DisplayName,
                new HashSet<int>(agent.CompetenceIds),
                agent.Unavailabilities.Select(window => new MediPlan.Services.UnavailabilityWindow(
                    window.Start,
                    window.End,
                    window.Reason ?? string.Empty,
                    window.IsBlocking)).ToList(),
                agent.Preferences.Select(preference => new MediPlan.Services.PreferenceRule(
                    preference.DayIndex,
                    preference.ShiftType,
                    preference.Weight)).ToList(),
                agent.HistoricalNightGuardsInMonth,
                agent.ConsecutiveWorkedDaysBeforeWeek,
                agent.ConsecutiveWorkedWeekendsBeforeWeek);
        }).ToList();

        var solverSlots = slots.Select(slot =>
        {
            var internalId = slotMap[slot.Id];
            slotLookupLocal[internalId] = slot;

            return new MediPlan.Services.SolverSlot(
                internalId,
                slot.PosteLabel ?? slot.PosteId ?? "Poste",
                CombineDateAndTime(request.WeekStart.AddDays(slot.DayIndex), slot.StartTime),
                CombineDateAndTime(request.WeekStart.AddDays(slot.DayIndex), slot.EndTime) <= CombineDateAndTime(request.WeekStart.AddDays(slot.DayIndex), slot.StartTime)
                    ? CombineDateAndTime(request.WeekStart.AddDays(slot.DayIndex), slot.EndTime).AddDays(1)
                    : CombineDateAndTime(request.WeekStart.AddDays(slot.DayIndex), slot.EndTime),
                slot.RequiredCoverage,
                new HashSet<int>(slot.RequiredCompetenceIds),
                int.TryParse(slot.PosteId, out var posteId) ? posteId : null,
                slot.ShiftType,
                slot.DayIndex,
                string.IsNullOrWhiteSpace(slot.LockedPersonnelId) || !agentMap.TryGetValue(slot.LockedPersonnelId, out var lockedAgentId) ? null : lockedAgentId,
                IsNightSlot(slot.ShiftType, slot.PosteLabel, slot.StartTime, slot.EndTime),
                IsGuardSlot(slot.ShiftType, slot.PosteLabel, slot.StartTime, slot.EndTime));
        }).ToList();

            agentLookup = agentLookupLocal;
            slotLookup = slotLookupLocal;

        return new MediPlan.Services.SolverInput(
            request.ServiceId,
            request.WeekStart,
            request.WeekEnd,
            solverAgents,
            solverSlots);
    }

    private static bool IsNightSlot(string? shiftType, string? label, string? startTime, string? endTime)
    {
        var normalized = $"{shiftType} {label}".ToLowerInvariant();
        if (normalized.Contains("nuit") || normalized.Contains("garde_nuit"))
        {
            return true;
        }

        if (TimeSpan.TryParse(startTime, out var start) && TimeSpan.TryParse(endTime, out var end))
        {
            return end <= start || start >= TimeSpan.FromHours(20) || end <= TimeSpan.FromHours(8);
        }

        return false;
    }

    private static bool IsGuardSlot(string? shiftType, string? label, string? startTime, string? endTime)
    {
        var normalized = $"{shiftType} {label}".ToLowerInvariant();
        if (normalized.Contains("garde"))
        {
            return true;
        }

        if (TimeSpan.TryParse(startTime, out var start) && TimeSpan.TryParse(endTime, out var end))
        {
            var duration = end > start ? end - start : (TimeSpan.FromDays(1) - start) + end;
            return duration.TotalHours >= 24;
        }

        return false;
    }
    private async Task<GeneratePlanningResponse?> TryGenerateWithExternalSolverAsync(
        GeneratePlanningRequest request,
        PlanningData planning,
        List<PosteTemplate> postes)
    {
        using var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(Math.Clamp(_aiPlanningOptions.TimeoutSeconds, 5, 120));

        if (!string.IsNullOrWhiteSpace(_aiPlanningOptions.ApiKey))
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _aiPlanningOptions.ApiKey);
            client.DefaultRequestHeaders.Add("X-API-Key", _aiPlanningOptions.ApiKey);
        }

        var payload = new
        {
            serviceId = request.ServiceId,
            weekStart = request.WeekStart.ToString("yyyy-MM-dd"),
            weekEnd = request.WeekEnd.ToString("yyyy-MM-dd"),
            constraints = new
            {
                userAcceptedMandatoryRules = request.Constraints.UserAcceptedMandatoryRules,
                userAcceptedAtUtc = request.Constraints.UserAcceptedAtUtc,
                requirePostCoverage = request.Constraints.RequirePostCoverage,
                enforceSlotIncompatibilities = request.Constraints.EnforceSlotIncompatibilities,
                respectReposLegaux = request.Constraints.RespectReposLegaux,
                competencesObligatoires = request.Constraints.CompetencesObligatoires,
                enforceBlockingUnavailabilities = request.Constraints.EnforceBlockingUnavailabilities,
                enforceMaxDailyDuration12h = request.Constraints.EnforceMaxDailyDuration12h,
                enforceSecurityRestAfterGuardOrNight = request.Constraints.EnforceSecurityRestAfterGuardOrNight,
                enforceMaxConsecutiveDays6 = request.Constraints.EnforceMaxConsecutiveDays6,
                enforceWeeklyRest35hSimplified = request.Constraints.EnforceWeeklyRest35hSimplified,
                enforceMonthlyNightQuota = request.Constraints.EnforceMonthlyNightQuota,
                preserveLockedAssignments = request.Constraints.PreserveLockedAssignments,
                maxMonthlyNightShifts = request.Constraints.MaxMonthlyNightShifts,
                prioriserDisponibilites = request.Constraints.PrioriserDisponibilites
            },
            personnel = planning.Personnel.Select(p => new { id = p.Id, nom = p.Nom, prenom = p.Prenom }).ToList(),
            postes = postes.Select(p => new
            {
                id = p.Id,
                label = p.Nom,
                shiftType = p.ShiftType,
                startTime = p.HeureDebut,
                endTime = p.HeureFin
            }).ToList()
        };

        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, _aiPlanningOptions.Endpoint)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }), Encoding.UTF8, "application/json")
        };

        using var response = await client.SendAsync(requestMessage);
        var raw = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"{(int)response.StatusCode} {response.ReasonPhrase}: {raw}");
        }

        var parsed = ParseSolverAssignments(raw, request.WeekStart.Date, out var isPartial);
        if (parsed.Count == 0)
        {
            return null;
        }

        return new GeneratePlanningResponse
        {
            Assignments = parsed,
            Partial = isPartial,
            Message = $"Planning genere par le solveur IA ({parsed.Count} affectations)."
        };
    }

    private static List<PlanningAssignment> ParseSolverAssignments(string json, DateTime weekStart, out bool isPartial)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        isPartial = ResolvePartialFlag(root);
        var array = ResolveAssignmentsArray(root);
        if (array is null || array.Value.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<PlanningAssignment>();
        foreach (var item in array.Value.EnumerateArray())
        {
            var personnelId = GetString(item, "personnelId")
                ?? GetString(item, "userId")
                ?? GetString(item, "employeeId")
                ?? GetString(item, "staffId")
                ?? GetString(item, "assigneeId");
            if (string.IsNullOrWhiteSpace(personnelId))
            {
                continue;
            }

            var day = ResolveDay(item, weekStart);
            if (day < 0)
            {
                continue;
            }

            var posteId = GetString(item, "posteId")
                ?? GetString(item, "shiftId")
                ?? GetString(item, "roleId");
            var posteLabel = GetString(item, "posteLabel")
                ?? GetString(item, "label")
                ?? GetString(item, "shiftLabel")
                ?? GetString(item, "role")
                ?? "Poste";
            var shiftType = GetString(item, "shiftType")
                ?? GetString(item, "type")
                ?? GetString(item, "shift")
                ?? "jour";
            var startTime = GetString(item, "startTime")
                ?? GetString(item, "heureDebut")
                ?? GetString(item, "start")
                ?? "08:00";
            var endTime = GetString(item, "endTime")
                ?? GetString(item, "heureFin")
                ?? GetString(item, "end")
                ?? "16:00";

            result.Add(new PlanningAssignment
            {
                Id = GetString(item, "id") ?? $"AI-{personnelId}-{day}-{posteId}",
                PersonnelId = personnelId,
                Day = day,
                ShiftType = shiftType,
                PosteId = posteId,
                PosteLabel = posteLabel,
                StartTime = startTime,
                EndTime = endTime,
                Note = "Genere par solveur IA",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        return result;
    }

    private static JsonElement? ResolveAssignmentsArray(JsonElement root)
    {
        if (TryGetProperty(root, "assignments", out var assignments))
        {
            return assignments;
        }

        if (TryGetProperty(root, "proposedAssignments", out var proposed))
        {
            return proposed;
        }

        if (TryGetProperty(root, "data", out var data)
            && data.ValueKind == JsonValueKind.Object
            && TryGetProperty(data, "assignments", out var nestedAssignments))
        {
            return nestedAssignments;
        }

        if (TryGetProperty(root, "solution", out var solution)
            && solution.ValueKind == JsonValueKind.Object
            && TryGetProperty(solution, "assignments", out var solutionAssignments))
        {
            return solutionAssignments;
        }

        if (TryGetProperty(root, "result", out var result)
            && result.ValueKind == JsonValueKind.Object
            && TryGetProperty(result, "assignments", out var resultAssignments))
        {
            return resultAssignments;
        }

        if (TryGetProperty(root, "output", out var output)
            && output.ValueKind == JsonValueKind.Object
            && TryGetProperty(output, "assignments", out var outputAssignments))
        {
            return outputAssignments;
        }

        return null;
    }

    private static bool ResolvePartialFlag(JsonElement root)
    {
        if (TryGetProperty(root, "partial", out var partial))
        {
            return partial.ValueKind == JsonValueKind.True;
        }

        if (TryGetProperty(root, "isPartial", out var isPartial))
        {
            return isPartial.ValueKind == JsonValueKind.True;
        }

        if (TryGetProperty(root, "data", out var data)
            && data.ValueKind == JsonValueKind.Object
            && TryGetProperty(data, "partial", out var nestedPartial))
        {
            return nestedPartial.ValueKind == JsonValueKind.True;
        }

        return false;
    }

    private static bool TryGetProperty(JsonElement element, string propertyName, out JsonElement value)
    {
        foreach (var prop in element.EnumerateObject())
        {
            if (string.Equals(prop.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static string? GetString(JsonElement item, string propertyName)
    {
        if (!TryGetProperty(item, propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            _ => null
        };
    }

    private static int ResolveDay(JsonElement item, DateTime weekStart)
    {
        if (TryGetProperty(item, "day", out var dayValue) && dayValue.ValueKind == JsonValueKind.Number && dayValue.TryGetInt32(out var dayIndex))
        {
            return dayIndex;
        }

        if (TryGetProperty(item, "dayIndex", out var dayIndexValue) && dayIndexValue.ValueKind == JsonValueKind.Number && dayIndexValue.TryGetInt32(out var altDayIndex))
        {
            return altDayIndex;
        }

        if (TryGetProperty(item, "dateIndex", out var dateIndexValue) && dateIndexValue.ValueKind == JsonValueKind.Number && dateIndexValue.TryGetInt32(out var dateIndex))
        {
            return dateIndex;
        }

        if (TryGetProperty(item, "dayOfWeek", out var dayOfWeek) && dayOfWeek.ValueKind == JsonValueKind.Number && dayOfWeek.TryGetInt32(out var dow))
        {
            return dow;
        }

        var dateValue = GetString(item, "date") ?? GetString(item, "jour");
        if (!string.IsNullOrWhiteSpace(dateValue) && DateTime.TryParse(dateValue, out var date))
        {
            return Math.Max(0, (date.Date - weekStart.Date).Days);
        }

        return -1;
    }

    private static List<PlanningAssignment> BuildFallbackAssignments(IReadOnlyList<PersonnelInfo> personnel, IReadOnlyList<PosteTemplate> postes, int totalDays)
    {
        var generated = new List<PlanningAssignment>();
        if (personnel.Count == 0 || totalDays <= 0)
        {
            return generated;
        }

        var workPostes = postes
            .Where(p => !string.Equals(p.ShiftType?.Trim(), "repos", StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(p.Nom?.Trim(), "repos", StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (workPostes.Count == 0)
        {
            workPostes = postes.ToList();
        }

        for (var idx = 0; idx < personnel.Count; idx++)
        {
            var person = personnel[idx];

            var firstRestDay = (idx + 5) % totalDays;
            var secondRestDay = (firstRestDay + 3) % totalDays;
            if (secondRestDay == firstRestDay)
            {
                secondRestDay = (secondRestDay + 1) % totalDays;
            }

            for (var day = 0; day < totalDays; day++)
            {
                var isRestDay = day == firstRestDay || day == secondRestDay;
                if (isRestDay)
                {
                    generated.Add(new PlanningAssignment
                    {
                        Id = $"AI-{person.Id}-{day}-repos",
                        PersonnelId = person.Id,
                        Day = day,
                        ShiftType = "repos",
                        PosteId = null,
                        PosteLabel = "Repos",
                        StartTime = "00:00",
                        EndTime = "00:00",
                        Note = "Genere automatiquement (repos minimum)",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                    continue;
                }

                var poste = workPostes[(idx + day) % workPostes.Count];

                generated.Add(new PlanningAssignment
                {
                    Id = $"AI-{person.Id}-{day}-{poste.Id}",
                    PersonnelId = person.Id,
                    Day = day,
                    ShiftType = string.IsNullOrWhiteSpace(poste.ShiftType) ? "jour" : poste.ShiftType,
                    PosteId = poste.Id == 0 ? null : poste.Id.ToString(),
                    PosteLabel = poste.Nom,
                    StartTime = poste.HeureDebut,
                    EndTime = poste.HeureFin,
                    Note = "Genere automatiquement (fallback)",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        return generated;
    }

    private async Task<List<PosteTemplate>> GetCandidatePostesAsync(int serviceId)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string sql = @"
SELECT id, nom, type, heure_debut, heure_fin, jour_suivant, services_autorises, competences_requises, effectif_min
FROM postes
WHERE actif = 1
ORDER BY id;";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();

        var result = new List<PosteTemplate>();
        while (await reader.ReadAsync())
        {
            var servicesRaw = reader.IsDBNull(reader.GetOrdinal("services_autorises"))
                ? null
                : reader.GetString("services_autorises");

            var services = ParseServicesAutorises(servicesRaw);
            if (services.Count > 0 && !services.Contains(serviceId))
            {
                continue;
            }

            result.Add(new PosteTemplate(
                reader.GetInt32("id"),
                reader.IsDBNull(reader.GetOrdinal("nom")) ? "Poste" : reader.GetString("nom"),
                reader.IsDBNull(reader.GetOrdinal("type")) ? "jour" : reader.GetString("type"),
                reader.IsDBNull(reader.GetOrdinal("heure_debut")) ? "08:00" : reader.GetString("heure_debut"),
                reader.IsDBNull(reader.GetOrdinal("heure_fin")) ? "16:00" : reader.GetString("heure_fin"),
                !reader.IsDBNull(reader.GetOrdinal("jour_suivant")) && reader.GetBoolean("jour_suivant"),
                reader.IsDBNull(reader.GetOrdinal("effectif_min")) ? 1 : Math.Max(1, reader.GetInt32("effectif_min")),
                services,
                ParseIntList(reader.IsDBNull(reader.GetOrdinal("competences_requises")) ? null : reader.GetString("competences_requises"))));
        }

        return result;
    }

    private async Task<List<IntelligentSolver.Agent>> BuildSolverAgentsAsync(
        MySqlConnection connection,
        int serviceId,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var start = NormalizeDate(weekStart);
        var end = NormalizeDate(weekEnd);
        if (end < start)
        {
            end = start.AddDays(6);
        }

        var agents = new Dictionary<string, IntelligentSolver.Agent>(StringComparer.OrdinalIgnoreCase);

        const string staffSql = @"
SELECT
    u.id,
    TRIM(CONCAT(COALESCE(u.prenom, ''), ' ', COALESCE(u.nom, ''))) AS display_name,
    u.competences_json,
    GROUP_CONCAT(DISTINCT uc.competence_id ORDER BY uc.competence_id SEPARATOR '|') AS competence_ids
FROM staff_users u
LEFT JOIN utilisateur_competence uc ON uc.utilisateur_id = u.id
WHERE u.service_id = @serviceId
  AND u.actif = 1
GROUP BY u.id, u.nom, u.prenom
ORDER BY u.nom, u.prenom;";

        await using (var staffCmd = new MySqlCommand(staffSql, connection))
        {
            staffCmd.Parameters.AddWithValue("@serviceId", serviceId);
            await using var reader = await staffCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var id = reader["id"]?.ToString() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(id))
                {
                    continue;
                }

                agents[id] = new IntelligentSolver.Agent
                {
                    Id = id,
                    DisplayName = reader.IsDBNull(reader.GetOrdinal("display_name")) ? id : reader.GetString("display_name"),
                    CompetenceIds = ParsePipeSeparatedInts(reader.IsDBNull(reader.GetOrdinal("competence_ids")) ? null : reader.GetString("competence_ids"))
                        .Concat(ParseIntList(reader.IsDBNull(reader.GetOrdinal("competences_json")) ? null : reader.GetString("competences_json")))
                        .Distinct()
                        .ToHashSet()
                };
            }
        }

        if (agents.Count == 0)
        {
            return [];
        }

        const string requestsSql = @"
SELECT user_id, date_evenement, date_fin_evenement, heure_debut, heure_fin, type_demande, statut, commentaire
FROM demandes_utilisateur
WHERE service_id = @serviceId
  AND user_id IS NOT NULL
  AND statut IN ('APPROUVEE', 'INFORMATIF')
  AND date_evenement <= @weekEnd
  AND COALESCE(date_fin_evenement, date_evenement) >= @weekStart
ORDER BY user_id, date_evenement;";

        await using (var requestsCmd = new MySqlCommand(requestsSql, connection))
        {
            requestsCmd.Parameters.AddWithValue("@serviceId", serviceId);
            requestsCmd.Parameters.AddWithValue("@weekStart", start);
            requestsCmd.Parameters.AddWithValue("@weekEnd", end);
            await using var reader = await requestsCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var userId = reader["user_id"]?.ToString() ?? string.Empty;
                if (!agents.TryGetValue(userId, out var agent))
                {
                    continue;
                }

                var type = NormalizeSolverRequestType(reader["type_demande"]?.ToString());
                var requestStartDate = reader.GetDateTime("date_evenement").Date;
                var requestEndDate = reader.IsDBNull(reader.GetOrdinal("date_fin_evenement"))
                    ? requestStartDate
                    : reader.GetDateTime("date_fin_evenement").Date;

                var startTime = reader.IsDBNull(reader.GetOrdinal("heure_debut")) ? "00:00" : reader.GetString("heure_debut");
                var endTime = reader.IsDBNull(reader.GetOrdinal("heure_fin")) ? "00:00" : reader.GetString("heure_fin");

                var windowStart = CombineDateAndTime(requestStartDate, startTime);
                var windowEnd = CombineDateAndTime(requestEndDate, endTime);

                if (requestEndDate > requestStartDate || startTime == "00:00" && endTime == "00:00")
                {
                    windowStart = requestStartDate.Date;
                    windowEnd = requestEndDate.Date.AddDays(1);
                }
                else if (windowEnd <= windowStart)
                {
                    windowEnd = windowEnd.AddDays(1);
                }

                agent.Unavailabilities.Add(new IntelligentSolver.UnavailabilityWindow
                {
                    Start = windowStart,
                    End = windowEnd,
                    IsBlocking = IsBlockingRequestType(type),
                    Reason = reader.IsDBNull(reader.GetOrdinal("commentaire")) ? type : reader.GetString("commentaire")
                });

                if (TryMapPreference(type, out var preferenceKind, out var preferenceShiftType))
                {
                    agent.Preferences.Add(new IntelligentSolver.PreferenceRule
                    {
                        ShiftType = preferenceShiftType,
                        Weight = 8,
                        Kind = preferenceKind
                    });
                }
            }
        }

        var monthStart = new DateTime(start.Year, start.Month, 1);
        const string historySql = @"
SELECT
    pa.personnel_id,
    pw.week_start,
    pa.day_index,
    pa.shift_type
FROM planning_assignments pa
INNER JOIN planning_weeks pw ON pw.id = pa.planning_week_id
WHERE pw.service_id = @serviceId
  AND pa.personnel_id IS NOT NULL
  AND pw.week_start >= @monthStart
  AND pw.week_start <= @weekEnd
ORDER BY pa.personnel_id, pw.week_start, pa.day_index;";

        var historyRows = new List<(string PersonnelId, DateTime Date, string ShiftType)>();
        await using (var historyCmd = new MySqlCommand(historySql, connection))
        {
            historyCmd.Parameters.AddWithValue("@serviceId", serviceId.ToString());
            historyCmd.Parameters.AddWithValue("@monthStart", monthStart);
            historyCmd.Parameters.AddWithValue("@weekEnd", end);
            await using var reader = await historyCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var personnelId = reader["personnel_id"]?.ToString() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(personnelId))
                {
                    continue;
                }

                var planningDate = reader.GetDateTime("week_start").Date.AddDays(reader.GetInt32("day_index"));
                var shiftType = reader.IsDBNull(reader.GetOrdinal("shift_type")) ? "jour" : reader.GetString("shift_type");
                historyRows.Add((personnelId, planningDate, shiftType));
            }
        }

        foreach (var agent in agents.Values)
        {
            var rows = historyRows
                .Where(r => string.Equals(r.PersonnelId, agent.Id, StringComparison.OrdinalIgnoreCase))
                .OrderBy(r => r.Date)
                .ToList();

            agent.HistoricalNightGuardsInMonth = rows.Count(r =>
                string.Equals(r.ShiftType, "nuit", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(r.ShiftType, "garde_nuit", StringComparison.OrdinalIgnoreCase));

            var workedDatesBeforeWeek = rows
                .Where(r => r.Date < start)
                .Select(r => r.Date)
                .Distinct()
                .OrderByDescending(d => d)
                .ToList();

            agent.ConsecutiveWorkedDaysBeforeWeek = ComputeConsecutiveWorkedDays(workedDatesBeforeWeek, start);
            agent.ConsecutiveWorkedWeekendsBeforeWeek = ComputeConsecutiveWorkedWeekends(workedDatesBeforeWeek, start);
        }

        return agents.Values.ToList();
    }

    private static List<IntelligentSolver.Slot> BuildSolverSlots(
        GeneratePlanningRequest request,
        IReadOnlyList<PosteTemplate> postes,
        IReadOnlyList<PlanningAssignment> existingAssignments)
    {
        var weekStart = NormalizeDate(request.WeekStart);
        var weekEnd = NormalizeDate(request.WeekEnd);
        if (weekEnd < weekStart)
        {
            weekEnd = weekStart.AddDays(6);
        }

        var totalDays = (weekEnd - weekStart).Days + 1;
        var slots = new List<IntelligentSolver.Slot>();

        for (var day = 0; day < totalDays; day++)
        {
            var dayAssignments = existingAssignments
                .Where(a => a.Day == day)
                .ToList();

            foreach (var poste in postes)
            {
                var matchingLockedAssignments = dayAssignments
                    .Where(a => MatchesPosteTemplate(a, poste))
                    .ToList();

                foreach (var existing in matchingLockedAssignments)
                {
                    slots.Add(new IntelligentSolver.Slot
                    {
                        Id = $"locked-{day}-{existing.Id}",
                        DayIndex = day,
                        PosteId = existing.PosteId ?? poste.Id.ToString(),
                        PosteLabel = existing.PosteLabel ?? poste.Nom,
                        ShiftType = string.IsNullOrWhiteSpace(existing.ShiftType) ? poste.ShiftType : existing.ShiftType,
                        StartTime = string.IsNullOrWhiteSpace(existing.StartTime) ? poste.HeureDebut : existing.StartTime!,
                        EndTime = string.IsNullOrWhiteSpace(existing.EndTime) ? poste.HeureFin : existing.EndTime!,
                        RequiredCoverage = 1,
                        RequiredCompetenceIds = poste.RequiredCompetenceIds.ToHashSet(),
                        LockedPersonnelId = existing.PersonnelId
                    });
                }

                var remainingCoverage = Math.Max(0, poste.RequiredCoverage - matchingLockedAssignments.Count);
                for (var index = 0; index < remainingCoverage; index++)
                {
                    slots.Add(new IntelligentSolver.Slot
                    {
                        Id = $"slot-{day}-{poste.Id}-{index}",
                        DayIndex = day,
                        PosteId = poste.Id == 0 ? null : poste.Id.ToString(),
                        PosteLabel = poste.Nom,
                        ShiftType = poste.ShiftType,
                        StartTime = poste.HeureDebut,
                        EndTime = poste.HeureFin,
                        RequiredCoverage = 1,
                        RequiredCompetenceIds = poste.RequiredCompetenceIds.ToHashSet()
                    });
                }
            }
        }

        foreach (var orphanAssignment in existingAssignments)
        {
            var alreadyRepresented = slots.Any(slot =>
                slot.DayIndex == orphanAssignment.Day &&
                string.Equals(slot.LockedPersonnelId, orphanAssignment.PersonnelId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(slot.PosteId ?? string.Empty, orphanAssignment.PosteId ?? string.Empty, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(slot.StartTime, orphanAssignment.StartTime, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(slot.EndTime, orphanAssignment.EndTime, StringComparison.OrdinalIgnoreCase));

            if (alreadyRepresented)
            {
                continue;
            }

            slots.Add(new IntelligentSolver.Slot
            {
                Id = $"orphan-{orphanAssignment.Day}-{orphanAssignment.Id}",
                DayIndex = orphanAssignment.Day,
                PosteId = orphanAssignment.PosteId,
                PosteLabel = orphanAssignment.PosteLabel ?? "Poste verrouille",
                ShiftType = string.IsNullOrWhiteSpace(orphanAssignment.ShiftType) ? "jour" : orphanAssignment.ShiftType,
                StartTime = string.IsNullOrWhiteSpace(orphanAssignment.StartTime) ? "08:00" : orphanAssignment.StartTime!,
                EndTime = string.IsNullOrWhiteSpace(orphanAssignment.EndTime) ? "16:00" : orphanAssignment.EndTime!,
                RequiredCoverage = 1,
                LockedPersonnelId = orphanAssignment.PersonnelId
            });
        }

        return slots
            .OrderBy(s => s.DayIndex)
            .ThenBy(s => s.StartTime, StringComparer.Ordinal)
            .ThenBy(s => s.PosteLabel, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static List<int> ParseServicesAutorises(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        try
        {
            var values = JsonSerializer.Deserialize<List<int>>(raw);
            return values ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<int> ParseIntList(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        var trimmed = raw.Trim();

        try
        {
            using var doc = JsonDocument.Parse(trimmed);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var jsonValues = new List<int>();
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var number))
                    {
                        jsonValues.Add(number);
                    }
                    else if (item.ValueKind == JsonValueKind.String && int.TryParse(item.GetString(), out var parsed))
                    {
                        jsonValues.Add(parsed);
                    }
                }

                if (jsonValues.Count > 0)
                {
                    return jsonValues.Distinct().ToList();
                }
            }
        }
        catch
        {
            // Fallback texte delimite ci-dessous.
        }

        var values = new List<int>();
        foreach (var part in trimmed.Split([',', ';', '|', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var token = part.Trim('"', '\'', '[', ']', '(', ')');
            if (int.TryParse(token, out var parsed))
            {
                values.Add(parsed);
            }
        }

        return values.Distinct().ToList();
    }

    private static IEnumerable<int> ParsePipeSeparatedInts(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            yield break;
        }

        foreach (var part in raw.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (int.TryParse(part, out var value))
            {
                yield return value;
            }
        }
    }

    private static DateTime CombineDateAndTime(DateTime date, string? time)
    {
        if (!TimeSpan.TryParse(time, out var parsed))
        {
            parsed = TimeSpan.Zero;
        }

        return date.Date.Add(parsed);
    }

    private static string NormalizeSolverRequestType(string? type)
        => string.IsNullOrWhiteSpace(type) ? string.Empty : type.Trim().ToUpperInvariant();

    private static bool IsBlockingRequestType(string type)
        => type is "ABSENCE" or "ARRET" or "AT" or "VA" or "AL" or "JR";

    private static bool TryMapPreference(
        string type,
        out IntelligentSolver.AgentPreferenceKind kind,
        out string? shiftType)
    {
        switch (type)
        {
            case "AS":
                kind = IntelligentSolver.AgentPreferenceKind.Prefer;
                shiftType = "astreinte";
                return true;
            case "HS":
                kind = IntelligentSolver.AgentPreferenceKind.Avoid;
                shiftType = null;
                return true;
            default:
                kind = IntelligentSolver.AgentPreferenceKind.Prefer;
                shiftType = null;
                return false;
        }
    }

    private static int ComputeConsecutiveWorkedDays(IReadOnlyList<DateTime> workedDatesBeforeWeek, DateTime weekStart)
    {
        var expected = weekStart.Date.AddDays(-1);
        var count = 0;

        foreach (var date in workedDatesBeforeWeek)
        {
            if (date.Date != expected)
            {
                break;
            }

            count++;
            expected = expected.AddDays(-1);
            if (count >= 6)
            {
                break;
            }
        }

        return count;
    }

    private static int ComputeConsecutiveWorkedWeekends(IReadOnlyList<DateTime> workedDatesBeforeWeek, DateTime weekStart)
    {
        var workedSet = workedDatesBeforeWeek.Select(d => d.Date).ToHashSet();
        var count = 0;
        var cursor = weekStart.Date.AddDays(-(int)weekStart.DayOfWeek - 1);

        for (var i = 0; i < 4; i++)
        {
            var saturday = cursor.AddDays(-1);
            var sunday = cursor;
            if (!workedSet.Contains(saturday) && !workedSet.Contains(sunday))
            {
                break;
            }

            count++;
            cursor = cursor.AddDays(-7);
        }

        return count;
    }

    private static bool MatchesPosteTemplate(PlanningAssignment assignment, PosteTemplate poste)
    {
        if (!string.IsNullOrWhiteSpace(assignment.PosteId) &&
            string.Equals(assignment.PosteId, poste.Id.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(assignment.PosteLabel) &&
            string.Equals(assignment.PosteLabel, poste.Nom, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return string.Equals(assignment.StartTime, poste.HeureDebut, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(assignment.EndTime, poste.HeureFin, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(assignment.ShiftType, poste.ShiftType, StringComparison.OrdinalIgnoreCase);
    }
}
