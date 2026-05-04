import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/compteurs.dart';
import '../models/planning.dart';
import '../providers/auth_provider.dart';
import '../services/planning_service.dart';
import '../utils/constants.dart';
import '../utils/date_utils.dart';

final planningServiceProvider = Provider<PlanningService>((Ref ref) {
  final apiClient = ref.watch(apiClientProvider);
  return PlanningService(apiClient);
});

class PlanningState {
  const PlanningState({
    required this.weekStart,
    this.loading = false,
    this.weekPlanning,
    this.compteurs,
    this.teamAssignments = const <ServicePlanningAssignment>[],
    this.scope = AppConstants.planningScopePersonal,
    this.infoMessage,
    this.error,
  });

  final DateTime weekStart;
  final bool loading;
  final WeekPlanning? weekPlanning;
  final Compteurs? compteurs;
  final List<ServicePlanningAssignment> teamAssignments;
  final String scope;
  final String? infoMessage;
  final String? error;

  PlanningState copyWith({
    DateTime? weekStart,
    bool? loading,
    WeekPlanning? weekPlanning,
    Compteurs? compteurs,
    List<ServicePlanningAssignment>? teamAssignments,
    String? scope,
    String? infoMessage,
    String? error,
    bool clearError = false,
    bool clearInfoMessage = false,
  }) {
    return PlanningState(
      weekStart: weekStart ?? this.weekStart,
      loading: loading ?? this.loading,
      weekPlanning: weekPlanning ?? this.weekPlanning,
      compteurs: compteurs ?? this.compteurs,
      teamAssignments: teamAssignments ?? this.teamAssignments,
      scope: scope ?? this.scope,
      infoMessage: clearInfoMessage ? null : infoMessage ?? this.infoMessage,
      error: clearError ? null : error ?? this.error,
    );
  }
}

class PlanningController extends StateNotifier<PlanningState> {
  PlanningController(this._ref)
      : super(PlanningState(weekStart: AppDateUtils.startOfWeek(DateTime.now())));

  final Ref _ref;

  Future<void> loadCurrentWeek() async {
    await loadWeek(state.weekStart);
  }

  Future<void> loadWeek(DateTime weekStart) async {
    final authState = _ref.read(authControllerProvider).state;
    final user = authState.user;
    if (user == null) {
      return;
    }

    state = state.copyWith(
      weekStart: AppDateUtils.startOfWeek(weekStart),
      loading: true,
      clearError: true,
      clearInfoMessage: true,
    );

    try {
      final service = _ref.read(planningServiceProvider);
      final planning = await service.getWeekPlanning(
        session: user,
        weekStart: state.weekStart,
      );
      final compteurs = await service.getCompteurs(user.id);

      List<ServicePlanningAssignment> teamAssignments = <ServicePlanningAssignment>[];
      String scope = AppConstants.planningScopePersonal;
      String? infoMessage;

      if (user.isManager && user.serviceId != null) {
        teamAssignments = await service.getServicePlanning(
          session: user,
          weekStart: state.weekStart,
        );
        scope = AppConstants.planningScopeService;
        if (user.normalizedRole.contains('POLE')) {
          infoMessage =
              'Vue service affichee. Une vue pole complete necessite un endpoint backend dedie.';
        }
      }

      state = state.copyWith(
        loading: false,
        weekPlanning: planning,
        compteurs: compteurs,
        teamAssignments: teamAssignments,
        scope: scope,
        infoMessage: infoMessage,
      );
    } catch (error) {
      state = state.copyWith(
        loading: false,
        error: error.toString(),
      );
    }
  }

  Future<void> nextWeek() async {
    await loadWeek(state.weekStart.add(const Duration(days: 7)));
  }

  Future<void> previousWeek() async {
    await loadWeek(state.weekStart.subtract(const Duration(days: 7)));
  }

  Future<void> goToToday() async {
    await loadWeek(DateTime.now());
  }
}

final planningProvider =
    StateNotifierProvider<PlanningController, PlanningState>((Ref ref) {
  return PlanningController(ref);
});
