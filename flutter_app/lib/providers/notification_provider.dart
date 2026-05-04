import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/notification.dart';
import '../providers/auth_provider.dart';
import '../services/notification_service.dart';

final notificationServiceProvider = Provider<NotificationService>((Ref ref) {
  final apiClient = ref.watch(apiClientProvider);
  return NotificationService(apiClient);
});

class NotificationState {
  const NotificationState({
    this.loading = false,
    this.notifications = const <AppNotification>[],
    this.unreadCount = 0,
    this.error,
  });

  final bool loading;
  final List<AppNotification> notifications;
  final int unreadCount;
  final String? error;

  NotificationState copyWith({
    bool? loading,
    List<AppNotification>? notifications,
    int? unreadCount,
    String? error,
    bool clearError = false,
  }) {
    return NotificationState(
      loading: loading ?? this.loading,
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      error: clearError ? null : error ?? this.error,
    );
  }
}

class NotificationController extends StateNotifier<NotificationState> {
  NotificationController(this._ref) : super(const NotificationState());

  final Ref _ref;

  Future<void> loadNotifications() async {
    if (!_ref.read(authControllerProvider).state.isAuthenticated) {
      return;
    }

    state = state.copyWith(loading: true, clearError: true);
    try {
      final service = _ref.read(notificationServiceProvider);
      final notifications = await service.getNotifications();
      final count = await service.getUnreadCount();
      state = state.copyWith(
        loading: false,
        notifications: notifications,
        unreadCount: count,
      );
    } catch (error) {
      state = state.copyWith(
        loading: false,
        error: error.toString(),
      );
    }
  }

  Future<void> markAsRead(int id) async {
    final service = _ref.read(notificationServiceProvider);
    await service.markAsRead(id);
    await loadNotifications();
  }

  Future<void> markAllAsRead() async {
    final service = _ref.read(notificationServiceProvider);
    await service.markAllAsRead();
    await loadNotifications();
  }
}

final notificationProvider =
    StateNotifierProvider<NotificationController, NotificationState>((Ref ref) {
  return NotificationController(ref);
});
