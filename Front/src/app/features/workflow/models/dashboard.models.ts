export interface ServiceStat {
    serviceName: string;
    enAttente: number;
    valides: number;
}

export interface EvolutionPoint {
    label: string;
    value: number;
}

export interface DashboardStats {
    enAttente: number;
    depasses: number;
    validesCeMois: number;
    tempsMoyenValidation: number;
    tauxApprobation: number;
    planningsFinaux: number;
    parService: ServiceStat[];
    evolution: EvolutionPoint[];
}

export interface BlockedPlanning {
    id: number;
    nom: string;
    service: string;
    bloqueChez: string;
    bloqueChezRole: string;
    depuis: string;
    joursDepasses: number;
    validateurId: number;
    validateurEmail: string;
}

export type ValidatorPerfLevel = 'good' | 'average' | 'poor';

export interface ValidatorPerformance {
    validateurId: number;
    nom: string;
    role: string;
    traites: number;
    enAttente: number;
    tempsMoyen: number;
    performance: ValidatorPerfLevel;
}
