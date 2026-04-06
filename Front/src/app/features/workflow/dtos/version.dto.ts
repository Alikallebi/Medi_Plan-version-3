export type NouvelleVersionMotif =
    | 'echange-garde'
    | 'maladie'
    | 'demande-modification'
    | 'reorganisation'
    | 'autre';

export type TypeModificationVersion = 'mineure' | 'majeure';

export interface NouvelleVersionDTO {
    planningId: number;
    motif: NouvelleVersionMotif;
    description: string;
    typeModification: TypeModificationVersion;
}