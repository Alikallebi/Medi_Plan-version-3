export type VersionReason =
    | 'CREATION'
    | 'MODIFICATION'
    | 'VALIDATION'
    | 'REJET'
    | 'CORRECTION';

export interface Version {
    /** Identifiant unique de version */
    id: string;
    /** Planning concerné */
    planningId: string;
    /** Numéro de version séquentiel */
    versionNumber: number;
    /** Version parente en cas de branchement */
    parentVersionId?: string;
    /** Motif de création de version */
    reason: VersionReason;
    /** Hash optionnel du snapshot pour intégrité */
    snapshotHash?: string;
    /** Utilisateur qui a créé la version */
    createdBy: string;
    /** Date ISO de création */
    createdAt: string;
}