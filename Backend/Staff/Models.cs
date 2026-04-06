namespace Backend.Staff;

public sealed class StaffUser
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Prenom { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Tel { get; set; }
    public string? Matricule { get; set; }
    public string? Role { get; set; }
    public string? Specialite { get; set; }
    public bool Actif { get; set; } = true;
    public int? EquipeId { get; set; }
    public int? ServiceId { get; set; }
    public int? PoleId { get; set; }
    public string? Password { get; set; }

    public string? Civilite { get; set; }
    public DateTime? DateNaissance { get; set; }
    public string? Telephone { get; set; }
    public string? Mobile { get; set; }
    public string? EmailPersonnel { get; set; }
    public string? Adresse { get; set; }
    public string? CodePostal { get; set; }
    public string? Ville { get; set; }
    public string? Username { get; set; }
    public DateTime? Expiration { get; set; }
    public bool ForceChangePassword { get; set; }
    public bool TwoFactorAuth { get; set; }
    public List<string>? RolesSecondaires { get; set; }
    public DateTime? DateEmbauche { get; set; }
    public string? Diplome { get; set; }
    public string? Universite { get; set; }
    public string? Rpps { get; set; }
    public string? Secu { get; set; }
    public List<string>? Competences { get; set; }
    public bool NotifEmail { get; set; } = true;
    public bool NotifSMS { get; set; }
    public bool NotifPush { get; set; }
    public string? RappelPlanning { get; set; }
    public bool NotifModifications { get; set; }
    public bool RecevoirRapports { get; set; }
    public string? Photo { get; set; }
    public List<StaffAffectationInput>? Affectations { get; set; }
}

public sealed class UpdateStaffPhotoRequest
{
    public string? Photo { get; set; }
}

public sealed class StaffAffectationInput
{
    public int? ServiceId { get; set; }
    public string? ServiceName { get; set; }
    public int? EquipeId { get; set; }
    public string? EquipeName { get; set; }
    public string? Role { get; set; }
    public DateTime DateDebut { get; set; }
    public DateTime? DateFin { get; set; }
    public int Taux { get; set; } = 100;
    public bool Principale { get; set; }
    public bool? IsPrimary { get; set; }
}

public sealed class CompetenceItem
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
}

public sealed class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public sealed class LoginResponse
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? Specialite { get; set; }
    public string Token { get; set; } = string.Empty;
    public int? ServiceId { get; set; }
    public string? ServiceNom { get; set; }
    public int? PoleId { get; set; }
    public string? PoleNom { get; set; }
    public int? EquipeId { get; set; }
    public string? EquipeNom { get; set; }
}

public sealed class UserAffectationRequest
{
    public int? ServiceId { get; set; }
    public string? ServiceName { get; set; }
    public int? EquipeId { get; set; }
    public string? EquipeName { get; set; }
    public string? Role { get; set; }
    public DateTime DateDebut { get; set; }
    public DateTime? DateFin { get; set; }
    public int Taux { get; set; } = 100;
    public bool IsPrimary { get; set; }
}