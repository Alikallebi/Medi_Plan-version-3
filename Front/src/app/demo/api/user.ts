interface Specialite {
    label: string;
    value: string;
}

interface Localisation {
    label: string;
    value: string;
}

export interface User {
    id?: any;              
    nom?: string;          
    prenom?: string;       
    email?: string;        
    specialite?: string;  
    localisation?: Localisation;  
    tel?: string;
    password?: string;
    name?: string; 
    confirm_password?: string; 
    avatar?: File; 
    nombreCommandesTerminees?: number;
    position?: number; 
    rank?: any;
    periode?:any;
    avatarUrl?: string;
     role?: string;
    
}


  