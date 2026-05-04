import 'package:flutter/material.dart';

import '../models/planning.dart';
import '../utils/constants.dart';
import '../utils/date_utils.dart';
import '../utils/helpers.dart';

class PlanningWeekView extends StatelessWidget {
  const PlanningWeekView({
    super.key,
    required this.days,
    required this.onAddRequest,
    this.highlightToday = false,
  });

  final List<PlanningDay> days;
  final void Function(PlanningDay day) onAddRequest;
  final bool highlightToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: days.map((PlanningDay day) {
        final isToday = _isSameDate(day.date, DateTime.now());
        final isPastDay = _isBeforeToday(day.date);
        final showTodayHighlight = highlightToday && isToday;

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: showTodayHighlight
                    ? const Color(0xFF0F6CBD)
                    : const Color(0xFFD9E4F1),
                width: showTodayHighlight ? 1.6 : 1,
              ),
              boxShadow: showTodayHighlight
                  ? const <BoxShadow>[
                      BoxShadow(
                        color: Color(0x140F6CBD),
                        blurRadius: 18,
                        offset: Offset(0, 8),
                      ),
                    ]
                  : null,
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              AppDateUtils.relativeDayLabel(day.date),
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: const Color(0xFF16324F),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              AppDateUtils.shortDate(day.date),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: const Color(0xFF64748B),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (showTodayHighlight)
                        const Padding(
                          padding: EdgeInsets.only(right: 8),
                          child: _HeaderBadge(
                            icon: Icons.today_outlined,
                            label: 'Aujourd\'hui',
                            backgroundColor: Color(0xFFEAF4FF),
                            foregroundColor: Color(0xFF0F6CBD),
                          ),
                        ),
                      if (day.hasConflict)
                        const Padding(
                          padding: EdgeInsets.only(right: 8),
                          child: _HeaderBadge(
                            icon: Icons.warning_amber_rounded,
                            label: 'Conflit',
                            backgroundColor: Color(0xFFFFF4E8),
                            foregroundColor: Color(0xFFEF8C00),
                          ),
                        ),
                      if (!isPastDay)
                        IconButton.filledTonal(
                          onPressed: () => onAddRequest(day),
                          icon: const Icon(Icons.add),
                          tooltip: 'Nouvelle demande',
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (!day.hasEntries)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: Text(
                        'Aucune affectation pour cette journee.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    )
                  else
                    ...day.entries.map((PlanningEntry entry) {
                      final tone = AppHelpers.shiftColor(entry.shiftType);
                      final shiftLabel = _shiftLabel(entry.shiftType);
                      final note = (entry.note ?? '').trim();
                      final hasTimeRange =
                          (entry.heureDebut ?? '').isNotEmpty &&
                          (entry.heureFin ?? '').isNotEmpty;

                      return Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: <Color>[
                              Colors.white,
                              tone.withOpacity(0.06),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: tone.withOpacity(0.18)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Container(
                                  width: 42,
                                  height: 42,
                                  decoration: BoxDecoration(
                                    color: tone.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Icon(
                                    _entryIcon(entry.shiftType),
                                    color: tone,
                                    size: 22,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(
                                        entry.poste,
                                        style: theme.textTheme.titleMedium?.copyWith(
                                          color: const Color(0xFF16324F),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        entry.displayPerson,
                                        style: theme.textTheme.bodySmall?.copyWith(
                                          color: const Color(0xFF64748B),
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (shiftLabel != null)
                                  _ShiftBadge(
                                    label: shiftLabel,
                                    color: tone,
                                  ),
                                if (entry.hasConflict) ...<Widget>[
                                  const SizedBox(width: 8),
                                  const Icon(
                                    Icons.error_outline,
                                    color: Color(0xFFEF8C00),
                                    size: 20,
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 12),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.9),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: const Color(0xFFD7E3F1)),
                              ),
                              child: Row(
                                children: <Widget>[
                                  Icon(Icons.schedule_outlined, size: 16, color: tone),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      hasTimeRange
                                          ? '${entry.heureDebut} - ${entry.heureFin}'
                                          : (shiftLabel ?? entry.horaireLabel),
                                      style: theme.textTheme.bodyMedium?.copyWith(
                                        color: const Color(0xFF16324F),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (note.isNotEmpty) ...<Widget>[
                              const SizedBox(height: 10),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  const Padding(
                                    padding: EdgeInsets.only(top: 2),
                                    child: Icon(
                                      Icons.notes_rounded,
                                      size: 16,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      note,
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        color: const Color(0xFF475569),
                                        height: 1.35,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      );
                    }),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  String? _shiftLabel(String? shiftType) {
    final normalized = (shiftType ?? '').trim();
    if (normalized.isEmpty) {
      return null;
    }

    return AppConstants.requestTypeLabels[normalized.toUpperCase()] ?? normalized;
  }

  IconData _entryIcon(String? shiftType) {
    final normalized = (shiftType ?? '').toUpperCase();
    if (normalized == 'JR') {
      return Icons.weekend_outlined;
    }
    if (normalized == 'AT') {
      return Icons.health_and_safety_outlined;
    }
    if (normalized == 'AS' || normalized == 'AL' || normalized == 'ABSENCE') {
      return Icons.event_busy_outlined;
    }
    if (normalized.contains('NUIT')) {
      return Icons.dark_mode_outlined;
    }
    return Icons.schedule_outlined;
  }

  bool _isSameDate(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  bool _isBeforeToday(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final current = DateTime(date.year, date.month, date.day);
    return current.isBefore(today);
  }
}

class _HeaderBadge extends StatelessWidget {
  const _HeaderBadge({
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.foregroundColor,
  });

  final IconData icon;
  final String label;
  final Color backgroundColor;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 16, color: foregroundColor),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: foregroundColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ShiftBadge extends StatelessWidget {
  const _ShiftBadge({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 132),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.22)),
      ),
      child: Text(
        label,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
