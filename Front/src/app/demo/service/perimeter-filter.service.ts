import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { AuthService } from './auth.service';

/**
 * Service de filtrage par périmètre.
 *
 * Centralise la logique qui ajoute automatiquement les paramètres de
 * périmètre (poleId, serviceId) aux appels HTTP selon le rôle de
 * l'utilisateur connecté.
 *
 * Usage :
 *   const params = this.perimetre.applyToParams();
 *   this.http.get('/api/staff', { params });
 *
 *   const params = this.perimetre.applyToParams(new HttpParams().set('statut', 'ACTIF'));
 *   this.http.get('/api/staff', { params });
 */
@Injectable({ providedIn: 'root' })
export class PerimeterFilterService {

  constructor(private authService: AuthService) {}

  /**
   * Retourne les HttpParams enrichis avec le filtre de périmètre adapté au
   * rôle de l'utilisateur courant.
   *
   * - chef-pole  → ajoute poleId
   * - chef-service / chef-equipe → ajoute serviceId
   * - super-admin / admin → aucun filtre (accès total)
   * - autres → aucun filtre supplémentaire
   */
  applyToParams(base?: HttpParams): HttpParams {
    let params = base ?? new HttpParams();
    const user = this.authService.getCurrentUser();
    if (!user) return params;

    const role = user.roleNormalized as string;

    if (role === 'chef-pole' && user.poleId) {
      params = params.set('poleId', user.poleId.toString());
    } else if (
      (role === 'chef-service' || role === 'chef-equipe') &&
      user.serviceId
    ) {
      params = params.set('serviceId', user.serviceId.toString());
    }

    return params;
  }

  /**
   * Retourne un objet littéral { poleId?, serviceId? } prêt à être fusionné
   * avec d'autres paramètres de requête.
   */
  asQueryObject(): Record<string, string> {
    const user = this.authService.getCurrentUser();
    if (!user) return {};

    const role = user.roleNormalized as string;

    if (role === 'chef-pole' && user.poleId) {
      return { poleId: user.poleId.toString() };
    }
    if ((role === 'chef-service' || role === 'chef-equipe') && user.serviceId) {
      return { serviceId: user.serviceId.toString() };
    }
    return {};
  }

  /** Retourne true si l'utilisateur est chef-pole */
  isChefPole(): boolean {
    return this.authService.getCurrentUser()?.roleNormalized === 'chef-pole';
  }

  /** Retourne true si l'utilisateur est chef de service ou d'équipe */
  isChefService(): boolean {
    const role = (this.authService.getCurrentUser()?.roleNormalized ?? '') as string;
    return role === 'chef-service' || role === 'chef-equipe';
  }

  /** Retourne l'ID du pôle de l'utilisateur (chef-pole uniquement) */
  getPoleId(): number | null {
    const user = this.authService.getCurrentUser();
    return user?.roleNormalized === 'chef-pole' ? (user.poleId ?? null) : null;
  }

  /** Retourne l'ID du service de l'utilisateur */
  getServiceId(): number | null {
    return this.authService.getCurrentUser()?.serviceId ?? null;
  }
}
