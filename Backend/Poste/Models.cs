namespace Backend.Poste;

public sealed class ReglePoste
{
    public int? Id { get; set; }
    public string Nom { get; set; } = string.Empty;
    public string? Type { get; set; }
    public string? Valeur { get; set; }
    public string? Description { get; set; }
}

public sealed class PosteItem
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Nom { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Type { get; set; } = "jour";
    public string HeureDebut { get; set; } = "08:00";
    public string HeureFin { get; set; } = "16:00";
    public bool JourSuivant { get; set; }
    public double Duree { get; set; }
    public string Couleur { get; set; } = "#fef9c3";
    public string? Icone { get; set; }
    public int? Tolerance { get; set; }
    public bool Actif { get; set; } = true;
    public List<ReglePoste> ReglesAssociees { get; set; } = [];
    public List<int> ServicesAutorises { get; set; } = [];
    public List<string> ConditionsSaisonnieres { get; set; } = [];
    public List<int> CompetencesRequises { get; set; } = [];
    public int? EffectifMin { get; set; }
    public int? EffectifMax { get; set; }
    public bool ChevauchementAutorise { get; set; } = true;
    public bool Fractionnable { get; set; }
}
