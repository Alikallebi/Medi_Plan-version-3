import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RolesPermissionsApiService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/roles-permissions`;

  constructor(private readonly http: HttpClient) {}

  getRoles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/roles`);
  }

  getPermissionCategories(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/permission-categories`);
  }

  getRoleUsers(roleId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}/users`);
  }

  getRoleHistory(roleId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}/history`);
  }

  createRole(payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/roles`, payload);
  }

  updateRole(roleId: string, payload: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}`, payload);
  }

  duplicateRole(roleId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}/duplicate`, {});
  }

  deleteRole(roleId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}`);
  }

  setPermissionLevel(roleId: string, permissionId: string, level: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}/permissions/${encodeURIComponent(permissionId)}`, { level });
  }

  setAllPermissions(roleId: string, level: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}/permissions`, { level });
  }

  removeUser(roleId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/roles/${encodeURIComponent(roleId)}/users/${encodeURIComponent(userId)}`);
  }

  exportCsv(): Observable<{ fileName: string; content: string; mimeType: string; isBase64: boolean }> {
    return this.http.get<{ fileName: string; content: string; mimeType: string; isBase64: boolean }>(`${this.apiUrl}/export`);
  }

  importCsv(file: File): Observable<{ created: number; updated: number; ignored: number }> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<{ created: number; updated: number; ignored: number }>(`${this.apiUrl}/import`, formData);
  }
}
