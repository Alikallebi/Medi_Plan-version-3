import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface ServiceMedicalSimple {
    id: number;
    nom: string;
    code: string;
    couleur?: string;
    poleId?: number;
    statut?: string;
    favorite?: boolean;
    staffCount?: number;
    chef?: string;
    occupation?: number;
}

@Injectable({
    providedIn: 'root'
})
export class ServiceSelectionService {
    private readonly apiUrl = environment.apiBaseUrl;
    private readonly servicesSubject = new BehaviorSubject<ServiceMedicalSimple[]>([]);
    private readonly currentServiceSubject = new BehaviorSubject<ServiceMedicalSimple | null>(null);
    
    public readonly services$ = this.servicesSubject.asObservable();
    public readonly currentService$ = this.currentServiceSubject.asObservable();

    constructor(private readonly http: HttpClient) {
        this.loadServices();
    }

    /**
     * Charge tous les services depuis le backend
     */
    loadServices(): void {
        console.log('🔵 ServiceSelectionService: Chargement des services depuis le backend...');
        
        this.http.get<any[]>(`${this.apiUrl}/api/structure/services`)
            .pipe(
                map(services => {
                    // Charger les favoris depuis localStorage
                    const favorites = this.getFavoritesFromStorage();
                    return services.map(s => ({
                        id: s.id,
                        nom: s.nom,
                        code: s.code,
                        couleur: s.couleur || '#10b981',
                        poleId: s.poleId,
                        statut: s.statut,
                        favorite: favorites.includes(s.id)
                    }));
                }),
                tap(services => {
                    console.log('✅ Services chargés:', services.length);
                }),
                catchError(error => {
                    console.error('❌ Erreur chargement services:', error);
                    return of([]);
                })
            )
            .subscribe(services => {
                this.servicesSubject.next(services);
                
                // Définir le service par défaut si aucun n'est sélectionné
                if (!this.currentServiceSubject.value && services.length > 0) {
                    const defaultServiceId = localStorage.getItem('currentServiceId');
                    if (defaultServiceId) {
                        const service = services.find(s => s.id === Number(defaultServiceId));
                        if (service) {
                            this.currentServiceSubject.next(service);
                        } else {
                            this.currentServiceSubject.next(services[0]);
                        }
                    } else {
                        this.currentServiceSubject.next(services[0]);
                    }
                }
            });
    }

    /**
     * Définit le service courant par ID
     */
    setCurrentService(serviceId: number): void {
        const services = this.servicesSubject.value;
        const service = services.find(s => s.id === serviceId);
        
        if (service) {
            console.log('🔵 Service sélectionné:', service.nom);
            this.currentServiceSubject.next(service);
            localStorage.setItem('currentServiceId', serviceId.toString());
        }
    }

    /**
     * Définit le service courant par objet
     */
    setCurrentServiceObject(service: ServiceMedicalSimple): void {
        console.log('🔵 Service sélectionné:', service.nom);
        this.currentServiceSubject.next(service);
        localStorage.setItem('currentServiceId', service.id.toString());
    }

    /**
     * Récupère le service courant
     */
    getCurrentService(): ServiceMedicalSimple | null {
        return this.currentServiceSubject.value;
    }

    /**
     * Récupère l'ID du service courant (ou null si 'all')
     */
    getCurrentServiceId(): string | null {
        const service = this.currentServiceSubject.value;
        return service ? service.id.toString() : null;
    }

    /**
     * Recherche des services par nom ou code
     */
    searchServices(query: string): Observable<ServiceMedicalSimple[]> {
        const services = this.servicesSubject.value;
        
        if (!query || query.trim() === '') {
            return of(services);
        }

        const lowerQuery = query.toLowerCase();
        const filtered = services.filter(s => 
            s.nom.toLowerCase().includes(lowerQuery) ||
            s.code.toLowerCase().includes(lowerQuery)
        );

        return of(filtered);
    }

    /**
     * Toggle le statut favori d'un service
     */
    toggleFavorite(serviceId: number): void {
        const services = this.servicesSubject.value;
        const updatedServices = services.map(s => {
            if (s.id === serviceId) {
                return { ...s, favorite: !s.favorite };
            }
            return s;
        });
        
        this.servicesSubject.next(updatedServices);
        this.saveFavoritesToStorage(updatedServices.filter(s => s.favorite).map(s => s.id));
    }

    /**
     * Récupère les favoris depuis localStorage
     */
    private getFavoritesFromStorage(): number[] {
        const stored = localStorage.getItem('favoriteServices');
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Sauvegarde les favoris dans localStorage
     */
    private saveFavoritesToStorage(serviceIds: number[]): void {
        localStorage.setItem('favoriteServices', JSON.stringify(serviceIds));
    }

    /**
     * Recharge les services (utile après modification)
     */
    refresh(): void {
        this.loadServices();
    }
}
