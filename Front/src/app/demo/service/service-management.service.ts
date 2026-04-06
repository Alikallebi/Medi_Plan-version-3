import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Service, StatutActif } from '../api/service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ServiceManagementService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/structure/services`;

  constructor(private http: HttpClient) { }

  getServices(): Observable<Service[]> {
    return this.http.get<any[]>(this.apiUrl).pipe(
      map(services => services.map(service => ({
        id: service.id,
        nom: service.nom,
        code: service.code,
        description: service.description,
        localisation: service.localisation,
        telephone: service.telephone,
        email: service.email,
        couleur: service.couleur,
        statut: (service.statut ?? '').toUpperCase() === 'INACTIF' ? StatutActif.INACTIF : StatutActif.ACTIF
      })))
    );
  }

  getService(id: number): Observable<Service> {
    return this.http.get<Service>(`${this.apiUrl}/${id}`);
  }

  createService(service: Service): Observable<Service> {
    return this.http.post<Service>(this.apiUrl, service);
  }

  updateService(id: number, service: Service): Observable<Service> {
    return this.http.put<Service>(`${this.apiUrl}/${id}`, service);
  }

  deleteService(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
