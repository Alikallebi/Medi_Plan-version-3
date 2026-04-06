export interface SoumissionDTO {
    planningId: number;
    message?: string;
    dateSoumission: Date;
}

export interface AnnulationSoumissionDTO {
    planningId: number;
    motif?: string;
}