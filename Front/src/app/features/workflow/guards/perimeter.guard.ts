import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { AuthService } from 'src/app/demo/service/auth.service';
import { WorkflowService } from '../services/workflow.service';

/**
 * Guard de périmètre pour les plannings.
 * Vérifie que l'utilisateur a le droit d'accéder à un planning spécifique
 * en fonction de son rôle et de son périmètre (service, pôle).
 * 
 * Utilisation dans le routing :
 * {
 *   path: 'validation/:id',
 *   component: ValidationDetailComponent,
 *   canActivate: [AuthGuard, PerimeterGuard]
 * }
 */
@Injectable({ providedIn: 'root' })
export class PerimeterGuard implements CanActivate {
    constructor(
        private readonly authService: AuthService,
        private readonly workflowService: WorkflowService,
        private readonly router: Router
    ) {}

    canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
        const planningId = route.paramMap.get('id');

        if (!planningId || !Number.isFinite(Number(planningId))) {
            console.warn('PerimeterGuard: ID de planning invalide');
            this.router.navigate(['/workflow/validation-inbox']);
            return of(false);
        }

        return this.authService.getUserContext().pipe(
            take(1),
            switchMap((user) => {
                if (!user) {
                    console.warn('PerimeterGuard: Aucun utilisateur connecté');
                    this.router.navigate(['/auth/login']);
                    return of(false);
                }

                // Super Admin peut tout voir
                if (user.roleNormalized === 'super-admin') {
                    return of(true);
                }

                // Admin GTA peut tout voir aussi
                if (user.roleNormalized === 'admin-gta') {
                    return of(true);
                }

                // Pour les autres rôles, vérifier l'accès au planning via l'API
                return this.workflowService.verifierAccesPlanning(Number(planningId), user.id).pipe(
                    map((hasAccess) => {
                        if (!hasAccess) {
                            console.warn(`PerimeterGuard: Utilisateur ${user.id} n'a pas accès au planning ${planningId}`);
                            this.router.navigate(['/access-denied'], {
                                queryParams: {
                                    message: 'Vous n\'avez pas accès à ce planning (hors de votre périmètre).'
                                }
                            });
                        }
                        return hasAccess;
                    }),
                    catchError((error) => {
                        console.error('PerimeterGuard: Erreur lors de la vérification d\'accès', error);
                        // En cas d'erreur, rediriger vers une page d'erreur
                        this.router.navigate(['/error'], {
                            queryParams: {
                                message: 'Impossible de vérifier vos permissions pour ce planning.'
                            }
                        });
                        return of(false);
                    })
                );
            })
        );
    }
}
