import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Commande } from '../api/commande';
import { User } from '../api/user';

@Injectable({
  providedIn: 'root'
})
export class CommandeService {

  private apiUrl = 'http://127.0.0.1:8000/api/commandes';

  constructor(private http: HttpClient) { }

  getCommandes(): Observable<Commande[]> {
    return this.http.get<Commande[]>(this.apiUrl);
  }

  getCommande(id: number): Observable<Commande> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.get<Commande>(url);
  }

  createCommande(commande: Commande): Observable<Commande> {
    return this.http.post<Commande>(this.apiUrl, commande);
  }

  updateCommande(commande: Commande): Observable<Commande> {
    const url = `${this.apiUrl}/${commande.id}`;
    return this.http.put<Commande>(url, commande);
  }

  deleteCommande(id: number): Observable<void> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.delete<void>(url);
  }

  // Nouvelle méthode pour affecter le statut d'une commande
  updateCommandeStatus(commandeId: number, newStatus: string): Observable<any> {
    const url = `${this.apiUrl}/${commandeId}/update-status`;
    return this.http.put<any>(url, { status: newStatus });
  }
  getCommandesByStatus(status: string): Observable<Commande[]> {
    const url = `${this.apiUrl}/status/${status}`;
    return this.http.get<Commande[]>(url);
}
  getCommandesByStatusAndUser(status: string, userId: number): Observable<Commande[]> {
    const url = `${this.apiUrl}/status/${status}/user/${userId}`;
    return this.http.get<Commande[]>(url);
  }

  affecterCommande(commandeId: number, userId: number): Observable<any> {
    const url = `http://127.0.0.1:8000/api/commandes/${commandeId}/affecter-commande`;
    return this.http.post<any>(url, { commandeId, userId });
  }
 
  
  rejectCommande(commandeId: number, rejectionReason: string, rejectionDate: Date): Observable<any> {
    const url = `${this.apiUrl}/${commandeId}/reject-commande`;
    return this.http.put<any>(url, { rejectionReason, rejectionDate });
}
termineCommande(commandeId: number, dateDebut: Date, dateFin: Date): Observable<any> {
  const url = `${this.apiUrl}/${commandeId}/termine-commande`;
  return this.http.post<any>(url, { dateDebut, dateFin });
}
affecteCommande(commandeId: number, description: string, date_affecte: Date): Observable<any> {
  const url = `${this.apiUrl}/${commandeId}/affect-commande`;
  return this.http.put<any>(url, { description, date_affecte });
}
getCommandesEnAttente(): Observable<Commande[]> {
  return this.http.get<Commande[]>(`${this.apiUrl}/en-attente`);
}
getSummary(): Observable<any> {
  const url = `${this.apiUrl}/summary`;
  return this.http.get<any>(url);
}
getUsers(): Observable<User[]> {
  return this.http.get<User[]>('http://127.0.0.1:8000/api/users')
      
}

}

