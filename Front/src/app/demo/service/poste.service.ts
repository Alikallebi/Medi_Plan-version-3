import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface ReglePoste {
  id?: number;
  nom: string;
  type?: string;
  valeur?: string;
  description?: string;
}

export interface Poste {
  id?: number;
  code: string;
  nom: string;
  description?: string;
  type: string;
  heureDebut: string;
  heureFin: string;
  jourSuivant: boolean;
  duree: number;
  couleur: string;
  icone?: string;
  tolerance?: number;
  actif: boolean;
  reglesAssociees?: ReglePoste[];
  servicesAutorises?: number[];
  conditionsSaisonnieres?: string[];
  competencesRequises?: number[];
  effectifMin?: number;
  effectifMax?: number;
  chevauchementAutorise: boolean;
  fractionnable: boolean;
}

export interface ServiceOption {
  id: number;
  nom: string;
}

@Injectable({ providedIn: 'root' })
export class PosteService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/postes`;
  private readonly structureApiUrl = `${environment.apiBaseUrl}/api/structure/services`;

  constructor(private readonly http: HttpClient) {}

  getPostes(): Observable<Poste[]> {
    return this.http.get<Poste[]>(this.apiUrl);
  }

  getServices(): Observable<ServiceOption[]> {
    return this.http.get<any[]>(this.structureApiUrl).pipe(
      map(services => services.map(service => ({ id: service.id, nom: service.nom } as ServiceOption)))
    );
  }

  createPoste(payload: Omit<Poste, 'id'>): Observable<Poste> {
    return this.http.post<Poste>(this.apiUrl, payload);
  }

  updatePoste(id: number, payload: Omit<Poste, 'id'>): Observable<Poste> {
    return this.http.put<Poste>(`${this.apiUrl}/${id}`, payload);
  }

  deletePoste(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
