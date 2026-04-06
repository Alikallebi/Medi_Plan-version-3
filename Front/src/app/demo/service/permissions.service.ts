import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

/**
 * Rôles de l'application pour la gestion des droits
 */
export enum ApplicationRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN_GTA = 'admin_gta',
  CHEF_POLE = 'chef_pole',
  CHEF_SERVICE = 'chef_service',
  CHEF_EQUIPE = 'chef_equipe',
  STAFF = 'staff'
}

/**
 * Droits disponibles dans l'application
 */
export enum Permission {
  // Lecture
  VIEW_STRUCTURE = 'view_structure',
  VIEW_ALL_STRUCTURE = 'view_all_structure',
  
  // Création
  CREATE_POLE = 'create_pole',
  CREATE_SERVICE = 'create_service',
  CREATE_EQUIPE = 'create_equipe',
  
  // Modification
  EDIT_POLE = 'edit_pole',
  EDIT_SERVICE = 'edit_service',
  EDIT_EQUIPE = 'edit_equipe',
  
  // Suppression
  DELETE_POLE = 'delete_pole',
  DELETE_SERVICE = 'delete_service',
  DELETE_EQUIPE = 'delete_equipe',
  
  // Déplacement
  MOVE_SERVICE = 'move_service',
  MOVE_EQUIPE = 'move_equipe',
  
  // Actions supplémentaires
  MANAGE_MEMBERS = 'manage_members',
  VIEW_REPORTS = 'view_reports'
}

export interface UserSession {
  userId: number;
  username: string;
  email: string;
  role: ApplicationRole;
  poleId?: number; // Pour Chef de Pôle
  serviceId?: number; // Pour Chef de Service
  equipeId?: number; // Pour Chef d'Équipe
}

/**
 * Service pour gérer les permissions et les droits d'accès
 */
@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  private currentUser: UserSession | null = null;

  // Matrice des permissions par rôle
  private permissionMatrix: Map<ApplicationRole, Permission[]> = new Map([
    // Super Admin: tous les droits
    [ApplicationRole.SUPER_ADMIN, [
      Permission.VIEW_ALL_STRUCTURE,
      Permission.CREATE_POLE,
      Permission.CREATE_SERVICE,
      Permission.CREATE_EQUIPE,
      Permission.EDIT_POLE,
      Permission.EDIT_SERVICE,
      Permission.EDIT_EQUIPE,
      Permission.DELETE_POLE,
      Permission.DELETE_SERVICE,
      Permission.DELETE_EQUIPE,
      Permission.MOVE_SERVICE,
      Permission.MOVE_EQUIPE,
      Permission.MANAGE_MEMBERS,
      Permission.VIEW_REPORTS
    ]],

    // Admin GTA: tous les droits sauf suppressions de pôles avec enfants
    [ApplicationRole.ADMIN_GTA, [
      Permission.VIEW_ALL_STRUCTURE,
      Permission.CREATE_POLE,
      Permission.CREATE_SERVICE,
      Permission.CREATE_EQUIPE,
      Permission.EDIT_POLE,
      Permission.EDIT_SERVICE,
      Permission.EDIT_EQUIPE,
      Permission.DELETE_SERVICE, // Avec restrictions
      Permission.DELETE_EQUIPE,
      Permission.MOVE_SERVICE,
      Permission.MOVE_EQUIPE,
      Permission.MANAGE_MEMBERS,
      Permission.VIEW_REPORTS
    ]],

    // Chef de Pôle: gestion de son pôle et enfants
    [ApplicationRole.CHEF_POLE, [
      Permission.VIEW_STRUCTURE,
      Permission.CREATE_SERVICE,
      Permission.CREATE_EQUIPE,
      Permission.EDIT_SERVICE,
      Permission.EDIT_EQUIPE,
      Permission.MOVE_EQUIPE,
      Permission.MANAGE_MEMBERS
    ]],

    // Chef de Service: gestion de son service et équipes
    [ApplicationRole.CHEF_SERVICE, [
      Permission.VIEW_STRUCTURE,
      Permission.CREATE_EQUIPE,
      Permission.EDIT_EQUIPE,
      Permission.MOVE_EQUIPE,
      Permission.MANAGE_MEMBERS
    ]],

    // Chef d'Équipe: lecture seule
    [ApplicationRole.CHEF_EQUIPE, [
      Permission.VIEW_STRUCTURE
    ]],

    // Staff: pas d'accès
    [ApplicationRole.STAFF, []]
  ]);

  constructor() {
    this.initializeSession();
  }

  /**
   * Initialise la session utilisateur (à adapter avec vrai auth service)
   */
  private initializeSession(): void {
    // TODO: À intégrer avec le vrai service d'authentification
    this.currentUser = {
      userId: 1,
      username: 'SuperAdmin',
      email: 'admin@hopital.fr',
      role: ApplicationRole.SUPER_ADMIN
    };
  }

  /**
   * Récupère l'utilisateur actuel
   */
  getCurrentUser(): UserSession | null {
    return this.currentUser;
  }

  /**
   * Définit l'utilisateur actuel (pour tests)
   */
  setCurrentUser(user: UserSession): void {
    this.currentUser = user;
  }

  /**
   * Vérifie si l'utilisateur a une permission
   */
  hasPermission(permission: Permission): boolean {
    if (!this.currentUser) return false;
    const permissions = this.permissionMatrix.get(this.currentUser.role) || [];
    return permissions.includes(permission);
  }

  /**
   * Vérifie si l'utilisateur a toutes les permissions
   */
  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }

  /**
   * Vérifie si l'utilisateur a au moins une permission
   */
  hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  /**
   * Vérifie si l'utilisateur peut voir la structure
   */
  canViewStructure(): boolean {
    return this.hasAnyPermission([
      Permission.VIEW_STRUCTURE,
      Permission.VIEW_ALL_STRUCTURE
    ]);
  }

  /**
   * Vérifie si l'utilisateur peut créer un pôle
   */
  canCreatePole(): boolean {
    return this.hasPermission(Permission.CREATE_POLE);
  }

  /**
   * Vérifie si l'utilisateur peut créer un service
   */
  canCreateService(): boolean {
    return this.hasPermission(Permission.CREATE_SERVICE);
  }

  /**
   * Vérifie si l'utilisateur peut créer une équipe
   */
  canCreateEquipe(): boolean {
    return this.hasPermission(Permission.CREATE_EQUIPE);
  }

  /**
   * Vérifie si l'utilisateur peut modifier un pôle
   */
  canEditPole(poleId: number): boolean {
    if (this.hasPermission(Permission.EDIT_POLE)) {
      // Si c'est un Chef de Pôle, vérifier que c'est son pôle
      if (this.currentUser?.role === ApplicationRole.CHEF_POLE) {
        return this.currentUser.poleId === poleId;
      }
      return true;
    }
    return false;
  }

  /**
   * Vérifie si l'utilisateur peut modifier un service
   */
  canEditService(serviceId: number, poleId?: number): boolean {
    if (!this.hasPermission(Permission.EDIT_SERVICE)) return false;
    
    if (this.currentUser?.role === ApplicationRole.CHEF_POLE && poleId) {
      return this.currentUser.poleId === poleId;
    }
    
    if (this.currentUser?.role === ApplicationRole.CHEF_SERVICE) {
      return this.currentUser.serviceId === serviceId;
    }
    
    return true;
  }

  /**
   * Vérifie si l'utilisateur peut modifier une équipe
   */
  canEditEquipe(equipeId: number): boolean {
    if (!this.hasPermission(Permission.EDIT_EQUIPE)) return false;
    
    if (this.currentUser?.role === ApplicationRole.CHEF_EQUIPE) {
      return this.currentUser.equipeId === equipeId;
    }
    
    return true;
  }

  /**
   * Vérifie si l'utilisateur peut supprimer un pôle
   */
  canDeletePole(): boolean {
    return this.hasPermission(Permission.DELETE_POLE);
  }

  /**
   * Vérifie si l'utilisateur peut supprimer un service
   */
  canDeleteService(): boolean {
    return this.hasPermission(Permission.DELETE_SERVICE);
  }

  /**
   * Vérifie si l'utilisateur peut supprimer une équipe
   */
  canDeleteEquipe(): boolean {
    return this.hasPermission(Permission.DELETE_EQUIPE);
  }

  /**
   * Vérifie si l'utilisateur peut déplacer un service
   */
  canMoveService(fromPoleId?: number): boolean {
    if (!this.hasPermission(Permission.MOVE_SERVICE)) return false;
    
    if (this.currentUser?.role === ApplicationRole.CHEF_POLE && fromPoleId) {
      return this.currentUser.poleId === fromPoleId;
    }
    
    return true;
  }

  /**
   * Vérifie si l'utilisateur peut déplacer une équipe
   */
  canMoveEquipe(fromPoleId?: number, fromServiceId?: number): boolean {
    if (!this.hasPermission(Permission.MOVE_EQUIPE)) return false;
    
    if (this.currentUser?.role === ApplicationRole.CHEF_POLE && fromPoleId) {
      return this.currentUser.poleId === fromPoleId;
    }
    
    if (this.currentUser?.role === ApplicationRole.CHEF_SERVICE && fromServiceId) {
      return this.currentUser.serviceId === fromServiceId;
    }
    
    return true;
  }

  /**
   * Obtient les permissions de l'utilisateur actuel
   */
  getCurrentPermissions(): Permission[] {
    if (!this.currentUser) return [];
    return this.permissionMatrix.get(this.currentUser.role) || [];
  }

  /**
   * Vérifie si l'utilisateur est Super Admin
   */
  isSuperAdmin(): boolean {
    return this.currentUser?.role === ApplicationRole.SUPER_ADMIN;
  }

  /**
   * Vérifie si l'utilisateur est Admin GTA
   */
  isAdminGta(): boolean {
    return this.currentUser?.role === ApplicationRole.ADMIN_GTA;
  }

  /**
   * Vérifie si l'utilisateur est Chef de Pôle
   */
  isChefPole(): boolean {
    return this.currentUser?.role === ApplicationRole.CHEF_POLE;
  }

  /**
   * Vérifie si l'utilisateur est Chef de Service
   */
  isChefService(): boolean {
    return this.currentUser?.role === ApplicationRole.CHEF_SERVICE;
  }

  /**
   * Vérifie si l'utilisateur est Chef d'Équipe
   */
  isChefEquipe(): boolean {
    return this.currentUser?.role === ApplicationRole.CHEF_EQUIPE;
  }
}
