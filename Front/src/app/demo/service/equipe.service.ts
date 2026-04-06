import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface Equipe {
  id?: number;
  nom?: string;
  code?: string;
  service?: any; // Référence à Service
  typeEquipe?: TypeEquipe;
  specialite?: string;
  description?: string;
  chefEquipe?: any; // Référence à User
  chefEquipeAdjoint?: any; // Référence à User
  referent?: any; // Référence à User
  capaciteMaximale?: number;
  compositionSouhaitee?: CompositionEquipe;
  membres?: any[]; // Array de User
  typeHoraires?: TypeHoraires;
  horairesPersonnalises?: HoraireJour[];
  pauseDejeuner?: PauseDejeuner;
  postesAssures?: string[];
  competencesSpecifiques?: string[];
  statut?: StatutActif;
  couleur?: string;
  dateCreation?: Date;
  equipeVolante?: boolean;
  
  // Propriétés de suivi
  creePar?: string;
  modifieLe?: Date;
  modifiePar?: string;
}

export enum TypeEquipe {
    JOUR = 'Équipe de jour',
    NUIT = 'Équipe de nuit',
    MIXTE = 'Équipe mixte',
    GARDE = 'Équipe de garde',
    ROTATION = 'Équipe de rotation',
    SPECIFIQUE = 'Équipe spécifique'
}

export interface CompositionEquipe {
    medecins?: number;
    infirmiers?: number;
    autres?: number;
}

export enum TypeHoraires {
    STANDARDS = 'Horaires standards du service',
    PERSONNALISES = 'Horaires personnalisés'
}

export interface HoraireJour {
    jour?: string;
    debut?: string;
    fin?: string;
    pause?: boolean;
}

export interface PauseDejeuner {
    debut?: string;
    fin?: string;
}

export enum StatutActif {
    ACTIF = 'Actif',
    INACTIF = 'Inactif'
}

@Injectable({
  providedIn: 'root'
})
export class EquipeService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;

  constructor(private readonly http: HttpClient) { }

  getEquipes(): Observable<Equipe[]> {
    return combineLatest([
      this.http.get<any[]>(`${this.apiUrl}/structure/equipes`),
      this.http.get<any[]>(`${this.apiUrl}/structure/services`),
      this.http.get<any[]>(`${this.apiUrl}/staff`)
    ]).pipe(
      map(([equipes, services, staff]) => {
        const servicesById = new Map<number, any>(services.map(s => [s.id, s]));
        const staffById = new Map<number, any>(staff.map(u => [u.id, u]));

        return equipes.map(equipe => this.fromBackend(equipe, servicesById.get(equipe.serviceId), staffById.get(equipe.chefEquipeId)));
      })
    );
  }

  createEquipe(equipe: Equipe): Observable<Equipe> {
    const payload = this.toBackend(equipe);
    return this.http.post<any>(`${this.apiUrl}/structure/equipes`, payload).pipe(
      map(created => this.fromBackend(created, equipe.service, equipe.chefEquipe))
    );
  }

  updateEquipe(id: number, equipe: Equipe): Observable<Equipe> {
    const payload = this.toBackend(equipe);
    return this.http.put<any>(`${this.apiUrl}/structure/equipes/${id}`, payload).pipe(
      map(updated => this.fromBackend(updated, equipe.service, equipe.chefEquipe))
    );
  }

  deleteEquipe(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/structure/equipes/${id}`);
  }

  private toBackend(equipe: Equipe): any {
    const medecins = Number(equipe.compositionSouhaitee?.medecins ?? 0);
    const infirmiers = Number(equipe.compositionSouhaitee?.infirmiers ?? 0);
    const autres = Number(equipe.compositionSouhaitee?.autres ?? 0);

    return {
      nom: equipe.nom,
      code: equipe.code,
      serviceId: equipe.service?.id,
      description: equipe.description ?? null,
      type: this.toBackendType(equipe.typeEquipe),
      couleur: equipe.couleur ?? '#f59e0b',
      statut: this.toBackendStatut(equipe.statut),
      chefEquipeId: equipe.chefEquipe?.id ?? null,
      effectif: {
        total: medecins + infirmiers + autres,
        medecins,
        infirmiers,
        autres
      }
    };
  }

  private fromBackend(equipe: any, service?: any, chefEquipe?: any): Equipe {
    return {
      id: equipe.id,
      nom: equipe.nom,
      code: equipe.code,
      service: service ? { id: service.id, nom: service.nom } : { id: equipe.serviceId },
      typeEquipe: this.fromBackendType(equipe.type),
      description: equipe.description,
      chefEquipe: chefEquipe ? { id: chefEquipe.id, nom: `${chefEquipe.prenom ?? ''} ${chefEquipe.nom ?? ''}`.trim() } : undefined,
      compositionSouhaitee: {
        medecins: equipe.effectif?.medecins ?? 0,
        infirmiers: equipe.effectif?.infirmiers ?? 0,
        autres: equipe.effectif?.autres ?? 0
      },
      statut: this.fromBackendStatut(equipe.statut),
      couleur: equipe.couleur,
      dateCreation: equipe.dateCreation ? new Date(equipe.dateCreation) : undefined,
      modifieLe: equipe.dateModification ? new Date(equipe.dateModification) : undefined
    };
  }

  private toBackendType(type?: TypeEquipe): string {
    switch (type) {
      case TypeEquipe.NUIT:
        return 'NUIT';
      case TypeEquipe.MIXTE:
        return 'MIXTE';
      case TypeEquipe.ROTATION:
        return 'ROTATION';
      case TypeEquipe.GARDE:
      case TypeEquipe.SPECIFIQUE:
      case TypeEquipe.JOUR:
      default:
        return 'JOUR';
    }
  }

  private fromBackendType(type?: string): TypeEquipe {
    switch ((type ?? '').toUpperCase()) {
      case 'NUIT':
        return TypeEquipe.NUIT;
      case 'MIXTE':
        return TypeEquipe.MIXTE;
      case 'ROTATION':
        return TypeEquipe.ROTATION;
      case 'JOUR':
      default:
        return TypeEquipe.JOUR;
    }
  }

  private toBackendStatut(statut?: StatutActif): string {
    return statut === StatutActif.INACTIF ? 'INACTIF' : 'ACTIF';
  }

  private fromBackendStatut(statut?: string): StatutActif {
    return (statut ?? '').toUpperCase() === 'INACTIF' ? StatutActif.INACTIF : StatutActif.ACTIF;
  }
}
