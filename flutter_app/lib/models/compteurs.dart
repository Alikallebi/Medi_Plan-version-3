class Compteurs {
  const Compteurs({
    required this.userId,
    required this.soldeRcPlus,
    required this.soldeRcMoins,
    required this.updatedAt,
  });

  final int userId;
  final double soldeRcPlus;
  final double soldeRcMoins;
  final DateTime updatedAt;

  factory Compteurs.empty(int userId) {
    return Compteurs(
      userId: userId,
      soldeRcPlus: 0,
      soldeRcMoins: 0,
      updatedAt: DateTime.now(),
    );
  }

  factory Compteurs.fromJson(Map<String, dynamic> json) {
    return Compteurs(
      userId: _asInt(json['userId']) ?? 0,
      soldeRcPlus: _asDouble(json['soldeRcPlus']),
      soldeRcMoins: _asDouble(json['soldeRcMoins']),
      updatedAt: DateTime.tryParse(json['updatedAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }

  static double _asDouble(dynamic value) {
    if (value is double) {
      return value;
    }
    if (value is int) {
      return value.toDouble();
    }
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }
}
