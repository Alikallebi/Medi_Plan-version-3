import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  Pole,
  Service,
  Equipe,
  Utilisateur,
  NoeudArborescence,
  Statistiques
} from '../../../service/models';

@Injectable({
  providedIn: 'root'
})
export class StructureService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/structure`;

  constructor(private http: HttpClient) {}

  getPoles(): Observable<Pole[]> {
    return this.http.get<Pole[]>(`${this.apiUrl}/poles`);
  }

  getServices(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.apiUrl}/services`);
  }

  getEquipes(): Observable<Equipe[]> {
    return this.http.get<Equipe[]>(`${this.apiUrl}/equipes`);
  }

  getUtilisateurs(): Observable<Utilisateur[]> {
    return this.http.get<Utilisateur[]>(`${this.apiUrl}/utilisateurs`);
  }

  getStatistiques(): Observable<Statistiques> {
    return this.http.get<Statistiques>(`${this.apiUrl}/statistiques`);
  }

  buildUnifiedTree(): Observable<NoeudArborescence> {
    return this.http.get<NoeudArborescence>(`${this.apiUrl}/tree`);
  }

  createPole(payload: Pole): Observable<Pole> {
    return this.http.post<Pole>(`${this.apiUrl}/poles`, payload);
  }

  createService(payload: Service): Observable<Service> {
    return this.http.post<Service>(`${this.apiUrl}/services`, payload);
  }

  createEquipe(payload: Equipe): Observable<Equipe> {
    return this.http.post<Equipe>(`${this.apiUrl}/equipes`, payload);
  }

  deletePole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/poles/${id}`);
  }

  deleteService(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/services/${id}`);
  }

  deleteEquipe(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/equipes/${id}`);
  }

  exporterStructure(format: 'json' | 'csv' | 'xlsx'): Observable<any> {
    return forkJoin({
      poles: this.getPoles(),
      services: this.getServices(),
      equipes: this.getEquipes(),
      statistiques: this.getStatistiques(),
      tree: this.buildUnifiedTree()
    }).pipe(
      map(data => ({
        format,
        exportedAt: new Date().toISOString(),
        ...data
      }))
    );
  }
}
