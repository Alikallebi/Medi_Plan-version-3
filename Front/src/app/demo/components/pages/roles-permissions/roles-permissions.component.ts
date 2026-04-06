import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { RolesPermissionsApiService } from 'src/app/demo/service/roles-permissions-api.service';
import { RbacService } from 'src/app/demo/service/rbac.service';

// Interfaces
export interface Permission {
  id: string;
  name: string;
  description: string;
  level: 'none' | 'read' | 'write' | 'validate' | 'admin';
}

export interface PermissionCategory {
  id: string;
  name: string;
  icon: string;
  expanded: boolean;
  permissions: Permission[];
}

export interface Role {
  id: string;
  name: string;
  type: 'system' | 'custom';
  color: string;
  icon?: string;
  description?: string;
  usersCount: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
  parentRoleId?: string;
  isActive: boolean;
  permissions: Map<string, 'none' | 'read' | 'write' | 'validate' | 'admin'>;
}

export interface RoleUser {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  service: string;
  photo?: string;
  status: 'actif' | 'inactif';
}

export interface RoleHistory {
  id: string;
  type: 'created' | 'modified' | 'users_added' | 'users_removed' | 'duplicated';
  description: string;
  date: Date;
  by: string;
  icon: string;
}

@Component({
  selector: 'app-roles-permissions',
  templateUrl: './roles-permissions.component.html',
  styleUrls: ['./roles-permissions.component.scss']
})
export class RolesPermissionsComponent implements OnInit {
  // Liste des rôles
  roles: Role[] = [];
  filteredRoles: Role[] = [];
  selectedRole: Role | null = null;
  
  // Recherche et filtres
  searchQuery: string = '';
  roleFilter: 'all' | 'system' | 'custom' | 'withUsers' = 'all';
  
  // Onglets
  activeTab: 'permissions' | 'users' | 'hierarchy' | 'history' = 'permissions';
  
  // Permissions
  permissionCategories: PermissionCategory[] = [];
  
  // Utilisateurs du rôle
  roleUsers: RoleUser[] = [];
  roleUsersLoaded: boolean = false;
  
  // Historique
  roleHistory: RoleHistory[] = [];
  
  // Modales
  showCreateRoleModal: boolean = false;
  showEditRoleModal: boolean = false;
  showTestPermissionsModal: boolean = false;
  showAddUsersModal: boolean = false;
  showCompareRolesModal: boolean = false;
  
  // Formulaire de rôle
  roleForm: any = {
    name: '',
    description: '',
    type: 'custom',
    color: '#2563eb',
    icon: 'pi-users',
    parentRoleId: null,
    isActive: true
  };
  
  // Statistiques
  stats = {
    totalRoles: 0,
    totalUsers: 0,
    customRoles: 0
  };
  
  // Niveaux de permission
  permissionLevels = [
    { value: 'none', label: 'Aucun', icon: 'pi-times', color: '#e2e8f0' },
    { value: 'read', label: 'Lecture', icon: 'pi-eye', color: '#64748b' },
    { value: 'write', label: 'Écriture', icon: 'pi-pencil', color: '#2563eb' },
    { value: 'validate', label: 'Validation', icon: 'pi-check', color: '#10b981' },
    { value: 'admin', label: 'Admin', icon: 'pi-cog', color: '#8b5cf6' }
  ];

  constructor(
    private messageService: MessageService,
    private rolesPermissionsApi: RolesPermissionsApiService,
    public rbac: RbacService
  ) {}

  ngOnInit(): void {
    this.loadRoles();
    this.loadPermissionCategories();
  }

  // Chargement des données
  loadRoles(): void {
    this.rolesPermissionsApi.getRoles().subscribe({
      next: (roles) => {
        const selectedRoleId = this.selectedRole?.id;
        this.roles = (roles || []).map(role => ({
          ...role,
          createdAt: new Date(role.createdAt),
          updatedAt: new Date(role.updatedAt),
          permissions: new Map(Object.entries(role.permissions || {}))
        }));
        this.filteredRoles = [...this.roles];
        if (selectedRoleId) {
          this.selectedRole = this.roles.find(r => r.id === selectedRoleId) || null;
        }
        this.updateStats();
      },
      error: () => {
        this.roles = [];
        this.filteredRoles = [];
        this.updateStats();
        this.messageService.add({
          severity: 'error',
          summary: 'Chargement impossible',
          detail: 'Erreur lors du chargement des rôles'
        });
      }
    });
  }

  loadPermissionCategories(): void {
    this.rolesPermissionsApi.getPermissionCategories().subscribe({
      next: (categories) => {
        this.permissionCategories = (categories || []).map(category => ({
          ...category,
          permissions: category.permissions || []
        }));
      },
      error: () => {
        this.permissionCategories = [];
        this.messageService.add({
          severity: 'error',
          summary: 'Chargement impossible',
          detail: 'Erreur lors du chargement des permissions'
        });
      }
    });
  }

  loadRoleUsers(roleId: string): void {
    this.roleUsersLoaded = false;

    this.rolesPermissionsApi.getRoleUsers(roleId).subscribe({
      next: (users) => {
        this.roleUsers = users || [];
        this.roleUsersLoaded = true;
      },
      error: () => {
        this.roleUsers = [];
        this.roleUsersLoaded = true;
      }
    });
  }

  loadRoleHistory(roleId: string): void {
    this.rolesPermissionsApi.getRoleHistory(roleId).subscribe({
      next: (history) => {
        this.roleHistory = (history || []).map(item => ({
          ...item,
          date: new Date(item.date)
        }));
      },
      error: () => {
        this.roleHistory = [];
      }
    });
  }

  updateStats(): void {
    this.stats.totalRoles = this.roles.length;
    this.stats.totalUsers = this.roles.reduce((sum, role) => sum + role.usersCount, 0);
    this.stats.customRoles = this.roles.filter(r => r.type === 'custom').length;
  }

  // Recherche et filtres
  onSearch(): void {
    this.filteredRoles = this.roles.filter(role => {
      const matchesSearch = role.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                           (role.description && role.description.toLowerCase().includes(this.searchQuery.toLowerCase()));
      
      let matchesFilter = true;
      if (this.roleFilter === 'system') {
        matchesFilter = role.type === 'system';
      } else if (this.roleFilter === 'custom') {
        matchesFilter = role.type === 'custom';
      } else if (this.roleFilter === 'withUsers') {
        matchesFilter = role.usersCount > 0;
      }
      
      return matchesSearch && matchesFilter;
    });
  }

  setRoleFilter(filter: 'all' | 'system' | 'custom' | 'withUsers'): void {
    this.roleFilter = filter;
    this.onSearch();
  }

  // Sélection de rôle
  selectRole(role: Role): void {
    this.selectedRole = role;
    this.activeTab = 'permissions';
    this.roleUsers = [];
    this.roleUsersLoaded = false;
    this.roleHistory = [];
    this.loadRoleUsers(role.id);
    this.loadRoleHistory(role.id);
  }

  getSelectedRoleUsersCount(): number {
    if (!this.selectedRole) {
      return 0;
    }

    if (this.roleUsers.length > 0) {
      return this.roleUsers.length;
    }

    return this.selectedRole.usersCount;
  }

  getRoleUsersPreview(limit: number = 5): RoleUser[] {
    return this.roleUsers.slice(0, limit);
  }

  getRemainingRoleUsersCount(limit: number = 5): number {
    const visible = Math.min(limit, this.roleUsers.length);
    return Math.max(0, this.getSelectedRoleUsersCount() - visible);
  }

  getParentRole(role: Role | null): Role | null {
    if (!role?.parentRoleId) {
      return null;
    }

    return this.roles.find(item => item.id === role.parentRoleId) || null;
  }

  getChildRoles(role: Role | null): Role[] {
    if (!role) {
      return [];
    }

    return this.roles.filter(item => item.parentRoleId === role.id);
  }

  getInheritedPermissionsCount(role: Role | null): number {
    const parentRole = this.getParentRole(role);
    if (!role || !parentRole) {
      return 0;
    }

    return Array.from(parentRole.permissions.entries())
      .filter(([permissionId, level]) => level !== 'none' && (role.permissions.get(permissionId) || 'none') === 'none')
      .length;
  }

  hasInheritance(role: Role | null): boolean {
    return !!role && (!!this.getParentRole(role) || this.getChildRoles(role).length > 0);
  }

  getAvailableParentRoles(): Role[] {
    return this.roles.filter(role => role.id !== this.selectedRole?.id);
  }

  deselectRole(): void {
    this.selectedRole = null;
  }

  // Onglets
  setActiveTab(tab: 'permissions' | 'users' | 'hierarchy' | 'history'): void {
    this.activeTab = tab;
  }

  // Permissions
  toggleCategory(category: PermissionCategory): void {
    category.expanded = !category.expanded;
  }

  getPermissionLevel(permissionId: string): 'none' | 'read' | 'write' | 'validate' | 'admin' {
    return this.getEffectivePermissionLevel(this.selectedRole, permissionId);
  }

  private getEffectivePermissionLevel(
    role: Role | null,
    permissionId: string,
    visited: Set<string> = new Set()
  ): 'none' | 'read' | 'write' | 'validate' | 'admin' {
    if (!role || visited.has(role.id)) {
      return 'none';
    }

    visited.add(role.id);

    const directLevel = role.permissions.get(permissionId);
    if (directLevel !== undefined) {
      return directLevel;
    }

    const parentRole = this.getParentRole(role);
    if (!parentRole) {
      return 'none';
    }

    return this.getEffectivePermissionLevel(parentRole, permissionId, visited);
  }

  setPermissionLevel(permissionId: string, level: 'none' | 'read' | 'write' | 'validate' | 'admin'): void {
    if (!this.selectedRole) return;
    
    if (this.selectedRole.type === 'system') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Rôle système',
        detail: 'Les rôles système ne peuvent pas être modifiés'
      });
      return;
    }
    
    this.selectedRole.permissions.set(permissionId, level);
    this.rolesPermissionsApi.setPermissionLevel(this.selectedRole.id, permissionId, level).subscribe({
      next: () => {
        this.loadRoleHistory(this.selectedRole!.id);
        this.loadRoles();
        this.messageService.add({
          severity: 'success',
          summary: 'Permission mise à jour',
          detail: `Permission ${permissionId} définie à ${level}`
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de mettre à jour la permission'
        });
      }
    });
  }

  setAllPermissions(level: 'none' | 'read' | 'write' | 'validate' | 'admin'): void {
    if (!this.selectedRole) return;
    
    this.permissionCategories.forEach(category => {
      category.permissions.forEach(permission => {
        this.selectedRole!.permissions.set(permission.id, level);
      });
    });

    this.rolesPermissionsApi.setAllPermissions(this.selectedRole.id, level).subscribe({
      next: () => {
        this.loadRoleHistory(this.selectedRole!.id);
        this.loadRoles();
        this.messageService.add({
          severity: 'success',
          summary: 'Permissions mises à jour',
          detail: `Toutes les permissions définies à ${level}`
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de mettre à jour les permissions'
        });
      }
    });
  }

  // Actions sur les rôles
  createRole(): void {
    this.roleForm = {
      name: '',
      description: '',
      type: 'custom',
      color: '#2563eb',
      icon: 'pi-users',
      parentRoleId: null,
      isActive: true
    };
    this.showCreateRoleModal = true;
  }

  editRole(): void {
    if (!this.selectedRole) return;
    
    if (this.selectedRole.type === 'system') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Rôle système',
        detail: 'Les rôles système ne peuvent pas être modifiés. Vous pouvez les dupliquer.'
      });
      return;
    }
    
    this.roleForm = {
      name: this.selectedRole.name,
      description: this.selectedRole.description,
      type: this.selectedRole.type,
      color: this.selectedRole.color,
      icon: this.selectedRole.icon,
      parentRoleId: this.selectedRole.parentRoleId,
      isActive: this.selectedRole.isActive
    };
    this.showEditRoleModal = true;
  }

  duplicateRole(): void {
    if (!this.selectedRole) return;

    this.rolesPermissionsApi.duplicateRole(this.selectedRole.id).subscribe({
      next: (newRoleRaw) => {
        const newRole: Role = {
          ...newRoleRaw,
          createdAt: new Date(newRoleRaw.createdAt),
          updatedAt: new Date(newRoleRaw.updatedAt),
          permissions: new Map(Object.entries(newRoleRaw.permissions || {}))
        };

        this.roles.push(newRole);
        this.filteredRoles = [...this.roles];
        this.updateStats();

        this.messageService.add({
          severity: 'success',
          summary: 'Rôle dupliqué',
          detail: `Le rôle "${this.selectedRole!.name}" a été dupliqué`
        });

        this.selectRole(newRole);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de dupliquer le rôle'
        });
      }
    });
  }

  deleteRole(): void {
    if (!this.selectedRole) return;
    
    if (this.selectedRole.type === 'system') {
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail: 'Les rôles système ne peuvent pas être supprimés'
      });
      return;
    }
    
    if (this.getSelectedRoleUsersCount() > 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Rôle utilisé',
        detail: `Ce rôle est attribué à ${this.getSelectedRoleUsersCount()} utilisateurs`
      });
      return;
    }
    
    const roleId = this.selectedRole.id;
    this.rolesPermissionsApi.deleteRole(roleId).subscribe({
      next: () => {
        this.roles = this.roles.filter(r => r.id !== roleId);
        this.filteredRoles = [...this.roles];
        this.selectedRole = null;
        this.updateStats();

        this.messageService.add({
          severity: 'success',
          summary: 'Rôle supprimé',
          detail: 'Le rôle a été supprimé avec succès'
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de supprimer le rôle'
        });
      }
    });
  }

  saveRole(): void {
    if (this.showCreateRoleModal) {
      const parentRoleId = this.roleForm.parentRoleId || null;
      this.rolesPermissionsApi.createRole({
        name: this.roleForm.name,
        description: this.roleForm.description,
        type: this.roleForm.type,
        color: this.roleForm.color,
        icon: this.roleForm.icon,
        parentRoleId,
        isActive: this.roleForm.isActive
      }).subscribe({
        next: (newRoleRaw) => {
          const newRole: Role = {
            ...newRoleRaw,
            createdAt: new Date(newRoleRaw.createdAt),
            updatedAt: new Date(newRoleRaw.updatedAt),
            permissions: new Map(Object.entries(newRoleRaw.permissions || {}))
          };

          this.roles.push(newRole);
          this.filteredRoles = [...this.roles];
          this.updateStats();
          this.selectRole(newRole);

          this.messageService.add({
            severity: 'success',
            summary: 'Rôle créé',
            detail: `Le rôle "${newRole.name}" a été créé`
          });

          this.closeModals();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de créer le rôle'
          });
        }
      });
    } else if (this.showEditRoleModal && this.selectedRole) {
      const parentRoleId = this.roleForm.parentRoleId || null;
      this.rolesPermissionsApi.updateRole(this.selectedRole.id, {
        name: this.roleForm.name,
        description: this.roleForm.description,
        color: this.roleForm.color,
        icon: this.roleForm.icon,
        parentRoleId,
        isActive: this.roleForm.isActive
      }).subscribe({
        next: (updatedRoleRaw) => {
          this.selectedRole!.name = updatedRoleRaw.name;
          this.selectedRole!.description = updatedRoleRaw.description;
          this.selectedRole!.color = updatedRoleRaw.color;
          this.selectedRole!.icon = updatedRoleRaw.icon;
          this.selectedRole!.parentRoleId = updatedRoleRaw.parentRoleId;
          this.selectedRole!.isActive = updatedRoleRaw.isActive;
          this.selectedRole!.updatedAt = new Date(updatedRoleRaw.updatedAt);

          this.messageService.add({
            severity: 'success',
            summary: 'Rôle modifié',
            detail: `Le rôle "${this.selectedRole!.name}" a été modifié`
          });

          this.loadRoleHistory(this.selectedRole!.id);
          this.loadRoles();
          this.closeModals();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de modifier le rôle'
          });
        }
      });
    }
  }

  closeModals(): void {
    this.showCreateRoleModal = false;
    this.showEditRoleModal = false;
    this.showTestPermissionsModal = false;
    this.showAddUsersModal = false;
    this.showCompareRolesModal = false;
  }

  testPermissions(): void {
    this.showTestPermissionsModal = true;
  }

  addUsers(): void {
    this.showAddUsersModal = true;
  }

  removeUserFromRole(userId: string): void {
    if (!this.selectedRole) return;

    this.rolesPermissionsApi.removeUser(this.selectedRole.id, userId).subscribe({
      next: () => {
        this.roleUsers = this.roleUsers.filter(u => u.id !== userId);
        this.syncSelectedRoleUsersCount();

        this.loadRoleHistory(this.selectedRole!.id);

        this.messageService.add({
          severity: 'success',
          summary: 'Utilisateur retiré',
          detail: 'L\'utilisateur a été retiré du rôle'
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de retirer l\'utilisateur du rôle'
        });
      }
    });
  }

  // Utilitaires
  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR');
  }

  formatDateTime(date: Date): string {
    return new Date(date).toLocaleString('fr-FR');
  }

  getRoleIcon(role: Role): string {
    return role.icon || 'pi-users';
  }

  private syncSelectedRoleUsersCount(): void {
    if (!this.selectedRole) {
      return;
    }

    const nextCount = this.roleUsers.length;
    this.selectedRole.usersCount = nextCount;

    const matchingRole = this.roles.find(role => role.id === this.selectedRole?.id);
    if (matchingRole) {
      matchingRole.usersCount = nextCount;
    }

    const matchingFilteredRole = this.filteredRoles.find(role => role.id === this.selectedRole?.id);
    if (matchingFilteredRole) {
      matchingFilteredRole.usersCount = nextCount;
    }

    this.updateStats();
  }

  exportRoles(): void {
    this.rolesPermissionsApi.exportCsv().subscribe({
      next: (result) => {
        const blob = new Blob([result.content], { type: result.mimeType || 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.fileName || 'roles-permissions.csv';
        link.click();
        URL.revokeObjectURL(url);

        this.messageService.add({
          severity: 'info',
          summary: 'Export',
          detail: 'Export de la matrice des rôles terminé'
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Export',
          detail: 'Erreur lors de l\'export des rôles'
        });
      }
    });
  }

  importRoles(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';

    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (!file) {
        return;
      }

      this.rolesPermissionsApi.importCsv(file).subscribe({
        next: (result) => {
          this.loadRoles();

          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `Créés: ${result.created}, mis à jour: ${result.updated}, ignorés: ${result.ignored}`
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Import',
            detail: 'Erreur lors de l\'import du CSV'
          });
        }
      });
    };

    fileInput.click();
  }

  showHelp(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Aide',
      detail: 'Guide des bonnes pratiques disponible'
    });
  }
}
