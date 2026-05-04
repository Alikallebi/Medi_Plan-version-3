class AppConstants {
  const AppConstants._();

  static const String appName = 'MediPlan Mobile';
  static const String planningScopePersonal = 'personal';
  static const String planningScopeService = 'service';
  static const String planningScopePole = 'pole';

  static const String tokenStorageKey = 'mediplan_token';
  static const String sessionStorageKey = 'mediplan_session';

  static const List<String> managerRoles = <String>[
    'CHEF_SERVICE',
    'CHEF DE SERVICE',
    'CHEF_SERVICE_ROLE',
    'CHEF_PÔLE',
    'CHEF_POLE',
    'CHEF DE PÔLE',
    'CHEF DE POLE',
    'SUPER_ADMIN',
    'SUPER-ADMIN',
    'SUPER ADMIN',
    'ADMIN',
  ];

  static const Map<String, String> requestTypeLabels = <String, String>{
    'HS': 'Heures sup',
    'RC+': 'Recuperation +',
    'RC-': 'Recuperation -',
    'ABSENCE': 'Absence',
    'ARRET': 'Arret',
    'VA': 'Conges',
    'AS': 'Absence service',
    'AL': 'Autorisation',
    'JR': 'Jour de repos',
    'AT': 'Arret travail',
  };
}
