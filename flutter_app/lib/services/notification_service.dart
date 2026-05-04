import '../models/notification.dart';
import '../services/api_client.dart';

class NotificationService {
  NotificationService(this._apiClient);

  final ApiClient _apiClient;

  Future<List<AppNotification>> getNotifications({bool unreadOnly = false}) async {
    final response = await _apiClient.dio.get<List<dynamic>>(
      '/api/notifications',
      queryParameters: <String, dynamic>{'unreadOnly': unreadOnly},
    );

    return (response.data ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<int> getUnreadCount() async {
    final response = await _apiClient.dio.get<Map<String, dynamic>>(
      '/api/notifications/count',
    );
    final value = response.data?['count'];
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  Future<void> markAsRead(int id) async {
    await _apiClient.dio.post('/api/notifications/$id/lire');
  }

  Future<void> markAllAsRead() async {
    await _apiClient.dio.post('/api/notifications/lire-tout');
  }
}
