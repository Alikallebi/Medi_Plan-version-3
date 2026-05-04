import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
    DemandeAbsenceReason,
    DemandeAlReason,
    DemandeCreatePayload,
    DemandeTypeDefinition,
    DemandeTypeUi
} from '../../../models/demande.model';

interface DemandeFormState {
    startDate: string;
    endDate: string;
    type: DemandeTypeUi;
    startTime: string;
    endTime: string;
    comment: string;
    alReason: DemandeAlReason | '';
    absenceReason: DemandeAbsenceReason | '';
    absenceEndDateUnknown: boolean;
}

interface AlReasonRule {
    label: string;
    maxDays: number;
}

interface RequestTypeOption {
    code: DemandeTypeUi;
    label: string;
    description: string;
    color: string;
}

@Component({
    selector: 'app-demande-modal',
    templateUrl: './demande-modal.component.html',
    styleUrls: ['./demande-modal.component.scss']
})
export class DemandeModalComponent implements OnChanges {
    @Input() visible = false;
    @Input() loading = false;
    @Input() defaultDate = '';
    @Input() workEndHourByDate: Record<string, string> = {};
    @Input() planningAvailableByDate: Record<string, boolean> = {};
    @Input() typeDefinitions: DemandeTypeDefinition[] = [];

    @Output() close = new EventEmitter<void>();
    @Output() submitDemande = new EventEmitter<DemandeCreatePayload>();

    readonly requestTypes: RequestTypeOption[] = [
        {
            code: 'VA',
            label: 'Vacances annuelles',
            description: 'Conges annuels. Les week-ends et jours feries de la periode sont exclus du decompte.',
            color: '#14b8a6'
        },
        {
            code: 'HS',
            label: 'Heures supplementaires',
            description: 'Saisie sur une seule journee. Debut automatiquement propose selon la fin de service planifiee.',
            color: '#2563eb'
        },
        {
            code: 'AL',
            label: 'Autorisation legale',
            description: 'Motif legal obligatoire avec duree maximale autorisee selon le motif selectionne.',
            color: '#f59e0b'
        },
        {
            code: 'JR',
            label: 'Jour de repos',
            description: 'Periode de repos sur jour non travaille, deduite du compteur de recuperation.',
            color: '#64748b'
        },
        {
            code: 'AS',
            label: 'Astreinte',
            description: 'Periode d astreinte avec horaires. Toute intervention reelle doit faire l objet d une HS liee.',
            color: '#8b5cf6'
        },
        {
            code: 'ABSENCE',
            label: 'Absence',
            description: 'Absence avec motif obligatoire. Le motif pilote le traitement paie et RH.',
            color: '#ff7f50'
        },
        {
            code: 'AT',
            label: 'Arret de travail',
            description: 'Arret maladie ou accident du travail. Envoi informatif pour la date du jour uniquement.',
            color: '#dc2626'
        }
    ];

    readonly alReasonRules: Record<DemandeAlReason, AlReasonRule> = {
        marriage: { label: 'Mariage', maxDays: 4 },
        bereavement: { label: 'Deces', maxDays: 3 },
        birth: { label: 'Naissance', maxDays: 3 },
        family_event: { label: 'Evenement familial', maxDays: 2 },
        other: { label: 'Autre motif legal', maxDays: 1 }
    };

    readonly absenceReasons: Record<DemandeAbsenceReason, string> = {
        unjustified: 'Absence injustifiee',
        sick_leave: 'Arret maladie',
        work_accident: 'Accident du travail',
        other: 'Autre'
    };

    errorMessage = '';
    form: DemandeFormState = this.buildInitialState();

    ngOnChanges(changes: SimpleChanges): void {
        if ((changes['visible'] && this.visible) || changes['defaultDate']) {
            this.form = this.buildInitialState();
            this.applyTypeDefaults(true);
            this.errorMessage = '';
        }

        if (changes['workEndHourByDate'] && this.visible && this.isHsType) {
            this.applyAutoHsStartTime(true);
        }
    }

    get selectedType(): RequestTypeOption {
        return this.availableRequestTypes.find(item => item.code === this.form.type) || this.availableRequestTypes[0];
    }

    get availableRequestTypes(): RequestTypeOption[] {
        if (this.hasPlanningOnSelectedDate) {
            return this.requestTypes;
        }

        return this.requestTypes.filter(item => item.code === 'AS');
    }

    get hasPlanningOnSelectedDate(): boolean {
        return this.planningAvailableByDate?.[this.form.startDate] === true;
    }

    get isHsType(): boolean {
        return this.form.type === 'HS';
    }

    get isAsType(): boolean {
        return this.form.type === 'AS';
    }

    get isAtType(): boolean {
        return this.form.type === 'AT';
    }

    get isSingleDayAbsence(): boolean {
        if (this.form.type !== 'ABSENCE' || !this.form.startDate) {
            return false;
        }

        return this.getNormalizedEndDate() === this.form.startDate;
    }

    get showEndDateField(): boolean {
        return !this.isHsType && !this.isAtType && !this.form.absenceEndDateUnknown;
    }

    get showTimeFields(): boolean {
        return this.isHsType || this.isAsType || this.isSingleDayAbsence;
    }

    get showAlReasonField(): boolean {
        return this.form.type === 'AL';
    }

    get showAbsenceReasonField(): boolean {
        return this.form.type === 'ABSENCE';
    }

    get showAbsenceUnknownEndDateToggle(): boolean {
        return this.showAbsenceReasonField;
    }

    get computedWorkingDays(): number {
        if (this.form.type !== 'VA' || !this.form.startDate || !this.form.endDate || this.form.endDate < this.form.startDate) {
            return 0;
        }

        return this.countWorkingDaysExcludingWeekendsAndHolidays(this.form.startDate, this.form.endDate);
    }

    get computedHsDurationLabel(): string {
        if (!this.isHsType || !this.form.startTime || !this.form.endTime) {
            return '-';
        }

        const duration = this.calculateDurationMinutes(this.form.startTime, this.form.endTime, true);
        if (duration <= 0) {
            return '-';
        }

        return this.formatDuration(duration);
    }

    get computedAsDurationLabel(): string {
        if (!this.isAsType || !this.form.startTime || !this.form.endTime) {
            return '-';
        }

        const duration = this.calculateDurationMinutes(this.form.startTime, this.form.endTime, true);
        if (duration <= 0) {
            return '-';
        }

        return this.formatDuration(duration);
    }

    get selectedAlMaxDays(): number | null {
        if (!this.showAlReasonField || !this.form.alReason) {
            return null;
        }

        return this.alReasonRules[this.form.alReason].maxDays;
    }

    get absencePayrollHint(): string {
        if (!this.showAbsenceReasonField || !this.form.absenceReason) {
            return 'Selectionnez un motif pour appliquer le traitement paie adequat.';
        }

        switch (this.form.absenceReason) {
            case 'unjustified':
                return 'Impact paie negatif applique.';
            case 'sick_leave':
                return 'Delai de carence applique selon l accord entreprise.';
            case 'work_accident':
                return 'Declaration AT parallele requise.';
            default:
                return 'Traitement paie selon analyse RH.';
        }
    }

    getTypeChipStyle(type: Pick<RequestTypeOption, 'color'>): Record<string, string> {
        return { '--type-color': type.color };
    }

    onTypeSelect(type: DemandeTypeUi): void {
        this.form.type = type;
        this.applyTypeDefaults(true);
        this.errorMessage = '';
    }

    onStartDateChange(): void {
        if (this.form.absenceEndDateUnknown || this.isHsType) {
            this.form.endDate = this.form.startDate;
        }

        this.ensureAllowedTypeForDate();

        if (this.isHsType) {
            this.applyAutoHsStartTime(true);
        }
    }

    onEndDateChange(): void {
        if (this.form.endDate && this.form.startDate && this.form.endDate < this.form.startDate) {
            this.form.endDate = this.form.startDate;
        }
    }

    onAbsenceUnknownEndDateChange(): void {
        if (this.form.absenceEndDateUnknown) {
            this.form.endDate = this.form.startDate;
        }
    }

    closeModal(): void {
        if (this.loading) {
            return;
        }

        this.close.emit();
    }

    submit(): void {
        const validation = this.validate();
        if (!validation.ok) {
            this.errorMessage = validation.message;
            return;
        }

        const normalizedEndDate = this.getNormalizedEndDate();
        const hsDurationMinutes = this.isHsType
            ? this.calculateDurationMinutes(this.form.startTime, this.form.endTime, true)
            : 0;
        const isAtRequest = this.isAtType;
        const requestEndDate = isAtRequest ? undefined : normalizedEndDate;
        const requestDate = isAtRequest ? this.form.startDate : this.form.startDate;

        this.errorMessage = '';
        this.submitDemande.emit({
            serviceId: 0,
            type: this.form.type,
            date: requestDate,
            dateFin: requestEndDate,
            heureDebut: this.showTimeFields ? this.form.startTime : '00:00',
            heureFin: this.showTimeFields ? this.form.endTime : '00:00',
            commentaire: this.form.comment?.trim() || undefined,
            startDate: this.form.startDate,
            endDate: requestEndDate,
            startTime: this.showTimeFields ? this.form.startTime : undefined,
            endTime: this.showTimeFields ? this.form.endTime : undefined,
            reason: this.form.alReason || this.form.absenceReason || undefined,
            absenceEndDateUnknown: this.form.type === 'ABSENCE' ? this.form.absenceEndDateUnknown : undefined,
            workingDaysCount: this.form.type === 'VA' ? this.computedWorkingDays : undefined,
            durationMinutes: this.showTimeFields ? this.calculateDurationMinutes(this.form.startTime, this.form.endTime, true) : undefined,
            durationLabel: this.showTimeFields
                ? this.formatDuration(this.calculateDurationMinutes(this.form.startTime, this.form.endTime, true))
                : undefined,
            maxAuthorizedDays: this.form.type === 'AL' && this.form.alReason
                ? this.alReasonRules[this.form.alReason].maxDays
                : undefined,
            supportingDocumentRequired: this.form.type === 'AL' ? true : undefined,
            payrollImpact: this.getPayrollImpact(),
            linkedRequestHint: this.form.type === 'AS'
                ? 'En cas d intervention pendant l astreinte, creer une demande HS liee a cette AS.'
                : undefined,
            sourceAssignmentId: this.isHsType && hsDurationMinutes > 0
                ? undefined
                : undefined
        });
    }

    private validate(): { ok: boolean; message: string } {
        if (!this.form.startDate) {
            return { ok: false, message: 'La date de debut est obligatoire.' };
        }

        if (!this.form.type) {
            return { ok: false, message: 'Le type de demande est obligatoire.' };
        }

        if (!this.hasPlanningOnSelectedDate && this.form.type !== 'AS') {
            return { ok: false, message: 'Sur un jour sans planning, seule une demande d astreinte est autorisee.' };
        }

        const todayIso = this.toIsoDate(new Date());
        if (this.form.startDate < todayIso) {
            return { ok: false, message: 'Les demandes pour des jours deja passes ne sont pas autorisees.' };
        }

        if (!this.isHsType && !this.isAtType) {
            if (!this.getNormalizedEndDate()) {
                return { ok: false, message: 'La date de fin est obligatoire.' };
            }

            if (this.getNormalizedEndDate() < this.form.startDate) {
                return { ok: false, message: 'La date de fin doit etre posterieure ou egale a la date de debut.' };
            }

            if (this.getNormalizedEndDate() < todayIso) {
                return { ok: false, message: 'Les demandes pour des jours deja passes ne sont pas autorisees.' };
            }
        }

        if (this.isHsType) {
            if (!this.form.startTime || !this.form.endTime) {
                return { ok: false, message: 'Les heures de debut et de fin sont obligatoires pour une demande HS.' };
            }

            if (this.form.startTime === this.form.endTime) {
                return { ok: false, message: 'L heure de fin doit etre differente de l heure de debut.' };
            }

            const minimumStart = this.getMinimumHsStartTime(this.form.startDate);
            if (minimumStart && this.form.startTime < minimumStart) {
                return {
                    ok: false,
                    message: `La demande HS doit commencer a partir de ${minimumStart}.`
                };
            }
        }

        if (this.isAsType) {
            if (!this.form.startTime || !this.form.endTime) {
                return { ok: false, message: 'Les heures de debut et de fin sont obligatoires pour une astreinte.' };
            }

            if (this.form.startTime === this.form.endTime) {
                return { ok: false, message: 'L horaire d astreinte est invalide (debut et fin identiques).' };
            }
        }

        if (this.form.type === 'VA') {
            if (this.computedWorkingDays <= 0) {
                return { ok: false, message: 'La periode selectionnee ne contient aucun jour ouvrable a deduire.' };
            }
        }

        if (this.form.type === 'AL') {
            if (!this.form.alReason) {
                return { ok: false, message: 'Le motif legal est obligatoire.' };
            }

            const maxAllowed = this.alReasonRules[this.form.alReason].maxDays;
            const selectedDays = this.countCalendarDays(this.form.startDate, this.getNormalizedEndDate());
            if (selectedDays > maxAllowed) {
                return { ok: false, message: `Le motif selectionne autorise au maximum ${maxAllowed} jour(s).` };
            }
        }

        if (this.form.type === 'ABSENCE' && !this.form.absenceReason) {
            return { ok: false, message: 'Le motif d absence est obligatoire.' };
        }

        if (this.isSingleDayAbsence) {
            if (!this.form.startTime || !this.form.endTime) {
                return { ok: false, message: 'Pour une absence sur une seule journee, les heures de debut et de fin sont obligatoires.' };
            }

            if (this.form.startTime === this.form.endTime) {
                return { ok: false, message: 'L heure de fin doit etre differente de l heure de debut pour une absence journaliere.' };
            }
        }

        if (this.showTimeFields && this.isToday(this.form.startDate)) {
            const currentTime = this.getCurrentTimeRoundedToMinute();
            if (this.form.startTime < currentTime) {
                return { ok: false, message: `L heure de debut doit etre posterieure a ${currentTime}.` };
            }
        }

        if (this.isAtType && this.form.startDate !== this.form.endDate) {
            this.form.endDate = this.form.startDate;
        }

        return { ok: true, message: '' };
    }

    private buildInitialState(): DemandeFormState {
        const todayIso = this.toIsoDate(new Date());
        const initialDate = this.defaultDate || todayIso;

        return {
            startDate: initialDate,
            endDate: initialDate,
            type: 'VA',
            startTime: '08:00',
            endTime: '17:00',
            comment: '',
            alReason: '',
            absenceReason: '',
            absenceEndDateUnknown: false
        };
    }

    private applyTypeDefaults(adjustTime = false): void {
        this.ensureAllowedTypeForDate();

        if (this.isHsType) {
            this.form.endDate = this.form.startDate;
            this.applyAutoHsStartTime(adjustTime);
        }

        if (!this.showTimeFields) {
            this.form.startTime = '00:00';
            this.form.endTime = '00:00';
        } else if (this.form.startTime === '00:00' && this.form.endTime === '00:00') {
            this.form.startTime = '08:00';
            this.form.endTime = '17:00';
            if (this.isHsType) {
                this.applyAutoHsStartTime(true);
            }
        }

        if (this.form.type !== 'AL') {
            this.form.alReason = '';
        }

        if (this.form.type === 'ABSENCE') {
            this.form.absenceReason = '';
            this.form.absenceEndDateUnknown = false;
        }
    }

    private applyAutoHsStartTime(adjustEndTime = false): void {
        if (!this.isHsType) {
            return;
        }

        const suggested = this.getMinimumHsStartTime(this.form.startDate);
        if (!suggested) {
            return;
        }

        this.form.startTime = suggested;

        if (adjustEndTime) {
            const startMinutes = this.parseTimeToMinutes(this.form.startTime);
            const endMinutes = this.parseTimeToMinutes(this.form.endTime);
            if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
                this.form.endTime = this.addMinutesToTime(this.form.startTime, 60);
            }
        }
    }

    private getPlannedEndTime(dateIso: string): string {
        const candidate = `${this.workEndHourByDate?.[dateIso] ?? ''}`.trim();
        return /^\d{2}:\d{2}$/.test(candidate) ? candidate : '';
    }

    private ensureAllowedTypeForDate(): void {
        const allowed = this.availableRequestTypes.map(item => item.code);
        if (!allowed.includes(this.form.type)) {
            this.form.type = allowed[0];
        }
    }

    private getMinimumHsStartTime(dateIso: string): string {
        const plannedEnd = this.getPlannedEndTime(dateIso);
        if (!this.isToday(dateIso)) {
            return plannedEnd;
        }

        const now = this.getCurrentTimeRoundedToMinute();
        if (!plannedEnd) {
            return now;
        }

        return plannedEnd > now ? plannedEnd : now;
    }

    private calculateDurationMinutes(start: string, end: string, allowCrossMidnight: boolean): number {
        const startMinutes = this.parseTimeToMinutes(start);
        const endMinutes = this.parseTimeToMinutes(end);

        if (startMinutes === null || endMinutes === null) {
            return 0;
        }

        if (endMinutes > startMinutes) {
            return endMinutes - startMinutes;
        }

        if (allowCrossMidnight && endMinutes < startMinutes) {
            return (24 * 60 - startMinutes) + endMinutes;
        }

        return 0;
    }

    private parseTimeToMinutes(value: string): number | null {
        const match = `${value ?? ''}`.trim().match(/^(\d{2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        return hours * 60 + minutes;
    }

    private addMinutesToTime(time: string, minutes: number): string {
        const base = this.parseTimeToMinutes(time);
        if (base === null) {
            return time;
        }

        const next = (base + minutes) % (24 * 60);
        const hh = Math.floor(next / 60);
        const mm = next % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    private getCurrentTimeRoundedToMinute(): string {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    private formatDuration(minutes: number): string {
        const safe = Math.max(0, Math.floor(minutes));
        const hours = Math.floor(safe / 60);
        const remaining = safe % 60;
        return `${hours}h ${String(remaining).padStart(2, '0')}min`;
    }

    private getNormalizedEndDate(): string {
        if (this.isHsType) {
            return this.form.startDate;
        }

        if (this.form.type === 'ABSENCE' && this.form.absenceEndDateUnknown) {
            return this.form.startDate;
        }

        return this.form.endDate;
    }

    private countCalendarDays(startIso: string, endIso: string): number {
        if (!startIso || !endIso || endIso < startIso) {
            return 0;
        }

        const start = new Date(`${startIso}T00:00:00`);
        const end = new Date(`${endIso}T00:00:00`);
        const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        return diff + 1;
    }

    private countWorkingDaysExcludingWeekendsAndHolidays(startIso: string, endIso: string): number {
        const start = new Date(`${startIso}T00:00:00`);
        const end = new Date(`${endIso}T00:00:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            return 0;
        }

        const holidays = this.getPublicHolidaySet(start.getFullYear(), end.getFullYear());
        let count = 0;

        for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
            const weekday = day.getDay();
            const dayIso = this.toIsoDate(day);
            const isWeekend = weekday === 0 || weekday === 6;
            const isHoliday = holidays.has(dayIso);
            if (!isWeekend && !isHoliday) {
                count += 1;
            }
        }

        return count;
    }

    private getPublicHolidaySet(startYear: number, endYear: number): Set<string> {
        const set = new Set<string>();
        for (let year = startYear; year <= endYear; year += 1) {
            this.getFrenchPublicHolidays(year).forEach(dateIso => set.add(dateIso));
        }
        return set;
    }

    private getFrenchPublicHolidays(year: number): string[] {
        const fixedDates = [
            `${year}-01-01`,
            `${year}-05-01`,
            `${year}-05-08`,
            `${year}-07-14`,
            `${year}-08-15`,
            `${year}-11-01`,
            `${year}-11-11`,
            `${year}-12-25`
        ];

        const easter = this.getEasterDate(year);
        const easterMonday = new Date(easter);
        easterMonday.setDate(easter.getDate() + 1);
        const ascension = new Date(easter);
        ascension.setDate(easter.getDate() + 39);
        const pentecostMonday = new Date(easter);
        pentecostMonday.setDate(easter.getDate() + 50);

        return [
            ...fixedDates,
            this.toIsoDate(easterMonday),
            this.toIsoDate(ascension),
            this.toIsoDate(pentecostMonday)
        ];
    }

    private getEasterDate(year: number): Date {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;

        return new Date(year, month - 1, day);
    }

    private getPayrollImpact(): 'none' | 'negative' | 'waiting_period' | 'requires_at_declaration' {
        if (this.form.type !== 'ABSENCE' || !this.form.absenceReason) {
            return 'none';
        }

        switch (this.form.absenceReason) {
            case 'unjustified':
                return 'negative';
            case 'sick_leave':
                return 'waiting_period';
            case 'work_accident':
                return 'requires_at_declaration';
            default:
                return 'none';
        }
    }

    private toIsoDate(date: Date): string {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    private isToday(dateIso: string): boolean {
        return dateIso === this.toIsoDate(new Date());
    }
}
