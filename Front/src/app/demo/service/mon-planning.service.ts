import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Affectation, Compteurs, PlanningDay } from '../models/mon-planning.model';

export interface MonPlanningQueryContext {
    userId: number;
    serviceId: number;
    serviceName?: string;
    nom?: string;
    prenom?: string;
}

@Injectable({ providedIn: 'root' })
export class MonPlanningService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api`;

    constructor(private readonly http: HttpClient) {}

    getPlanning(context: MonPlanningQueryContext, weekStart: Date | string): Observable<PlanningDay[]> {
        const semaineDebut = this.toIsoDate(weekStart);
        const weekEnd = this.toIsoDate(this.addDays(this.fromIsoDate(semaineDebut), 6));
        const serviceId = String(context.serviceId);
        const serviceName = context.serviceName?.trim() || serviceId;

        return this.http
            .get<any>(`${this.apiUrl}/planning`, {
                params: {
                    serviceId,
                    serviceName,
                    weekStart: semaineDebut,
                    weekEnd,
                    userId: String(context.userId)
                }
            })
            .pipe(map(raw => this.mapPlanningFromDashboard(raw, semaineDebut, context)));
    }

    getCompteurs(userId: number): Observable<Compteurs> {
        return this.http.get<any>(`${this.apiUrl}/mon-planning/compteurs`, {
            params: { userId }
        }).pipe(
            map(response => ({
                solde_rc_plus_heures: this.toNumber(response?.solde_rc_plus_heures ?? response?.soldeRcPlusHeures ?? response?.soldeRcPlus ?? 0),
                solde_rc_moins_heures: this.toNumber(response?.solde_rc_moins_heures ?? response?.soldeRcMoinsHeures ?? response?.soldeRcMoins ?? 0)
            }))
        );
    }

    private mapPlanningFromDashboard(raw: any, weekStartIso: string, context: MonPlanningQueryContext): PlanningDay[] {
        const assignments = Array.isArray(raw?.assignments) ? raw.assignments : [];
        const personnel = Array.isArray(raw?.personnel) ? raw.personnel : [];
        const matchedPersonnelIds = this.resolveMatchedPersonnelIds(personnel, context);
        const userIdAsString = String(context.userId);
        const hasMatchedPersonnel = matchedPersonnelIds.size > 0;

        const rows = assignments.filter((item: any) => {
            const personnelId = `${item?.personnelId ?? ''}`.trim();
            if (!personnelId) {
                return false;
            }

            if (hasMatchedPersonnel) {
                return matchedPersonnelIds.has(personnelId) || personnelId === userIdAsString;
            }

            if (personnelId === userIdAsString) {
                return true;
            }

            return this.isNameMatch(personnelId, context);
        });

        const groupedDays = new Map<string, PlanningDay>();

        for (const row of rows) {
            const mappedRow = this.mapPlanningRow(row, weekStartIso);
            const existing = groupedDays.get(mappedRow.date);

            if (!existing) {
                groupedDays.set(mappedRow.date, {
                    date: mappedRow.date,
                    nomJour: mappedRow.nomJour,
                    affectations: mappedRow.affectations,
                    demandes: mappedRow.demandes
                });
                continue;
            }

            existing.affectations = this.mergeUniqueAffectations(existing.affectations, mappedRow.affectations);
            existing.demandes.push(...mappedRow.demandes);
        }

        const weekStart = this.fromIsoDate(weekStartIso);

        return Array.from({ length: 7 }, (_, index) => {
            const date = this.addDays(weekStart, index);
            const iso = this.toIsoDate(date);

            return groupedDays.get(iso) ?? {
                date: iso,
                nomJour: this.getFrenchDayName(date),
                affectations: [],
                demandes: []
            };
        });
    }

    private mapPlanningRow(row: any, weekStartIso: string): PlanningDay {
        const date = this.mapAssignmentDate(row, weekStartIso);
        const affectation = this.mapAffectation(row);

        return {
            date,
            nomJour: this.getFrenchDayName(this.fromIsoDate(date)),
            affectations: affectation ? [affectation] : [],
            demandes: []
        };
    }

    private mergeUniqueAffectations(current: Affectation[], incoming: Affectation[]): Affectation[] {
        const unique = new Map<string, Affectation>();

        for (const item of [...current, ...incoming]) {
            const key = `${item.id ?? ''}|${item.code}|${item.libelle}|${item.heureDebut}|${item.heureFin}`;
            if (!unique.has(key)) {
                unique.set(key, item);
            }
        }

        return Array.from(unique.values());
    }

    private mapAffectation(value: any): Affectation {
        const shiftType = this.normalizeLabel(value?.shiftType ?? value?.type ?? value?.shift_type ?? value?.code ?? 'Poste');
        const posteLabel = this.normalizeLabel(
            value?.posteLabel ?? value?.poste ?? value?.label ?? value?.libelle ?? value?.titre ?? value?.note ?? shiftType
        );

        return {
            id: value?.id ?? value?.assignmentId ?? value?.planningId,
            code: this.toTitleCase(shiftType),
            libelle: posteLabel,
            heureDebut: this.normalizeTime(value?.heureDebut ?? value?.debut ?? value?.start ?? value?.startTime),
            heureFin: this.normalizeTime(value?.heureFin ?? value?.fin ?? value?.end ?? value?.endTime),
            type: shiftType,
            couleur: this.normalizeColor(value?.couleur ?? value?.color ?? value?.couleurHex),
            badgeClass: this.resolveAffectationClass(value)
        };
    }

    private resolveAffectationClass(value: any): string {
        const raw = `${value?.badgeClass ?? value?.type ?? value?.code ?? value?.libelle ?? value?.shiftType ?? ''}`.toLowerCase();

        if (raw.includes('urg') || raw.includes('astreinte') || raw.includes('garde')) {
            return 'shift-urgent';
        }

        if (raw.includes('nuit')) {
            return 'shift-night';
        }

        if (raw.includes('repos') || raw.includes('abs')) {
            return 'shift-rest';
        }

        if (raw.includes('consult') || raw.includes('ca')) {
            return 'shift-consultation';
        }

        return 'shift-general';
    }

    private normalizeLabel(value: unknown): string {
        const text = `${value ?? ''}`.trim();
        return text.length > 0 ? text : '-';
    }

    private normalizeColor(value: unknown): string | undefined {
        const text = `${value ?? ''}`.trim();
        return text.length > 0 ? text : undefined;
    }

    private normalizeTime(value: unknown): string {
        const text = `${value ?? ''}`.trim();
        if (!text) {
            return '--:--';
        }

        const withSeconds = text.match(/^(\d{2}:\d{2})(?::\d{2})$/);
        if (withSeconds) {
            return withSeconds[1];
        }

        const embedded = text.match(/(\d{2}:\d{2})(?::\d{2})?/);
        if (embedded) {
            return embedded[1];
        }

        return text;
    }

    private toTitleCase(value: string): string {
        return value
            .split(/[\s_-]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
    }


    private toNumber(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private toIsoDate(value: Date | string): string {
        const date = value instanceof Date ? value : this.fromIsoDate(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private fromIsoDate(value: string): Date {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
    }

    private addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    private getFrenchDayName(date: Date): string {
        return date.toLocaleDateString('fr-FR', { weekday: 'long' });
    }

    private mapAssignmentDate(row: any, weekStartIso: string): string {
        const explicitDate = row?.date ?? row?.datePlanning ?? row?.weekDate;
        if (explicitDate) {
            return this.toIsoDate(explicitDate);
        }

        const dayIndexRaw = Number(row?.day ?? row?.dayIndex ?? row?.day_index);
        if (Number.isFinite(dayIndexRaw)) {
            const safeDayIndex = Math.min(6, Math.max(0, Math.trunc(dayIndexRaw)));
            const weekStart = this.fromIsoDate(weekStartIso);
            const date = this.addDays(weekStart, safeDayIndex);
            return this.toIsoDate(date);
        }

        const weekStartRaw = row?.weekStart;
        const dayIndex = Number(row?.day ?? row?.dayIndex ?? row?.day_index);
        if (weekStartRaw && Number.isFinite(dayIndex)) {
            const safeDayIndex = Math.min(6, Math.max(0, Math.trunc(dayIndex)));
            const date = this.addDays(this.toDate(weekStartRaw), safeDayIndex);
            return this.toIsoDate(date);
        }

        return weekStartIso;
    }

    private resolveMatchedPersonnelIds(personnel: any[], context: MonPlanningQueryContext): Set<string> {
        const ids = new Set<string>();
        const contextUserId = String(context.userId);
        const contextName = this.normalizeName(`${context.prenom ?? ''} ${context.nom ?? ''}`);

        for (const person of personnel) {
            const pid = `${person?.id ?? ''}`.trim();
            if (!pid) {
                continue;
            }

            const personName = this.normalizeName(`${person?.prenom ?? ''} ${person?.nom ?? ''}`);
            if (pid === contextUserId || (contextName && personName === contextName)) {
                ids.add(pid);
            }
        }

        return ids;
    }

    private isNameMatch(personnelId: string, context: MonPlanningQueryContext): boolean {
        const contextName = this.normalizeName(`${context.prenom ?? ''} ${context.nom ?? ''}`);
        if (!contextName) {
            return false;
        }

        return this.normalizeName(personnelId) === contextName;
    }

    private normalizeName(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()
            .trim();
    }

    private toDate(value: Date | string): Date {
        if (value instanceof Date) {
            return new Date(value);
        }

        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }

        return this.fromIsoDate(this.toIsoDate(new Date()));
    }
}