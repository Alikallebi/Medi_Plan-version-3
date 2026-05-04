class AppNotification {
  static final RegExp _demandeIdPattern = RegExp(r'Demande\s*#(\d+)', caseSensitive: false);

  const AppNotification({
    required this.id,
    required this.userId,
    required this.type,
    required this.titre,
    required this.message,
    required this.lu,
    required this.dateCreation,
    this.planningId,
    this.planningWeekId,
    this.dateLecture,
    this.lien,
    this.emetteurId,
  });

  final int id;
  final int userId;
  final String type;
  final String titre;
  final String message;
  final int? planningId;
  final int? planningWeekId;
  final bool lu;
  final DateTime dateCreation;
  final DateTime? dateLecture;
  final String? lien;
  final int? emetteurId;

  bool get isUnread => !lu;

  bool get isDemandeApprovalNotification {
    final normalized = type.trim().toUpperCase();
    return normalized == 'DEMANDE_A_VALIDER' ||
        normalized.contains('DEMANDE') &&
            ((lien ?? '').contains('demandes-attente') || demandeId != null);
  }

  int? get demandeId {
    final sources = <String>[
      titre,
      message,
      if ((lien ?? '').isNotEmpty) lien!,
    ];

    for (final source in sources) {
      final match = _demandeIdPattern.firstMatch(source);
      final value = int.tryParse(match?.group(1) ?? '');
      if (value != null) {
        return value;
      }
    }

    return null;
  }

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: _asInt(json['id']) ?? 0,
      userId: _asInt(json['userId']) ?? 0,
      type: json['type']?.toString() ?? 'INFO',
      titre: json['titre']?.toString() ?? 'Notification',
      message: json['message']?.toString() ?? '',
      planningId: _asInt(json['planningId']),
      planningWeekId: _asInt(json['planningWeekId']),
      lu: json['lu'] == true,
      dateCreation:
          DateTime.tryParse(json['dateCreation']?.toString() ?? '') ?? DateTime.now(),
      dateLecture: DateTime.tryParse(json['dateLecture']?.toString() ?? ''),
      lien: json['lien']?.toString(),
      emetteurId: _asInt(json['emetteurId']),
    );
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }
}
