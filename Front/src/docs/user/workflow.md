# Guide du module Workflow

## Introduction
Le module Workflow gère le circuit de validation des plannings médicaux, de la soumission initiale jusqu'à la validation finale.

## Rôles et permissions
- **Super Admin** : validation finale, supervision globale, actions d'exception.
- **Admin GTA** : configuration des règles workflow, supervision opérationnelle.
- **Chef de Service** : validation niveau 1.
- **Validateur RH** : validation niveau 2.
- **Staff** : consultation uniquement.

## Pages principales

### 1. Validation Inbox
[CAPTURE ECRAN]

Accédez à la liste des plannings en attente de votre validation.

**Actions possibles :**
- ✅ Approuver un planning
- ❌ Rejeter avec motif
- ✏️ Demander des modifications
- 👁️ Voir les détails

### 2. Détail d'un planning
[CAPTURE ECRAN]

Visualisez toutes les informations d'un planning :
- Timeline des validations
- Aperçu du planning
- Commentaires et pièces jointes

### 3. Dashboard Admin
[CAPTURE ECRAN]

Réservé aux rôles Super Admin et Admin GTA :
- Statistiques globales
- Plannings bloqués
- Performance des validateurs

### 4. Audit Trail
[CAPTURE ECRAN]

Historique complet des actions avec filtres avancés et export.

## FAQ
**Q: Comment soumettre un planning ?**
R: Depuis le Module 2, cliquez sur "Soumettre pour validation".

**Q: Que faire si un planning est bloqué ?**
R: Contactez le validateur concerné ou, si vous êtes admin, utilisez l'action "Relancer".

**Q: Comment voir l'historique complet ?**
R: Ouvrez "Audit Trail" depuis le menu workflow/admin.

**Q: Puis-je joindre des documents à une validation ?**
R: Oui, via la section "Pièces Jointes" dans le détail d'un planning.
