import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/demande.dart';
import '../providers/auth_provider.dart';
import '../services/demande_service.dart';

final demandeServiceProvider = Provider<DemandeService>((Ref ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DemandeService(apiClient);
});

class DemandeState {
  const DemandeState({
    this.loading = false,
    this.myDemandes = const <Demande>[],
    this.pendingDemandes = const <Demande>[],
    this.staffNames = const <int, String>{},
    this.typeOptions = const <DemandeTypeOption>[],
    this.error,
  });

  final bool loading;
  final List<Demande> myDemandes;
  final List<Demande> pendingDemandes;
  final Map<int, String> staffNames;
  final List<DemandeTypeOption> typeOptions;
  final String? error;

  DemandeState copyWith({
    bool? loading,
    List<Demande>? myDemandes,
    List<Demande>? pendingDemandes,
    Map<int, String>? staffNames,
    List<DemandeTypeOption>? typeOptions,
    String? error,
    bool clearError = false,
  }) {
    return DemandeState(
      loading: loading ?? this.loading,
      myDemandes: myDemandes ?? this.myDemandes,
      pendingDemandes: pendingDemandes ?? this.pendingDemandes,
      staffNames: staffNames ?? this.staffNames,
      typeOptions: typeOptions ?? this.typeOptions,
      error: clearError ? null : error ?? this.error,
    );
  }
}

class DemandeController extends StateNotifier<DemandeState> {
  DemandeController(this._ref) : super(const DemandeState());

  final Ref _ref;

  Future<void> loadMyDemandes() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final service = _ref.read(demandeServiceProvider);
      final demandes = await service.getMyDemandes();
      final types = await service.getDemandeTypes();
      state = state.copyWith(
        loading: false,
        myDemandes: demandes,
        typeOptions: types,
      );
    } catch (error) {
      state = state.copyWith(
        loading: false,
        error: error.toString(),
      );
    }
  }

  Future<void> loadPendingDemandes() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final service = _ref.read(demandeServiceProvider);
      final demandes = await service.getDemandesToValidate();
      final staff = await service.fetchStaffNames();
      state = state.copyWith(
        loading: false,
        pendingDemandes: demandes,
        staffNames: staff,
      );
    } catch (error) {
      state = state.copyWith(
        loading: false,
        error: error.toString(),
      );
    }
  }

  Future<Demande> createDemande({
    required String type,
    required DateTime date,
    DateTime? dateFin,
    String? heureDebut,
    String? heureFin,
    String? commentaire,
    String? sourceAssignmentId,
  }) async {
    final user = _ref.read(authControllerProvider).state.user;
    if (user == null || user.serviceId == null) {
      throw Exception('Session invalide ou service manquant.');
    }

    final service = _ref.read(demandeServiceProvider);
    final demande = await service.createDemande(
      session: user,
      serviceId: user.serviceId!,
      type: type,
      date: date,
      dateFin: dateFin,
      heureDebut: heureDebut,
      heureFin: heureFin,
      commentaire: commentaire,
      sourceAssignmentId: sourceAssignmentId,
    );
    await loadMyDemandes();
    return demande;
  }

  Future<void> approveDemande(int demandeId) async {
    final user = _ref.read(authControllerProvider).state.user;
    if (user == null) {
      throw Exception('Session invalide.');
    }
    final service = _ref.read(demandeServiceProvider);
    await service.approveDemande(session: user, demandeId: demandeId);
    await loadPendingDemandes();
  }

  Future<void> rejectDemande(int demandeId, String motif) async {
    final user = _ref.read(authControllerProvider).state.user;
    if (user == null) {
      throw Exception('Session invalide.');
    }
    final service = _ref.read(demandeServiceProvider);
    await service.rejectDemande(
      session: user,
      demandeId: demandeId,
      motif: motif,
    );
    await loadPendingDemandes();
  }
}

final demandeProvider =
    StateNotifierProvider<DemandeController, DemandeState>((Ref ref) {
  return DemandeController(ref);
});
