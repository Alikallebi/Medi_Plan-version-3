import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Assignment, DragPlanningItem, Personnel, PlanningPoste, ShiftType } from 'src/app/demo/api/planning.models';

@Component({
    selector: 'app-personnel-list',
    templateUrl: './personnel-list.component.html',
    styleUrls: ['./personnel-list.component.scss']
})
export class PersonnelListComponent implements OnChanges {
    @Input() personnel: Personnel[] = [];
    @Input() postes: PlanningPoste[] = [];
    @Input() assignments: Assignment[] = [];
    @Input() selectedCellsCount = 0;
    @Output() searchChanged = new EventEmitter<string>();
    @Output() applyPosteToSelection = new EventEmitter<string>();
    @Output() posteSelectionChanged = new EventEmitter<PlanningPoste | null>();

    searchTerm = '';
    statusFilter: 'all' | 'disponible' | 'conges' | 'formation' = 'all';
    selectedCategory: 'all' | 'medecin' | 'infirmier' | 'autre' | 'vacant' = 'all';
    // specialty filter (pills)
    specialtyFilter: string = 'all';

    shiftByPerson: Record<string, ShiftType> = {};
    usersExpanded = true;
    postesExpanded = true;
    posteTypeFilter: 'all' | ShiftType = 'all';
    selectedPosteIdForBulk = '';

    readonly posteTypeOptions: { key: 'all' | ShiftType; label: string }[] = [
        { key: 'all',        label: 'Tous'       },
        { key: 'jour',       label: 'Jour'       },
        { key: 'nuit',       label: 'Nuit'       },
        { key: 'garde',      label: 'Garde'      },
        { key: 'astreinte',  label: 'Astreinte'  },
        { key: 'repos',      label: 'Repos'      },
    ];
    selectedPosteForDrag: PlanningPoste | null = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['personnel']) {
            for (const person of this.personnel) {
                this.shiftByPerson[person.id] = this.shiftByPerson[person.id] || 'jour';
            }
            // Reset specialty & category filters when the service (personnel list) changes
            if (!changes['personnel'].firstChange) {
                this.specialtyFilter = 'all';
                this.selectedCategory = 'all';
                this.statusFilter = 'all';
            }
        }
    }

    get categories() {
        return [
            { key: 'all', label: 'Tous', count: this.personnel.length },
            { key: 'medecin', label: 'Médecins', count: this.personnel.filter(item => item.category === 'medecin').length },
            { key: 'infirmier', label: 'Infirmiers', count: this.personnel.filter(item => item.category === 'infirmier').length },
            { key: 'autre', label: 'Autres', count: this.personnel.filter(item => item.category === 'autre').length },
            { key: 'vacant', label: 'Vacants', count: this.personnel.filter(item => item.category === 'vacant').length }
        ];
    }

    get filteredPersonnel(): Personnel[] {
        const term = this.searchTerm.trim().toLowerCase();

        return this.personnel.filter(person => {
            const matchesCategory = this.selectedCategory === 'all' || person.category === this.selectedCategory;
            const matchesStatus = this.statusFilter === 'all' || person.status === this.statusFilter;
            const matchesSpecialty = this.specialtyFilter === 'all' || (person.specialty || '').toLowerCase() === this.specialtyFilter;
            const matchesTerm = !term || `${person.prenom} ${person.nom} ${person.role}`.toLowerCase().includes(term);
            return matchesCategory && matchesStatus && matchesSpecialty && matchesTerm;
        });
    }

    /**
     * Distinct specialties present in the current personnel list.
     * Returns array of { key, label, count }
     */
    get specialties() {
        const counts: Record<string, number> = {};
        for (const p of this.personnel) {
            const key = (p.specialty || '').toLowerCase() || 'autre';
            counts[key] = (counts[key] || 0) + 1;
        }

        const items = Object.keys(counts).map(k => ({ key: k, label: k === 'autre' ? 'Autres' : this.titleCase(k), count: counts[k] }));
        // place 'all' first
        items.sort((a, b) => (a.key === 'all' ? -1 : b.key === 'all' ? 1 : a.label.localeCompare(b.label)));
        return [{ key: 'all', label: 'Tous', count: this.personnel.length }, ...items];
    }

    setSpecialty(key: string): void {
        this.specialtyFilter = key;
    }

    private titleCase(s: string) {
        return s.replace(/(^|\s)\S/g, t => t.toUpperCase());
    }

    get filteredPostes(): PlanningPoste[] {
        const items = this.posteTypeFilter === 'all'
            ? this.postes
            : this.postes.filter(poste => poste.type === this.posteTypeFilter);

        return [...items].sort((left, right) => this.getPosteUsage(right.id) - this.getPosteUsage(left.id));
    }

    setCategory(category: string): void {
        if (category === 'all' || category === 'medecin' || category === 'infirmier' || category === 'autre' || category === 'vacant') {
            this.selectedCategory = category;
        }
    }

    onSearch(value: string): void {
        this.searchTerm = value;
        this.searchChanged.emit(value);
    }

    toDragItem(person: Personnel): DragPlanningItem {
        return {
            source: 'list',
            personnelId: person.id,
            shiftType: this.shiftByPerson[person.id] || 'jour'
        };
    }

    toPosteDragItem(poste: PlanningPoste): DragPlanningItem {
        const isNonWorkingType = poste.type === 'repos' || poste.type === 'conges';
        return {
            source: 'list',
            posteId: poste.id,
            posteLabel: isNonWorkingType ? poste.nom : `${poste.nom} (${poste.heureDebut} - ${poste.heureFin})`,
            shiftType: poste.type,
            startTime: isNonWorkingType ? undefined : poste.heureDebut,
            endTime: isNonWorkingType ? undefined : poste.heureFin
        };
    }

    isNonWorkingType(type?: string): boolean {
        return type === 'repos' || type === 'conges';
    }

    getInitials(person: Personnel): string {
        return `${person.prenom.charAt(0)}${person.nom.charAt(0)}`.toUpperCase();
    }

    getPosteUsage(posteId: string): number {
        return this.assignments.filter(item => item.posteId === posteId).length;
    }

    applyToSelection(): void {
        if (!this.selectedPosteIdForBulk) {
            return;
        }
        this.applyPosteToSelection.emit(this.selectedPosteIdForBulk);
        // Keep the poste selected even after applying - don't clear selectedPosteIdForBulk
    }

    selectPosteForDrag(poste: PlanningPoste): void {
        // Called when dragging starts - automatically select the poste
        // This happens during dragstart event
        this.selectedPosteForDrag = poste;
        this.selectedPosteIdForBulk = poste.id;
        this.posteSelectionChanged.emit(poste);
    }

    togglePosteSelection(poste: PlanningPoste): void {
        // Manual toggle via button/menu - not needed anymore
        if (this.selectedPosteForDrag?.id === poste.id) {
            this.clearPosteSelection();
        } else {
            this.selectPosteForDrag(poste);
        }
    }

    clearPosteSelection(): void {
        this.selectedPosteForDrag = null;
        this.selectedPosteIdForBulk = '';
        this.posteSelectionChanged.emit(null);
    }

    isPosteSelected(posteId: string): boolean {
        return this.selectedPosteForDrag?.id === posteId;
    }

    @HostListener('document:keydown.escape')
    onEscapeKey(): void {
        // Clear poste selection when ESC is pressed
        if (this.selectedPosteForDrag) {
            this.clearPosteSelection();
        }
    }
}