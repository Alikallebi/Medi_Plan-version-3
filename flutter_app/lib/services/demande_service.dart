import '../models/demande.dart';
import '../models/user.dart';
import '../services/api_client.dart';

class DemandeService {
  DemandeService(this._apiClient);

  final ApiClient _apiClient;

  Future<List<Demande>> getMyDemandes({
    DateTime? from,
    DateTime? to,
  }) async {
    final response = await _apiClient.dio.get<List<dynamic>>(
      '/api/demandes/mes-demandes',
      queryParameters: <String, dynamic>{
        if (from != null) 'from': from.toIso8601String(),
        if (to != null) 'to': to.toIso8601String(),
      },
    );

    return (response.data ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Demande.fromJson)
        .toList();
  }

  Future<List<DemandeTypeOption>> getDemandeTypes() async {
    final response = await _apiClient.dio.get<List<dynamic>>(
      '/api/demandes/types',
      queryParameters: const <String, dynamic>{
        'requestableOnly': true,
      },
    );

    return (response.data ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(DemandeTypeOption.fromJson)
        .toList();
  }

  Future<Demande> createDemande({
    required UserSession session,
    required int serviceId,
    required String type,
    required DateTime date,
    DateTime? dateFin,
    String? heureDebut,
    String? heureFin,
    String? commentaire,
    String? sourceAssignmentId,
  }) async {
    final response = await _apiClient.dio.post<Map<String, dynamic>>(
      '/api/demandes',
      data: <String, dynamic>{
        'actingUserId': session.id,
        'demande': <String, dynamic>{
          'userId': session.id,
          'serviceId': serviceId,
          'date': date.toIso8601String(),
          'dateFin': dateFin?.toIso8601String(),
          'type': type,
          'heureDebut': heureDebut ?? '00:00',
          'heureFin': heureFin ?? '00:00',
          'commentaire': commentaire,
          'sourceAssignmentId': sourceAssignmentId,
        },
      },
    );

    return Demande.fromJson(response.data ?? <String, dynamic>{});
  }

  Future<List<Demande>> getDemandesToValidate() async {
    final response = await _apiClient.dio.get<List<dynamic>>('/api/demandes/a-valider');

    return (response.data ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Demande.fromJson)
        .toList();
  }

  Future<Demande> approveDemande({
    required UserSession session,
    required int demandeId,
  }) async {
    final response = await _apiClient.dio.put<Map<String, dynamic>>(
      '/api/demandes/$demandeId/valider',
      data: <String, dynamic>{
        'actingUserId': session.id,
        'action': <String, dynamic>{
          'validatorId': session.id,
          'validatorName': session.displayName,
        },
      },
    );

    return Demande.fromJson(response.data ?? <String, dynamic>{});
  }

  Future<Demande> rejectDemande({
    required UserSession session,
    required int demandeId,
    required String motif,
  }) async {
    final response = await _apiClient.dio.put<Map<String, dynamic>>(
      '/api/demandes/$demandeId/rejeter',
      data: <String, dynamic>{
        'actingUserId': session.id,
        'action': <String, dynamic>{
          'validatorId': session.id,
          'validatorName': session.displayName,
          'motif': motif,
        },
      },
    );

    return Demande.fromJson(response.data ?? <String, dynamic>{});
  }

  Future<Map<int, String>> fetchStaffNames() async {
    final response = await _apiClient.dio.get<List<dynamic>>('/api/staff');
    final result = <int, String>{};
    for (final item in response.data ?? <dynamic>[]) {
      if (item is! Map<String, dynamic>) {
        continue;
      }
      final id = _asInt(item['id']);
      if (id == null) {
        continue;
      }
      final prenom = item['prenom']?.toString() ?? '';
      final nom = item['nom']?.toString() ?? '';
      final fullName = '$prenom $nom'.trim();
      result[id] = fullName.isEmpty ? 'Utilisateur #$id' : fullName;
    }
    return result;
  }

  static int? _asInt(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '');
  }
}
