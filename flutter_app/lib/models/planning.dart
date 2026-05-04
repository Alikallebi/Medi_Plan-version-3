class PlanningEntry {
  const PlanningEntry({
    required this.id,
    required this.date,
    required this.dayIndex,
    required this.poste,
    this.personnelId,
    this.personnelName,
    this.planningWeekId,
    this.serviceId,
    this.heureDebut,
    this.heureFin,
    this.shiftType,
    this.note,
    this.updatedAt,
    this.hasConflict = false,
  });

  final String id;
  final DateTime date;
  final int dayIndex;
  final String poste;
  final String? personnelId;
  final String? personnelName;
  final int? planningWeekId;
  final String? serviceId;
  final String? heureDebut;
  final String? heureFin;
  final String? shiftType;
  final String? note;
  final DateTime? updatedAt;
  final bool hasConflict;

  String get horaireLabel {
    if ((heureDebut ?? '').isEmpty || (heureFin ?? '').isEmpty) {
      return shiftType ?? 'Non precise';
    }
    return '$heureDebut - $heureFin';
  }

  String get displayPerson {
    if ((personnelName ?? '').trim().isNotEmpty) {
      return personnelName!.trim();
    }
    if ((personnelId ?? '').trim().isNotEmpty) {
      return personnelId!.trim();
    }
    return 'Personnel';
  }

  PlanningEntry copyWith({
    String? personnelName,
    bool? hasConflict,
  }) {
    return PlanningEntry(
      id: id,
      date: date,
      dayIndex: dayIndex,
      poste: poste,
      personnelId: personnelId,
      personnelName: personnelName ?? this.personnelName,
      planningWeekId: planningWeekId,
      serviceId: serviceId,
      heureDebut: heureDebut,
      heureFin: heureFin,
      shiftType: shiftType,
      note: note,
      updatedAt: updatedAt,
      hasConflict: hasConflict ?? this.hasConflict,
    );
  }

  factory PlanningEntry.fromJson(Map<String, dynamic> json) {
    return PlanningEntry(
      id: json['id']?.toString() ?? '',
      planningWeekId: _asInt(json['planningWeekId']),
      serviceId: json['serviceId']?.toString(),
      personnelId: json['personnelId']?.toString(),
      personnelName: json['personnelName']?.toString(),
      date: DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      dayIndex: _asInt(json['dayIndex']) ?? 0,
      poste: json['poste']?.toString() ?? 'Affectation',
      heureDebut: json['heureDebut']?.toString(),
      heureFin: json['heureFin']?.toString(),
      shiftType: json['shiftType']?.toString(),
      note: json['note']?.toString(),
      updatedAt: DateTime.tryParse(json['updatedAt']?.toString() ?? ''),
      hasConflict: json['hasConflict'] == true,
    );
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }
}

class PlanningDay {
  const PlanningDay({
    required this.date,
    required this.entries,
  });

  final DateTime date;
  final List<PlanningEntry> entries;

  bool get hasEntries => entries.isNotEmpty;
  bool get hasConflict => entries.any((PlanningEntry entry) => entry.hasConflict);
}

class WeekPlanning {
  const WeekPlanning({
    required this.weekStart,
    required this.days,
    this.scopeLabel,
  });

  final DateTime weekStart;
  final List<PlanningDay> days;
  final String? scopeLabel;

  List<PlanningEntry> get allEntries =>
      days.expand((PlanningDay day) => day.entries).toList();
}

class ServicePlanningAssignment {
  const ServicePlanningAssignment({
    required this.id,
    required this.dayIndex,
    required this.shiftType,
    required this.personnelId,
    required this.date,
    this.posteLabel,
    this.startTime,
    this.endTime,
    this.note,
    this.personnelName,
    this.hasConflict = false,
  });

  final String id;
  final int dayIndex;
  final String shiftType;
  final String personnelId;
  final DateTime date;
  final String? posteLabel;
  final String? startTime;
  final String? endTime;
  final String? note;
  final String? personnelName;
  final bool hasConflict;

  String get horaireLabel {
    if ((startTime ?? '').isEmpty || (endTime ?? '').isEmpty) {
      return shiftType;
    }
    return '$startTime - $endTime';
  }

  String get posteDisplay => (posteLabel ?? '').isEmpty ? shiftType : posteLabel!;
  String get displayPerson =>
      (personnelName ?? '').isNotEmpty ? personnelName! : personnelId;
}
