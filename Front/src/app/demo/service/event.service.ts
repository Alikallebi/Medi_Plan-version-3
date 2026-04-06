import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Event } from '../api/event';  // Assurez-vous de créer et d'importer le modèle Event

@Injectable({
  providedIn: 'root'
})
export class EventService {

  private apiUrl = 'http://127.0.0.1:8000/api';  // Remplacez par l'URL de votre API

  constructor(private http: HttpClient) { }

  getEvents(): Observable<Event[]> {
    return this.http.get<Event[]>(`${this.apiUrl}/events`);
  }

  addEvent(event: Event): Observable<Event> {
    return this.http.post<Event>(`${this.apiUrl}/add-event`, event);
  }

  updateEvent(event: Event, id: number): Observable<Event> {
    return this.http.put<Event>(`${this.apiUrl}/update-event/${id}`, event);
  }

  deleteEvent(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/delete-event/${id}`);
  }
}
