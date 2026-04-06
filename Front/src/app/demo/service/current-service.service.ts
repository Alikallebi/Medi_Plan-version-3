import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, delay, map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { normalizeRole } from '../../features/workflow/models/user-context.model';

export type ServiceStatus = 'active' | 'inactive';

export interface MedicalService {
    id: string;
    name: string;
    staffCount: number;
    icon: string;
    status: ServiceStatus;
    isFavorite: boolean;
}

export interface ServiceDashboardSnapshot {
    serviceLabel: string;
    weekLabel: string;
    occupancyRate: number;
    conflictCount: number;
    pendingValidations: number;
    openPositions: number;
    multiplier: number;
}

@Injectable({
    providedIn: 'root'
})
export class CurrentServiceService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api/structure/services`;

    private readonly allServices: MedicalService[] = [
        { id: 'cardiologie', name: 'Cardiologie', staffCount: 18, icon: 'pi pi-heart-fill', status: 'active', isFavorite: true },
        { id: 'radiologie', name: 'Radiologie', staffCount: 12, icon: 'pi pi-images', status: 'active', isFavorite: false },
        { id: 'urgences', name: 'Urgences', staffCount: 25, icon: 'pi pi-bolt', status: 'active', isFavorite: true },
        { id: 'chirurgie', name: 'Chirurgie', staffCount: 22, icon: 'pi pi-wrench', status: 'active', isFavorite: false },
        { id: 'pediatrie', name: 'Pédiatrie', staffCount: 15, icon: 'pi pi-users', status: 'active', isFavorite: false },
        { id: 'gynecologie', name: 'Gynécologie', staffCount: 10, icon: 'pi pi-user-plus', status: 'active', isFavorite: false },
        { id: 'neurologie', name: 'Neurologie', staffCount: 8, icon: 'pi pi-sun', status: 'active', isFavorite: false },
        { id: 'oncologie', name: 'Oncologie', staffCount: 14, icon: 'pi pi-shield', status: 'active', isFavorite: false },
        { id: 'reanimation', name: 'Réanimation', staffCount: 20, icon: 'pi pi-heart', status: 'active', isFavorite: false },
        { id: 'laboratoire', name: 'Laboratoire', staffCount: 9, icon: 'pi pi-flask', status: 'inactive', isFavorite: false }
    ];

    private readonly superUserOption: MedicalService = {
        id: 'all',
        name: 'Tous les services',
        staffCount: 153,
        icon: 'pi pi-sitemap',
        status: 'active',
        isFavorite: false
    };

    private readonly currentServiceSubject = new BehaviorSubject<MedicalService>(this.allServices[0]);
    private readonly servicesSubject = new BehaviorSubject<MedicalService[]>(this.resolveServicesForRole());
    private readonly loadingSubject = new BehaviorSubject<boolean>(false);
    private readonly servicesFromApiSubject = new BehaviorSubject<boolean>(false);
    private readonly cache = new Map<string, ServiceDashboardSnapshot>();

    readonly currentService$ = this.currentServiceSubject.asObservable();
    readonly services$ = this.servicesSubject.asObservable();
    readonly isLoading$ = this.loadingSubject.asObservable();
    readonly servicesFromApi$ = this.servicesFromApiSubject.asObservable();

    constructor(private readonly http: HttpClient) {
        const initialList = this.servicesSubject.value;
        this.currentServiceSubject.next(initialList[0]);
        this.loadServicesFromApi();
    }

    get currentService(): MedicalService {
        return this.currentServiceSubject.value;
    }

    setCurrentService(serviceId: string): void {
        const target = this.servicesSubject.value.find(service => service.id === serviceId);
        if (!target || target.id === this.currentService.id) {
            return;
        }
        this.loadingSubject.next(true);
        this.currentServiceSubject.next(target);
    }

    markLoadingDone(): void {
        this.loadingSubject.next(false);
    }

    /** Recharge les services depuis l'API en tenant compte du rôle courant.
     *  À appeler après login pour que le filtre par pôle soit correctement appliqué. */
    reloadServices(): void {
        this.loadServicesFromApi();
    }

    toggleFavorite(serviceId: string): void {
        const updated = this.servicesSubject.value.map(service => {
            if (service.id !== serviceId || service.id === 'all') {
                return service;
            }
            return { ...service, isFavorite: !service.isFavorite };
        });
        this.servicesSubject.next(updated);
        const selectedUpdated = updated.find(service => service.id === this.currentService.id);
        if (selectedUpdated) {
            this.currentServiceSubject.next(selectedUpdated);
        }
    }

    searchServices(term: string): Observable<MedicalService[]> {
        const lower = term.trim().toLowerCase();
        return this.services$.pipe(
            map(services => {
                if (!lower) {
                    return services;
                }
                return services.filter(service => service.name.toLowerCase().includes(lower));
            })
        );
    }

    loadDashboardSnapshot(serviceId: string): Observable<ServiceDashboardSnapshot> {
        const cached = this.cache.get(serviceId);
        if (cached) {
            return of(cached).pipe(
                delay(120),
                tap(() => this.loadingSubject.next(false))
            );
        }

        const created = this.buildSnapshot(serviceId);
        return of(created).pipe(
            delay(420),
            tap(snapshot => {
                this.cache.set(serviceId, snapshot);
                this.loadingSubject.next(false);
            })
        );
    }

    private resolveServicesForRole(): MedicalService[] {
        const canSeeAll = this.hasGlobalServiceAccess();
        if (canSeeAll) {
            return [this.superUserOption, ...this.allServices];
        }
        // For chef-service and other restricted roles, return only their assigned service.
        // The real service will be resolved from the API in loadServicesFromApi().
        // We return an empty list here so the page doesn't load with a wrong hardcoded default.
        return [];
    }

    private getUserServiceId(): string | null {
        return localStorage.getItem('serviceId') || localStorage.getItem('service_id') || null;
    }

    private loadServicesFromApi(): void {
        const staffUrl = `${environment.apiBaseUrl}/api/staff`;

        forkJoin({
            services: this.http.get<any[]>(this.apiUrl).pipe(catchError(() => of([]))),
            staff:    this.http.get<any[]>(staffUrl).pipe(catchError(() => of([])))
        }).subscribe(({ services, staff }) => {
            if (!services || services.length === 0) {
                this.servicesFromApiSubject.next(false);
                return;
            }

            // Build a map: serviceId (number) → real staff count
            const countByServiceId = new Map<number, number>();
            for (const member of (staff || [])) {
                const sid = Number(member.serviceId ?? member.ServiceId ?? null);
                if (Number.isFinite(sid) && sid > 0) {
                    countByServiceId.set(sid, (countByServiceId.get(sid) ?? 0) + 1);
                }
            }

            const totalStaff = (staff || []).length;

            const mapped: MedicalService[] = services.map((service, index) => {
                const numericId = Number(service.id);
                const realCount = Number.isFinite(numericId)
                    ? (countByServiceId.get(numericId) ?? 0)
                    : 0;
                return {
                    id: String(service.id ?? service.code ?? `service-${index + 1}`),
                    name: String(service.nom ?? service.name ?? `Service ${index + 1}`),
                    staffCount: realCount,
                    icon: 'pi pi-briefcase',
                    status: (String(service.statut ?? 'ACTIF').toUpperCase() === 'INACTIF' ? 'inactive' : 'active') as ServiceStatus,
                    isFavorite: false
                };
            });

            if (mapped.length === 0) {
                return;
            }

            // Update global "Tous les services" badge with real total
            const superOption: MedicalService = { ...this.superUserOption, staffCount: totalStaff };

            const canSeeAll = this.hasGlobalServiceAccess();
            let resolved: MedicalService[];

            if (canSeeAll) {
                resolved = [superOption, ...mapped];
            } else if (this.isChefPoleByRole()) {
                // Chef de Pôle : afficher uniquement les services appartenant à son pôle
                // (pas seulement son propre service)
                const poleId = this.getUserPoleId();
                if (poleId) {
                    // services et mapped sont en correspondance 1-to-1 (même ordre)
                    const poleServices = mapped.filter(
                        (_, i) => Number(services[i]?.poleId ?? services[i]?.pole_id) === poleId
                    );
                    resolved = poleServices.length > 0 ? poleServices : mapped;
                } else {
                    resolved = mapped;
                }
            } else {
                // For restricted roles (chef-service, etc.), only expose their own service.
                const userServiceId = this.getUserServiceId();
                const userService = userServiceId
                    ? mapped.find(s => s.id === userServiceId)
                    : null;
                resolved = userService ? [userService] : mapped.length > 0 ? [mapped[0]] : [];
            }

            if (resolved.length === 0) {
                return;
            }

            this.servicesSubject.next(resolved);
            this.servicesFromApiSubject.next(true);

            // Keep the current service if it's still in the resolved list,
            // otherwise switch to the user's own service.
            const currentId = this.currentServiceSubject.value?.id;
            const nextCurrent = resolved.find(s => s.id === currentId) ?? resolved[0];
            this.currentServiceSubject.next(nextCurrent);
        });
    }

    private hasGlobalServiceAccess(): boolean {
        const rawRole = (localStorage.getItem('role') || '').trim().toLowerCase();
        const normalizedRole = rawRole.replace(/[_\s]+/g, '-');
        const allowedRoles = new Set(['admin', 'super-admin', 'rh', 'admin-gta', 'validateur-rh', 'planificateur-rh']);
        return allowedRoles.has(normalizedRole);
    }

    private isChefPoleByRole(): boolean {
        const rawRole = localStorage.getItem('role') || '';
        return normalizeRole(rawRole) === 'chef-pole';
    }

    private getUserPoleId(): number | null {
        const raw = localStorage.getItem('poleId');
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    private buildSnapshot(serviceId: string): ServiceDashboardSnapshot {
        const service = this.servicesSubject.value.find(item => item.id === serviceId) ?? this.allServices[0];
        const baseSeed = service.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const multiplier = service.id === 'all' ? 1.4 : 0.85 + (baseSeed % 30) / 100;

        return {
            serviceLabel: service.name,
            weekLabel: this.createWeekLabel(),
            occupancyRate: Math.min(98, Math.round(72 * multiplier)),
            conflictCount: Math.max(1, Math.round(4 / multiplier)),
            pendingValidations: Math.max(1, Math.round(3 * multiplier)),
            openPositions: Math.max(0, Math.round(5 / multiplier)),
            multiplier
        };
    }

    private createWeekLabel(): string {
        const now = new Date();
        const weekNumber = Math.ceil((((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
        return `Semaine ${weekNumber} - ${now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
    }
}