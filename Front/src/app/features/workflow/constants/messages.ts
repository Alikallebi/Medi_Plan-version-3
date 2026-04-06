export const WORKFLOW_MESSAGES = {
    SUCCESS: {
        APPROBATION: 'Planning approuvé avec succès',
        REJET: 'Planning rejeté',
        SAUVEGARDE: 'Modifications enregistrées'
    },
    ERROR: {
        CHARGEMENT: 'Erreur lors du chargement',
        VALIDATION: 'Erreur lors de la validation',
        RESEAU: 'Problème de connexion'
    },
    CONFIRMATION: {
        REJET: 'Êtes-vous sûr de vouloir rejeter ce planning ?',
        SUPPRESSION: 'Cette action est irréversible'
    }
} as const;
