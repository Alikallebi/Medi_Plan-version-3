import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { UserContext, RoleNormalized } from '../../features/workflow/models/user-context.model';

/**
 * Définition du périmètre de filtrage basé sur le rôle et le contexte utilisateur
 */
export interface PerimeterFilter {
    /** Type de filtrage à appliquer */
    filterType: 'none' | 'user' | 'equipe' | 'service' | 'pole' | 'all';
    
    /** ID de l'utilisateur (pour Staff) */
    userId?: number;
    
    /** ID de l'équipe (pour Chef d'Équipe) */
    equipeId?: number;
    
    /** ID du service (pour Chef de Service) */
    serviceId?: number;
    
    /** ID du pôle (pour Chef de Pôle) */
    poleId?: number;
    
    /** Permissions calculées */
    canViewAll: boolean;
    canViewPole: boolean;
    canViewService: boolean;
    canViewEquipe: boolean;
    canViewOnlySelf: boolean;
}

/**
 * Service centralisé pour gérer le filtrage des données par rôle et périmètre
 * 
 * Ce service détermine automatiquement le périmètre de visibilité
 * en fonction du rôle et du contexte de l'utilisateur connecté.
 */
@Injectable({ providedIn: 'root' })
export class PerimeterService {

    /**
     * Détermine le périmètre de filtrage pour un utilisateur
     * @param userContext Contexte utilisateur complet
     * @returns PerimeterFilter avec les paramètres de filtrage appropriés
     */
    public getPerimeterFilter(userContext: UserContext | null): PerimeterFilter {
        if (!userContext) {
            return this.createNoAccessFilter();
        }

        const role = userContext.roleNormalized;

        // DEBUG: Affiche le poleId pour le chef de pôle
        if (role === 'chef-pole') {
            console.log('[DEBUG] PerimeterService.getPerimeterFilter - poleId du contexte utilisateur:', userContext.poleId);
        }

        switch (role) {
            case 'super-admin':
            case 'admin-gta':
                // Accès total sans filtrage
                return {
                    filterType: 'all',
                    canViewAll: true,
                    canViewPole: true,
                    canViewService: true,
                    canViewEquipe: true,
                    canViewOnlySelf: false
                };

            case 'chef-pole':
                // Filtre par pôle
                return {
                    filterType: 'pole',
                    poleId: userContext.poleId,
                    canViewAll: false,
                    canViewPole: true,
                    canViewService: true,
                    canViewEquipe: true,
                    canViewOnlySelf: false
                };

            case 'chef-service':
            case 'planificateur-urgence':
            case 'superviseur-internes':
                // Filtre par service
                return {
                    filterType: 'service',
                    serviceId: userContext.serviceId,
                    canViewAll: false,
                    canViewPole: false,
                    canViewService: true,
                    canViewEquipe: true,
                    canViewOnlySelf: false
                };

            case 'validateur-rh':
            case 'planificateur-rh':
                // RH peut voir tout mais pas modifier
                return {
                    filterType: 'all',
                    canViewAll: true,
                    canViewPole: true,
                    canViewService: true,
                    canViewEquipe: true,
                    canViewOnlySelf: false
                };

            case 'staff':
            default:
                // Staff ne voit que son propre planning
                return {
                    filterType: 'user',
                    userId: userContext.id,
                    canViewAll: false,
                    canViewPole: false,
                    canViewService: false,
                    canViewEquipe: false,
                    canViewOnlySelf: true
                };
        }
    }

    /**
     * Construit les paramètres HTTP pour une requête API avec filtrage de périmètre
     * @param filter Filtre de périmètre
     * @param baseParams Paramètres de base optionnels
     * @returns HttpParams avec les paramètres de filtrage appropriés
     */
    public buildHttpParams(filter: PerimeterFilter, baseParams?: HttpParams): HttpParams {
        let params = baseParams || new HttpParams();

        switch (filter.filterType) {
            case 'user':
                if (filter.userId) {
                    params = params.set('userId', filter.userId.toString());
                }
                break;

            case 'equipe':
                if (filter.equipeId) {
                    params = params.set('equipeId', filter.equipeId.toString());
                }
                break;

            case 'service':
                if (filter.serviceId) {
                    params = params.set('serviceId', filter.serviceId.toString());
                }
                break;

            case 'pole':
                if (filter.poleId) {
                    params = params.set('poleId', filter.poleId.toString());
                }
                break;

            case 'all':
                // Pas de filtrage, ne pas ajouter de paramètres
                break;

            case 'none':
            default:
                // Bloquer la requête en retournant un paramètre invalide
                params = params.set('blocked', 'true');
                break;
        }

        return params;
    }

    /**
     * Vérifie si un utilisateur peut accéder à une ressource spécifique
     * @param filter Filtre de périmètre de l'utilisateur
     * @param resourceServiceId Service ID de la ressource
     * @param resourceUserId User ID de la ressource (optionnel)
     * @returns true si l'utilisateur peut accéder à la ressource
     */
    public canAccessResource(
        filter: PerimeterFilter,
        resourceServiceId?: number,
        resourceUserId?: number
    ): boolean {
        if (filter.canViewAll) {
            return true;
        }

        if (filter.filterType === 'user' && filter.userId) {
            // Staff ne peut voir que ses propres données
            return resourceUserId === filter.userId;
        }

        if (filter.filterType === 'service' && filter.serviceId) {
            // Chef de service ne peut voir que son service
            return resourceServiceId === filter.serviceId;
        }

        if (filter.filterType === 'pole' && filter.poleId) {
            // Chef de pôle peut voir tous les services de son pôle
            // Note: nécessite une vérification côté backend que le service appartient au pôle
            return true; // Backend vérifiera avec poleId
        }

        return false;
    }

    /**
     * Filtre une liste d'éléments selon le périmètre
     * @param items Liste d'éléments avec serviceId
     * @param filter Filtre de périmètre
     * @returns Liste filtrée
     */
    public filterList<T extends { serviceId?: number; id?: number }>(
        items: T[],
        filter: PerimeterFilter
    ): T[] {
        if (filter.filterType === 'all') {
            return items;
        }

        if (filter.filterType === 'service' && filter.serviceId) {
            return items.filter(item => item.serviceId === filter.serviceId);
        }

        if (filter.filterType === 'user' && filter.userId) {
            return items.filter(item => item.id === filter.userId);
        }

        // Pour pôle et équipe, le filtrage doit se faire côté backend
        return items;
    }

    /**
     * Génère un message d'erreur personnalisé selon le périmètre
     * @param filter Filtre de périmètre
     * @returns Message d'erreur approprié
     */
    public getAccessDeniedMessage(filter: PerimeterFilter): string {
        switch (filter.filterType) {
            case 'service':
                return 'Vous ne pouvez accéder qu\'aux données de votre service.';
            case 'pole':
                return 'Vous ne pouvez accéder qu\'aux données de votre pôle.';
            case 'equipe':
                return 'Vous ne pouvez accéder qu\'aux données de votre équipe.';
            case 'user':
                return 'Vous ne pouvez accéder qu\'à vos propres données.';
            case 'none':
                return 'Vous n\'avez pas accès à ces données.';
            default:
                return 'Accès refusé.';
        }
    }

    /**
     * Crée un filtre qui bloque tout accès
     */
    private createNoAccessFilter(): PerimeterFilter {
        return {
            filterType: 'none',
            canViewAll: false,
            canViewPole: false,
            canViewService: false,
            canViewEquipe: false,
            canViewOnlySelf: false
        };
    }

    /**
     * Vérifie si un utilisateur a le droit de créer/modifier pour un personnel donné
     * @param filter Filtre de périmètre de l'utilisateur
     * @param targetPersonnelServiceId Service du personnel cible
     * @param targetPersonnelId ID du personnel cible
     * @returns true si l'utilisateur peut modifier ce personnel
     */
    public canModifyPersonnel(
        filter: PerimeterFilter,
        targetPersonnelServiceId?: number,
        targetPersonnelId?: number
    ): boolean {
        if (filter.filterType === 'user') {
            // Staff ne peut pas modifier (vue limitée à soi-même)
            return false;
        }

        return this.canAccessResource(filter, targetPersonnelServiceId, targetPersonnelId);
    }

    /**
     * Retourne un message indiquant le périmètre actuel
     * @param filter Filtre de périmètre
     * @param userContext Contexte utilisateur
     * @returns Message descriptif du périmètre
     */
    public getPerimeterDescription(filter: PerimeterFilter, userContext: UserContext | null): string {
        if (!userContext) {
            return '';
        }

        switch (filter.filterType) {
            case 'all':
                return 'Tous les services';
            case 'pole':
                return `Pôle: ${userContext.poleNom || 'Non défini'}`;
            case 'service':
                return `Service: ${userContext.serviceNom || 'Non défini'}`;
            case 'equipe':
                return `Équipe: ${userContext.equipeNom || 'Non définie'}`;
            case 'user':
                return 'Mes données personnelles';
            default:
                return 'Périmètre non défini';
        }
    }
}
