import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/demande.dart';
import '../providers/demande_provider.dart';
import '../utils/helpers.dart';
import '../widgets/demande_card.dart';

class GestionDemandesScreen extends ConsumerStatefulWidget {
  const GestionDemandesScreen({super.key});

  @override
  ConsumerState<GestionDemandesScreen> createState() =>
      _GestionDemandesScreenState();
}

class _GestionDemandesScreenState extends ConsumerState<GestionDemandesScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(demandeProvider.notifier).loadPendingDemandes());
  }

  Future<void> _approve(Demande demande) async {
    await ref.read(demandeProvider.notifier).approveDemande(demande.id);
    if (!mounted) {
      return;
    }
    AppHelpers.showSuccessSnackBar(context, 'Demande approuvee.');
  }

  Future<void> _reject(Demande demande) async {
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
    if (!mounted) {
      return;
    }
    AppHelpers.showSuccessSnackBar(context, 'Demande rejetee.');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(demandeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Demandes a traiter')),
      body: RefreshIndicator(
        onRefresh: () => ref.read(demandeProvider.notifier).loadPendingDemandes(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
          children: <Widget>[
            if (state.loading)
              const Center(child: CircularProgressIndicator())
            else if (state.pendingDemandes.isEmpty)
              const Text('Aucune demande en attente.')
            else
              ...state.pendingDemandes.map((Demande demande) {
                final requester =
                    state.staffNames[demande.userId] ?? 'Utilisateur #${demande.userId}';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DemandeCard(
                    demande: demande,
                    typeLabel: demande.type,
                    title: '${demande.type} • $requester',
                    subtitle: 'Demandeur : $requester',
                    actions: <Widget>[
                      FilledButton.icon(
                        onPressed: () => _approve(demande),
                        icon: const Icon(Icons.check),
                        label: const Text('Approuver'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _reject(demande),
                        icon: const Icon(Icons.close),
                        label: const Text('Rejeter'),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
