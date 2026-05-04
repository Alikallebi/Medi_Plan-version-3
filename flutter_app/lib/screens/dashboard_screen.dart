import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/planning.dart';
import '../providers/auth_provider.dart';
import '../providers/demande_provider.dart';
import '../providers/notification_provider.dart';
import '../providers/planning_provider.dart';
import '../utils/date_utils.dart';
import '../utils/helpers.dart';
import '../widgets/compteurs_widget.dart';
import '../widgets/custom_bottom_nav_bar.dart';
import '../widgets/profile_avatar.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  DateTime _selectedPlanningDate = DateTime.now();

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      await ref.read(planningProvider.notifier).loadCurrentWeek();
      await ref.read(notificationProvider.notifier).loadNotifications();
      await ref.read(demandeProvider.notifier).loadMyDemandes();
    });
  }

  Future<void> _changePlanningDay(int offsetDays) async {
    final base = _selectedPlanningDate;
    final nextDate = DateTime(base.year, base.month, base.day + offsetDays);

    setState(() {
      _selectedPlanningDate = nextDate;
    });

    final currentWeekStart = AppDateUtils.startOfWeek(nextDate);
    if (!_isSameDate(ref.read(planningProvider).weekStart, currentWeekStart)) {
      await ref.read(planningProvider.notifier).loadWeek(currentWeekStart);
    }
  }

  Future<void> _goToTodayPlanning() async {
    final today = DateTime.now();
    setState(() {
      _selectedPlanningDate = DateTime(today.year, today.month, today.day);
    });
    await ref.read(planningProvider.notifier).goToToday();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final planning = ref.watch(planningProvider);
    final notifications = ref.watch(notificationProvider);
    final demandes = ref.watch(demandeProvider);
    final user = auth.user!;

    return Scaffold(
      bottomNavigationBar: CustomBottomNavBar(
        currentIndex: 0,
        unreadCount: notifications.unreadCount,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref
              .read(planningProvider.notifier)
              .loadWeek(AppDateUtils.startOfWeek(_selectedPlanningDate));
          await ref.read(notificationProvider.notifier).loadNotifications();
          await ref.read(demandeProvider.notifier).loadMyDemandes();
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              toolbarHeight: 80,
              title: Text(
                'MediPlan',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                ),
              ),
              actions: [
                IconButton(
                  onPressed: () => context.push('/notifications'),
                  icon: Badge(
                    isLabelVisible: notifications.unreadCount > 0,
                    label: Text(notifications.unreadCount.toString()),
                    child: const Icon(Icons.notifications_outlined),
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  _WelcomeBanner(
                    userName: user.displayName,
                    roleLabel: AppHelpers.roleLabel(user),
                    userPhoto: user.photo,
                    serviceLabel: user.serviceNom ?? user.poleNom ?? 'Organisation',
                  ),
                  const SizedBox(height: 24),
                  CompteursWidget(
                    rcPlus: '${planning.compteurs?.soldeRcPlus.toStringAsFixed(1) ?? "0"} h',
                    rcMoins: '${planning.compteurs?.soldeRcMoins.toStringAsFixed(1) ?? "0"} h',
                    onTapRcPlus: () => context.go('/planning'),
                    onTapRcMoins: () => context.go('/demandes'),
                  ),
                  const SizedBox(height: 24),
                  _QuickActions(
                    isManager: user.isManager,
                    onPlanning: () => context.go('/planning'),
                    onDemandes: () => context.go('/demandes'),
                    onNotifications: () => context.go('/notifications'),
                    onManagerDemandes: () => context.push('/gestion-demandes'),
                  ),
                  const SizedBox(height: 28),
                  _SectionTitle(
                    title: user.isManager ? 'Planning du service' : 'Mon planning',
                    subtitle: 'Jour du ${AppDateUtils.shortDate(_selectedPlanningDate)}',
                  ),
                  const SizedBox(height: 16),
                  _DashboardPlanningHeader(
                    selectedDate: _selectedPlanningDate,
                    onPrevious: () => _changePlanningDay(-1),
                    onNext: () => _changePlanningDay(1),
                    onToday: _goToTodayPlanning,
                  ),
                  const SizedBox(height: 16),
                  if (planning.loading)
                    const Center(child: CircularProgressIndicator())
                  else if (user.isManager)
                    _TeamPlanningCard(
                      assignments: planning.teamAssignments.where((item) {
                        return _isSameDate(item.date, _selectedPlanningDate);
                      }).toList(),
                      selectedDate: _selectedPlanningDate,
                      infoMessage: planning.infoMessage,
                    )
                  else
                    _PersonalPlanningCard(
                      days: planning.weekPlanning?.days ?? const <PlanningDay>[],
                      selectedDate: _selectedPlanningDate,
                    ),
                  const SizedBox(height: 28),
                  const _SectionTitle(
                    title: 'Notifications récentes',
                    subtitle: 'Les 3 dernières non lues',
                  ),
                  const SizedBox(height: 16),
                  if (notifications.notifications.isEmpty)
                    const _EmptyCard(message: 'Aucune notification récente.')
                  else
                    ...notifications.notifications
                        .where((item) => item.isUnread)
                        .take(3)
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _MiniNotificationTile(
                              title: item.titre,
                              message: item.message,
                              date: AppDateUtils.shortDate(item.dateCreation),
                              onTap: () => context.push('/notifications'),
                            ),
                          ),
                        ),
                  const SizedBox(height: 28),
                  const _SectionTitle(
                    title: 'Mes demandes',
                    subtitle: 'Les plus récentes',
                  ),
                  const SizedBox(height: 16),
                  if (demandes.myDemandes.isEmpty)
                    const _EmptyCard(message: 'Aucune demande enregistrée.')
                  else
                    ...demandes.myDemandes.take(3).map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _MiniDemandeTile(
                              type: item.type,
                              status: item.statutLabel,
                              date: AppDateUtils.shortDate(item.date),
                            ),
                          ),
                        ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isSameDate(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }
}

// Bannière de bienvenue améliorée
class _WelcomeBanner extends StatelessWidget {
  const _WelcomeBanner({
    required this.userName,
    required this.roleLabel,
    required this.serviceLabel,
    this.userPhoto,
  });

  final String userName;
  final String roleLabel;
  final String serviceLabel;
  final String? userPhoto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F6CBD), Color(0xFF13A89E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F6CBD).withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bonjour $userName',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '$roleLabel • $serviceLabel',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.white.withOpacity(0.85),
                  ),
                ),
              ],
            ),
          ),
          ProfileAvatar(name: userName, photoUrl: userPhoto, radius: 32),
        ],
      ),
    );
  }
}

// Actions rapides (cartes modernes)
class _QuickActions extends StatelessWidget {
  const _QuickActions({
    required this.isManager,
    required this.onPlanning,
    required this.onDemandes,
    required this.onNotifications,
    required this.onManagerDemandes,
  });

  final bool isManager;
  final VoidCallback onPlanning;
  final VoidCallback onDemandes;
  final VoidCallback onNotifications;
  final VoidCallback onManagerDemandes;

  @override
  Widget build(BuildContext context) {
    final items = [
      _QuickActionData('Planning', Icons.calendar_month_outlined, onPlanning),
      _QuickActionData('Demandes', Icons.assignment_outlined, onDemandes),
      _QuickActionData('Alertes', Icons.notifications_outlined, onNotifications),
      if (isManager)
        _QuickActionData('Validation', Icons.rule_folder_outlined, onManagerDemandes),
    ];

    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: items.map((item) {
        return SizedBox(
          width: (MediaQuery.of(context).size.width - 48) / 2 - 12,
          child: Card(
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            color: Colors.white,
            child: InkWell(
              onTap: item.onTap,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: const Color(0xFFEAF4FF),
                      child: Icon(item.icon, color: const Color(0xFF0F6CBD)),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      item.label,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _QuickActionData {
  const _QuickActionData(this.label, this.icon, this.onTap);
  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ],
    );
  }
}

class _DashboardPlanningHeader extends StatelessWidget {
  const _DashboardPlanningHeader({
    required this.selectedDate,
    required this.onPrevious,
    required this.onNext,
    required this.onToday,
  });

  final DateTime selectedDate;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final isToday = AppDateUtils.relativeDayLabel(selectedDate) == 'Aujourd\'hui';

    return Row(
      children: <Widget>[
        IconButton.filledTonal(
          onPressed: onPrevious,
          icon: const Icon(Icons.chevron_left),
          tooltip: 'Jour precedent',
        ),
        Expanded(
          child: Column(
            children: <Widget>[
              Text(
                AppDateUtils.relativeDayLabel(selectedDate),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                '${AppDateUtils.weekdayLabel(selectedDate)} ${AppDateUtils.shortDate(selectedDate)}',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        if (!isToday)
          TextButton(
            onPressed: onToday,
            child: const Text('Aujourd hui'),
          ),
        IconButton.filledTonal(
          onPressed: onNext,
          icon: const Icon(Icons.chevron_right),
          tooltip: 'Jour suivant',
        ),
      ],
    );
  }
}

// Carte planning personnel simplifiée
class _PersonalPlanningCard extends StatelessWidget {
  const _PersonalPlanningCard({
    required this.days,
    required this.selectedDate,
  });

  final List<PlanningDay> days;
  final DateTime selectedDate;

  @override
  Widget build(BuildContext context) {
    if (days.isEmpty) {
      return const _EmptyCard(message: 'Aucun planning personnel disponible.');
    }

    PlanningDay? selectedDay;
    for (final day in days) {
      if (day.date.year == selectedDate.year &&
          day.date.month == selectedDate.month &&
          day.date.day == selectedDate.day) {
        selectedDay = day;
        break;
      }
    }

    if (selectedDay == null || selectedDay.entries.isEmpty) {
      return const _EmptyCard(message: 'Aucun planning disponible pour ce jour.');
    }

    final activeDay = selectedDay;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Column(
          children: activeDay.entries.map((entry) {
            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              leading: CircleAvatar(
                backgroundColor: const Color(0xFFEAF4FF),
                child: Icon(Icons.calendar_today, size: 18, color: const Color(0xFF0F6CBD)),
              ),
              title: Text(
                entry.poste,
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
              subtitle: Text(
                '${AppDateUtils.relativeDayLabel(activeDay.date)} • ${entry.horaireLabel}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// Carte planning d’équipe (service/pôle)
class _TeamPlanningCard extends StatelessWidget {
  const _TeamPlanningCard({
    required this.assignments,
    required this.selectedDate,
    this.infoMessage,
  });

  final List<ServicePlanningAssignment> assignments;
  final DateTime selectedDate;
  final String? infoMessage;

  @override
  Widget build(BuildContext context) {
    if (assignments.isEmpty) {
      return _EmptyCard(message: infoMessage ?? 'Aucun planning de service disponible pour ce jour.');
    }

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            if ((infoMessage ?? '').isNotEmpty)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF8E8),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFFFE0B2)),
                ),
                child: Text(
                  infoMessage!,
                  style: const TextStyle(color: Color(0xFFE65100), fontSize: 13),
                ),
              ),
            ...assignments.take(6).map((item) {
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFE),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: AppHelpers.shiftColor(item.shiftType).withOpacity(0.15),
                      child: Icon(
                        Icons.medical_services_outlined,
                        size: 20,
                        color: AppHelpers.shiftColor(item.shiftType),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.displayPerson,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${AppDateUtils.relativeDayLabel(selectedDate)} • ${item.posteDisplay}',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            item.horaireLabel,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                    if (item.hasConflict)
                      const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF8C00), size: 20),
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

// Widgets miniatures réutilisables
class _MiniNotificationTile extends StatelessWidget {
  const _MiniNotificationTile({
    required this.title,
    required this.message,
    required this.date,
    required this.onTap,
  });

  final String title;
  final String message;
  final String date;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const CircleAvatar(
                backgroundColor: Color(0xFFEAF4FF),
                child: Icon(Icons.notifications_outlined, color: Color(0xFF0F6CBD)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(
                      message,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ),
              ),
              Text(date, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ],
          ),
        ),
      ),
    );
  }
}

class _MiniDemandeTile extends StatelessWidget {
  const _MiniDemandeTile({
    required this.type,
    required this.status,
    required this.date,
  });

  final String type;
  final String status;
  final String date;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const CircleAvatar(
              backgroundColor: Color(0xFFEAF4FF),
              child: Icon(Icons.assignment_outlined, color: Color(0xFF0F6CBD)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(type, style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(
                    '$date • $status',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: Text(
            message,
            style: TextStyle(color: Colors.grey.shade500),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
