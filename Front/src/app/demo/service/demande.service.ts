import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { DemandeCreatePayload, DemandeHistoriqueItem, DemandeItem, DemandeTypeDefinition } from '../models/demande.model';

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

    getDemandeTypes(requestableOnly = false): Observable<DemandeTypeDefinition[]> {
        const params = new HttpParams().set('requestableOnly', String(requestableOnly));
        return this.http.get<DemandeTypeDefinition[]>(`${this.apiUrl}/demandes/types`, { params });
    }

    getHistoriqueDemande(id: number, actingUserId: number): Observable<DemandeHistoriqueItem[]> {
        const params = new HttpParams().set('actingUserId', String(actingUserId));
        return this.http.get<DemandeHistoriqueItem[]>(`${this.apiUrl}/demandes/${id}/historique`, { params });
    }

    annulerDemande(id: number, actingUserId: number): Observable<DemandeItem> {
        const payload = { actingUserId };
        return this.http.put<DemandeItem>(`${this.apiUrl}/demandes/${id}/annuler`, payload);
    }

    createDemande(actingUserId: number, demande: DemandeCreatePayload): Observable<DemandeItem> {
        const normalizedDemande = this.normalizeCreatePayload(demande, actingUserId);
        const fullPayload = {
            actingUserId,
            ...normalizedDemande,
            startDate: normalizedDemande.startDate,
            endDate: normalizedDemande.endDate,
            startTime: normalizedDemande.startTime,
            endTime: normalizedDemande.endTime,
            comment: normalizedDemande.commentaire
        };

        return this.http.post<DemandeItem>(`${this.apiUrl}/requests`, fullPayload).pipe(
            catchError(() => this.http.post<DemandeItem>(`${this.apiUrl}/demandes`, {
                actingUserId,
                demande: {
                    ...normalizedDemande
                }
            }))
        );
    }

    private normalizeCreatePayload(demande: DemandeCreatePayload, actingUserId: number): DemandeCreatePayload & {
        userId: number;
        startDate: string;
        endDate: string;
        startTime: string;
        endTime: string;
        heureDebut: string;
        heureFin: string;
        date: string;
        dateFin: string;
    } {
        const normalizedStartDate = `${demande.startDate ?? demande.date ?? ''}`.trim();
        const normalizedEndDate = `${demande.endDate ?? demande.dateFin ?? normalizedStartDate}`.trim();
        const normalizedStartTime = `${demande.startTime ?? demande.heureDebut ?? ''}`.trim();
        const normalizedEndTime = `${demande.endTime ?? demande.heureFin ?? ''}`.trim();

        return {
            ...demande,
            userId: actingUserId,
            date: normalizedStartDate,
            dateFin: normalizedEndDate,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            heureDebut: normalizedStartTime,
            heureFin: normalizedEndTime,
            startTime: normalizedStartTime,
            endTime: normalizedEndTime
        };
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
