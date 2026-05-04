import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../env.dart';
import '../models/user.dart';
import '../utils/constants.dart';

class AuthService {
  AuthService({
    required FlutterSecureStorage secureStorage,
    required SharedPreferences preferences,
  })  : _secureStorage = secureStorage,
        _preferences = preferences,
        _dio = Dio(
          BaseOptions(
            baseUrl: Env.baseUrl,
            connectTimeout: const Duration(seconds: 20),
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 20),
            contentType: Headers.jsonContentType,
          ),
        );

  final FlutterSecureStorage _secureStorage;
  final SharedPreferences _preferences;
  final Dio _dio;

  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/auth/login',
        data: <String, dynamic>{
          'email': email,
          'password': password,
        },
      );

      final session = UserSession.fromJson(response.data ?? <String, dynamic>{});
      await persistSession(session);
      return session;
    } on DioException catch (error) {
      throw Exception(_extractMessage(error));
    }
  }

  Future<UserSession?> restoreSession() async {
    final rawSession = _preferences.getString(AppConstants.sessionStorageKey);
    if (rawSession == null || rawSession.isEmpty) {
      return null;
    }

    final token = await _secureStorage.read(key: AppConstants.tokenStorageKey);
    if (token == null || token.isEmpty) {
      return null;
    }

    final session = UserSession.decode(rawSession);
    return session.copyWith();
  }

  Future<void> persistSession(UserSession session) async {
    await _secureStorage.write(
      key: AppConstants.tokenStorageKey,
      value: session.token,
    );
    await _preferences.setString(
      AppConstants.sessionStorageKey,
      session.encode(),
    );
  }

  Future<void> logout() async {
    await _secureStorage.delete(key: AppConstants.tokenStorageKey);
    await _preferences.remove(AppConstants.sessionStorageKey);
  }

  Future<UserSession> fetchProfile(UserSession session) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/staff/${session.id}',
        options: Options(
          headers: <String, dynamic>{
            'Authorization': 'Bearer ${session.token}',
            'X-User-Id': session.id.toString(),
            'X-User-Name': session.displayName,
          },
        ),
      );

      final data = response.data ?? <String, dynamic>{};
      return session.copyWith(
        nom: data['nom']?.toString(),
        prenom: data['prenom']?.toString(),
        specialite: data['specialite']?.toString() ?? session.specialite,
        serviceId: _asInt(data['serviceId']) ?? session.serviceId,
        serviceNom: data['serviceNom']?.toString() ?? session.serviceNom,
        poleId: _asInt(data['poleId']) ?? session.poleId,
        poleNom: data['poleNom']?.toString() ?? session.poleNom,
        equipeId: _asInt(data['equipeId']) ?? session.equipeId,
        equipeNom: data['equipeNom']?.toString() ?? session.equipeNom,
        telephone:
            data['telephone']?.toString() ?? data['tel']?.toString() ?? session.telephone,
        adresse: data['adresse']?.toString() ?? session.adresse,
        photo: data['photo']?.toString() ?? session.photo,
        actif: data['actif'] is bool ? data['actif'] as bool : session.actif,
      );
    } on DioException catch (_) {
      return session;
    }
  }

  Future<void> changePassword({
    required String email,
    required String newPassword,
  }) async {
    try {
      await _dio.post(
        '/api/auth/reset-password',
        data: <String, dynamic>{
          'email': email,
          'password': newPassword,
        },
      );
    } on DioException catch (error) {
      throw Exception(_extractMessage(error));
    }
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }

  String _extractMessage(DioException error) {
    final data = error.response?.data;
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
    if (error.response?.statusCode == 401) {
      return 'Email ou mot de passe incorrect.';
    }
    return 'Une erreur est survenue lors de l\'authentification.';
  }
}
