export type DemandeType = 'HS' | 'RC+' | 'RC-' | 'ABSENCE' | 'ARRET' | 'VA' | 'AS' | 'AT' | 'AL' | 'JR';
export type DemandeTypeUi = 'VA' | 'HS' | 'AL' | 'JR' | 'AS' | 'ABSENCE' | 'AT';
export type DemandeAlReason = 'marriage' | 'bereavement' | 'birth' | 'family_event' | 'other';
export type DemandeAbsenceReason = 'unjustified' | 'sick_leave' | 'work_accident' | 'other';

export type DemandeTypeImpact = 'neutral' | 'positive' | 'negative';

export interface DemandeTypeDefinition {
    code: DemandeType;
    label: string;
    description: string;
    color: string;
    impact: DemandeTypeImpact;
    isRequestable?: boolean;
}

export interface DemandeItem {
    id: number;
    userId: number;
    serviceId: number;
    date: string;
    dateFin?: string;
    type: string;
    heureDebut: string;
    heureFin: string;
    dureeHeures: number;
    commentaire?: string;
    statut: string;
    motifRejet?: string;
    traitePar?: number;
    traiteLe?: string;
    createdAt: string;
    updatedAt: string;
    sourceAssignmentId?: string;
    validePar?: number;
    valideParNom?: string;
    dateValidation?: string;
}

export interface DemandeCreatePayload {
    serviceId: number;
    date: string;
    dateFin?: string;
    type: DemandeType;
    heureDebut: string;
    heureFin: string;
    commentaire?: string;
    sourceAssignmentId?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    reason?: DemandeAlReason | DemandeAbsenceReason;
    absenceEndDateUnknown?: boolean;
    workingDaysCount?: number;
    durationMinutes?: number;
    durationLabel?: string;
    maxAuthorizedDays?: number;
    supportingDocumentRequired?: boolean;
    payrollImpact?: 'none' | 'negative' | 'waiting_period' | 'requires_at_declaration';
    linkedRequestHint?: string;
}

export interface DemandeHistoriqueItem {
    id: number;
    demandeId: number;
    action: string;
    acteurId?: number;
    acteurNom?: string;
    commentaire?: string;
    createdAt: string;
}