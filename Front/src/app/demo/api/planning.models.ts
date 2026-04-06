export type ShiftType = 'jour' | 'nuit' | 'garde' | 'astreinte' | 'repos' | 'conges' | 'formation';

export type PersonnelCategory = 'medecin' | 'infirmier' | 'autre' | 'vacant';

export type PersonnelStatus = 'disponible' | 'indisponible' | 'conges' | 'formation';

export interface PlanningData {
    id: string;
    serviceId: string;
    serviceName: string;
    weekStart: Date;
    weekEnd: Date;
    workflowStatus?: string;
    workflowId?: number;
    canSubmit?: boolean;
    submittedBy?: string;
    submittedAt?: Date;
    assignments: Assignment[];
    personnel: Personnel[];
    rules: Rule[];
    conflicts: Conflict[];
    history: PlanningHistoryEntry[];
}

export interface Assignment {
    id: string;
    personnelId: string;
    day: number;
    shiftType: ShiftType;
    posteId?: string;
    posteLabel?: string;
    startTime?: string;
    endTime?: string;
    note?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface PlanningPoste {
    id: string;
    code: string;
    nom: string;
    type: ShiftType;
    heureDebut: string;
    heureFin: string;
    actif: boolean;
    serviceName?: string;
}

export interface Personnel {
    id: string;
    nom: string;
    prenom: string;
    role: string;
    specialty: string;
    category: PersonnelCategory;
    status: PersonnelStatus;
    avatar?: string;
}

export interface Rule {
    id: string;
    name: string;
    description: string;
    type: 'repos' | 'quota' | 'competence';
    value: any;
    active: boolean;
}

export interface Conflict {
    id: string;
    type:
        | 'double_affectation'
        | 'chevauchement_horaire'
        | 'repos_insuffisant'
        | 'quota_depasse'
        | 'incompatibilite_postes'
        | 'competence_manquante';
    description: string;
    severity: 'warning' | 'critical';
    assignments: string[];
    personnelId?: string;
    day?: number;
    suggestedFix?: string;
    details?: string;
}

export interface PlanningVersion {
    id: string;
    versionLabel: string;
    createdAt: Date;
    author: string;
    assignmentsCount: number;
}

export interface PlanningHistoryEntry {
    id: string;
    at: Date;
    author: string;
    action: string;
    details: string;
}

export interface ValidationResult {
    valid: boolean;
    violations: string[];
}

export interface PlanningStats {
    occupancyRate: number;
    coveredPosts: number;
    totalPosts: number;
    conflicts: number;
}

export interface DragPlanningItem {
    source: 'list' | 'planning';
    personnelId?: string;
    posteId?: string;
    posteLabel?: string;
    shiftType: ShiftType;
    startTime?: string;
    endTime?: string;
    assignmentId?: string;
}

export interface DropTargetCell {
    personnelId: string;
    day: number;
}
