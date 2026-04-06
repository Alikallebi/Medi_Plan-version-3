import { Injectable } from '@angular/core';
import { Assignment, PlanningData, ValidationResult } from '../api/planning.models';

@Injectable({
    providedIn: 'root'
})
export class RuleValidationService {
    private readonly REST_SHIFT_TYPES = new Set(['conges', 'conge', 'repos', 'ca', 'rtt', 'maladie', 'formation', 'absence']);

    validateAssignment(assignment: Assignment, planning: PlanningData): ValidationResult {
        const violations: string[] = [];

        if (this.hasDoubleAssignment(assignment, planning)) {
            violations.push('Ce personnel est déjà affecté ce jour.');
        }

        if (assignment.shiftType === 'garde' && this.reachesWeeklyGuardQuota(assignment, planning)) {
            violations.push('Quota maximum de 3 gardes/semaine dépassé.');
        }

        if (this.violatesRestRule(assignment, planning)) {
            violations.push('Temps de repos minimum (11h) non respecté.');
        }

        return {
            valid: violations.length === 0,
            violations
        };
    }

    getViolatedRules(planning: PlanningData): string[] {
        return planning.conflicts.map(conflict => conflict.description);
    }

    suggestFixes(conflictType: string): string[] {
        if (conflictType === 'quota_depasse') {
            return ['Réaffecter vers un collègue disponible', 'Transformer une garde en astreinte'];
        }
        if (conflictType === 'repos_insuffisant') {
            return ['Décaler la prise de poste au lendemain', 'Attribuer un créneau jour à un autre personnel'];
        }
        return ['Modifier ou supprimer l\'affectation existante'];
    }

    private hasDoubleAssignment(candidate: Assignment, planning: PlanningData): boolean {
        return planning.assignments.some(item =>
            item.personnelId === candidate.personnelId &&
            item.day === candidate.day &&
            item.id !== candidate.id
        );
    }

    private reachesWeeklyGuardQuota(candidate: Assignment, planning: PlanningData): boolean {
        const currentGuards = planning.assignments.filter(item =>
            item.personnelId === candidate.personnelId &&
            item.shiftType === 'garde' &&
            item.id !== candidate.id
        ).length;
        return currentGuards >= 3;
    }

    private violatesRestRule(candidate: Assignment, planning: PlanningData): boolean {
        if (this.isRestOrLeave(candidate.shiftType)) {
            return false;
        }

        const previousDay = planning.assignments.find(item =>
            item.personnelId === candidate.personnelId &&
            item.day === candidate.day - 1 &&
            item.id !== candidate.id
        );

        const nextDay = planning.assignments.find(item =>
            item.personnelId === candidate.personnelId &&
            item.day === candidate.day + 1 &&
            item.id !== candidate.id
        );

        const previousIsNight = previousDay?.shiftType === 'nuit' || previousDay?.shiftType === 'garde';
        const nextIsDay = nextDay?.shiftType === 'jour';

        if (this.isRestOrLeave(previousDay?.shiftType) || this.isRestOrLeave(nextDay?.shiftType)) {
            return false;
        }

        if ((candidate.shiftType === 'jour' && previousIsNight) || (candidate.shiftType === 'nuit' && nextIsDay)) {
            return true;
        }

        return false;
    }

    private isRestOrLeave(shiftType?: string): boolean {
        return !!shiftType && this.REST_SHIFT_TYPES.has(shiftType.toLowerCase());
    }
}
