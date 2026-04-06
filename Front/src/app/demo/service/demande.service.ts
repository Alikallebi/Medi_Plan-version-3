import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DemandeCreatePayload, DemandeHistoriqueItem, DemandeItem } from '../models/demande.model';

@Injectable({ providedIn: 'root' })
export class DemandeService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api`;

    constructor(private readonly http: HttpClient) {}

    getMesDemandes(actingUserId: number, from?: string, to?: string): Observable<DemandeItem[]> {
        let params = new HttpParams().set('actingUserId', String(actingUserId));

        if (from) {
            params = params.set('from', from);
        }

        if (to) {
            params = params.set('to', to);
        }

        return this.http.get<DemandeItem[]>(`${this.apiUrl}/demandes/mes-demandes`, { params });
    }

    getDemandesAValider(actingUserId: number): Observable<DemandeItem[]> {
        const params = new HttpParams().set('actingUserId', String(actingUserId));
        return this.http.get<DemandeItem[]>(`${this.apiUrl}/demandes/a-valider`, { params });
    }

    getHistoriqueDemande(id: number, actingUserId: number): Observable<DemandeHistoriqueItem[]> {
        const params = new HttpParams().set('actingUserId', String(actingUserId));
        return this.http.get<DemandeHistoriqueItem[]>(`${this.apiUrl}/demandes/${id}/historique`, { params });
    }

    createDemande(actingUserId: number, demande: DemandeCreatePayload): Observable<DemandeItem> {
        return this.http.post<DemandeItem>(`${this.apiUrl}/demandes`, {
            actingUserId,
            demande: {
                ...demande,
                userId: actingUserId
            }
        });
    }

    validerDemande(id: number, actingUserId: number, validatorName: string): Observable<DemandeItem> {
        return this.http.put<DemandeItem>(`${this.apiUrl}/demandes/${id}/valider`, {
            actingUserId,
            action: {
                validatorName
            }
        });
    }

    rejeterDemande(id: number, actingUserId: number, motif: string, validatorName: string): Observable<DemandeItem> {
        return this.http.put<DemandeItem>(`${this.apiUrl}/demandes/${id}/rejeter`, {
            actingUserId,
            action: {
                validatorName,
                motif
            }
        });
    }
}