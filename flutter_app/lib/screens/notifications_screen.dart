import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/demande.dart';
import '../models/notification.dart';
import '../providers/auth_provider.dart';
import '../providers/demande_provider.dart';
import '../providers/notification_provider.dart';
import '../utils/helpers.dart';
import '../widgets/custom_bottom_nav_bar.dart';
import '../widgets/notification_card.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(_loadData);
  }

  Future<void> _loadData() async {
    await ref.read(notificationProvider.notifier).loadNotifications();

    final user = ref.read(authControllerProvider).state.user;
    if (user?.isManager ?? false) {
      await ref.read(demandeProvider.notifier).loadPendingDemandes();
    }
  }

  Future<void> _handleTap(AppNotification notification) async {
    if (notification.isUnread) {
      await ref.read(notificationProvider.notifier).markAsRead(notification.id);
    }

    if (!mounted) {
      return;
    }

    final normalized = notification.type.toUpperCase();
    final user = ref.read(authControllerProvider).state.user;
    if (notification.isDemandeApprovalNotification && (user?.isManager ?? false)) {
      context.go('/gestion-demandes');
      return;
    }

    if ((notification.lien ?? '').isNotEmpty ||
        normalized.contains('WORKFLOW') ||
        notification.planningId != null ||
        notification.planningWeekId != null) {
      context.go('/planning');
      return;
    }

    if (normalized.contains('DEMANDE')) {
      context.go('/demandes');
      return;
    }

    context.go('/dashboard');
  }

  Future<void> _approveFromNotification(Demande demande) async {
    await ref.read(demandeProvider.notifier).approveDemande(demande.id);
    await ref.read(notificationProvider.notifier).loadNotifications();
    if (!mounted) {
      return;
    }
    AppHelpers.showSuccessSnackBar(context, 'Demande approuvee.');
  }

  Future<void> _rejectFromNotification(Demande demande) async {
    final controller = TextEditingController();
    final motif = await showDialog<String>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Motif de rejet'),
          content: TextField(
            controller: controller,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: 'Motif obligatoire',
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(controller.text.trim()),
              child: const Text('Rejeter'),
            ),
          ],
        );
      },
    );
    controller.dispose();

    if (motif == null || motif.isEmpty) {
      return;
    }

    await ref.read(demandeProvider.notifier).rejectDemande(demande.id, motif);
    await ref.read(notificationProvider.notifier).loadNotifications();
    if (!mounted) {
      return;
    }
    AppHelpers.showSuccessSnackBar(context, 'Demande rejetee.');
  }

  Demande? _findPendingDemande(List<Demande> pendingDemandes, int? demandeId) {
    if (demandeId == null) {
      return null;
    }

    for (final demande in pendingDemandes) {
      if (demande.id == demandeId) {
        return demande;
      }
    }

    return null;
  }

  Widget? _buildNotificationFooter({
    required AppNotification notification,
    required List<Demande> pendingDemandes,
    required bool canManageDemandes,
  }) {
    if (!canManageDemandes || !notification.isDemandeApprovalNotification) {
      return null;
    }

    final demandeId = notification.demandeId;
    final demande = _findPendingDemande(pendingDemandes, demandeId);

    if (demande == null) {
      return Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          onPressed: () => context.go('/gestion-demandes'),
          icon: const Icon(Icons.open_in_new),
          label: const Text('Ouvrir les validations'),
        ),
      );
    }

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: <Widget>[
        FilledButton.icon(
          onPressed: () => _approveFromNotification(demande),
          icon: const Icon(Icons.check),
          label: const Text('Valider'),
        ),
        OutlinedButton.icon(
          onPressed: () => _rejectFromNotification(demande),
          icon: const Icon(Icons.close),
          label: const Text('Rejeter'),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationProvider);
    final demandeState = ref.watch(demandeProvider);
    final canManageDemandes =
        ref.watch(authControllerProvider).state.user?.isManager ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: <Widget>[
          TextButton(
            onPressed: state.notifications.isEmpty
                ? null
                : () => ref.read(notificationProvider.notifier).markAllAsRead(),
            child: const Text('Tout lire'),
          ),
        ],
      ),
      bottomNavigationBar: CustomBottomNavBar(
        currentIndex: 3,
        unreadCount: state.unreadCount,
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
          children: <Widget>[
            if (state.loading)
              const Center(child: CircularProgressIndicator())
            else if (state.notifications.isEmpty)
              const Text('Aucune notification disponible.')
            else
              ...state.notifications.map(
                (notification) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: NotificationCard(
                    notification: notification,
                    onTap: () => _handleTap(notification),
                    footer: _buildNotificationFooter(
                      notification: notification,
                      pendingDemandes: demandeState.pendingDemandes,
                      canManageDemandes: canManageDemandes,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
