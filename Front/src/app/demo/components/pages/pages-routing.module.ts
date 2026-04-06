import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PermissionGuard } from '../../../guards/permission.guard';
import { AuthGuard } from '../../../auth.guard';

@NgModule({
  imports: [
    RouterModule.forChild([
      {
        path: 'utilisateurs',
        loadChildren: () => import('./utilisateur/staff.module').then(m => m.StaffModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'admin.utilisateurs', rbacMinLevel: 'read' }
      },
      {
        path: 'utilisateurs/:id',
        loadChildren: () => import('./user-detail/user-detail.module').then(m => m.UserDetailModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'admin.utilisateur-detail', rbacMinLevel: 'read' }
      },
      {
        path: 'user-detail',
        loadChildren: () => import('./user-detail/user-detail.module').then(m => m.UserDetailModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'admin.utilisateur-detail', rbacMinLevel: 'read' }
      },
      {
        path: 'mon-profil',
        loadChildren: () => import('./mon-compte/mon-compte.module').then(m => m.MonCompteModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'mon-espace',
        loadChildren: () => import('./mon-espace/mon-espace.module').then(m => m.MonEspaceModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'mon-planning',
        loadChildren: () => import('./mon-espace/mon-espace.module').then(m => m.MonEspaceModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'parametres-compte',
        loadChildren: () => import('./mon-compte/mon-compte.module').then(m => m.MonCompteModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'demandes-attente',
        loadChildren: () => import('./demandes-attente/demandes-attente.module').then(m => m.DemandesAttenteModule),
        canActivate: [AuthGuard]
      },
      {
        path: 'services',
        loadChildren: () => import('./services/services.module').then(m => m.ServicesModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'referentiel.services', rbacMinLevel: 'read' }
      },
      {
        path: 'poste',
        loadChildren: () => import('./poste/poste.module').then(m => m.PosteModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'referentiel.postes', rbacMinLevel: 'read' }
      },
      { path: 'timeline', loadChildren: () => import('./timeline/timelinedemo.module').then(m => m.TimelineDemoModule) },
      {
        path: 'pole',
        loadChildren: () => import('./pole/pole.module').then(m => m.PoleModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'referentiel.equipes', rbacMinLevel: 'read' }
      },
      { path: 'equipe', redirectTo: 'pole', pathMatch: 'full' },
      {
        path: 'regles',
        loadChildren: () => import('./regles/regles.module').then(m => m.ReglesModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'planification.regles', rbacMinLevel: 'read' }
      },
      {
        path: 'planning',
        loadChildren: () => import('./planning/planning.module').then(m => m.PlanningModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'planning.view', rbacMinLevel: 'read' }
      },
      { path: 'ressource', loadChildren: () => import('./ressource/ressource.module').then(m => m.RessourceModule) },
      {
        path: 'competence',
        loadChildren: () => import('./competence/competence.module').then(m => m.CompetenceModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'referentiel.competences', rbacMinLevel: 'read' }
      },
      {
        path: 'indisponibilite',
        loadChildren: () => import('./indisponibilite/indisponibilite.module').then(m => m.IndisponibiliteModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'indisponibilites.view', rbacMinLevel: 'read' }
      },
      { path: 'etat', loadChildren: () => import('./etat/etat.module').then(m => m.EtatModule) },
      { path: 'categorie', loadChildren: () => import('./categorie/categorie.module').then(m => m.CategorieModule) },
      { path: 'contexte', loadChildren: () => import('./contexte/contexte.module').then(m => m.ContexteModule) },
      { path: 'groupes', loadChildren: () => import('./groupes/groupes.module').then(m => m.GroupesModule) },
      {
        path: 'roles-permissions',
        loadChildren: () => import('./roles-permissions/roles-permissions.module').then(m => m.RolesPermissionsModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'admin.roles', rbacMinLevel: 'read' }
      },
      { path: 'champs-personnalises', loadChildren: () => import('./champs-personnalises/champs-personnalises.module').then(m => m.ChampsPersonnalisesModule) },
      {
        path: 'notifications',
        loadChildren: () => import('./notifications/notifications.module').then(m => m.NotificationsModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'outils.notifications', rbacMinLevel: 'read' }
      },
      {
        path: 'historique',
        loadChildren: () => import('./historique/historique.module').then(m => m.HistoriqueModule),
        canActivate: [AuthGuard, PermissionGuard],
        data: { rbacPermission: 'outils.historique', rbacMinLevel: 'read' }
      }
    ])
  ],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
