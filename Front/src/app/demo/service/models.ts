// ===== ENUMS =====
export enum EntityStatus {
  ACTIF = 'ACTIF',
  INACTIF = 'INACTIF',
  SUSPENDU = 'SUSPENDU'
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  CHEF = 'CHEF',
  PRATICIEN = 'PRATICIEN',
  INFIRMIER = 'INFIRMIER',
  CADRE = 'CADRE'
}

export enum EquipeType {
  JOUR = 'JOUR',
  NUIT = 'NUIT',
  MIXTE = 'MIXTE',
  ROTATION = 'ROTATION'
}

export enum EntityType {
  POLE = 'POLE',
  SERVICE = 'SERVICE',
  EQUIPE = 'EQUIPE',
  ETABLISSEMENT = 'ETABLISSEMENT'
}

export enum MembershipStatus {
  ACTIF = 'ACTIF',
  INACTIF = 'INACTIF',
  SUSPENDRE = 'SUSPENDU'
}

// ===== INTERFACES =====

export interface Effectif {
  total: number;
  medecins: number;
  infirmiers: number;
  autres: number;
}

export interface Utilisateur {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  photo?: string;
  role: UserRole;
  specialite?: string;
  statut: EntityStatus;
  dateCreation?: Date;
  dateModification?: Date;
}

export interface Equipe {
  id: number;
  nom: string;
  code: string;
  serviceId: number;
  description?: string;
  type: EquipeType;
  couleur: string;
  statut: EntityStatus;
  chefEquipeId?: number;
  assistantId?: number;
  effectif: Effectif;
  dateCreation: Date;
  dateModification: Date;
  membres?: Utilisateur[];
  horaires?: any;
}

export interface Service {
  id: number;
  nom: string;
  code: string;
  poleId: number;
  description?: string;
  localisation?: string;
  telephone?: string;
  email?: string;
  couleur: string;
  statut: EntityStatus;
  chefServiceId?: number;
  cadreId?: number;
  effectif: Effectif;
  dateCreation: Date;
  dateModification: Date;
  equipes?: Equipe[];
  specialites?: string[];
  est24h?: boolean;
  estUrgence?: boolean;
  effectifMinimum?: number;
  lits?: number;
  tauxOccupation?: number;
  gardesParMois?: number;
  services?: Service[];
}

export interface Pole {
  id: number;
  nom: string;
  code: string;
  description?: string;
  adresse?: string;
  localisation?: string;
  telephone?: string;
  email?: string;
  couleur: string;
  statut: EntityStatus;
  chefPoleId?: number;
  assistantId?: number;
  effectif: Effectif;
  dateCreation: Date;
  dateModification: Date;
  services?: Service[];
}

export interface Etablissement {
  id: number;
  nom: string;
  code: string;
  description?: string;
  adresse: string;
  telephone?: string;
  email?: string;
  statut: EntityStatus;
  poles?: Pole[];
}

export interface HistoriqueModification {
  id: number;
  entityId?: number;
  entiteId?: number;
  entityType?: EntityType;
  entiteType?: EntityType;
  action: string;
  ancienneValeur?: string;
  nouvelleValeur?: string;
  utilisateur?: Utilisateur;
  utilisateurId?: number;
  dateModification?: Date;
  dateAction?: Date;
  detailsChangement?: string;
  commentaire?: string;
}

export interface Anomalie {
  id: string | number;
  type?: string;
  severite: 'CRITIQUE' | 'MAJEURE' | 'MINEURE';
  message?: string;
  entiteId?: number;
  entiteType?: EntityType;
  dateDetection?: Date;
  resolu?: boolean;
  titre?: string;
  description?: string;
  statut?: 'OUVERTE' | 'FERMEE' | 'EN_COURS';
  dateCreation?: Date;
  dateModification?: Date;
}

export interface NoeudArborescence {
  id: string | number;
  label?: string;
  nom?: string;
  data?: any;
  donnees?: any;
  expandedIcon?: string;
  collapsedIcon?: string;
  children?: NoeudArborescence[];
  enfants?: NoeudArborescence[];
  type: EntityType;
  couleur?: string;
  statut?: EntityStatus;
  effectif?: number;
  responsable?: string;
  icon?: string;
  expanded?: boolean;
}

export interface Statistiques {
  nombrePoles?: number;
  nbPoles?: number;
  nombreServices?: number;
  nbServices?: number;
  nombreEquipes?: number;
  nbEquipes?: number;
  nombreUtilisateurs?: number;
  effectifTotal?: Effectif;
  nombreInactifs?: number;
  tauxOccupationMoyen?: number;
  nbAnomalies?: number;
  tauxConformite?: number;
}

export interface Membership {
  id: number;
  equipeId: number;
  utilisateurId: number;
  rol?: UserRole;
  role?: UserRole;
  dateDebut: Date;
  dateFin?: Date;
  statut: MembershipStatus;
}

export interface Horaires {
  id?: number;
  nom: string;
  debut: string;
  fin: string;
  jours: string[];
  description?: string;
}

export interface HorairesEquipe {
  id?: number;
  equipeId: number;
  planningType?: string;
  horaires?: Horaires[];
  horairesParJour?: Array<{
    jour: string;
    matin: { debut: string; fin: string; actif: boolean };
    aprem: { debut: string; fin: string; actif: boolean };
    nuit: { debut: string; fin: string; actif: boolean };
    garde: boolean;
  }>;
  pauseDebut?: string;
  pauseFin?: string;
  rotationAutomatique?: boolean;
  periodeRotation?: number;
}

export interface PeriodeFermeture {
  id?: number;
  entiteId: number;
  entiteType: EntityType;
  dateDebut: Date;
  dateFin: Date;
  raison?: string;
  motif?: string;
}

export interface Budget {
  id?: number;
  entiteId: number;
  entiteType: EntityType;
  annee: number;
  montant: number;
  montantTotal?: number;
  consomme: number;
  montantUtilise?: number;
  details?: string;
  detail?: {
    masseSalariale?: number;
    equipement?: number;
    medicaments?: number;
    formation?: number;
    autres?: number;
  };
}

export interface Planning {
  id?: number;
  entiteId: number;
  entiteType: EntityType;
  semaine: Date;
  donnees: any;
  statut?: 'en_attente' | 'approuve' | 'rejete' | 'en_cours';
  tauxValidation?: number;
  conflitsDetectes?: number;
  dateCreation?: Date;
  dateModification?: Date;
}

export interface Regle {
  id?: number;
  entiteId: number;
  entiteType: EntityType;
  nom: string;
  description: string;
  type: string;
  actif: boolean;
  severite?: 'CRITIQUE' | 'MAJEURE' | 'MINEURE' | 'error' | 'warning';
}

export interface DragDropPayload {
  entiteId: number;
  entiteType: EntityType;
  targetParentId: number;
  targetParentType: EntityType;
}

export interface SearchResult {
  id: number;
  nom: string;
  type: EntityType;
  donnees?: any;
  responsable?: string;
  effectif?: number;
  couleur?: string;
  parentName?: string;
}

export interface Competence {
  id?: number;
  nom: string;
  description: string;
  domaine: string;
  niveau?: 'DEBUTANT' | 'CONFIRME' | 'EXPERT';
  obligatoire?: boolean;
}

export interface MemberCompetency {
  id?: number;
  utilisateurId: number;
  competenceId: number;
  niveau: 'DEBUTANT' | 'CONFIRME' | 'EXPERT';
  dateAcquisition: Date;
}
