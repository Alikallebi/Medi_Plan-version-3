import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { 
    UserContext, 
    createUserContext, 
    normalizeRole 
} from '../../features/workflow/models/user-context.model';

/**
 * Service d'authentification enrichi
 * Gère l'authentification, le contexte utilisateur et les permissions
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api`;
    
    /**
     * BehaviorSubject contenant le contexte utilisateur actuel
     * null si aucun utilisateur connecté
     */
    private userContextSubject = new BehaviorSubject<UserContext | null>(null);
    
    /**
     * Observable public du contexte utilisateur
     * Les composants peuvent s'y abonner pour réagir aux changements
     */
    public userContext$ = this.userContextSubject.asObservable();

    constructor(private http: HttpClient) {
        // Au démarrage, tenter de restaurer le contexte si l'utilisateur est connecté
        this.initializeUserContext();
    }

    /**
     * Initialise le contexte utilisateur au démarrage de l'application
     * Si un utilisateur est déjà connecté (token présent), recharge son contexte.
     * Le contexte minimal (fallback) est restauré IMMÉDIATEMENT de façon synchrone
     * depuis le localStorage, pour que le AuthGuard ne redirige pas vers login
     * lors d'un rafraîchissement de page (F5).
     */
    private initializeUserContext(): void {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('idUser');

        if (token && userId) {
            // 1. Restauration synchrone immédiate depuis localStorage
            //    → le guard verra le contexte avant même le retour de l'API
            this.loadFallbackContext();

            // 2. Puis charger le contexte complet depuis l'API (asynchrone)
            this.loadUserContext(parseInt(userId, 10)).subscribe({
                error: (err) => {
                    console.warn('Impossible de restaurer le contexte utilisateur depuis l\'API:', err);
                    // Le fallback est déjà chargé, rien de plus à faire
                }
            });
        }
    }

    /**
     * Charge le contexte utilisateur complet depuis l'API
     * @param userId ID de l'utilisateur
     * @returns Observable du contexte utilisateur
     */
    public loadUserContext(userId: number): Observable<UserContext> {
        // Essayer d'abord l'endpoint idéal /api/users/{id}/context
        return this.http.get<any>(`${this.apiUrl}/users/${userId}/context`).pipe(
            map(data => {
                const context = createUserContext(data);
                this.userContextSubject.next(context);
                // Store name info in localStorage for immediate access
                if (context.nom) localStorage.setItem('nom', context.nom);
                if (context.prenom) localStorage.setItem('prenom', context.prenom);
                if (context.email) localStorage.setItem('email', context.email);
                if (context.serviceId != null) localStorage.setItem('serviceId', context.serviceId.toString());
                if (context.poleId != null) localStorage.setItem('poleId', context.poleId.toString());
                return context;
            }),
            catchError(() => {
                // Si l'endpoint n'existe pas, utiliser /api/staff/{id} comme fallback
                return this.http.get<any>(`${this.apiUrl}/staff/${userId}`).pipe(
                    map(data => {
                        const context = createUserContext(data);
                        this.userContextSubject.next(context);
                        // Store name info in localStorage for immediate access
                        if (context.nom) localStorage.setItem('nom', context.nom);
                        if (context.prenom) localStorage.setItem('prenom', context.prenom);
                        if (context.email) localStorage.setItem('email', context.email);
                        if (context.serviceId != null) localStorage.setItem('serviceId', context.serviceId.toString());
                        if (context.poleId != null) localStorage.setItem('poleId', context.poleId.toString());
                        return context;
                    }),
                    catchError(err => {
                        console.error('Erreur lors du chargement du contexte utilisateur:', err);
                        // Dernier recours : contexte minimal depuis localStorage
                        this.loadFallbackContext();
                        return throwError(() => err);
                    })
                );
            })
        );
    }

    /**
     * Crée un contexte minimal depuis les données du localStorage
     * Utilisé quand l'API n'est pas disponible
     */
    private loadFallbackContext(): void {
        const userId = localStorage.getItem('idUser');
        const email = localStorage.getItem('userEmail');
        const role = localStorage.getItem('role');
        const poleIdRaw = localStorage.getItem('poleId');
        const serviceIdRaw = localStorage.getItem('serviceId');
        const equipeIdRaw = localStorage.getItem('equipeId');

        if (userId && role) {
            const minimalContext = createUserContext({
                id: parseInt(userId, 10),
                email: email || '',
                role: role,
                nom: '',
                prenom: '',
                actif: 1,
                pole_id: poleIdRaw ? parseInt(poleIdRaw, 10) : undefined,
                service_id: serviceIdRaw ? parseInt(serviceIdRaw, 10) : undefined,
                equipe_id: equipeIdRaw ? parseInt(equipeIdRaw, 10) : undefined
            });
            this.userContextSubject.next(minimalContext);
        }
    }

    /**
     * Authentifie un utilisateur
     * @param email Email de l'utilisateur
     * @param password Mot de passe
     * @returns Observable contenant les données de login et le contexte chargé
     */
    public login(email: string, password: string): Observable<{ user: any; context: UserContext }> {
        return this.http.post<any>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
            tap(user => {
                // Sauvegarder les informations de base dans localStorage
                localStorage.setItem('idUser', user.id.toString());
                localStorage.setItem('userEmail', user.email);
                localStorage.setItem('email', user.email);
                localStorage.setItem('role', user.role ?? 'STAFF');
                
                if (user.token) {
                    localStorage.setItem('token', user.token);
                }
                // Sauvegarder immédiatement les IDs de périmètre pour éviter
                // le race-condition lors du chargement de la page suivante
                if (user.poleId != null) localStorage.setItem('poleId', user.poleId.toString());
                if (user.serviceId != null) localStorage.setItem('serviceId', user.serviceId.toString());
                if (user.equipeId != null) localStorage.setItem('equipeId', user.equipeId.toString());
            }),
            // Charger le contexte complet après le login
            map(user => {
                // Synchrone : on retourne l'utilisateur, mais on lance le chargement du contexte en parallèle
                return { user, context: null as any };
            }),
            tap(({ user }) => {
                // Charger le contexte de manière asynchrone
                this.loadUserContext(user.id).subscribe({
                    error: () => {
                        // En cas d'erreur, créer un contexte minimal
                        this.loadFallbackContext();
                    }
                });
            })
        );
    }

    /**
     * Déconnecte l'utilisateur
     * Nettoie le localStorage et réinitialise le contexte
     */
    public logout(): void {
        localStorage.removeItem('idUser');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('role');
        localStorage.removeItem('token');
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('nom');
        localStorage.removeItem('prenom');
        localStorage.removeItem('email');
        localStorage.removeItem('serviceId');
        localStorage.removeItem('poleId');
        
        this.userContextSubject.next(null);
    }

    /**
     * Retourne le contexte utilisateur actuel de manière synchrone
     * @returns UserContext ou null si non connecté
     */
    public getCurrentUser(): UserContext | null {
        return this.userContextSubject.value;
    }

    /**
     * Retourne un Observable du contexte utilisateur
     * @returns Observable<UserContext | null>
     */
    public getUserContext(): Observable<UserContext | null> {
        return this.userContext$;
    }

    /**
     * Vérifie si l'utilisateur possède une permission spécifique
     * @param permission Nom de la permission à vérifier
     * @returns true si l'utilisateur a la permission
     */
    public hasPermission(permission: keyof UserContext['permissions']): boolean {
        const context = this.getCurrentUser();
        if (!context) {
            return false;
        }
        return context.permissions[permission] === true;
    }

    /**
     * Vérifie si l'utilisateur a l'un des rôles spécifiés
     * @param roles Liste des rôles à vérifier
     * @returns true si l'utilisateur a au moins l'un des rôles
     */
    public isInRole(roles: string[]): boolean {
        const context = this.getCurrentUser();
        if (!context) {
            return false;
        }
        
        // Normaliser les rôles fournis pour la comparaison
        const normalizedRoles = roles.map(r => normalizeRole(r));
        return normalizedRoles.includes(context.roleNormalized);
    }

    /**
     * Vérifie si un utilisateur est connecté
     * @returns true si un token et un userId existent (vérification synchrone, localStorage)
     */
    public isLoggedIn(): boolean {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('idUser');
        // On vérifie uniquement le token + userId (données synchrones du localStorage)
        // Le contexte BehaviorSubject peut ne pas encore être chargé au moment
        // où le guard s'exécute après un rafraîchissement de page (F5).
        return !!(token && userId);
    }

    /**
     * Retourne l'ID de l'utilisateur connecté
     * @returns ID ou null
     */
    public getUserId(): number | null {
        const context = this.getCurrentUser();
        return context ? context.id : null;
    }

    /**
     * Retourne le rôle normalisé de l'utilisateur connecté
     * @returns RoleNormalized ou null
     */
    public getUserRole(): string | null {
        const context = this.getCurrentUser();
        return context ? context.roleNormalized : null;
    }

    /**
     * Retourne le service de l'utilisateur connecté
     * @returns Service ID ou null
     */
    public getUserServiceId(): number | null {
        const context = this.getCurrentUser();
        return context?.serviceId ?? null;
    }

    /**
     * Retourne le pôle de l'utilisateur connecté
     * @returns Pôle ID ou null
     */
    public getUserPoleId(): number | null {
        const context = this.getCurrentUser();
        return context?.poleId ?? null;
    }

    /**
     * Vérifie si l'utilisateur peut agir sur un planning en fonction de son périmètre
     * @param planningServiceId Service du planning
     * @param planningPoleId Pôle du planning
     * @returns true si l'utilisateur a accès
     */
    public canAccessPlanning(planningServiceId?: number, planningPoleId?: number): boolean {
        const context = this.getCurrentUser();
        if (!context) {
            return false;
        }

        // Super-admin a accès à tout
        if (context.roleNormalized === 'super-admin') {
            return true;
        }

        // Chef de pôle : accès à son pôle
        if (context.roleNormalized === 'chef-pole' && context.poleId) {
            return context.poleId === planningPoleId;
        }

        // Chef de service : accès à son service
        if (context.roleNormalized === 'chef-service' && context.serviceId) {
            return context.serviceId === planningServiceId;
        }

        // Pour les autres rôles, vérifier les permissions globales
        return this.hasPermission('canViewAdmin');
    }

    /**
     * Recharge le contexte utilisateur depuis l'API
     * Utile après une mise à jour du profil
     */
    public refreshUserContext(): Observable<UserContext> {
        const userId = this.getUserId();
        if (!userId) {
            return throwError(() => new Error('Aucun utilisateur connecté'));
        }
        return this.loadUserContext(userId);
    }
}
