import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../env.dart';
import '../models/user.dart';
import '../utils/constants.dart';

class ApiClient {
  ApiClient({
    required FlutterSecureStorage secureStorage,
    required SharedPreferences preferences,
    required Future<void> Function() onUnauthorized,
  })  : _secureStorage = secureStorage,
        _preferences = preferences,
        _onUnauthorized = onUnauthorized {
    dio = Dio(
      BaseOptions(
        baseUrl: Env.baseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 20),
        sendTimeout: const Duration(seconds: 20),
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (RequestOptions options, RequestInterceptorHandler handler) async {
          final token = await _secureStorage.read(key: AppConstants.tokenStorageKey);
          final encodedSession =
              _preferences.getString(AppConstants.sessionStorageKey);

          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          if (encodedSession != null && encodedSession.isNotEmpty) {
            final session = UserSession.decode(encodedSession);
            options.headers['X-User-Id'] = session.id.toString();
            options.headers['X-User-Name'] = session.displayName;
          }

          handler.next(options);
        },
        onError: (DioException error, ErrorInterceptorHandler handler) async {
          if (error.response?.statusCode == 401) {
            await _onUnauthorized();
          }
          handler.next(error);
        },
      ),
    );
  }

  final FlutterSecureStorage _secureStorage;
  final SharedPreferences _preferences;
  final Future<void> Function() _onUnauthorized;

  late final Dio dio;
}
