# MediPlan Mobile

Refonte Flutter de MediPlan avec une interface plus moderne, orientee medicale, et adaptee aux roles :
- staff
- chef de service
- chef de pole
- super admin

## Ce qui est inclus

- nouvel habillage visuel medical bleu/blanc
- ecran de connexion redesign
- dashboard enrichi
- compteurs RC+ / RC-
- planning personnel hebdomadaire
- planning de service pour les managers via `/api/planning`
- centre de notifications avec badge
- liste et creation de demandes
- ecran profil avec photo, infos, changement de mot de passe et deconnexion

## Structure

```text
lib/
├── main.dart
├── env.dart
├── models/
├── providers/
├── screens/
├── services/
├── theme/
├── utils/
└── widgets/
```

## Endpoints utilises

- `POST /api/auth/login`
- `POST /api/auth/reset-password`
- `GET /api/staff/{id}`
- `GET /api/staff/{id}/planning`
- `GET /api/mon-planning/compteurs?userId={id}`
- `GET /api/planning?serviceId={id}&weekStart=yyyy-MM-dd`
- `GET /api/demandes/mes-demandes`
- `GET /api/demandes/types?requestableOnly=true`
- `POST /api/demandes`
- `GET /api/demandes/a-valider`
- `PUT /api/demandes/{id}/valider`
- `PUT /api/demandes/{id}/rejeter`
- `GET /api/notifications`
- `GET /api/notifications/count`
- `POST /api/notifications/{id}/lire`
- `POST /api/notifications/lire-tout`

## Notes importantes sur le backend

### 1. Identification utilisateur

Le backend actuel repose principalement sur :
- `X-User-Id`
- `X-User-Name`

L'application Flutter envoie aussi le token stocke pour rester compatible avec l'existant.

### 2. Planning personnel

L'endpoint cible `GET /api/mon-planning/calendrier` n'est pas present dans le backend actuel.

Fallback implemente :
- `GET /api/staff/{id}/planning`
- filtrage par semaine cote Flutter

### 3. Planning chef de pole

Le backend expose bien `GET /api/planning`, mais dans l'etat actuel il exige un `serviceId`.

Consequence :
- pour un chef de service : la vue service fonctionne
- pour un chef de pole : la vue mobile affiche le service principal et un message d'information

Pour une vraie vue pole mobile, il faudrait ajouter un endpoint backend du type :
- `GET /api/planning/pole?poleId={id}&weekStart=yyyy-MM-dd`

ou permettre `poleId` sans `serviceId` sur `/api/planning`.

### 4. Annulation d'une demande

Le swipe d'annulation est prepare dans l'UX, mais aucun endpoint backend d'annulation n'a ete detecte.

L'application affiche donc un message de demonstration au lieu d'executer une vraie suppression.

### 5. Photo de profil

L'affichage photo est supporte cote Flutter via `CachedNetworkImage` si le backend renvoie un champ `photo`.

Le changement de photo n'est pas active dans cette version car aucun endpoint mobile dedie n'a ete branche ici.

## Installation

```bash
flutter pub get
```

## Configuration

Par defaut, l'application pointe vers :

```text
http://localhost:5239
```

Pour surcharger l'URL du backend :

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:5239
```

Fichier de configuration :
- `lib/env.dart`

## Lancement

```bash
flutter run
```

Exemples :

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5239
flutter run -d android --dart-define=API_BASE_URL=http://10.0.2.2:5239
```

## Verification conseillee

```bash
flutter analyze
flutter test
```

## Parcours manuel recommande

1. Se connecter avec un compte actif.
2. Verifier la restauration de session.
3. Consulter le dashboard.
4. Verifier les compteurs RC+ / RC-.
5. Ouvrir le planning et changer de semaine.
6. Creer une demande.
7. Ouvrir `Mes demandes` et tester les filtres.
8. Avec un compte chef, ouvrir `Demandes a traiter`.
9. Approuver ou rejeter une demande.
10. Ouvrir les notifications et les marquer comme lues.
11. Ouvrir le profil et tester le changement de mot de passe.

## Remarques

- En Flutter Web, pense a configurer le CORS ou un proxy local.
- Si certaines commandes Flutter sont lentes dans ton environnement, commence par `flutter pub get` puis `flutter analyze`.
