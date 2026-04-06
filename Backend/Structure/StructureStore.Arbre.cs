using MySqlConnector;
using System.Data.Common;

namespace Backend.Structure;

public sealed partial class StructureStore
{
    public async Task<NoeudArborescence> BuildTreeAsync()
    {
        var poles = await GetPolesAsync();
        var services = await GetServicesAsync();
        var equipes = await GetEquipesAsync();
        var users = await GetUtilisateursAsync();

        var usersById = users.ToDictionary(x => x.Id, x => $"{x.Prenom} {x.Nom}");

        var root = new NoeudArborescence
        {
            Id = "etablissement-1",
            Nom = "CLINISYS",
            Type = EntityType.ETABLISSEMENT,
            Expanded = true,
            Enfants = []
        };

        foreach (var pole in poles.OrderBy(x => x.Nom))
        {
            var poleNode = new NoeudArborescence
            {
                Id = $"pole-{pole.Id}",
                Nom = pole.Nom,
                Type = EntityType.POLE,
                Couleur = pole.Couleur,
                Statut = pole.Statut,
                Effectif = pole.Effectif.Total,
                Responsable = ResolveUser(usersById, pole.ChefPoleId),
                Donnees = pole,
                Expanded = true,
                Enfants = []
            };

            foreach (var service in services.Where(s => s.PoleId == pole.Id).OrderBy(s => s.Nom))
            {
                var serviceNode = new NoeudArborescence
                {
                    Id = $"service-{service.Id}",
                    Nom = service.Nom,
                    Type = EntityType.SERVICE,
                    Couleur = service.Couleur,
                    Statut = service.Statut,
                    Effectif = service.Effectif.Total,
                    Responsable = ResolveUser(usersById, service.ChefServiceId),
                    Donnees = service,
                    Expanded = true,
                    Enfants = []
                };

                foreach (var equipe in equipes.Where(e => e.ServiceId == service.Id).OrderBy(e => e.Nom))
                {
                    serviceNode.Enfants.Add(new NoeudArborescence
                    {
                        Id = $"equipe-{equipe.Id}",
                        Nom = equipe.Nom,
                        Type = EntityType.EQUIPE,
                        Couleur = equipe.Couleur,
                        Statut = equipe.Statut,
                        Effectif = equipe.Effectif.Total,
                        Responsable = ResolveUser(usersById, equipe.ChefEquipeId),
                        Donnees = equipe,
                        Expanded = false,
                        Enfants = []
                    });
                }

                poleNode.Enfants.Add(serviceNode);
            }

            root.Enfants.Add(poleNode);
        }

        return root;
    }
}
