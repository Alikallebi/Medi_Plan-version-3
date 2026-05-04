class Env {
  const Env._();

  static const String _defaultPort = '5239';
  static const String _overrideBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static String get baseUrl {
    if (_overrideBaseUrl.isNotEmpty) {
      return _overrideBaseUrl;
    }

    return 'http://localhost:$_defaultPort';
  }
}
