export class Commande {
  id: number;
  nomClient: string;
  prenomClient: string;
  telClient: string;
  mailClient: string | undefined;
  localisation: string;
  dateLivraison: Date;
  produitCommande: string;
  montant_total: number;
  status: string;
  userId: number;
  rejectionDate?: Date; // Ajout de rejectionDate
  rejectionReason?: string;
  description?:string;
  date_affecte?:Date;
  dateDebut?:Date;
  dateFin?:Date;
      
  constructor(
    id: number,
    nomClient: string,
    prenomClient: string,
    telClient: string,
    mailClient: string | undefined,
    localisation: string,
    dateLivraison: Date,
    produitCommande: string,
    montant_total: number,
    status: string,
    userId: number,
    rejectionDate?: Date, 
    rejectionReason?: string,
    description?:string,
    date_affecte?:Date,
    dateDebut?:Date,
     dateFin?:Date,  
  ) {
    this.id = id;
    this.nomClient = nomClient;
    this.prenomClient = prenomClient;
    this.telClient = telClient;
    this.mailClient = mailClient;
    this.localisation = localisation;
    this.dateLivraison = dateLivraison;
    this.produitCommande = produitCommande;
    this.montant_total = montant_total;
    this.status = status;
    this.userId = userId;
    this.rejectionDate = rejectionDate; 
    this.rejectionReason = rejectionReason;
    this.description=description;
    this.date_affecte=date_affecte; 
    this.dateDebut=dateDebut;
    this.dateFin=dateFin;   
  }
}




// Modèle de réponse pour les commandes reçues d'un service
export interface CommandeResponse {
  id: number;
  nomClient: string;
  prenomClient: string;
  telClient: string;
  mailClient: string;
  localisation: string;
  dateLivraison: string; // Ou un type Date si la date est retournée sous forme de date
  produitCommande: string;
  montantTotal: number;
}

export interface InventoryStatus {
  label: string;
  
}
// commande.model.ts

export interface Commande {
  montant_total: number;
}
