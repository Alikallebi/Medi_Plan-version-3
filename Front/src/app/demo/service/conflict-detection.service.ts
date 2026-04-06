import { Injectable } from '@angular/core';
import { Conflict, PlanningData } from '../api/planning.models';

@Injectable({
    providedIn: 'root'
})
export class ConflictDetectionService {
    detectConflicts(planning: PlanningData): Conflict[] {
        const conflicts: Conflict[] = [];
        const totalDays = this.getPlanningSpanDays(planning);

        conflicts.push(...this.detectDoubleAssignments(planning, totalDays));
        conflicts.push(...this.detectOverlappingAssignments(planning, totalDays));
        conflicts.push(...this.detectGuardQuota(planning));
        conflicts.push(...this.detectRestViolations(planning, totalDays));
        conflicts.push(...this.detectPosteIncompatibilities(planning, totalDays));

        return conflicts;
    }

    private detectDoubleAssignments(planning: PlanningData, totalDays: number): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const person of planning.personnel) {
            for (let day = 0; day < totalDays; day++) {
                const dayAssignments = planning.assignments.filter(item => item.personnelId === person.id && item.day === day);
                if (dayAssignments.length > 1) {
                    conflicts.push({
                        id: `double-${person.id}-${day}`,
                        type: 'double_affectation',
                        description: `${person.prenom} ${person.nom} a plusieurs affectations le jour ${day + 1}.`,
                        severity: 'critical',
                        assignments: dayAssignments.map(item => item.id),
                        personnelId: person.id,
                        day,
                        suggestedFix: 'Conserver une seule affectation sur ce jour.'
                    });
                }
            }
        }

        return conflicts;
    }

    private detectOverlappingAssignments(planning: PlanningData, totalDays: number): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const person of planning.personnel) {
            for (let day = 0; day < totalDays; day++) {
                const dayAssignments = planning.assignments.filter(item => item.personnelId === person.id && item.day === day);
                if (dayAssignments.length < 2) {
                    continue;
                }

                for (let left = 0; left < dayAssignments.length; left++) {
                    for (let right = left + 1; right < dayAssignments.length; right++) {
                        const first = dayAssignments[left];
                        const second = dayAssignments[right];
                        if (this.overlaps(first.startTime, first.endTime, second.startTime, second.endTime)) {
                            conflicts.push({
                                id: `overlap-${person.id}-${day}-${left}-${right}`,
                                type: 'chevauchement_horaire',
                                description: `${person.prenom} ${person.nom} a des horaires qui se chevauchent en J${day + 1}.`,
                                severity: 'critical',
                                assignments: [first.id, second.id],
                                personnelId: person.id,
                                day,
                                details: `${first.startTime || '--:--'}-${first.endTime || '--:--'} chevauche ${second.startTime || '--:--'}-${second.endTime || '--:--'}`,
                                suggestedFix: 'Ajuster les horaires ou supprimer une affectation sur ce créneau.'
                            });
                        }
                    }
                }
            }
        }

        return conflicts;
    }

    private detectGuardQuota(planning: PlanningData): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const person of planning.personnel) {
            const guardAssignments = planning.assignments.filter(item => item.personnelId === person.id && item.shiftType === 'garde');
            if (guardAssignments.length > 3) {
                conflicts.push({
                    id: `quota-${person.id}`,
                    type: 'quota_depasse',
                    description: `${person.prenom} ${person.nom} dépasse le quota de gardes hebdomadaires (${guardAssignments.length}/3).`,
                    severity: 'warning',
                    assignments: guardAssignments.map(item => item.id),
                    personnelId: person.id,
                    suggestedFix: 'Réaffecter une garde vers un collègue disponible.'
                });
            }
        }

        return conflicts;
    }

    /** Shift types that represent rest or leave — these never violate work-rest rules. */
    private readonly REST_SHIFT_TYPES = new Set(['conges', 'conge', 'repos', 'ca', 'rtt', 'maladie', 'formation', 'absence']);

    private isRestOrLeave(shiftType?: string): boolean {
        return !!shiftType && this.REST_SHIFT_TYPES.has(shiftType.toLowerCase());
    }

    private detectRestViolations(planning: PlanningData, totalDays: number): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const person of planning.personnel) {
            for (let day = 1; day < totalDays; day++) {
                const previous = this.getMainAssignmentForDay(planning, person.id, day - 1);
                const current = this.getMainAssignmentForDay(planning, person.id, day);

                if (!previous || !current) {
                    continue;
                }

                // Repos/congés ne sont jamais soumis à la règle des 11h de repos
                if (this.isRestOrLeave(previous.shiftType) || this.isRestOrLeave(current.shiftType)) {
                    continue;
                }

                const restHours = this.restBetween(previous.endTime, current.startTime);
                const previousNight = previous.shiftType === 'nuit' || previous.shiftType === 'garde' || this.toMinutes(previous.endTime) <= 7 * 60;
                const currentMorning = current.shiftType === 'jour' || this.toMinutes(current.startTime) < 9 * 60;

                if ((previousNight && currentMorning) || restHours < 11) {
                    conflicts.push({
                        id: `rest-${person.id}-${day}`,
                        type: 'repos_insuffisant',
                        description: `${person.prenom} ${person.nom} n'a pas 11h de repos entre J${day} et J${day + 1}.`,
                        severity: 'warning',
                        assignments: [previous.id, current.id],
                        personnelId: person.id,
                        day,
                        details: `Repos calculé: ${restHours.toFixed(1)}h`,
                        suggestedFix: 'Déplacer l\'affectation Jour ou Nuit pour rétablir le repos minimum.'
                    });
                }
            }
        }

        return conflicts;
    }

    private detectPosteIncompatibilities(planning: PlanningData, totalDays: number): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const person of planning.personnel) {
            for (let day = 1; day < totalDays; day++) {
                const previous = this.getMainAssignmentForDay(planning, person.id, day - 1);
                const current = this.getMainAssignmentForDay(planning, person.id, day);
                if (!previous || !current) {
                    continue;
                }

                // Un jour de repos/congé entre deux postes n'est jamais incompatible
                if (this.isRestOrLeave(previous.shiftType) || this.isRestOrLeave(current.shiftType)) {
                    continue;
                }

                const incompatible = (previous.shiftType === 'nuit' && current.shiftType === 'jour')
                    || (previous.shiftType === 'garde' && current.shiftType === 'jour')
                    || (previous.shiftType === 'jour' && current.shiftType === 'nuit');

                if (!incompatible) {
                    continue;
                }

                conflicts.push({
                    id: `incompat-${person.id}-${day}`,
                    type: 'incompatibilite_postes',
                    description: `${person.prenom} ${person.nom} a une séquence de postes incompatible entre J${day} et J${day + 1}.`,
                    severity: 'warning',
                    assignments: [previous.id, current.id],
                    personnelId: person.id,
                    day,
                    details: `${previous.shiftType} → ${current.shiftType}`,
                    suggestedFix: 'Échanger une des deux affectations avec un collègue compatible.'
                });
            }
        }

        return conflicts;
    }

    private detectMissingSkills(planning: PlanningData): Conflict[] {
        const conflicts: Conflict[] = [];

        for (const assignment of planning.assignments) {
            const person = planning.personnel.find(item => item.id === assignment.personnelId);
            if (!person) {
                continue;
            }

            const required = this.requiredSkillForAssignment(assignment.posteLabel || assignment.posteId || '');
            if (!required) {
                continue;
            }

            const skillBlob = `${person.role} ${person.specialty}`.toLowerCase();
            if (skillBlob.includes(required)) {
                continue;
            }

            conflicts.push({
                id: `skill-${person.id}-${assignment.day}-${assignment.id}`,
                type: 'competence_manquante',
                description: `${person.prenom} ${person.nom} ne possède pas la compétence requise pour ce poste.`,
                severity: 'critical',
                assignments: [assignment.id],
                personnelId: person.id,
                day: assignment.day,
                details: `Compétence requise: ${required}`,
                suggestedFix: 'Affecter un membre habilité ou changer de poste.'
            });
        }

        return conflicts;
    }

    private requiredSkillForAssignment(label: string): string | null {
        const value = label.toLowerCase();
        if (value.includes('urgence')) {
            return 'urgence';
        }
        if (value.includes('rea')) {
            return 'réanimation';
        }
        if (value.includes('bloc')) {
            return 'bloc';
        }
        if (value.includes('pédiatr') || value.includes('pediatr')) {
            return 'pédiatr';
        }
        return null;
    }

    private getPlanningSpanDays(planning: PlanningData): number {
        if (!planning.weekStart || !planning.weekEnd) {
            return 7;
        }

        const diff = planning.weekEnd.getTime() - planning.weekStart.getTime();
        const days = Math.floor(diff / 86400000) + 1;
        return Math.max(days, 1);
    }

    private getMainAssignmentForDay(planning: PlanningData, personnelId: string, day: number) {
        return planning.assignments.find(item => item.personnelId === personnelId && item.day === day);
    }

    private overlaps(startA?: string, endA?: string, startB?: string, endB?: string): boolean {
        if (!startA || !endA || !startB || !endB) {
            return false;
        }

        const aStart = this.toMinutes(startA);
        const aEnd = this.normalizeEnd(aStart, this.toMinutes(endA));
        const bStart = this.toMinutes(startB);
        const bEnd = this.normalizeEnd(bStart, this.toMinutes(endB));

        return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
    }

    private restBetween(previousEnd?: string, currentStart?: string): number {
        if (!previousEnd || !currentStart) {
            return 24;
        }

        const prev = this.toMinutes(previousEnd);
        const next = this.toMinutes(currentStart) + 24 * 60;
        return Math.max((next - prev) / 60, 0);
    }

    private normalizeEnd(start: number, end: number): number {
        if (end <= start) {
            return end + 24 * 60;
        }
        return end;
    }

    private toMinutes(value?: string): number {
        if (!value || !value.includes(':')) {
            return 0;
        }
        const [hh, mm] = value.split(':');
        return Number(hh) * 60 + Number(mm);
    }
}
