import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { catchError, filter, take } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

export type PermissionLevel = 'none' | 'read' | 'write' | 'validate' | 'admin';

const LEVEL_ORDER: PermissionLevel[] = ['none', 'read', 'write', 'validate', 'admin'];

/**
 * Service RBAC — permissions dynamiques chargées depuis la base de données.
 *
 * Les permissions sont stockées dans MySQL (rbac_role_permissions) et chargées
 * une fois par session via l'endpoint GET /api/roles-permissions/user/{id}/permissions.
 *
 * Usage dans les templates :
 *   *ngIf="rbac.canView('planning.view')"
 *   *ngIf="rbac.canEdit('admin.utilisateurs')"
 *   *ngIf="rbac.canAdmin('admin.roles')"
 *
 * Usage dans les guards : voir PermissionGuard (data: { rbacPermission, rbacMinLevel })
 */
@Injectable({ providedIn: 'root' })
export class RbacService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/roles-permissions`;

  /** Dictionnaire { permissionCode → niveau } pour l'utilisateur connecté */
  private permissionsSubject = new BehaviorSubject<Record<string, string>>({});
  public permissions$ = this.permissionsSubject.asObservable();

  /** true une fois les permissions chargées depuis l'API */
  private loadedSubject = new BehaviorSubject<boolean>(false);
  public isLoaded$ = this.loadedSubject.asObservable();

  /** Accès synchrone au statut de chargement */
  get isLoaded(): boolean {
    return this.loadedSubject.value;
  }

  constructor(private http: HttpClient, private authService: AuthService) {
    // Charger les permissions dès que le contexte utilisateur est disponible
    this.authService.userContext$.subscribe(ctx => {
      if (ctx?.id) {
        this.loadPermissions(ctx.id);
      } else {
        this.permissionsSubject.next({});
        this.loadedSubject.next(false);
      }
    });
  }

  /**
   * Permissions de fallback par rôle normalisé.
   * Utilisées quand l'API retourne un dictionnaire vide (problème de résolution de rôle en base).
   * Ces valeurs reflètent exactement le seed backend (RolesPermissionsStore.Helpers.cs).
   */
  private static readonly FALLBACK_PERMISSIONS: Record<string, Record<string, string>> = {
    'super-admin': {
      'dashboard.view': 'admin', 'planning.view': 'admin', 'personnel.view': 'admin',
      'workflow.soumissions': 'admin', 'workflow.inbox': 'admin',
      'workflow.admin-dashboard': 'admin', 'workflow.audit': 'admin',
      'referentiel.services': 'admin', 'referentiel.equipes': 'admin',
      'referentiel.competences': 'admin', 'referentiel.postes': 'admin',
      'planification.regles': 'admin', 'admin.utilisateurs': 'admin',
      'admin.utilisateur-detail': 'admin', 'admin.roles': 'admin',
      'outils.notifications': 'admin', 'outils.historique': 'admin', 'outils.rapports': 'admin',
    },
    'admin-gta': {
      'dashboard.view': 'write', 'planning.view': 'write', 'personnel.view': 'write',
      'workflow.soumissions': 'write', 'workflow.inbox': 'validate',
      'workflow.admin-dashboard': 'write', 'workflow.audit': 'write',
      'referentiel.services': 'write', 'referentiel.equipes': 'write',
      'referentiel.competences': 'write', 'referentiel.postes': 'write',
      'planification.regles': 'write', 'admin.utilisateurs': 'write',
      'admin.utilisateur-detail': 'write', 'admin.roles': 'write',
      'outils.notifications': 'read', 'outils.historique': 'write', 'outils.rapports': 'write',
    },
    'chef-pole': {
      'dashboard.view': 'read', 'planning.view': 'validate', 'personnel.view': 'read',
      'workflow.soumissions': 'read', 'workflow.inbox': 'validate',
      'referentiel.services': 'read', 'referentiel.equipes': 'read',
      'referentiel.competences': 'read', 'referentiel.postes': 'read',
      'planification.regles': 'read', 'admin.utilisateurs': 'read',
      'admin.utilisateur-detail': 'read',
      'outils.notifications': 'read', 'outils.historique': 'read', 'outils.rapports': 'read',
    },
    'chef-service': {
      'dashboard.view': 'read', 'planning.view': 'write', 'personnel.view': 'read',
      'workflow.soumissions': 'write', 'workflow.inbox': 'validate',
      'referentiel.services': 'read', 'referentiel.equipes': 'read',
      'referentiel.competences': 'read', 'referentiel.postes': 'read',
      'planification.regles': 'read', 'admin.utilisateurs': 'read',
      'admin.utilisateur-detail': 'read',
      'outils.notifications': 'read', 'outils.historique': 'read', 'outils.rapports': 'read',
    },
    'validateur-rh': {
      'dashboard.view': 'read', 'personnel.view': 'read',
      'workflow.soumissions': 'read', 'workflow.inbox': 'validate',
      'admin.utilisateurs': 'read', 'admin.utilisateur-detail': 'read',
      'outils.notifications': 'read',
    },
    'planificateur-rh': {
      'dashboard.view': 'read', 'planning.view': 'read', 'personnel.view': 'read',
      'workflow.soumissions': 'read', 'workflow.inbox': 'validate',
      'workflow.admin-dashboard': 'read', 'workflow.audit': 'read',
      'referentiel.services': 'read', 'referentiel.equipes': 'read',
      'referentiel.competences': 'read', 'referentiel.postes': 'read',
      'planification.regles': 'read', 'indisponibilites.view': 'read',
      'admin.utilisateurs': 'read', 'admin.utilisateur-detail': 'read',
      'outils.notifications': 'read', 'outils.historique': 'read', 'outils.rapports': 'read',
    },
    'staff': {
      'dashboard.view': 'read', 'planning.view': 'read', 'outils.notifications': 'read',
      'outils.historique': 'read', 'admin.utilisateur-detail': 'read'
    },
  };

  private static readonly STAFF_MINIMUM_PERMISSIONS: Record<string, string> = {
    'dashboard.view': 'read',
    'planning.view': 'read',
    'outils.notifications': 'read',
    'outils.historique': 'read',
    'admin.utilisateur-detail': 'read'
  };

  /** Charge les permissions depuis l'API et met à jour le BehaviorSubject */
  loadPermissions(userId: number): void {
    this.http
      .get<Record<string, string>>(`${this.apiUrl}/user/${userId}/permissions`)
      .pipe(catchError(() => of({} as Record<string, string>)))
      .subscribe(permissions => {
        const roleNormalized = this.authService.getUserRole() ?? 'staff';

        // Si l'API retourne vide (résolution de rôle échouée côté backend),
        // utiliser le fallback basé sur le rôle normalisé de l'utilisateur.
        if (Object.keys(permissions).length === 0) {
          const fallback = RbacService.FALLBACK_PERMISSIONS[roleNormalized];
          if (fallback) {
            console.warn(`[RBAC] API returned empty permissions for userId=${userId} (role=${roleNormalized}). Using fallback.`);
            permissions = fallback;
          } else {
            console.warn(`[RBAC] API returned empty permissions for userId=${userId} (role=${roleNormalized}). No fallback found.`);
          }
        } else {
          console.log(`[RBAC] Loaded ${Object.keys(permissions).length} permissions for userId=${userId}`, permissions);
        }

        if (roleNormalized === 'staff') {
          permissions = {
            ...RbacService.STAFF_MINIMUM_PERMISSIONS,
            ...permissions
          };
        }

        this.permissionsSubject.next(permissions);
        this.loadedSubject.next(true);
      });
  }

  /**
   * Retourne le niveau de permission de l'utilisateur pour un code donné.
   * Un SUPER_ADMIN reçoit toujours 'admin'.
   */
  getLevel(permissionCode: string): PermissionLevel {
    if (this.authService.getUserRole() === 'super-admin') return 'admin';
    const level = this.permissionsSubject.value[permissionCode];
    return (level as PermissionLevel) || 'none';
  }

  /** Retourne true si le niveau de l'utilisateur >= niveau requis */
  hasPermission(permissionCode: string, requiredLevel: PermissionLevel = 'read'): boolean {
    const userLevel = this.getLevel(permissionCode);
    return LEVEL_ORDER.indexOf(userLevel) >= LEVEL_ORDER.indexOf(requiredLevel);
  }

  canView(permissionCode: string): boolean {
    return this.hasPermission(permissionCode, 'read');
  }

  canEdit(permissionCode: string): boolean {
    return this.hasPermission(permissionCode, 'write');
  }

  canValidate(permissionCode: string): boolean {
    return this.hasPermission(permissionCode, 'validate');
  }

  canAdmin(permissionCode: string): boolean {
    return this.hasPermission(permissionCode, 'admin');
  }

  /** Observable qui émet true quand les perms sont prêtes (utile dans les guards) */
  whenLoaded() {
    return this.isLoaded$.pipe(filter(v => v), take(1));
  }
}
