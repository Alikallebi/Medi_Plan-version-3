import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface Competence {
  id: number;
  nom: string;
  domaine: string;
  description?: string;
  code?: string;
  updatedAt?: string;
  updated_at?: string;
  actif?: boolean;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CompetenceService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/competences`;

  constructor(private readonly http: HttpClient) {}

  getAllCompetences(): Observable<Competence[]> {
    return this.http.get<Competence[]>(this.apiUrl).pipe(
      map(competences => this.normalizeCompetences(competences))
    );
  }

  getDomaines(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/domaines`);
  }

  getCompetences(): Observable<Competence[]> {
    return this.getAllCompetences();
  }

  private normalizeCompetences(competences: Competence[] | null | undefined): Competence[] {
    return (competences || []).map(item => ({
      ...item,
      domaine: item.domaine || 'Général',
      actif: item.actif ?? item.isActive ?? true,
      updatedAt: item.updatedAt || item.updated_at
    }));
  }

  createCompetence(payload: Omit<Competence, 'id'>): Observable<Competence> {
    return this.http.post<Competence>(this.apiUrl, payload).pipe(
      map(competence => this.normalizeCompetence(competence))
    );
  }

  updateCompetence(id: number, payload: Omit<Competence, 'id'>): Observable<Competence> {
    return this.http.put<Competence>(`${this.apiUrl}/${id}`, payload).pipe(
      map(competence => this.normalizeCompetence(competence))
    );
  }

  deleteCompetence(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  private normalizeCompetence(competence: Competence): Competence {
    return {
      ...competence,
      domaine: competence.domaine || 'Général',
      actif: competence.actif ?? competence.isActive ?? true
    };
  }
}
