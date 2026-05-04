import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers/auth_provider.dart';
import 'providers/notification_provider.dart';
import 'screens/dashboard_screen.dart';
import 'screens/demande_form_screen.dart';
import 'screens/demandes_list_screen.dart';
import 'screens/gestion_demandes_screen.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/planning_screen.dart';
import 'screens/profile_screen.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'theme/app_theme.dart';
import 'utils/constants.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final preferences = await SharedPreferences.getInstance();
  const secureStorage = FlutterSecureStorage();
  final authService = AuthService(
    secureStorage: secureStorage,
    preferences: preferences,
  );
  final authController = AuthController(authService: authService);
  final apiClient = ApiClient(
    secureStorage: secureStorage,
    preferences: preferences,
    onUnauthorized: authController.forceLogout,
  );

  runApp(
    ProviderScope(
      overrides: <Override>[
        sharedPreferencesProvider.overrideWithValue(preferences),
        secureStorageProvider.overrideWithValue(secureStorage),
        authServiceProvider.overrideWithValue(authService),
        authControllerProvider.overrideWith((Ref ref) => authController),
        apiClientProvider.overrideWithValue(apiClient),
      ],
      child: const MediPlanApp(),
    ),
  );
}

class MediPlanApp extends ConsumerStatefulWidget {
  const MediPlanApp({super.key});

  @override
  ConsumerState<MediPlanApp> createState() => _MediPlanAppState();
}

class _MediPlanAppState extends ConsumerState<MediPlanApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    final authController = ref.read(authControllerProvider);
    _router = GoRouter(
      initialLocation: '/dashboard',
      refreshListenable: authController,
      redirect: (BuildContext context, GoRouterState state) {
        final authState = authController.state;
        final loggingIn = state.matchedLocation == '/login';

        if (!authState.initialized) {
          return loggingIn ? null : '/login';
        }

        if (!authState.isAuthenticated) {
          return loggingIn ? null : '/login';
        }

        if (loggingIn) {
          return '/dashboard';
        }

        if (state.matchedLocation == '/gestion-demandes' &&
            !(authState.user?.isManager ?? false)) {
          return '/dashboard';
        }

        return null;
      },
      routes: <RouteBase>[
        GoRoute(
          path: '/login',
          builder: (_, __) => const LoginScreen(),
        ),
        GoRoute(
          path: '/dashboard',
          builder: (_, __) => const DashboardScreen(),
        ),
        GoRoute(
          path: '/planning',
          builder: (_, __) => const PlanningScreen(),
        ),
        GoRoute(
          path: '/demandes',
          builder: (_, __) => const DemandesListScreen(),
        ),
        GoRoute(
          path: '/demande-form',
          builder: (_, GoRouterState state) {
            final date = state.uri.queryParameters['date'];
            return DemandeFormScreen(
              initialDate: date == null ? null : DateTime.tryParse(date),
            );
          },
        ),
        GoRoute(
          path: '/notifications',
          builder: (_, __) => const NotificationsScreen(),
        ),
        GoRoute(
          path: '/gestion-demandes',
          builder: (_, __) => const GestionDemandesScreen(),
        ),
        GoRoute(
          path: '/profile',
          builder: (_, __) => const ProfileScreen(),
        ),
      ],
    );

    Future.microtask(() async {
      await authController.initialize();
      await ref.read(notificationProvider.notifier).loadNotifications();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      theme: AppTheme.lightTheme,
      supportedLocales: const <Locale>[
        Locale('fr', 'FR'),
      ],
      locale: const Locale('fr', 'FR'),
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
    );
  }
}
