import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, map } from 'rxjs';
import { User } from '../api/user';
import { environment } from 'src/environments/environment';
import { PerimeterService, PerimeterFilter } from './perimeter.service';

export interface UserTimeCounters {
	userId: number;
	soldeRcPlus: number;
	soldeRcMoins: number;
	updatedAt: string;
}

export interface PersonalPlanningRequest {
	id: number;
	userId: number;
	serviceId: number;
	date: string;
	type: string;
	heureDebut: string;
	heureFin: string;
	dureeHeures: number;
	commentaire?: string;
	statut: string;
	motifRejet?: string;
	traitePar?: number;
	traiteLe?: string;
	createdAt: string;
	updatedAt: string;
	sourceAssignmentId?: string;
}

export interface CreatePersonalPlanningRequest {
	userId: number;
	serviceId: number;
	date: string;
	type: 'HS' | 'RC+' | 'RC-' | 'ABSENCE' | 'ARRET';
	heureDebut: string;
	heureFin: string;
	commentaire?: string;
	sourceAssignmentId?: string;
}

@Injectable({providedIn:'root'})
export class StaffService {

private readonly apiUrl = `${environment.apiBaseUrl}/api`;

constructor(
    private readonly http: HttpClient,
    private readonly perimeterService: PerimeterService
) {}

logout(): void {
localStorage.removeItem('idUser');
localStorage.removeItem('userEmail');
localStorage.removeItem('role');
localStorage.removeItem('token');
}

getAll(serviceId?: number | null) {
const query = Number.isFinite(serviceId as number) ? `?serviceId=${serviceId}` : '';
return this.http.get<any[]>(`${this.apiUrl}/staff${query}`);
}

/**
 * Get all staff with perimeter filtering applied
 * @param filter Perimeter filter from PerimeterService.getPerimeterFilter()
 * @returns Observable of staff array filtered by user's perimeter
 */
getAllWithPerimeter(filter: PerimeterFilter): Observable<any[]> {
    const params = this.perimeterService.buildHttpParams(filter);
    console.log('🔵 StaffService.getAllWithPerimeter - params:', params.toString());
    return this.http.get<any[]>(`${this.apiUrl}/staff`, { params });
}

create(data:any) {
return this.http.post(`${this.apiUrl}/staff`, data);
}

update(id:number,data:any): Observable<any> {
return this.http.put<any>(`${this.apiUrl}/staff/${id}`, data);
}

updateProfilePhoto(id: number, photo: string | null): Observable<any> {
return this.http.put<any>(`${this.apiUrl}/staff/${id}/photo`, { photo });
}

delete(id:number) {
return this.http.delete(`${this.apiUrl}/staff/${id}`);
}

getEquipes() {
return this.http.get<any[]>(`${this.apiUrl}/structure/equipes`).pipe(
map((equipes) => (equipes ?? []).map((equipe: any) => ({
id: equipe?.id,
nom: equipe?.nom,
serviceId: equipe?.serviceId,
service: equipe?.service
})))
);
}

getServices() {
return this.http.get<any[]>(`${this.apiUrl}/services`);
}

getCompetences() {
return this.http.get<any[]>(`${this.apiUrl}/competences`);
}

getCompetenceDomaines() {
return this.http.get<string[]>(`${this.apiUrl}/competences/domaines`);
}

getUtilisateursDisponiblesPourPoste(posteId: number) {
return this.http.get<any[]>(`${this.apiUrl}/planning/utilisateurs-disponibles?posteId=${posteId}`);
}

getMetiers() {
return this.http.get<any[]>(`${this.apiUrl}/metiers`);
}

getRoleCatalog() {
return this.http.get<any[]>(`${this.apiUrl}/roles-permissions/roles`).pipe(
map((roles) => (roles ?? [])
	.filter((role: any) => role?.isActive !== false)
	.map((role: any) => ({
		value: (role?.name ?? '').toString().trim(),
		label: (role?.name ?? '').toString().trim()
	}))
	.filter((role: any) => role.value.length > 0)
)
);
}

getUsers() {
return this.http.get<any[]>(`${this.apiUrl}/staff`);
}

getUserById(id: number): Observable<any> {
return this.http.get<any>(`${this.apiUrl}/staff/${id}`);
}

getUserPlanning(id: number): Observable<any[]> {
return this.http.get<any[]>(`${this.apiUrl}/staff/${id}/planning`);
}

getUserTimeCounters(userId: number): Observable<UserTimeCounters> {
return this.http.get<UserTimeCounters>(`${this.apiUrl}/mon-planning/compteurs?userId=${userId}`);
}

getPersonalPlanningRequests(userId: number, from?: string, to?: string): Observable<PersonalPlanningRequest[]> {
const params = new URLSearchParams({ userId: String(userId) });
if (from) {
	params.set('from', from);
}
if (to) {
	params.set('to', to);
}
return this.http.get<PersonalPlanningRequest[]>(`${this.apiUrl}/mon-planning/demandes?${params.toString()}`);
}

createPersonalPlanningRequest(payload: CreatePersonalPlanningRequest): Observable<PersonalPlanningRequest> {
return this.http.post<PersonalPlanningRequest>(`${this.apiUrl}/mon-planning/demandes`, payload);
}

getPendingPersonalRequests(serviceId?: number): Observable<PersonalPlanningRequest[]> {
const query = Number.isFinite(serviceId as number) ? `?serviceId=${serviceId}` : '';
return this.http.get<PersonalPlanningRequest[]>(`${this.apiUrl}/mon-planning/demandes/en-attente${query}`);
}

approvePersonalRequest(id: number, validatorId: number, validatorName: string): Observable<PersonalPlanningRequest> {
return this.http.post<PersonalPlanningRequest>(`${this.apiUrl}/mon-planning/demandes/${id}/approuver`, {
	validatorId,
	validatorName
});
}

rejectPersonalRequest(id: number, validatorId: number, validatorName: string, motif: string): Observable<PersonalPlanningRequest> {
return this.http.post<PersonalPlanningRequest>(`${this.apiUrl}/mon-planning/demandes/${id}/rejeter`, {
	validatorId,
	validatorName,
	motif
});
}

getUserHistory(id: number): Observable<any[]> {
return this.http.get<any[]>(`${this.apiUrl}/staff/${id}/history`);
}

getUserAffectations(id: number): Observable<any[]> {
return this.http.get<any[]>(`${this.apiUrl}/staff/${id}/affectations`);
}

getUserRoles(id: number): Observable<any[]> {
return this.http.get<any[]>(`${this.apiUrl}/staff/${id}/roles`);
}

createUserAffectation(id: number, payload: any): Observable<any> {
return this.http.post<any>(`${this.apiUrl}/staff/${id}/affectations`, payload);
}

deleteUserAffectation(id: number, affectationId: number): Observable<void> {
return this.http.delete<void>(`${this.apiUrl}/staff/${id}/affectations/${affectationId}`);
}

loginUser(email: string, password: string): Observable<any> {
return this.http.post<any>(`${this.apiUrl}/auth/login`, { email, password });
}

registerUser(user: any): Observable<any> {
return this.http.post<any>(`${this.apiUrl}/auth/register`, user);
}

resetPassword(data: any): Observable<any> {
return this.http.post<any>(`${this.apiUrl}/auth/reset-password`, data);
}

isLoggedIn(): boolean {
const token = localStorage.getItem('token');
return !!token;
}

}

export { StaffService as UserService };
