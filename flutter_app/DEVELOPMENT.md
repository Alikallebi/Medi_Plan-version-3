# MediPlan Staff - Application Flutter

Une application Flutter professionnelle et moderne conçue pour les utilisateurs ayant le rôle "Staff". Elle permet aux professionnels de santé de gérer leur profil, leurs plannings, leurs affectations et leurs compétences.

## 🚀 Fonctionnalités

### Implémentées
- ✅ **Authentification** : Login, token management, secure storage
- ✅ **Dashboard** : Vue d'ensemble avec statistiques
- ✅ **Profil** : Consultation des informations personnelles et professionnelles
- ✅ **Plannings** : Liste des plannings avec statuts (draft, soumis, approuvé, rejeté)
- ✅ **Affectations** : Gestion des affectations (actuelles, à venir, passées)
- ✅ **Compétences** : Affichage des compétences avec niveaux
- ✅ **Notifications** : Centre de notifications avec gestion des lectures
- ✅ **Thème** : Design moderne avec couleurs cohérentes

### À Implémenter (Priorités)

**Phase 1 - Core Features**
1. **Écran Planning Détail** 
   - Affichage des jours et shifts
   - Affichage du statut du workflow
   - Timeline des validations
   - Commentaires

2. **Créer/Modifier Planning**
   - Formulaire pour ajouter des shifts
   - Interface calendrier pour sélectionner les jours
   - Sauvegarde en brouillon
   - Soumission pour validation

3. **Détails du Workflow**
   - Affichage des étapes d'approbation
   - Raisons de rejet (si applicable)
   - Demandes de modification

**Phase 2 - Améliorations**
1. **Export PDF** : Exporter un planning en PDF
2. **Duplication Planning** : Dupliquer un planning pour la semaine suivante
3. **Gestion des Compétences** : Ajouter, modifier, supprimer des compétences
4. **Photo de Profil** : Télécharger une photo
5. **Historique** : Vue complète de l'historique des modifications

**Phase 3 - Avancé**
1. **Notifications Push** : Intégration avec Firebase Cloud Messaging
2. **Mode Hors Ligne** : Synchronisation offline-first avec Hive
3. **Calendar View** : Vue calendrier pour les plannings
4. **Search & Filter** : Recherche avancée et filtres
5. **Paramètres** : Gestion des préférences utilisateur

## 📁 Structure du Projet

```
staff_app/
├── lib/
│   ├── main.dart                 # Point d'entrée de l'app
│   ├── config/
│   │   └── router.dart          # Configuration GoRouter
│   ├── models/
│   │   ├── index.dart           # Exports
│   │   ├── planning.dart
│   │   ├── affectation.dart
│   │   ├── competence.dart
│   │   ├── notification.dart
│   │   ├── dashboard_stats.dart
│   │   ├── history_item.dart
│   │   ├── staff_user.dart
│   │   ├── login_response.dart
│   │   └── user_context.dart
│   ├── services/
│   │   ├── auth_service.dart
│   │   ├── staff_service.dart
│   │   ├── planning_service.dart
│   │   ├── dashboard_service.dart
│   │   └── api_service.dart
│   ├── providers/
│   │   └── app_providers.dart   # Riverpod providers
│   ├── screens/
│   │   ├── login_screen.dart
│   │   ├── home_screen.dart
│   │   ├── profile_screen.dart
│   │   ├── plannings_screen.dart
│   │   ├── affectations_screen.dart
│   │   └── notifications_screen.dart
│   ├── widgets/
│   │   ├── app_loading_dialog.dart
│   │   ├── common_widgets.dart
│   │   └── custom_widgets.dart
│   └── theme/
│       └── app_theme.dart
├── pubspec.yaml
└── README.md
```

## 🛠️ Technologie Utilisée

- **Framework** : Flutter 3.0+
- **État** : Riverpod 2.3.6
- **Routage** : GoRouter 10.1.2
- **HTTP** : Dio 5.3.2
- **Sécurité** : Flutter Secure Storage
- **Stockage Local** : Shared Preferences
- **UI** : Material Design 3
- **Fonts** : Google Fonts (Poppins)

## 🚀 Démarrage

### Prérequis
- Flutter SDK >= 3.0.0
- Dart SDK >= 3.0.0
- Un serveur backend accessible (par défaut: `http://localhost:5000`)

### Installation

1. **Cloner/Accéder au projet**
```bash
cd staff_app
```

2. **Installer les dépendances**
```bash
flutter pub get
```

3. **Générer les fichiers JSON (si nécessaire)**
```bash
dart run build_runner build
```

4. **Configurer l'URL du backend**
   - Éditer `lib/services/auth_service.dart`
   - Modifier `baseUrl` selon votre configuration

5. **Lancer l'application**
```bash
flutter run
```

## 📱 Écrans Disponibles

### 1. **Login Screen** (`/login`)
- Formulaire de connexion
- Validation des inputs
- Gestion des erreurs
- Lien "Mot de passe oublié"

### 2. **Home Screen** (`/home`)
- Dashboard avec statistiques
- Profil utilisateur
- Récents plannings
- Affectations actuelles
- Notifications non lues

### 3. **Profile Screen** (`/profile`)
- Informations personnelles
- Informations professionnelles
- Compétences
- Affectations actuelles
- Logout

### 4. **Plannings Screen** (`/plannings`)
- Liste de tous les plannings
- Filtrage par statut
- Création nouveau planning
- Vue détaillée d'un planning
- Actions (voir, modifier, dupliquer)

### 5. **Affectations Screen** (`/affectations`)
- Affectations actuelles
- Affectations à venir
- Affectations passées
- Détails complets de chaque affectation

### 6. **Notifications Screen** (`/notifications`)
- Notifications non lues
- Notifications lues
- Marquage comme lu
- Filtrage par type

## 🔑 Configuration du Backend

### Endpoints Requis

**Authentification**
```
POST /api/auth/login
GET  /api/auth/logout
POST /api/auth/refresh
POST /api/auth/reset-password
```

**Staff**
```
GET    /api/staff/profile
PUT    /api/staff/profile
POST   /api/staff/profile/photo
GET    /api/staff/affectations
GET    /api/staff/competences
POST   /api/staff/competences
PUT    /api/staff/competences/{id}
DELETE /api/staff/competences/{id}
GET    /api/staff/history
```

**Planning**
```
GET    /api/planning/my-plannings
GET    /api/planning/{id}
POST   /api/planning
PUT    /api/planning/{id}
POST   /api/planning/{id}/submit
POST   /api/planning/{id}/duplicate
GET    /api/planning/workflow/{id}
DELETE /api/planning/{id}
```

**Dashboard**
```
GET /api/dashboard/stats
```

**Notifications**
```
GET    /api/planning/notifications
PUT    /api/planning/notifications/{id}/read
PUT    /api/planning/notifications/mark-all-read
GET    /api/planning/notifications?export=pdf
```

## 🔐 Gestion de l'Authentification

### Flux d'Authentification
1. Utilisateur se connecte avec email/password
2. Backend retourne un JWT token
3. Token stocké de manière sécurisée (Secure Storage)
4. Token envoyé dans les headers des requêtes suivantes
5. Si token expiré, appel à `/api/auth/refresh`

### Token Format
```dart
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": 123,
  "userNom": "Dupont",
  "userPrenom": "Jean",
  "userEmail": "jean.dupont@example.com",
  "userRole": "staff",
  "expiresIn": 3600
}
```

## 📊 Modèles de Données

### Planning
```dart
Planning(
  id: 1,
  staffId: 123,
  weekStart: DateTime.now(),
  days: [...],  // PlanningDay[]
  status: PlanningStatus.draft,
  notes: "Notes optionnelles"
)
```

### Affectation
```dart
Affectation(
  id: 1,
  staffId: 123,
  serviceId: 5,
  posteName: "Infirmier",
  type: AffectationType.primary,
  startDate: DateTime.now(),
  endDate: DateTime(2026, 12, 31),
)
```

### Competence
```dart
Competence(
  id: 1,
  staffId: 123,
  name: "Soins intensifs",
  level: CompetenceLevel.advanced,
  expirationDate: DateTime(2026, 6, 30),
  verified: true
)
```

## 🎨 Thème et Customisation

### Couleurs Primaires
- **Primary** : #2563EB (Bleu)
- **Secondary** : #10B981 (Vert)
- **Accent** : #F59E0B (Orange)
- **Error** : #EF4444 (Rouge)

### Fonts
- **Family** : Poppins
- **Weights** : Regular, Medium (500), SemiBold (600), Bold (700)

## 🧪 Tests Recommandés

### Unit Tests
```bash
flutter test
```

### Integration Tests
```bash
flutter drive --target=test_driver/app.dart
```

### Build pour Production
```bash
# Android
flutter build apk --release

# iOS
flutter build ios --release
```

## 📝 Prochaines Étapes de Développement

1. **Planning Détail Screen** - Créer un écran pour voir un planning complet
2. **Create/Edit Planning** - Interface pour créer et modifier des plannings
3. **Planning Workflow** - Affichage du statut et des étapes de validation
4. **Export PDF** - Exporter les plannings en PDF
5. **Offline Support** - Synchronisation offline-first avec Hive
6. **Notifications Push** - Intégration Firebase Cloud Messaging
7. **Tests Unitaires** - Couvrir les services avec des tests
8. **Analyse Performance** - Profiler et optimiser

## 🐛 Debug

Pour activer les logs détaillés :

```dart
// Dans main.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  runApp(
    ProviderScope(
      observers: [ProviderLogger()],
      child: const MyApp(),
    ),
  );
}

class ProviderLogger extends ProviderObserver {
  @override
  void didUpdateProvider(
    ProviderBase provider,
    Object? previousValue,
    Object? newValue,
    ProviderContainer container,
  ) {
    print('${provider.name ?? provider} was updated');
  }
}
```

## 📞 Support

Pour des questions ou des problèmes :
1. Vérifier la connexion au backend
2. Vérifier les logs dans `flutter run -v`
3. Vérifier les endpoints API
4. Vérifier la configuration de CORS

## 📄 Licence

Tous droits réservés - MediPlan 2026
