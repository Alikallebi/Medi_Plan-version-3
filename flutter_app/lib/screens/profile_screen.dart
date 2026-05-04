import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import '../providers/notification_provider.dart';
import '../utils/helpers.dart';
import '../widgets/custom_bottom_nav_bar.dart';
import '../widgets/profile_avatar.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final oldController = TextEditingController();
    final controller = TextEditingController();
    final confirmController = TextEditingController();

    final result = await showDialog<String>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Changer le mot de passe'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              TextField(
                controller: oldController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Ancien mot de passe'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Nouveau mot de passe'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: confirmController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirmation'),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: () {
                if (controller.text.trim().isEmpty ||
                    controller.text.trim() != confirmController.text.trim()) {
                  return;
                }
                Navigator.of(context).pop(controller.text.trim());
              },
              child: const Text('Enregistrer'),
            ),
          ],
        );
      },
    );

    oldController.dispose();
    controller.dispose();
    confirmController.dispose();

    if (result == null || result.isEmpty) {
      return;
    }

    try {
      await ref.read(authControllerProvider).changePassword(result);
      if (!context.mounted) {
        return;
      }
      AppHelpers.showSuccessSnackBar(context, 'Mot de passe mis a jour.');
    } catch (error) {
      if (!context.mounted) {
        return;
      }
      AppHelpers.showErrorSnackBar(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (BuildContext context) {
            return AlertDialog(
              title: const Text('Deconnexion'),
              content: const Text('Voulez-vous vraiment vous deconnecter ?'),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Annuler'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('Se deconnecter'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (confirmed) {
      await ref.read(authControllerProvider).logout();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final user = auth.user!;
    final notifications = ref.watch(notificationProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      bottomNavigationBar: CustomBottomNavBar(
        currentIndex: 4,
        unreadCount: notifications.unreadCount,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(28),
            ),
            child: Column(
              children: <Widget>[
                ProfileAvatar(
                  name: user.displayName,
                  photoUrl: user.photo,
                  radius: 42,
                ),
                const SizedBox(height: 14),
                Text(user.displayName, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(user.email, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 8),
                Chip(label: Text(AppHelpers.roleLabel(user))),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: <Widget>[
                _ProfileRow(label: 'Role', value: user.role),
                _ProfileRow(label: 'Service', value: user.serviceNom ?? 'Non renseigne'),
                _ProfileRow(label: 'Pole', value: user.poleNom ?? 'Non renseigne'),
                _ProfileRow(label: 'Equipe', value: user.equipeNom ?? 'Non renseigne'),
                _ProfileRow(
                  label: 'Telephone',
                  value: user.telephone ?? 'Non renseigne',
                  isLast: true,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.tonalIcon(
            onPressed: () => _changePassword(context, ref),
            icon: const Icon(Icons.lock_reset),
            label: const Text('Changer le mot de passe'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _confirmLogout(context, ref),
            icon: const Icon(Icons.logout),
            label: const Text('Se deconnecter'),
          ),
        ],
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.label,
    required this.value,
    this.isLast = false,
  });

  final String label;
  final String value;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(
                bottom: BorderSide(color: Color(0xFFD9E4F1)),
              ),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ],
      ),
    );
  }
}
