import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/planning.dart';
import '../providers/notification_provider.dart';
import '../providers/planning_provider.dart';
import '../utils/date_utils.dart';
import '../widgets/compteurs_widget.dart';
import '../widgets/custom_bottom_nav_bar.dart';
import '../widgets/planning_week_view.dart';

enum _PlanningDisplayMode { week, day }

class PlanningScreen extends ConsumerStatefulWidget {
  const PlanningScreen({super.key});

  @override
  ConsumerState<PlanningScreen> createState() => _PlanningScreenState();
}

class _PlanningScreenState extends ConsumerState<PlanningScreen> {
  _PlanningDisplayMode _displayMode = _PlanningDisplayMode.week;
  int _selectedDayIndex = DateTime.now().weekday - DateTime.monday;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(planningProvider.notifier).loadCurrentWeek());
  }

  List<PlanningDay> _visibleDays(PlanningState planning) {
    final weekPlanning = planning.weekPlanning;
    if (weekPlanning == null) {
      return const <PlanningDay>[];
    }

    if (_displayMode == _PlanningDisplayMode.week) {
      return weekPlanning.days;
    }

    if (weekPlanning.days.isEmpty) {
      return const <PlanningDay>[];
    }

    final safeIndex = _safeSelectedDayIndex(weekPlanning);
    return <PlanningDay>[weekPlanning.days[safeIndex]];
  }

  int _safeSelectedDayIndex(WeekPlanning weekPlanning) {
    if (weekPlanning.days.isEmpty) {
      return 0;
    }

    if (_selectedDayIndex < 0) {
      return 0;
    }

    if (_selectedDayIndex >= weekPlanning.days.length) {
      return weekPlanning.days.length - 1;
    }

    return _selectedDayIndex;
  }

  void _selectTodayInCurrentWeek(WeekPlanning? weekPlanning) {
    if (weekPlanning == null || weekPlanning.days.isEmpty) {
      return;
    }

    final today = DateTime.now();
    final todayIndex = weekPlanning.days.indexWhere(
      (PlanningDay day) =>
          day.date.year == today.year &&
          day.date.month == today.month &&
          day.date.day == today.day,
    );

    if (todayIndex != -1) {
      setState(() {
        _selectedDayIndex = todayIndex;
      });
    }
  }

  int? _todayIndexInWeek(WeekPlanning? weekPlanning) {
    if (weekPlanning == null || weekPlanning.days.isEmpty) {
      return null;
    }

    final today = DateTime.now();
    final todayIndex = weekPlanning.days.indexWhere(
      (PlanningDay day) =>
          day.date.year == today.year &&
          day.date.month == today.month &&
          day.date.day == today.day,
    );

    return todayIndex == -1 ? null : todayIndex;
  }

  @override
  Widget build(BuildContext context) {
    final planning = ref.watch(planningProvider);
    final notifications = ref.watch(notificationProvider);
    final weekPlanning = planning.weekPlanning;
    final visibleDays = _visibleDays(planning);
    final selectedDay = weekPlanning == null || weekPlanning.days.isEmpty
        ? null
        : weekPlanning.days[_safeSelectedDayIndex(weekPlanning)];

    return Scaffold(
      appBar: AppBar(title: const Text('Mon planning')),
      bottomNavigationBar: CustomBottomNavBar(
        currentIndex: 1,
        unreadCount: notifications.unreadCount,
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(planningProvider.notifier).loadCurrentWeek(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
          children: <Widget>[
            Row(
              children: <Widget>[
                IconButton.filledTonal(
                  onPressed: () => ref.read(planningProvider.notifier).previousWeek(),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Column(
                    children: <Widget>[
                      Text(
                        'Semaine du ${AppDateUtils.shortDate(planning.weekStart)}',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        AppDateUtils.monthLabel(planning.weekStart),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: () => ref.read(planningProvider.notifier).nextWeek(),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.center,
              child: TextButton(
                onPressed: () async {
                  await ref.read(planningProvider.notifier).goToToday();
                  if (!mounted) {
                    return;
                  }
                  _selectTodayInCurrentWeek(ref.read(planningProvider).weekPlanning);
                },
                child: const Text('Aujourd hui'),
              ),
            ),
            const SizedBox(height: 12),
            SegmentedButton<_PlanningDisplayMode>(
              segments: const <ButtonSegment<_PlanningDisplayMode>>[
                ButtonSegment<_PlanningDisplayMode>(
                  value: _PlanningDisplayMode.week,
                  icon: Icon(Icons.view_week_outlined),
                  label: Text('Semaine'),
                ),
                ButtonSegment<_PlanningDisplayMode>(
                  value: _PlanningDisplayMode.day,
                  icon: Icon(Icons.today_outlined),
                  label: Text('Jour'),
                ),
              ],
              selected: <_PlanningDisplayMode>{_displayMode},
              onSelectionChanged: (Set<_PlanningDisplayMode> value) {
                final nextMode = value.first;
                final todayIndex =
                    nextMode == _PlanningDisplayMode.day ? _todayIndexInWeek(weekPlanning) : null;
                setState(() {
                  _displayMode = nextMode;
                  if (todayIndex != null) {
                    _selectedDayIndex = todayIndex;
                  }
                });
              },
            ),
            if (weekPlanning != null) ...<Widget>[
              const SizedBox(height: 12),
              SizedBox(
                height: 52,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: weekPlanning.days.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (BuildContext context, int index) {
                    final day = weekPlanning.days[index];
                    final selected = index == _selectedDayIndex;
                    final isToday = AppDateUtils.relativeDayLabel(day.date) == 'Aujourd\'hui';
                    final label = isToday
                        ? 'Aujourd hui'
                        : '${AppDateUtils.weekdayLabel(day.date)} ${day.date.day}';

                    return ChoiceChip(
                      selected: selected,
                      showCheckmark: selected,
                      avatar: isToday
                          ? Icon(
                              Icons.circle,
                              size: 10,
                              color: selected
                                  ? Colors.white
                                  : const Color(0xFF0F6CBD),
                            )
                          : null,
                      label: Text(
                        label,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onSelected: (_) {
                        setState(() {
                          _selectedDayIndex = index;
                        });
                      },
                    );
                  },
                ),
              ),
            ],
            if (_displayMode == _PlanningDisplayMode.day && selectedDay != null) ...<Widget>[
              const SizedBox(height: 8),
              Text(
                'Vue du ${AppDateUtils.weekdayLabel(selectedDay.date)} ${AppDateUtils.shortDate(selectedDay.date)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
            const SizedBox(height: 8),
            CompteursWidget(
              rcPlus: '${planning.compteurs?.soldeRcPlus.toStringAsFixed(1) ?? "0"} h',
              rcMoins:
                  '${planning.compteurs?.soldeRcMoins.toStringAsFixed(1) ?? "0"} h',
            ),
            const SizedBox(height: 18),
            if (planning.loading)
              const Center(child: CircularProgressIndicator())
            else if (planning.weekPlanning == null)
              const Text('Impossible de charger le planning.')
            else
              PlanningWeekView(
                days: visibleDays,
                highlightToday: _displayMode == _PlanningDisplayMode.week,
                onAddRequest: (day) {
                  context.push('/demande-form?date=${AppDateUtils.apiDate(day.date)}');
                },
              ),
          ],
        ),
      ),
    );
  }
}
