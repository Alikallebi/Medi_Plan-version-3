import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ChatbotRequest {
  message: string;
  conversationId?: string;
  userId?: number;
  role?: string;
  serviceId?: number;
  poleId?: number;
  userName?: string;
}

export interface ChatbotResponse {
  reply: string;
  intent: string;
  conversationId: string;
  suggestions: string[];
  actionPending: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/chat`;

  constructor(private readonly http: HttpClient) {}

  sendMessage(request: ChatbotRequest): Observable<ChatbotResponse> {
    const userId = localStorage.getItem('idUser') || '';
    const role = localStorage.getItem('role') || '';
    const serviceId = localStorage.getItem('serviceId') || '';
    const poleId = localStorage.getItem('poleId') || '';
    const nom = localStorage.getItem('nom') || '';
    const prenom = localStorage.getItem('prenom') || '';
    const userName = `${prenom} ${nom}`.trim();

    const headers = new HttpHeaders({
      'X-User-Id': userId,
      'X-User-Name': userName,
      'X-User-Role': role,
      'X-Service-Id': serviceId,
      'X-Pole-Id': poleId
    });

    const requestWithContext: ChatbotRequest = {
      ...request,
      role: request.role ?? (role || undefined),
      serviceId: request.serviceId ?? this.parseOptionalNumber(serviceId),
      poleId: request.poleId ?? this.parseOptionalNumber(poleId),
      userName: request.userName ?? (userName || undefined)
    };

    return this.http.post<ChatbotResponse>(this.apiUrl, requestWithContext, { headers });
  }

  private parseOptionalNumber(value: string): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
