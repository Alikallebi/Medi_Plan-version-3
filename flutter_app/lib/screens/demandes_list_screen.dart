import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/demande.dart';
import '../providers/demande_provider.dart';
import '../providers/notification_provider.dart';
import '../utils/helpers.dart';
import '../widgets/custom_bottom_nav_bar.dart';
import '../widgets/demande_card.dart';

class DemandesListScreen extends ConsumerStatefulWidget {
  const DemandesListScreen({super.key});

  @override
  ConsumerState<DemandesListScreen> createState() => _DemandesListScreenState();
}

class _DemandesListScreenState extends ConsumerState<DemandesListScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    Future.microtask(() => ref.read(demandeProvider.notifier).loadMyDemandes());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<Demande> _filtered(List<Demande> source) {
    switch (_tabController.index) {
      case 1:
        return source.where((item) => item.isPending).toList();
      case 2:
        return source.where((item) => item.isApproved).toList();
      case 3:
        return source.where((item) => item.isRejected).toList();
      default:
        return source;
    }
  }

  Future<bool> _confirmMockCancel(Demande demande) async {
    if (!demande.isPending) {
      return false;
    }

    final confirmed = await showDialog<bool>(
          context: context,
          builder: (BuildContext context) {
            return AlertDialog(
              title: const Text('Annulation'),
              content: const Text(
                'Le geste de swipe est pret, mais aucun endpoint backend d annulation n a ete detecte. Voulez-vous afficher un message de demonstration ?',
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Non'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('Oui'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (confirmed && mounted) {
      AppHelpers.showErrorSnackBar(
        context,
        'Annulation non disponible : endpoint backend manquant.',
      );
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final demandeState = ref.watch(demandeProvider);
    final notifications = ref.watch(notificationProvider);
    final filtered = _filtered(demandeState.myDemandes);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes demandes'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          onTap: (_) => setState(() {}),
          tabs: const <Tab>[
            Tab(text: 'Toutes'),
            Tab(text: 'En attente'),
            Tab(text: 'Approuvees'),
            Tab(text: 'Rejetees'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/demande-form'),
        icon: const Icon(Icons.add),
        label: const Text('Nouvelle demande'),
      ),
      bottomNavigationBar: CustomBottomNavBar(
        currentIndex: 2,
        unreadCount: notifications.unreadCount,
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(demandeProvider.notifier).loadMyDemandes(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
          children: <Widget>[
            if (demandeState.loading)
              const Center(child: CircularProgressIndicator())
            else if (filtered.isEmpty)
              const Text('Aucune demande a afficher.')
            else
              ...filtered.map((Demande demande) {
                final typeLabel = AppHelpers.demandeTypeLabel(
                  demande.type,
                  demandeState.typeOptions,
                );
                final card = DemandeCard(
                  demande: demande,
                  typeLabel: typeLabel,
                );
                if (!demande.isPending) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: card,
                  );
                }
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Dismissible(
                    key: ValueKey<int>(demande.id),
                    direction: DismissDirection.endToStart,
                    confirmDismiss: (_) => _confirmMockCancel(demande),
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF3F1),
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: const Icon(Icons.delete_outline, color: Color(0xFFC62828)),
                    ),
                    child: card,
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
