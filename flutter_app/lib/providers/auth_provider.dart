import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';

class AuthState {
  const AuthState({
    this.initialized = false,
    this.loading = false,
    this.user,
    this.error,
  });

  final bool initialized;
  final bool loading;
  final UserSession? user;
  final String? error;

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    bool? initialized,
    bool? loading,
    UserSession? user,
    String? error,
    bool clearError = false,
  }) {
    return AuthState(
      initialized: initialized ?? this.initialized,
      loading: loading ?? this.loading,
      user: user ?? this.user,
      error: clearError ? null : error ?? this.error,
    );
  }
}

final secureStorageProvider = Provider<FlutterSecureStorage>((Ref ref) {
  return const FlutterSecureStorage();
});

final sharedPreferencesProvider =
    Provider<SharedPreferences>((Ref ref) => throw UnimplementedError());

final authServiceProvider =
    Provider<AuthService>((Ref ref) => throw UnimplementedError());

final authControllerProvider =
    ChangeNotifierProvider<AuthController>((Ref ref) => throw UnimplementedError());

final apiClientProvider =
    Provider<ApiClient>((Ref ref) => throw UnimplementedError());

class AuthController extends ChangeNotifier {
  AuthController({
    required AuthService authService,
  })  : _authService = authService,
        _state = const AuthState();

  final AuthService _authService;

  AuthState _state;
  AuthState get state => _state;

  Future<void> initialize() async {
    if (_state.initialized) {
      return;
    }
    _state = _state.copyWith(loading: true, clearError: true);
    notifyListeners();

    final restored = await _authService.restoreSession();
    if (restored == null) {
      _state = const AuthState(initialized: true, loading: false);
      notifyListeners();
      return;
    }

    final hydrated = await _authService.fetchProfile(restored);
    await _authService.persistSession(hydrated);
    _state = AuthState(
      initialized: true,
      loading: false,
      user: hydrated,
    );
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    _state = _state.copyWith(loading: true, clearError: true);
    notifyListeners();

    try {
      final session = await _authService.login(email: email, password: password);
      final hydrated = await _authService.fetchProfile(session);
      await _authService.persistSession(hydrated);
      _state = AuthState(
        initialized: true,
        loading: false,
        user: hydrated,
      );
      notifyListeners();
    } catch (error) {
      _state = AuthState(
        initialized: true,
        loading: false,
        error: error.toString().replaceFirst('Exception: ', ''),
      );
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await _authService.logout();
    _state = const AuthState(initialized: true, loading: false);
    notifyListeners();
  }

  Future<void> forceLogout() async {
    await logout();
  }

  Future<void> refreshProfile() async {
    final user = _state.user;
    if (user == null) {
      return;
    }
    final refreshed = await _authService.fetchProfile(user);
    await _authService.persistSession(refreshed);
    _state = _state.copyWith(user: refreshed);
    notifyListeners();
  }

  Future<void> changePassword(String newPassword) async {
    final user = _state.user;
    if (user == null) {
      throw Exception('Aucune session active.');
    }
    await _authService.changePassword(email: user.email, newPassword: newPassword);
  }
}
