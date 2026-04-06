/**
 * Modèle représentant le contexte complet d'un utilisateur connecté
 * Inclut les informations de rôle, périmètre et permissions calculées
 */

export type RoleNormalized =
    | 'super-admin'
    | 'admin-gta'
    | 'chef-pole'
    | 'chef-service'
    | 'validateur-rh'
    | 'planificateur-rh'
    | 'planificateur-urgence'
    | 'superviseur-internes'
    | 'staff';

export interface UserPermissions {
    canValidate: boolean;
    canConfigure: boolean;
    canViewAdmin: boolean;
    canViewAudit: boolean;
    canValidateFinal: boolean;
    canCreatePlanning: boolean;
    canComment: boolean;
    canAttachFiles: boolean;
}

export interface UserContext {
    id: number;
    nom: string;
    prenom: string;
    nomComplet: string;
    email: string;
    role: string;
    roleNormalized: RoleNormalized;
    serviceId?: number;
    serviceNom?: string;
    poleId?: number;
    poleNom?: string;
    equipeId?: number;
    equipeNom?: string;
    permissions: UserPermissions;
    derniereConnexion?: Date;
    estActif: boolean;
}

export interface UserContextLite {
    id: number;
    roleNormalized: RoleNormalized;
    serviceId?: number;
    poleId?: number;
    permissions: Pick<UserPermissions, 'canValidate' | 'canViewAdmin' | 'canValidateFinal'>;
}

export const ROLE_PERMISSIONS_MAP: Record<RoleNormalized, Partial<UserPermissions>> = {
    'super-admin': {
        canValidate: true,
        canConfigure: true,
        canViewAdmin: true,
        canViewAudit: true,
        canValidateFinal: true,
        canCreatePlanning: true,
        canComment: true,
        canAttachFiles: true
    },
    'admin-gta': {
        canValidate: false,
        canConfigure: true,
        canViewAdmin: true,
        canViewAudit: true,
        canValidateFinal: false,
        canCreatePlanning: true,
        canComment: true,
        canAttachFiles: true
    },
    'chef-service': {
        canValidate: true,
        canConfigure: false,
        canViewAdmin: false,
        canViewAudit: false,
        canValidateFinal: false,
        canCreatePlanning: true,
        canComment: true,
        canAttachFiles: true
    },
    'chef-pole': {
        canValidate: true,
        canConfigure: false,
        canViewAdmin: false,
        canViewAudit: false,
        canValidateFinal: false,
        canCreatePlanning: false,
        canComment: true,
        canAttachFiles: true
    },
    'validateur-rh': {
        canValidate: true,
        canConfigure: false,
        canViewAdmin: false,
        canViewAudit: false,
        canValidateFinal: false,
        canCreatePlanning: false,
        canComment: true,
        canAttachFiles: true
    },
    'planificateur-rh': {
        canValidate: true,
        canConfigure: false,
        canViewAdmin: true,
        canViewAudit: true,
        canValidateFinal: false,
        canCreatePlanning: false,
        canComment: true,
        canAttachFiles: true
    },
    'planificateur-urgence': {
        canValidate: true,
        canConfigure: false,
        canViewAdmin: false,
        canViewAudit: false,
        canValidateFinal: false,
        canCreatePlanning: true,
        canComment: true,
        canAttachFiles: true
    },
    'superviseur-internes': {
        canValidate: true,
        canConfigure: false,
        canViewAdmin: false,
        canViewAudit: false,
        canValidateFinal: false,
        canCreatePlanning: true,
        canComment: true,
        canAttachFiles: true
    },
    'staff': {
        canValidate: false,
        canConfigure: false,
        canViewAdmin: false,
        canViewAudit: false,
        canValidateFinal: false,
        canCreatePlanning: false,
        canComment: false,
        canAttachFiles: false
    }
};

export function normalizeRole(role: string): RoleNormalized {
    const roleMap: Record<string, RoleNormalized> = {
        SUPER_ADMIN: 'super-admin',
        'SUPER-ADMIN': 'super-admin',
        'super-admin': 'super-admin',
        'Super Admin': 'super-admin',

        ADMIN_GTA: 'admin-gta',
        'ADMIN-GTA': 'admin-gta',
        'admin-gta': 'admin-gta',
        'Admin GTA': 'admin-gta',
        ADMIN: 'admin-gta',

        CHEF_DE_POLE: 'chef-pole',
        'CHEF-DE-POLE': 'chef-pole',
        'chef-pole': 'chef-pole',
        'Chef de Pôle': 'chef-pole',
        CHEF_POLE: 'chef-pole',
        'CHEF-POLE': 'chef-pole',
        'CHEF DE POLE': 'chef-pole',

        CHEF_DE_SERVICE: 'chef-service',
        'CHEF-DE-SERVICE': 'chef-service',
        'chef-service': 'chef-service',
        'Chef de Service': 'chef-service',
        CHEF: 'chef-service',

        VALIDATEUR_RH: 'validateur-rh',
        'VALIDATEUR-RH': 'validateur-rh',
        'validateur-rh': 'validateur-rh',
        'Validateur RH': 'validateur-rh',

        PLANIFICATEUR_RH: 'planificateur-rh',
        'PLANIFICATEUR-RH': 'planificateur-rh',
        'planificateur-rh': 'planificateur-rh',
        'planificateur rh': 'planificateur-rh',
        'Planificateur RH': 'planificateur-rh',

        PLANIFICATEUR_URGENCE: 'planificateur-urgence',
        'planificateur-urgence': 'planificateur-urgence',
        'Planificateur urgence': 'planificateur-urgence',

        SUPERVISEUR_INTERNES: 'superviseur-internes',
        'superviseur-internes': 'superviseur-internes',
        'Superviseur internes': 'superviseur-internes',

        PRATICIEN: 'staff',
        INFIRMIER: 'staff',
        CADRE: 'staff',
        STAFF: 'staff',
        staff: 'staff',
        Staff: 'staff'
    };

    return roleMap[role] || 'staff';
}

export function createUserContext(rawData: any): UserContext {
    const roleNormalized = normalizeRole(rawData.role);
    const basePermissions = ROLE_PERMISSIONS_MAP[roleNormalized];
    const nomComplet = `${rawData.prenom || ''} ${rawData.nom || ''}`.trim() || rawData.username || 'Utilisateur';

    return {
        id: rawData.id ?? rawData.userId,
        nom: rawData.nom || '',
        prenom: rawData.prenom || '',
        nomComplet,
        email: rawData.email || '',
        role: rawData.role,
        roleNormalized,
        serviceId: rawData.service_id,
        serviceNom: rawData.service_nom,
        poleId: rawData.pole_id,
        poleNom: rawData.pole_nom,
        equipeId: rawData.equipe_id,
        equipeNom: rawData.equipe_nom,
        permissions: {
            canValidate: basePermissions.canValidate || false,
            canConfigure: basePermissions.canConfigure || false,
            canViewAdmin: basePermissions.canViewAdmin || false,
            canViewAudit: basePermissions.canViewAudit || false,
            canValidateFinal: basePermissions.canValidateFinal || false,
            canCreatePlanning: basePermissions.canCreatePlanning || false,
            canComment: basePermissions.canComment || false,
            canAttachFiles: basePermissions.canAttachFiles || false
        },
        derniereConnexion: rawData.last_login ? new Date(rawData.last_login) : undefined,
        estActif: rawData.actif !== 0
    };
}
