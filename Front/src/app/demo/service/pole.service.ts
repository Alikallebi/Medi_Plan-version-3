import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface Pole {
  id?: number;
  nom?: string;
  code?: string;
  responsable?: any;
  description?: string;
  // Keep old properties for backwards compatibility
  name?: string;
  responsables?: string[];
}

@Injectable({ providedIn: 'root' })
export class PoleService {
  private apiUrl = `${environment.apiBaseUrl}/api/structure/poles`;

  constructor(private http: HttpClient) {}

  getPoles(): Observable<Pole[]> {
    return this.http.get<Pole[]>(this.apiUrl);
  }

  createPole(pole: Pole): Observable<Pole> {
    return this.http.post<Pole>(this.apiUrl, pole);
  }

  updatePole(id: number, pole: Pole): Observable<Pole> {
    return this.http.put<Pole>(`${this.apiUrl}/${id}`, pole);
  }

  deletePole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getResponsablesByPole(poleName: string): Observable<string[]> {
    // Cette méthode peut rester comme une transformation locale
    return this.http.get<Pole[]>(this.apiUrl).pipe(
      map(poles => {
        const p = poles.find(x => x.name === poleName || x.nom === poleName);
        return p ? p.responsables || [] : [];
      })
    );
  }
}
