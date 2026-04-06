import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Compteurs } from '../models/mon-planning.model';

@Injectable({ providedIn: 'root' })
export class CompteurService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api`;

    constructor(private readonly http: HttpClient) {}

    getCompteurs(userId: number): Observable<Compteurs> {
        return this.http.get<any>(`${this.apiUrl}/compteurs/${userId}`).pipe(
            map(response => ({
                solde_rc_plus_heures: this.toNumber(response?.solde_rc_plus_heures ?? response?.soldeRcPlusHeures ?? response?.soldeRcPlus ?? 0),
                solde_rc_moins_heures: this.toNumber(response?.solde_rc_moins_heures ?? response?.soldeRcMoinsHeures ?? response?.soldeRcMoins ?? 0)
            }))
        );
    }

    private toNumber(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }
}