class Demande {
  const Demande({
    required this.id,
    required this.userId,
    required this.serviceId,
    required this.date,
    required this.type,
    required this.heureDebut,
    required this.heureFin,
    required this.dureeHeures,
    required this.statut,
    required this.createdAt,
    required this.updatedAt,
    this.dateFin,
    this.commentaire,
    this.motifRejet,
    this.traitePar,
    this.traiteLe,
    this.validePar,
    this.valideParNom,
    this.dateValidation,
    this.sourceAssignmentId,
  });

  final int id;
  final int userId;
  final int serviceId;
  final DateTime date;
  final DateTime? dateFin;
  final String type;
  final String heureDebut;
  final String heureFin;
  final double dureeHeures;
  final String? commentaire;
  final String statut;
  final String? motifRejet;
  final int? traitePar;
  final DateTime? traiteLe;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int? validePar;
  final String? valideParNom;
  final DateTime? dateValidation;
  final String? sourceAssignmentId;

  bool get isPending => statut.toUpperCase() == 'EN_ATTENTE';
  bool get isApproved => statut.toUpperCase() == 'APPROUVEE';
  bool get isRejected => statut.toUpperCase() == 'REJETEE';

  String get statutLabel {
    switch (statut.toUpperCase()) {
      case 'EN_ATTENTE':
        return 'En attente';
      case 'APPROUVEE':
        return 'Approuvee';
      case 'REJETEE':
        return 'Rejetee';
      case 'INFORMATIF':
        return 'Informatif';
      default:
        return statut;
    }
  }

  factory Demande.fromJson(Map<String, dynamic> json) {
    return Demande(
      id: _asInt(json['id']) ?? 0,
      userId: _asInt(json['userId']) ?? 0,
      serviceId: _asInt(json['serviceId']) ?? 0,
      date: DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      dateFin: DateTime.tryParse(json['dateFin']?.toString() ?? ''),
      type: json['type']?.toString() ?? '',
      heureDebut: json['heureDebut']?.toString() ?? '00:00',
      heureFin: json['heureFin']?.toString() ?? '00:00',
      dureeHeures: _asDouble(json['dureeHeures']),
      commentaire: json['commentaire']?.toString(),
      statut: json['statut']?.toString() ?? 'EN_ATTENTE',
      motifRejet: json['motifRejet']?.toString(),
      traitePar: _asInt(json['traitePar']),
      traiteLe: DateTime.tryParse(json['traiteLe']?.toString() ?? ''),
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      updatedAt:
          DateTime.tryParse(json['updatedAt']?.toString() ?? '') ?? DateTime.now(),
      validePar: _asInt(json['validePar']),
      valideParNom: json['valideParNom']?.toString(),
      dateValidation: DateTime.tryParse(json['dateValidation']?.toString() ?? ''),
      sourceAssignmentId: json['sourceAssignmentId']?.toString(),
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

class DemandeTypeOption {
  const DemandeTypeOption({
    required this.code,
    required this.label,
    required this.description,
    required this.color,
    required this.impact,
    required this.isRequestable,
  });

  final String code;
  final String label;
  final String description;
  final String color;
  final String impact;
  final bool isRequestable;

  factory DemandeTypeOption.fromJson(Map<String, dynamic> json) {
    return DemandeTypeOption(
      code: json['code']?.toString() ?? '',
      label: json['label']?.toString() ?? json['code']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      color: json['color']?.toString() ?? '#2563EB',
      impact: json['impact']?.toString() ?? 'neutral',
      isRequestable: json['isRequestable'] == true,
    );
  }
}
