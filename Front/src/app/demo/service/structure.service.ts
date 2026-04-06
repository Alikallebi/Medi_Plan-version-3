import { Injectable } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  Pole, Service, Equipe, Utilisateur, Etablissement, Anomalie, HistoriqueModification,
  EntityStatus, UserRole, EquipeType, EntityType, Effectif, NoeudArborescence, Statistiques
} from './models';

@Injectable({
  providedIn: 'root'
})
export class StructureService {
  private poles: Pole[] = [];
  private services: Service[] = [];
  private equipes: Equipe[] = [];
  private utilisateurs: Utilisateur[] = [];
  private anomalies: Anomalie[] = [];
  private historique: HistoriqueModification[] = [];

  private polesSubject = new BehaviorSubject<Pole[]>([]);
  private servicesSubject = new BehaviorSubject<Service[]>([]);
  private equipesSubject = new BehaviorSubject<Equipe[]>([]);

  constructor() {
    this.initMockData();
  }

  private initMockData(): void {
    // Utilisateurs mock
    this.utilisateurs = [
      { id: 1, nom: 'Martin', prenom: 'Jean', email: 'jean.martin@hopital.fr', telephone: '01 23 45 67 89', photo: 'avatar1.jpg', role: UserRole.CHEF, specialite: 'Cardiologie', statut: EntityStatus.ACTIF },
      { id: 2, nom: 'Dupont', prenom: 'Pierre', email: 'pierre.dupont@hopital.fr', telephone: '01 23 45 67 90', photo: 'avatar2.jpg', role: UserRole.CHEF, specialite: 'Pneumologie', statut: EntityStatus.ACTIF },
      { id: 3, nom: 'Leroy', prenom: 'Marie', email: 'marie.leroy@hopital.fr', telephone: '01 23 45 67 91', role: UserRole.PRATICIEN, specialite: 'Neurologie', statut: EntityStatus.ACTIF },
      { id: 4, nom: 'Petit', prenom: 'Sophie', email: 'sophie.petit@hopital.fr', role: UserRole.INFIRMIER, statut: EntityStatus.ACTIF },
      { id: 5, nom: 'Blanc', prenom: 'Thomas', email: 'thomas.blanc@hopital.fr', role: UserRole.PRATICIEN, specialite: 'Cardiologie', statut: EntityStatus.ACTIF },
      { id: 6, nom: 'Noir', prenom: 'Anne', email: 'anne.noir@hopital.fr', role: UserRole.INFIRMIER, statut: EntityStatus.INACTIF },
      { id: 7, nom: 'Dubois', prenom: 'Bruno', email: 'bruno.dubois@hopital.fr', role: UserRole.CHEF, specialite: 'Chirurgie', statut: EntityStatus.ACTIF },
      { id: 8, nom: 'Bernard', prenom: 'Claire', email: 'claire.bernard@hopital.fr', role: UserRole.CADRE, statut: EntityStatus.ACTIF }
    ];

    // Équipes
    this.equipes = [
      {
        id: 1, nom: 'Équipe A', code: 'EQ-A', serviceId: 1, description: 'Équipe de cardiologie clinique',
        type: EquipeType.JOUR, couleur: '#f59e0b', statut: EntityStatus.ACTIF, chefEquipeId: 1,
        effectif: { total: 8, medecins: 3, infirmiers: 4, autres: 1 },
        dateCreation: new Date('2020-01-01'), dateModification: new Date('2024-02-01'), membres: []
      },
      {
        id: 2, nom: 'Équipe B', code: 'EQ-B', serviceId: 1, description: 'Équipe de rythmologie',
        type: EquipeType.MIXTE, couleur: '#f59e0b', statut: EntityStatus.ACTIF, chefEquipeId: 5,
        effectif: { total: 7, medecins: 3, infirmiers: 3, autres: 1 },
        dateCreation: new Date('2020-01-01'), dateModification: new Date('2024-02-01'), membres: []
      },
      {
        id: 3, nom: 'Équipe unique', code: 'EQ-PNEUMO', serviceId: 2, description: 'Équipe pneumologie',
        type: EquipeType.MIXTE, couleur: '#f59e0b', statut: EntityStatus.ACTIF, chefEquipeId: 2,
        effectif: { total: 8, medecins: 3, infirmiers: 4, autres: 1 },
        dateCreation: new Date('2020-06-01'), dateModification: new Date('2024-02-01'), membres: []
      }
    ];

    // Services
    this.services = [
      {
        id: 1, nom: 'Cardiologie', code: 'CARDIO', poleId: 1, description: 'Service cardiologie et interventions',
        localisation: 'Bâtiment B, 2ème étage', telephone: '01 23 45 67 90', email: 'cardiologie@hopital.fr',
        couleur: '#10b981', statut: EntityStatus.ACTIF, chefServiceId: 1, cadreId: 4,
        effectif: { total: 15, medecins: 6, infirmiers: 8, autres: 1 },
        dateCreation: new Date('2020-01-01'), dateModification: new Date('2024-02-01'),
        equipes: [this.equipes[0], this.equipes[1]], specialites: ['Cardiologie interventionnelle', 'Rythmologie'],
        est24h: false, estUrgence: false, effectifMinimum: 6, lits: 25, tauxOccupation: 85, gardesParMois: 45
      },
      {
        id: 2, nom: 'Pneumologie', code: 'PNEUMO', poleId: 1, description: 'Service de pneumologie',
        localisation: 'Bâtiment A, 3ème étage', telephone: '01 23 45 67 91', email: 'pneumologie@hopital.fr',
        couleur: '#10b981', statut: EntityStatus.ACTIF, chefServiceId: 2, cadreId: 8,
        effectif: { total: 8, medecins: 3, infirmiers: 4, autres: 1 },
        dateCreation: new Date('2020-06-01'), dateModification: new Date('2024-02-01'),
        equipes: [this.equipes[2]], specialites: ['Pneumologie générale'],
        est24h: false, estUrgence: false, effectifMinimum: 4, lits: 15, tauxOccupation: 72, gardesParMois: 30
      },
      {
        id: 3, nom: 'Neurologie', code: 'NEURO', poleId: 1, description: 'Service neurologie',
        localisation: 'Bâtiment A, 4ème étage', telephone: '01 23 45 67 92', email: 'neurologie@hopital.fr',
        couleur: '#10b981', statut: EntityStatus.ACTIF, chefServiceId: 3,
        effectif: { total: 12, medecins: 4, infirmiers: 7, autres: 1 },
        dateCreation: new Date('2020-09-01'), dateModification: new Date('2024-02-01'),
        equipes: [], specialites: ['Neurologie générale'],
        est24h: false, estUrgence: false, effectifMinimum: 5, lits: 20, tauxOccupation: 78, gardesParMois: 35
      }
    ];

    // Pôles
    this.poles = [
      {
        id: 1, nom: 'Pôle Médecine', code: 'POLE-MED', description: 'Regroupement des services de médecine',
        adresse: 'Bâtiment A, 3ème étage', telephone: '01 23 45 67 89', email: 'pole.medecine@hopital.fr',
        couleur: '#8b5cf6', statut: EntityStatus.ACTIF, chefPoleId: 1, assistantId: 4,
        effectif: { total: 35, medecins: 13, infirmiers: 19, autres: 3 },
        dateCreation: new Date('2020-01-01'), dateModification: new Date('2024-02-01'),
        services: this.services.filter(s => s.poleId === 1)
      },
      {
        id: 2, nom: 'Pôle Chirurgie', code: 'POLE-CHIR', description: 'Regroupement des services de chirurgie',
        adresse: 'Bâtiment C, 1er étage', telephone: '01 23 45 67 93', email: 'pole.chirurgie@hopital.fr',
        couleur: '#8b5cf6', statut: EntityStatus.ACTIF, chefPoleId: 7,
        effectif: { total: 28, medecins: 10, infirmiers: 16, autres: 2 },
        dateCreation: new Date('2020-03-01'), dateModification: new Date('2024-02-01'),
        services: []
      }
    ];

    this.polesSubject.next(this.poles);
    this.servicesSubject.next(this.services);
    this.equipesSubject.next(this.equipes);
  }

  // POLES
  getPoles(): Observable<Pole[]> {
    return of([...this.poles]).pipe(delay(200), map(poles => poles.sort((a, b) => a.nom.localeCompare(b.nom))));
  }

  getPolesSubject(): BehaviorSubject<Pole[]> {
    return this.polesSubject;
  }

  getPoleById(id: number): Observable<Pole | undefined> {
    return of(this.poles.find(p => p.id === id)).pipe(delay(150));
  }

  createPole(pole: Pole): Observable<Pole> {
    const newPole: Pole = {
      ...pole,
      id: Math.max(...this.poles.map(p => p.id), 0) + 1,
      dateCreation: new Date(),
      dateModification: new Date(),
      services: []
    };
    this.poles.push(newPole);
    this.polesSubject.next([...this.poles]);
    return of(newPole).pipe(delay(200));
  }

  updatePole(id: number, updates: Partial<Pole>): Observable<Pole | null> {
    const index = this.poles.findIndex(p => p.id === id);
    if (index === -1) return of(null).pipe(delay(200));
    
    this.poles[index] = { ...this.poles[index], ...updates, dateModification: new Date() };
    this.polesSubject.next([...this.poles]);
    return of(this.poles[index]).pipe(delay(200));
  }

  deletePole(id: number): Observable<boolean> {
    const index = this.poles.findIndex(p => p.id === id);
    if (index === -1) return of(false).pipe(delay(200));
    
    this.poles.splice(index, 1);
    this.polesSubject.next([...this.poles]);
    return of(true).pipe(delay(200));
  }

  // SERVICES
  getServices(): Observable<Service[]> {
    return of([...this.services]).pipe(delay(200), map(services => services.sort((a, b) => a.nom.localeCompare(b.nom))));
  }

  getServicesSubject(): BehaviorSubject<Service[]> {
    return this.servicesSubject;
  }

  getServicesByPole(poleId: number): Observable<Service[]> {
    return of(this.services.filter(s => s.poleId === poleId)).pipe(delay(150));
  }

  getServiceById(id: number): Observable<Service | undefined> {
    return of(this.services.find(s => s.id === id)).pipe(delay(150));
  }

  createService(service: Service): Observable<Service> {
    const newService: Service = {
      ...service,
      id: Math.max(...this.services.map(s => s.id), 0) + 1,
      dateCreation: new Date(),
      dateModification: new Date(),
      equipes: []
    };
    this.services.push(newService);
    this.servicesSubject.next([...this.services]);
    
    // Mettre à jour le pôle
    if (service.poleId) {
      const poleIndex = this.poles.findIndex(p => p.id === service.poleId);
      if (poleIndex !== -1) {
        if (!this.poles[poleIndex].services) this.poles[poleIndex].services = [];
        this.poles[poleIndex].services!.push(newService);
      }
    }
    return of(newService).pipe(delay(200));
  }

  updateService(id: number, updates: Partial<Service>): Observable<Service | null> {
    const index = this.services.findIndex(s => s.id === id);
    if (index === -1) return of(null).pipe(delay(200));
    
    this.services[index] = { ...this.services[index], ...updates, dateModification: new Date() };
    this.servicesSubject.next([...this.services]);
    return of(this.services[index]).pipe(delay(200));
  }

  deleteService(id: number): Observable<boolean> {
    const index = this.services.findIndex(s => s.id === id);
    if (index === -1) return of(false).pipe(delay(200));
    
    this.services.splice(index, 1);
    this.servicesSubject.next([...this.services]);
    return of(true).pipe(delay(200));
  }

  // EQUIPES
  getEquipes(): Observable<Equipe[]> {
    return of([...this.equipes]).pipe(delay(200), map(equipes => equipes.sort((a, b) => a.nom.localeCompare(b.nom))));
  }

  getEquipesSubject(): BehaviorSubject<Equipe[]> {
    return this.equipesSubject;
  }

  getEquipesByService(serviceId: number): Observable<Equipe[]> {
    return of(this.equipes.filter(e => e.serviceId === serviceId)).pipe(delay(150));
  }

  getEquipeById(id: number): Observable<Equipe | undefined> {
    return of(this.equipes.find(e => e.id === id)).pipe(delay(150));
  }

  createEquipe(equipe: Equipe): Observable<Equipe> {
    const newEquipe: Equipe = {
      ...equipe,
      id: Math.max(...this.equipes.map(e => e.id), 0) + 1,
      dateCreation: new Date(),
      dateModification: new Date(),
      membres: []
    };
    this.equipes.push(newEquipe);
    this.equipesSubject.next([...this.equipes]);
    
    // Mettre à jour le service
    const serviceIndex = this.services.findIndex(s => s.id === equipe.serviceId);
    if (serviceIndex !== -1) {
      if (!this.services[serviceIndex].equipes) this.services[serviceIndex].equipes = [];
      this.services[serviceIndex].equipes!.push(newEquipe);
    }
    return of(newEquipe).pipe(delay(200));
  }

  updateEquipe(id: number, updates: Partial<Equipe>): Observable<Equipe | null> {
    const index = this.equipes.findIndex(e => e.id === id);
    if (index === -1) return of(null).pipe(delay(200));
    
    this.equipes[index] = { ...this.equipes[index], ...updates, dateModification: new Date() };
    this.equipesSubject.next([...this.equipes]);
    return of(this.equipes[index]).pipe(delay(200));
  }

  deleteEquipe(id: number): Observable<boolean> {
    const index = this.equipes.findIndex(e => e.id === id);
    if (index === -1) return of(false).pipe(delay(200));
    
    this.equipes.splice(index, 1);
    this.equipesSubject.next([...this.equipes]);
    return of(true).pipe(delay(200));
  }

  // UTILISATEURS
  getUtilisateurs(): Observable<Utilisateur[]> {
    return of([...this.utilisateurs]).pipe(delay(200));
  }

  getUtilisateurById(id: number): Observable<Utilisateur | undefined> {
    return of(this.utilisateurs.find(u => u.id === id)).pipe(delay(150));
  }

  // STATISTIQUES
  getStatistiques(): Observable<Statistiques> {
    const stats: Statistiques = {
      nombrePoles: this.poles.length,
      nombreServices: this.services.length,
      nombreEquipes: this.equipes.length,
      nombreUtilisateurs: this.utilisateurs.length,
      nombreInactifs: this.poles.filter(p => p.statut === EntityStatus.INACTIF).length +
                      this.services.filter(s => s.statut === EntityStatus.INACTIF).length +
                      this.equipes.filter(e => e.statut === EntityStatus.INACTIF).length,
      effectifTotal: {
        total: this.utilisateurs.length,
        medecins: this.utilisateurs.filter(u => u.specialite).length,
        infirmiers: this.utilisateurs.filter(u => u.role === UserRole.INFIRMIER).length,
        autres: 0
      }
    };
    return of(stats).pipe(delay(150));
  }

  // RECHERCHE
  rechercher(terme: string): Observable<any[]> {
    const resultats = [
      ...this.poles.filter(p => p.nom.toLowerCase().includes(terme.toLowerCase()) || p.code.toLowerCase().includes(terme.toLowerCase())),
      ...this.services.filter(s => s.nom.toLowerCase().includes(terme.toLowerCase()) || s.code.toLowerCase().includes(terme.toLowerCase())),
      ...this.equipes.filter(e => e.nom.toLowerCase().includes(terme.toLowerCase()) || e.code.toLowerCase().includes(terme.toLowerCase()))
    ];
    return of(resultats).pipe(delay(200));
  }

  // ANOMALIES
  getAnomalies(): Observable<Anomalie[]> {
    const anomalies: Anomalie[] = [];
    
    // Services sans chef
    this.services.forEach(s => {
      if (!s.chefServiceId) {
        anomalies.push({
          id: `svc-${s.id}`,
          type: 'SERVICE_SANS_CHEF',
          severite: 'MAJEURE',
          message: `Le service ${s.nom} n'a pas de chef`,
          entiteId: s.id,
          entiteType: EntityType.SERVICE,
          dateDetection: new Date(),
          resolu: false
        });
      }
    });
    
    // Équipes sous-effectif
    this.equipes.forEach(e => {
      if (e.effectif.total < 3) {
        anomalies.push({
          id: `eq-${e.id}`,
          type: 'EQUIPE_SOUS_EFFECTIF',
          severite: 'MINEURE',
          message: `L'équipe ${e.nom} a un effectif faible (${e.effectif.total})`,
          entiteId: e.id,
          entiteType: EntityType.EQUIPE,
          dateDetection: new Date(),
          resolu: false
        });
      }
    });
    
    return of(anomalies).pipe(delay(200));
  }

  // EXPORT
  exporterStructure(format: 'json' | 'csv' | 'xlsx'): Observable<any> {
    const data = {
      poles: this.poles,
      services: this.services,
      equipes: this.equipes,
      dateExport: new Date()
    };
    return of(data).pipe(delay(300));
  }

  // DUPLICATION
  dupliquerEntite(type: EntityType, id: number): Observable<any> {
    if (type === EntityType.POLE) {
      const pole = this.poles.find(p => p.id === id);
      if (!pole) return of(null).pipe(delay(200));
      const copy = { ...pole, id: Math.max(...this.poles.map(p => p.id), 0) + 1, nom: pole.nom + ' (copie)' };
      this.poles.push(copy);
      this.polesSubject.next([...this.poles]);
      return of(copy).pipe(delay(200));
    } else if (type === EntityType.SERVICE) {
      const service = this.services.find(s => s.id === id);
      if (!service) return of(null).pipe(delay(200));
      const copy = { ...service, id: Math.max(...this.services.map(s => s.id), 0) + 1, nom: service.nom + ' (copie)' };
      this.services.push(copy);
      this.servicesSubject.next([...this.services]);
      return of(copy).pipe(delay(200));
    } else if (type === EntityType.EQUIPE) {
      const equipe = this.equipes.find(e => e.id === id);
      if (!equipe) return of(null).pipe(delay(200));
      const copy = { ...equipe, id: Math.max(...this.equipes.map(e => e.id), 0) + 1, nom: equipe.nom + ' (copie)' };
      this.equipes.push(copy);
      this.equipesSubject.next([...this.equipes]);
      return of(copy).pipe(delay(200));
    }
    return of(null).pipe(delay(200));
  }
}
