export interface StatutInventaire {
    label: string;
    value: string;
}



export interface Produit {
    id?: number;
    nom?: string;
    prix?: number;
    categorie?: string;
    quantite?: number;
    note?: number;
    statutInventaire?: string;
    image?: File | string;
    
}
