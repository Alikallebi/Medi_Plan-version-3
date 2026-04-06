namespace Backend.Competence;

public sealed class CompetenceItem
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Domaine { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? UpdatedAt { get; set; }
}

public sealed class CompetenceUpsertRequest
{
    public string Nom { get; set; } = string.Empty;
    public string Domaine { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool? IsActive { get; set; }
}

public sealed class PosteCompetenceLink
{
    public int PosteId { get; set; }
    public int CompetenceId { get; set; }
}

public sealed class UtilisateurCompetenceLink
{
    public int UtilisateurId { get; set; }
    public int CompetenceId { get; set; }
}

public sealed class PlanningAvailableUserItem
{
    public int Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string Prenom { get; set; } = string.Empty;
    public List<string> Competences { get; set; } = [];
}
