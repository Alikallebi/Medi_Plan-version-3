import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private emailApiUrl = 'http://127.0.0.1:8000/api'; // URL de base pour l'API

  constructor(private http: HttpClient) { }

  sendEmail(emailData: any): Observable<any> {
    return this.http.post<any>(`${this.emailApiUrl}/send-email`, emailData);
  }
  
  sendMailTerminee(commandeId: number, dateDebut: Date, dateFin: Date): Observable<any> {
    const emailData = {
        commande_id: commandeId,
        dateDebut: dateDebut.toISOString(),
        dateFin: dateFin.toISOString()
    };
    return this.http.post<any>(`${this.emailApiUrl}/send-mail-terminee`, emailData);
}


  sendMailRejetee(commandeId: number, rejectionReason: string, rejectionDate: Date): Observable<any> {
    const emailData = {
      commande_id: commandeId,
      rejectionReason: rejectionReason,
      rejectionDate: rejectionDate.toISOString() // Convertir la date en chaîne de caractères ISO pour l'envoyer correctement
    };
    return this.http.post<any>(`${this.emailApiUrl}/send-mail-rejetee`, emailData);
  }
  sendMeilleurOuvrierEmail(): Observable<any> {
    return this.http.post<any>(`${this.emailApiUrl}/send-meilleur-ouvrier-email`, {});
  }
  
}