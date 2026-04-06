namespace Backend.Structure;

public enum EntityStatus
{
    ACTIF,
    INACTIF,
    SUSPENDU
}

public enum UserRole
{
    SUPER_ADMIN,
    ADMIN,
    CHEF,
    PRATICIEN,
    INFIRMIER,
    CADRE
}

public enum EquipeType
{
    JOUR,
    NUIT,
    MIXTE,
    ROTATION
}

public enum EntityType
{
    POLE,
    SERVICE,
    EQUIPE,
    ETABLISSEMENT
}

public sealed class Effectif
{
    public int Total { get; set; }
    public int Medecins { get; set; }
    public int Infirmiers { get; set; }
    public int Autres { get; set; }
}

public sealed class Utilisateur
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Prenom { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Telephone { get; set; }
    public UserRole Role { get; set; }
    public string? Specialite { get; set; }
    public EntityStatus Statut { get; set; }
}

public sealed class Equipe
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public int ServiceId { get; set; }
    public string? Description { get; set; }
    public EquipeType Type { get; set; }
    public string Couleur { get; set; } = "#f59e0b";
    public EntityStatus Statut { get; set; }
    public int? ChefEquipeId { get; set; }
    public Effectif Effectif { get; set; } = new();
    public DateTime DateCreation { get; set; }
    public DateTime DateModification { get; set; }
}

public sealed class ServiceMedical
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public int PoleId { get; set; }
    public string? Description { get; set; }
    public string? Localisation { get; set; }
    public string? Telephone { get; set; }
    public string? Email { get; set; }
    public string Couleur { get; set; } = "#10b981";
    public EntityStatus Statut { get; set; }
    public int? ChefServiceId { get; set; }
    public int? CadreId { get; set; }
    public Effectif Effectif { get; set; } = new();
    public DateTime DateCreation { get; set; }
    public DateTime DateModification { get; set; }
    public List<Equipe> Equipes { get; set; } = [];
    public List<string> Specialites { get; set; } = [];
    public bool Est24h { get; set; }
    public bool EstUrgence { get; set; }
    public int EffectifMinimum { get; set; }
    public int Lits { get; set; }
    public int TauxOccupation { get; set; }
    public int GardesParMois { get; set; }
}

public sealed class Pole
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Adresse { get; set; }
    public string? Telephone { get; set; }
    public string? Email { get; set; }
    public string Couleur { get; set; } = "#8b5cf6";
    public EntityStatus Statut { get; set; }
    public int? ChefPoleId { get; set; }
    public int? AssistantId { get; set; }
    public Effectif Effectif { get; set; } = new();
    public DateTime DateCreation { get; set; }
    public DateTime DateModification { get; set; }
    public List<ServiceMedical> Services { get; set; } = [];
}

public sealed class Statistiques
{
    public int NombrePoles { get; set; }
    public int NombreServices { get; set; }
    public int NombreEquipes { get; set; }
    public int NombreUtilisateurs { get; set; }
    public int NombreInactifs { get; set; }
    public Effectif EffectifTotal { get; set; } = new();
}

public sealed class NoeudArborescence
{
    public string Id { get; set; } = string.Empty;
    public string Nom { get; set; } = string.Empty;
    public EntityType Type { get; set; }
    public string? Couleur { get; set; }
    public EntityStatus? Statut { get; set; }
    public int Effectif { get; set; }
    public string? Responsable { get; set; }
    public object? Donnees { get; set; }
    public bool Expanded { get; set; }
    public List<NoeudArborescence> Enfants { get; set; } = [];
}