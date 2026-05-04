import '../models/compteurs.dart';
import '../models/planning.dart';
import '../models/user.dart';
import '../services/api_client.dart';
import '../utils/date_utils.dart';

class PlanningService {
  PlanningService(this._apiClient);

  final ApiClient _apiClient;

  Future<Compteurs> getCompteurs(int userId) async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/api/mon-planning/compteurs',
      queryParameters: <String, dynamic>{'userId': userId},
    );

    return Compteurs.fromJson(response.data ?? <String, dynamic>{});
  }

  Future<WeekPlanning> getWeekPlanning({
    required UserSession session,
    required DateTime weekStart,
  }) async {
    final response = await _apiClient.dio.get<List<dynamic>>(
      '/api/staff/${session.id}/planning',
    );

    final allEntries = (response.data ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(PlanningEntry.fromJson)
        .toList();

    return _buildPersonalWeek(allEntries, weekStart);
  }

  Future<List<ServicePlanningAssignment>> getServicePlanning({
    required UserSession session,
    required DateTime weekStart,
  }) async {
    if (session.serviceId == null) {
      return <ServicePlanningAssignment>[];
    }

    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/api/planning',
      queryParameters: <String, dynamic>{
        'serviceId': session.serviceId.toString(),
        'serviceName': session.serviceNom,
        'weekStart': AppDateUtils.apiDate(weekStart),
      },
    );

    final data = response.data ?? <String, dynamic>{};
    final assignments = (data['assignments'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
    final personnel = (data['personnel'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
    final conflicts = (data['conflicts'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();

    final namesById = <String, String>{};
    for (final item in personnel) {
      final id = item['id']?.toString() ?? '';
      final prenom = item['prenom']?.toString() ?? '';
      final nom = item['nom']?.toString() ?? '';
      final fullName = '$prenom $nom'.trim();
      namesById[id] = fullName.isEmpty ? id : fullName;
    }

    final conflictKeys = <String>{};
    for (final item in conflicts) {
      final personnelId = item['personnelId']?.toString();
      final day = item['day']?.toString();
      if ((personnelId ?? '').isNotEmpty && (day ?? '').isNotEmpty) {
        conflictKeys.add('$personnelId-$day');
      }
    }

    final start = AppDateUtils.startOfWeek(weekStart);
    final parsed = assignments.map((Map<String, dynamic> item) {
      final personnelId = item['personnelId']?.toString() ?? '';
      final dayIndex = _asInt(item['day']) ?? 0;
      return ServicePlanningAssignment(
        id: item['id']?.toString() ?? '',
        dayIndex: dayIndex,
        shiftType: item['shiftType']?.toString() ?? 'jour',
        personnelId: personnelId,
        date: start.add(Duration(days: dayIndex.clamp(0, 6))),
        posteLabel: item['posteLabel']?.toString(),
        startTime: item['startTime']?.toString(),
        endTime: item['endTime']?.toString(),
        note: item['note']?.toString(),
        personnelName: namesById[personnelId],
        hasConflict: conflictKeys.contains('$personnelId-$dayIndex'),
      );
    }).toList()
      ..sort((a, b) {
        final dateCompare = a.date.compareTo(b.date);
        if (dateCompare != 0) {
          return dateCompare;
        }
        return a.displayPerson.compareTo(b.displayPerson);
      });

    return parsed;
  }

  WeekPlanning _buildPersonalWeek(List<PlanningEntry> entries, DateTime weekStart) {
    final start = AppDateUtils.startOfWeek(weekStart);
    final end = AppDateUtils.endOfWeek(weekStart);
    final filtered = entries.where((PlanningEntry entry) {
      final date = DateTime(entry.date.year, entry.date.month, entry.date.day);
      return !date.isBefore(start) && !date.isAfter(end);
    }).toList();

    final days = List<PlanningDay>.generate(7, (int index) {
      final date = start.add(Duration(days: index));
      final dayEntries = filtered.where((PlanningEntry entry) {
        return entry.date.year == date.year &&
            entry.date.month == date.month &&
            entry.date.day == date.day;
      }).toList()
        ..sort((PlanningEntry a, PlanningEntry b) {
          return (a.heureDebut ?? '').compareTo(b.heureDebut ?? '');
        });

      return PlanningDay(date: date, entries: dayEntries);
    });

    return WeekPlanning(weekStart: start, days: days, scopeLabel: 'Personnel');
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }
}
