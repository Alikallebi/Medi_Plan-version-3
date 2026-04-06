import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Assignment, Conflict, PlanningData, PlanningHistoryEntry, Personnel, PlanningStats, PlanningVersion, Rule, ShiftType } from '../api/planning.models';
import { ConflictDetectionService } from './conflict-detection.service';
import { PerimeterService, PerimeterFilter } from './perimeter.service';
import { environment } from 'src/environments/environment';

export interface PlanningOverviewRow {
    planningId: string;
    planningWeekId: number;
    serviceId: string;
    serviceName: string;
    weekStart: string;
    weekEnd: string;
    dbAssignmentPk: number | null;
    assignmentId: string | null;
    personnelId: string | null;
    dayIndex: number | null;
    shiftType: string | null;
    posteId: string | null;
    posteLabel: string | null;
    startTime: string | null;
    endTime: string | null;
    note: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface SavePlanningVersionPayload {
    serviceId: string;
    serviceName: string;
    weekStart: Date;
    weekEnd: Date;
    author?: string;
    comment?: string;
    assignmentsCount: number;
}

@Injectable({
    providedIn: 'root'
})
export class PlanningService {
    private static readonly STORAGE_KEY = 'planning_cache_v1';
    private readonly apiUrl = `${environment.apiBaseUrl}/api/planning`;

    private readonly cache = new Map<string, PlanningData>();
    private readonly currentPlanningSubject = new BehaviorSubject<PlanningData | null>(null);
    readonly currentPlanning$ = this.currentPlanningSubject.asObservable();

    constructor(
        private readonly conflictDetectionService: ConflictDetectionService,
        private readonly http: HttpClient,
        private readonly perimeterService: PerimeterService
    ) {
        this.hydrateCache();
    }

    getPlanning(serviceId: string, serviceName: string, weekDate: Date, weekEnd?: Date): Observable<PlanningData> {
        const weekStart = this.toDateOnly(weekDate);
        const periodEnd = weekEnd ? this.toDateOnly(weekEnd) : undefined;
        const key = this.createCacheKey(serviceId, weekStart);
        const weekStartIso = this.toIsoDate(weekStart);

        let params = new HttpParams()
            .set('serviceId', serviceId)
            .set('serviceName', serviceName)
            .set('weekStart', weekStartIso);

        if (periodEnd) {
            params = params.set('weekEnd', this.toIsoDate(periodEnd));
        }

        return this.http.get<any>(this.apiUrl, { params }).pipe(
            map(raw => this.fromApiPlanning(raw, serviceId, serviceName, weekStart, periodEnd)),
            tap(planning => {
                const cached = this.cache.get(key);
                if (cached?.personnel?.length) {
                    planning.personnel = [...cached.personnel];
                }

                this.cache.set(key, planning);
                this.currentPlanningSubject.next(planning);
                this.saveCache();
            })
        );
    }

    /**
     * Récupère le planning avec filtrage par périmètre
     * @param filter Filtre de périmètre
     * @param serviceId ID du service
     * @param serviceName Nom du service
     * @param weekDate Date de début de semaine
     * @param weekEnd Date de fin (optionnel)
     */
    getPlanningWithPerimeter(
        filter: PerimeterFilter,
        serviceId: string,
        serviceName: string,
        weekDate: Date,
        weekEnd?: Date
    ): Observable<PlanningData> {
        const weekStart = this.toDateOnly(weekDate);
        const periodEnd = weekEnd ? this.toDateOnly(weekEnd) : undefined;
        const key = this.createCacheKey(serviceId, weekStart);
        const weekStartIso = this.toIsoDate(weekStart);

        // Construire les paramètres avec le filtre de périmètre
        let params = this.perimeterService.buildHttpParams(filter);
        params = params.set('serviceId', serviceId);
        params = params.set('serviceName', serviceName);
        params = params.set('weekStart', weekStartIso);

        if (periodEnd) {
            params = params.set('weekEnd', this.toIsoDate(periodEnd));
        }

        console.log('🔵 getPlanningWithPerimeter - params:', params.toString());

        return this.http.get<any>(this.apiUrl, { params }).pipe(
            map(raw => this.fromApiPlanning(raw, serviceId, serviceName, weekStart, periodEnd)),
            tap(planning => {
                const cached = this.cache.get(key);
                if (cached?.personnel?.length) {
                    planning.personnel = [...cached.personnel];
                }

                this.cache.set(key, planning);
                this.currentPlanningSubject.next(planning);
                this.saveCache();
            })
        );
    }

    saveAssignment(planningId: string, assignment: Assignment): Observable<Assignment> {
        const meta = this.parsePlanningId(planningId);
        const planning = this.getById(planningId);
        if (!planning) {
            return of(assignment);
        }

        const next: Assignment = {
            ...assignment,
            createdAt: assignment.createdAt || new Date(),
            updatedAt: new Date()
        };

        return this.http.post<Assignment>(`${this.apiUrl}/assignments`, {
            serviceId: meta.serviceId,
            serviceName: planning.serviceName,
            weekStart: meta.weekStart,
            weekEnd: this.toIsoDate(planning.weekEnd),
            assignment: next
        }).pipe(
            tap(saved => {
                const index = planning.assignments.findIndex(item => item.id === saved.id);
                if (index >= 0) {
                    planning.assignments[index] = saved;
                } else {
                    planning.assignments.push(saved);
                }

                planning.history.unshift(this.createHistoryEntry('AFFECTATION', `${saved.personnelId} → jour ${saved.day + 1} (${saved.shiftType})`));
                planning.conflicts = this.conflictDetectionService.detectConflicts(planning);
                this.persist(planning);
            })
        );
    }

    deleteAssignment(planningId: string, assignmentId: string): Observable<void> {
        const meta = this.parsePlanningId(planningId);
        const planning = this.getById(planningId);
        if (!planning) {
            return of(void 0);
        }

        const params = new HttpParams()
            .set('serviceId', meta.serviceId)
            .set('weekStart', meta.weekStart);

        return this.http.delete<void>(`${this.apiUrl}/assignments/${encodeURIComponent(assignmentId)}`, { params }).pipe(
            tap(() => {
                planning.assignments = planning.assignments.filter(item => item.id !== assignmentId);
                planning.history.unshift(this.createHistoryEntry('SUPPRESSION', `Affectation ${assignmentId} supprimée`));
                planning.conflicts = this.conflictDetectionService.detectConflicts(planning);
                this.persist(planning);
            })
        );
    }

    validatePlanning(planningId: string): Observable<{ valid: boolean; conflicts: Conflict[] }> {
        const meta = this.parsePlanningId(planningId);
        const planning = this.getById(planningId);
        if (!planning) {
            return of({ valid: false, conflicts: [] });
        }

        return this.http.post<{ valid: boolean; conflicts: Conflict[] }>(`${this.apiUrl}/validate`, {
            serviceId: meta.serviceId,
            serviceName: planning.serviceName,
            weekStart: meta.weekStart,
            weekEnd: this.toIsoDate(planning.weekEnd),
            assignments: planning.assignments
        }).pipe(
            tap(result => {
                planning.conflicts = result.conflicts || [];
                planning.history.unshift(this.createHistoryEntry('VALIDATION', result.valid ? 'Planning validé' : 'Validation avec conflits'));
                this.persist(planning);
            })
        );
    }

    replaceAssignments(planningId: string, assignments: Assignment[], actionLabel: string): Observable<void> {
        const meta = this.parsePlanningId(planningId);
        const planning = this.getById(planningId);
        if (!planning) {
            return of(void 0);
        }

        return this.http.put<void>(`${this.apiUrl}/assignments`, {
            serviceId: meta.serviceId,
            serviceName: planning.serviceName,
            weekStart: meta.weekStart,
            weekEnd: this.toIsoDate(planning.weekEnd),
            assignments
        }).pipe(
            tap(() => {
                planning.assignments = assignments.map(item => ({ ...item }));
                planning.conflicts = this.conflictDetectionService.detectConflicts(planning);
                planning.history.unshift(this.createHistoryEntry('HISTORIQUE', actionLabel));
                this.persist(planning);
            })
        );
    }

    /** Sauvegarde directe sans passer par le cache (utilis\u00e9 pour la propagation en mode mois/p\u00e9riode). */
    replaceAssignmentsRaw(serviceId: string, serviceName: string, weekStart: Date, weekEnd: Date, assignments: Assignment[]): Observable<void> {
        return this.http.put<void>(`${this.apiUrl}/assignments`, {
            serviceId,
            serviceName,
            weekStart: this.toIsoDate(weekStart),
            weekEnd: this.toIsoDate(weekEnd),
            assignments
        });
    }
    /** Valide + sauvegarde une semaine spécifique directement (sans passer par le cache). Utilisé pour la validation multi-semaines en mode mois/période. */
    validateWeekRaw(serviceId: string, serviceName: string, weekStart: Date, weekEnd: Date, assignments: Assignment[]): Observable<{ valid: boolean; conflicts: Conflict[] }> {
        return this.http.post<{ valid: boolean; conflicts: Conflict[] }>(`${this.apiUrl}/validate`, {
            serviceId,
            serviceName,
            weekStart: this.toIsoDate(weekStart),
            weekEnd: this.toIsoDate(weekEnd),
            assignments
        });
    }
    replacePersonnel(planningId: string, personnel: Personnel[], actionLabel: string): Observable<void> {
        const planning = this.getById(planningId);
        if (!planning) {
            return of(void 0);
        }

        const allowedIds = new Set(personnel.map(item => item.id));
        planning.personnel = personnel.map(item => ({ ...item }));
        planning.assignments = planning.assignments.filter(item => allowedIds.has(item.personnelId));
        planning.conflicts = this.conflictDetectionService.detectConflicts(planning);
        planning.history.unshift(this.createHistoryEntry('SYNC_SERVICE', actionLabel));
        this.persist(planning);

        return of(void 0);
    }

    detectConflicts(planningId: string): Observable<Conflict[]> {
        const planning = this.getById(planningId);
        if (!planning) {
            return of([]);
        }

        return this.validatePlanning(planningId).pipe(
            map(result => {
                planning.conflicts = result.conflicts || [];
                this.persist(planning);
                return planning.conflicts;
            })
        );
    }

    getStats(planning: PlanningData): PlanningStats {
        const totalPosts = planning.personnel.length * 7;
        const coveredPosts = planning.assignments.length;
        const occupancyRate = totalPosts === 0 ? 0 : Math.round((coveredPosts / totalPosts) * 100);

        return {
            occupancyRate,
            coveredPosts,
            totalPosts,
            conflicts: planning.conflicts.length
        };
    }

    exportPlanning(planning: PlanningData, format: 'pdf' | 'excel' | 'csv'): Observable<string> {
        const weekStart = this.toIsoDate(planning.weekStart);
        const params = new HttpParams()
            .set('serviceId', planning.serviceId)
            .set('serviceName', planning.serviceName)
            .set('weekStart', weekStart)
            .set('weekEnd', this.toIsoDate(planning.weekEnd))
            .set('format', format);

        return this.http.get<{ fileName: string; content: string; mimeType: string; isBase64?: boolean }>(`${this.apiUrl}/export`, { params }).pipe(
            map(result => {
                if (result?.content) {
                    const defaultName = `planning-${planning.serviceId}.${format === 'excel' ? 'xls' : format}`;
                    if (result.isBase64) {
                        this.downloadBase64File(result.fileName || defaultName, result.content, result.mimeType || 'application/octet-stream');
                    } else {
                        this.downloadFile(result.fileName || defaultName, result.content, result.mimeType || 'text/plain');
                    }
                }

                return `Export ${format.toUpperCase()} prêt pour ${planning.serviceName} (${planning.assignments.length} affectations).`;
            })
        );
    }

    getPlanningOverview(serviceId?: string, weekStart?: Date): Observable<PlanningOverviewRow[]> {
        let params = new HttpParams();

        if (serviceId && serviceId.trim().length > 0) {
            params = params.set('serviceId', serviceId);
        }

        if (weekStart) {
            params = params.set('weekStart', this.toIsoDate(this.toDateOnly(weekStart)));
        }

        return this.http.get<PlanningOverviewRow[]>(`${this.apiUrl}/overview`, { params });
    }

    saveVersion(payload: SavePlanningVersionPayload): Observable<PlanningVersion> {
        return this.http.post<any>(`${this.apiUrl}/versions`, {
            serviceId: payload.serviceId,
            serviceName: payload.serviceName,
            weekStart: this.toIsoDate(payload.weekStart),
            weekEnd: this.toIsoDate(payload.weekEnd),
            author: payload.author,
            comment: payload.comment,
            assignmentsCount: payload.assignmentsCount
        }).pipe(
            map(version => {
                const createdAt = this.toValidDate(version?.createdAt);
                const id = String(version?.id ?? version?.versionId ?? `${payload.serviceId}-${Date.now()}`);
                const rawLabel = version?.versionLabel ?? version?.version ?? 'V1';

                return {
                    id,
                    versionLabel: String(rawLabel),
                    createdAt,
                    author: String(version?.author ?? payload.author ?? localStorage.getItem('nom') ?? 'Gestionnaire'),
                    assignmentsCount: Number(version?.assignmentsCount ?? payload.assignmentsCount ?? 0)
                } as PlanningVersion;
            })
        );
    }

    getVersions(serviceId: string, weekStart: Date, weekEnd: Date): Observable<PlanningVersion[]> {
        const params = new HttpParams()
            .set('serviceId', serviceId)
            .set('weekStart', this.toIsoDate(weekStart))
            .set('weekEnd', this.toIsoDate(weekEnd));

        return this.http.get<PlanningVersion[]>(`${this.apiUrl}/versions`, { params }).pipe(
            map(items => (items || []).map(item => ({
                ...item,
                createdAt: this.toValidDate(item.createdAt)
            })))
        );
    }

    private toValidDate(value: unknown): Date {
        const parsed = new Date(value as any);
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    private getById(planningId: string): PlanningData | null {
        for (const value of this.cache.values()) {
            if (value.id === planningId) {
                return value;
            }
        }
        return this.currentPlanningSubject.value;
    }

    private persist(planning: PlanningData): void {
        const key = this.createCacheKey(planning.serviceId, planning.weekStart);
        this.cache.set(key, { ...planning, assignments: [...planning.assignments], conflicts: [...planning.conflicts], history: [...planning.history] });
        this.currentPlanningSubject.next(this.cache.get(key)!);
        this.saveCache();
    }

    private createHistoryEntry(action: string, details: string): PlanningHistoryEntry {
        return {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            at: new Date(),
            author: localStorage.getItem('nom') || 'Gestionnaire',
            action,
            details
        };
    }

    private toDateOnly(date: Date): Date {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
    }

    private createCacheKey(serviceId: string, weekStart: Date): string {
        return `${serviceId}-${weekStart.toISOString().split('T')[0]}`;
    }

    private parsePlanningId(planningId: string): { serviceId: string; weekStart: string } {
        // Accept both yyyy-MM-dd (ISO) and yyyyMMdd (backend BuildPlanningId format)
        const match = planningId.match(/^(.*?)-(\d{4}-\d{2}-\d{2}|\d{8})$/);
        if (match) {
            const rawDate = match[2];
            // Normalize yyyyMMdd → yyyy-MM-dd
            const weekStart = rawDate.length === 8
                ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                : rawDate;
            return { serviceId: match[1], weekStart };
        }

        const current = this.currentPlanningSubject.value;
        if (current) {
            return { serviceId: current.serviceId, weekStart: this.toIsoDate(current.weekStart) };
        }

        const monday = this.toDateOnly(new Date());
        return { serviceId: planningId, weekStart: this.toIsoDate(monday) };
    }

    private toIsoDate(date: Date): string {
        // Utiliser les composantes locales pour éviter le décalage UTC (timezone UTC+1)
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    private downloadFile(fileName: string, content: string, mimeType: string): void {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    private downloadBase64File(fileName: string, base64Content: string, mimeType: string): void {
        const binary = atob(base64Content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    private fromApiPlanning(raw: any, serviceId: string, serviceName: string, weekStart: Date, weekEnd?: Date): PlanningData {
        const normalizedStart = raw?.weekStart ? new Date(raw.weekStart) : weekStart;
        const normalizedEnd = raw?.weekEnd ? new Date(raw.weekEnd) : (weekEnd ? new Date(weekEnd) : new Date(normalizedStart.getTime() + 6 * 86400000));

        return {
            id: raw?.id ?? this.createCacheKey(serviceId, normalizedStart),
            serviceId: raw?.serviceId ?? serviceId,
            serviceName: raw?.serviceName ?? serviceName,
            weekStart: normalizedStart,
            weekEnd: normalizedEnd,
            workflowStatus: raw?.workflowStatus ?? raw?.statut ?? undefined,
            assignments: (raw?.assignments || []).map((item: any) => this.normalizeAssignment(item)),
            personnel: [],
            rules: (raw?.rules || []) as Rule[],
            conflicts: (raw?.conflicts || []) as Conflict[],
            history: [this.createHistoryEntry('LOAD', 'Planning chargé depuis le backend')]
        };
    }

    private hydrateCache(): void {
        try {
            const raw = localStorage.getItem(PlanningService.STORAGE_KEY);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw) as [string, any][];
            for (const [key, value] of parsed) {
                this.cache.set(key, this.deserializePlanning(value));
            }
        } catch {
            this.cache.clear();
        }
    }

    private saveCache(): void {
        try {
            const entries = Array.from(this.cache.entries());
            localStorage.setItem(PlanningService.STORAGE_KEY, JSON.stringify(entries));
        } catch {
            // ignore storage errors
        }
    }

    private deserializePlanning(raw: any): PlanningData {
        return {
            ...raw,
            weekStart: new Date(raw.weekStart),
            weekEnd: new Date(raw.weekEnd),
            submittedAt: raw.submittedAt ? new Date(raw.submittedAt) : undefined,
            assignments: (raw.assignments || []).map((item: any) => this.normalizeAssignment(item)),
            history: (raw.history || []).map((entry: any) => ({
                ...entry,
                at: entry.at ? new Date(entry.at) : new Date()
            }))
        } as PlanningData;
    }

    private normalizeAssignment(item: any): Assignment {
        const normalizedShiftType = this.normalizeLoadedShiftType(item);
        const isNonWorkingType = normalizedShiftType === 'repos' || normalizedShiftType === 'conges';

        return {
            ...item,
            shiftType: normalizedShiftType,
            posteLabel: isNonWorkingType
                ? String(item.posteLabel ?? item.posteId ?? 'Congé / Repos')
                : item.posteLabel,
            startTime: isNonWorkingType ? undefined : item.startTime ?? undefined,
            endTime: isNonWorkingType ? undefined : item.endTime ?? undefined,
            createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
        };
    }

    private normalizeLoadedShiftType(item: any): ShiftType {
        const shiftType = String(item?.shiftType ?? '').toLowerCase();
        const posteId = String(item?.posteId ?? '').toLowerCase();
        const posteLabel = String(item?.posteLabel ?? '').toLowerCase();
        const combined = `${shiftType} ${posteId} ${posteLabel}`;

        if (combined.includes('repos') || combined.includes('repo')) {
            return 'repos';
        }
        if (combined.includes('conge')) {
            return 'conges';
        }
        if (combined.includes('formation')) {
            return 'formation';
        }
        if (combined.includes('astreinte')) {
            return 'astreinte';
        }
        if (combined.includes('garde')) {
            return 'garde';
        }
        if (combined.includes('nuit')) {
            return 'nuit';
        }

        return 'jour';
    }

    submitPlanningToWorkflow(planningId: string, createdBy: string, createdById: string): Observable<any> {
        const meta = this.parsePlanningId(planningId);
        const planning = this.getById(planningId);
        
        if (!planning) {
            return throwError(() => new Error('Planning introuvable'));
        }

        const payload = {
            serviceId: meta.serviceId,
            serviceName: planning.serviceName,
            weekStart: this.toIsoDate(planning.weekStart),
            weekEnd: this.toIsoDate(planning.weekEnd),
            createdBy: createdBy,
            createdById: createdById,
            assignments: planning.assignments // Include assignments in the payload
        };

        return this.http.post<any>(`${this.apiUrl}/submit`, payload).pipe(
            tap(response => {
                if (response.success && planning) {
                    planning.workflowStatus = 'EN_ATTENTE_VALIDATION_RH';
                    planning.workflowId = response.workflowId;
                    planning.canSubmit = false;
                    planning.submittedBy = createdBy;
                    planning.submittedAt = new Date();
                    planning.history.unshift(
                        this.createHistoryEntry('SOUMISSION', `Planning soumis pour validation par ${createdBy}`)
                    );
                    this.persist(planning);
                }
            })
        );
    }

    submitPlanningToWorkflowRaw(
        serviceId: string,
        serviceName: string,
        weekStart: Date,
        weekEnd: Date,
        createdBy: string,
        createdById: string,
        assignments: Assignment[],
        message?: string
    ): Observable<any> {
        const payload: any = {
            serviceId,
            serviceName,
            weekStart: this.toIsoDate(weekStart),
            weekEnd: this.toIsoDate(weekEnd),
            createdBy,
            createdById,
            assignments
        };

        if (message) {
            payload.message = message;
        }

        return this.http.post<any>(`${this.apiUrl}/submit`, payload);
    }

    canSubmitPlanning(planningId: string): { canSubmit: boolean; reason?: string } {
        const planning = this.getById(planningId);
        
        if (!planning) {
            return { canSubmit: false, reason: 'Planning introuvable' };
        }

        // BROUILLON et REJETE peuvent être (re-)soumis ; les autres statuts bloquent
        const nonSubmittableStatuses = ['EN_ATTENTE_VALIDATION', 'EN_ATTENTE_VALIDATION_RH', 'VALIDE'];
        if (planning.workflowStatus && nonSubmittableStatuses.includes(planning.workflowStatus)) {
            return { canSubmit: false, reason: `Planning déjà soumis (Statut: ${planning.workflowStatus})` };
        }

        if (planning.assignments.length === 0) {
            return { canSubmit: false, reason: 'Le planning est vide' };
        }

        if (planning.conflicts.length > 0) {
            return { canSubmit: false, reason: `${planning.conflicts.length} conflit(s) à résoudre` };
        }

        return { canSubmit: true };
    }
}
