import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/demande_provider.dart';
import '../providers/planning_provider.dart';
import '../utils/date_utils.dart';
import '../utils/helpers.dart';

class DemandeFormScreen extends ConsumerStatefulWidget {
  const DemandeFormScreen({
    super.key,
    this.initialDate,
  });

  final DateTime? initialDate;

  @override
  ConsumerState<DemandeFormScreen> createState() => _DemandeFormScreenState();
}

class _DemandeFormScreenState extends ConsumerState<DemandeFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _commentController = TextEditingController();
  String? _selectedType;
  late DateTime _selectedDate;
  TimeOfDay? _startTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay? _endTime = const TimeOfDay(hour: 16, minute: 0);
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _selectedDate = widget.initialDate ?? DateTime.now();
    Future.microtask(() async {
      await ref
          .read(planningProvider.notifier)
          .loadWeek(AppDateUtils.startOfWeek(_selectedDate));
      await ref.read(demandeProvider.notifier).loadMyDemandes();
      if (!mounted) {
        return;
      }
      _ensureValidSelectedType();
    });
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  bool get _isArret {
    final type = (_selectedType ?? '').toUpperCase();
    return type == 'ARRET' || type == 'AT';
  }

  bool get _isHs => (_selectedType ?? '').toUpperCase() == 'HS';

  bool get _usesTimeRange {
    final type = (_selectedType ?? '').toUpperCase();
    return type == 'HS' ||
        type == 'AS' ||
        type == 'RC+' ||
        type == 'RC-' ||
        type == 'ABSENCE' ||
        type == 'AL';
  }

  bool get _isAstreinteOnlyDay => !_hasPlanningOnSelectedDate();

  List<dynamic> _availableOptions(List<dynamic> options) {
    if (!_isAstreinteOnlyDay) {
      return options;
    }
    return options.where((item) => '${item.code}'.toUpperCase() == 'AS').toList();
  }

  double get _durationHours {
    if (_isArret || _startTime == null || _endTime == null) {
      return 0;
    }
    final start = _startTime!.hour * 60 + _startTime!.minute;
    final end = _endTime!.hour * 60 + _endTime!.minute;
    if (end <= start) {
      return 0;
    }
    return (end - start) / 60;
  }

  Future<void> _pickDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (selected != null) {
      setState(() => _selectedDate = selected);
      await ref
          .read(planningProvider.notifier)
          .loadWeek(AppDateUtils.startOfWeek(selected));
      if (!mounted) {
        return;
      }
      _ensureValidSelectedType();
      _applySuggestedTimes(force: _isHs);
    }
  }

  Future<void> _pickStartTime() async {
    final selected = await showTimePicker(
      context: context,
      initialTime: _startTime ?? const TimeOfDay(hour: 8, minute: 0),
    );
    if (selected != null) {
      setState(() => _startTime = selected);
    }
  }

  Future<void> _pickEndTime() async {
    final selected = await showTimePicker(
      context: context,
      initialTime: _endTime ?? const TimeOfDay(hour: 16, minute: 0),
    );
    if (selected != null) {
      setState(() => _endTime = selected);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_isAstreinteOnlyDay && (_selectedType ?? '').toUpperCase() != 'AS') {
      AppHelpers.showErrorSnackBar(
        context,
        'Sur un jour sans planning, seule une demande d astreinte est autorisee.',
      );
      return;
    }

    final today = DateTime.now();
    final normalizedToday = DateTime(today.year, today.month, today.day);
    final normalizedSelectedDate =
        DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
    if (normalizedSelectedDate.isBefore(normalizedToday)) {
      AppHelpers.showErrorSnackBar(
        context,
        'Les demandes pour des jours deja passes ne sont pas autorisees.',
      );
      return;
    }

    if (_usesTimeRange && _selectedDate.year == DateTime.now().year &&
        _selectedDate.month == DateTime.now().month &&
        _selectedDate.day == DateTime.now().day) {
      final now = TimeOfDay.now();
      final start = (_startTime?.hour ?? 0) * 60 + (_startTime?.minute ?? 0);
      final nowMinutes = now.hour * 60 + now.minute;
      if (start < nowMinutes) {
        AppHelpers.showErrorSnackBar(
          context,
          'L heure de debut doit etre posterieure a l heure actuelle.',
        );
        return;
      }
    }

    if (_isHs) {
      final minimumStart = _minimumHsStartMinutes();
      final start = (_startTime?.hour ?? 0) * 60 + (_startTime?.minute ?? 0);
      if (minimumStart != null && start < minimumStart) {
        final hh = (minimumStart ~/ 60).toString().padLeft(2, '0');
        final mm = (minimumStart % 60).toString().padLeft(2, '0');
        AppHelpers.showErrorSnackBar(
          context,
          'La demande HS doit commencer a partir de $hh:$mm.',
        );
        return;
      }
    }

    final planningState = ref.read(planningProvider);
    if ((_selectedType ?? '').toUpperCase() == 'RC+' &&
        _durationHours > (planningState.compteurs?.soldeRcPlus ?? 0)) {
      AppHelpers.showErrorSnackBar(
        context,
        'Solde RC+ insuffisant pour cette demande.',
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(demandeProvider.notifier).createDemande(
            type: _selectedType!,
            date: _selectedDate,
            heureDebut: (_isArret || !_usesTimeRange) ? null : _toTimeString(_startTime),
            heureFin: (_isArret || !_usesTimeRange) ? null : _toTimeString(_endTime),
            commentaire:
                _commentController.text.trim().isEmpty ? null : _commentController.text.trim(),
          );
      if (!mounted) {
        return;
      }
      AppHelpers.showSuccessSnackBar(context, 'Demande envoyee avec succes.');
      context.go('/demandes');
    } catch (error) {
      if (!mounted) {
        return;
      }
      AppHelpers.showErrorSnackBar(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final demandeState = ref.watch(demandeProvider);
    final options = _availableOptions(demandeState.typeOptions);

    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle demande')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: const Color(0xFFEAF4FF),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Text(
              'Creez une demande d absence, RC ou heures supplementaires.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Form(
                key: _formKey,
                child: Column(
                  children: <Widget>[
                    DropdownButtonFormField<String>(
                      value: _selectedType,
                      decoration: const InputDecoration(
                        labelText: 'Type de demande',
                        prefixIcon: Icon(Icons.category_outlined),
                      ),
                      items: options.map((item) {
                        return DropdownMenuItem<String>(
                          value: item.code,
                          child: Text(item.label),
                        );
                      }).toList(),
                      onChanged: (String? value) {
                        setState(() => _selectedType = value);
                        _applySuggestedTimes(force: (_selectedType ?? '').toUpperCase() == 'HS');
                      },
                      validator: (String? value) {
                        if (value == null) {
                          return 'Veuillez choisir un type.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    ListTile(
                      tileColor: const Color(0xFFF7FBFF),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                      onTap: _pickDate,
                      title: const Text('Date'),
                      subtitle: Text(AppDateUtils.shortDate(_selectedDate)),
                      trailing: const Icon(Icons.calendar_today_outlined),
                    ),
                    const SizedBox(height: 16),
                    if (_isAstreinteOnlyDay)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF8E8),
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: const Text(
                          'Ce jour ne contient aucun planning. Seule une demande d astreinte est autorisee.',
                        ),
                      ),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: ListTile(
                            tileColor: _isArret ? const Color(0xFFF2F4F8) : const Color(0xFFF7FBFF),
                            enabled: _usesTimeRange,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
                            ),
                            onTap: !_usesTimeRange ? null : _pickStartTime,
                            title: const Text('Heure debut'),
                            subtitle: Text(_toTimeString(_startTime)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ListTile(
                            tileColor: _isArret ? const Color(0xFFF2F4F8) : const Color(0xFFF7FBFF),
                            enabled: _usesTimeRange,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
                            ),
                            onTap: !_usesTimeRange ? null : _pickEndTime,
                            title: const Text('Heure fin'),
                            subtitle: Text(_toTimeString(_endTime)),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _commentController,
                      minLines: 3,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Commentaire',
                        alignLabelWithHint: true,
                        prefixIcon: Icon(Icons.notes_outlined),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF4F7FB),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text(
                        'Duree calculee : ${_usesTimeRange ? _durationHours.toStringAsFixed(2) : "0.00"} h',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: _submitting ? null : _submit,
                      child: _submitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Envoyer'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _toTimeString(TimeOfDay? time) {
    if (time == null) {
      return '00:00';
    }
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  void _applySuggestedTimes({bool force = false}) {
    if (!_usesTimeRange) {
      setState(() {
        _startTime = const TimeOfDay(hour: 0, minute: 0);
        _endTime = const TimeOfDay(hour: 0, minute: 0);
      });
      return;
    }

    final minimum = _isHs ? _minimumHsStartMinutes() : _currentMinutesIfToday();
    if (minimum == null) {
      return;
    }

    final currentStart = (_startTime?.hour ?? 0) * 60 + (_startTime?.minute ?? 0);
    final currentEnd = (_endTime?.hour ?? 0) * 60 + (_endTime?.minute ?? 0);
    final nextStart = force || currentStart < minimum ? minimum : currentStart;
    final nextEnd = currentEnd <= nextStart ? nextStart + 60 : currentEnd;

    setState(() {
      _startTime = TimeOfDay(hour: (nextStart ~/ 60) % 24, minute: nextStart % 60);
      _endTime = TimeOfDay(hour: (nextEnd ~/ 60) % 24, minute: nextEnd % 60);
    });
  }

  int? _minimumHsStartMinutes() {
    final plannedEnd = _plannedEndMinutesForSelectedDate();
    final now = _currentMinutesIfToday();
    if (plannedEnd == null) {
      return now;
    }
    if (now == null) {
      return plannedEnd;
    }
    return plannedEnd > now ? plannedEnd : now;
  }

  int? _currentMinutesIfToday() {
    final now = DateTime.now();
    if (_selectedDate.year != now.year ||
        _selectedDate.month != now.month ||
        _selectedDate.day != now.day) {
      return null;
    }
    return now.hour * 60 + now.minute;
  }

  int? _plannedEndMinutesForSelectedDate() {
    final weekPlanning = ref.read(planningProvider).weekPlanning;
    if (weekPlanning == null) {
      return null;
    }

    for (final day in weekPlanning.days) {
      if (day.date.year != _selectedDate.year ||
          day.date.month != _selectedDate.month ||
          day.date.day != _selectedDate.day) {
        continue;
      }

      int? maxEnd;
      for (final entry in day.entries) {
        final end = entry.heureFin;
        if (end == null || !RegExp(r'^\d{2}:\d{2}$').hasMatch(end)) {
          continue;
        }
        final parts = end.split(':');
        final minutes = int.parse(parts[0]) * 60 + int.parse(parts[1]);
        if (maxEnd == null || minutes > maxEnd) {
          maxEnd = minutes;
        }
      }
      return maxEnd;
    }

    return null;
  }

  bool _hasPlanningOnSelectedDate() {
    final weekPlanning = ref.read(planningProvider).weekPlanning;
    if (weekPlanning == null) {
      return false;
    }

    for (final day in weekPlanning.days) {
      if (day.date.year == _selectedDate.year &&
          day.date.month == _selectedDate.month &&
          day.date.day == _selectedDate.day) {
        return day.entries.isNotEmpty;
      }
    }

    return false;
  }

  void _ensureValidSelectedType() {
    final options = _availableOptions(ref.read(demandeProvider).typeOptions);
    if (options.isEmpty) {
      setState(() {
        _selectedType = null;
      });
      return;
    }

    final current = (_selectedType ?? '').toUpperCase();
    final exists = options.any((item) => '${item.code}'.toUpperCase() == current);
    if (!exists) {
      setState(() {
        _selectedType = '${options.first.code}';
      });
    }
  }
}
