import 'package:flutter/material.dart';

import '../models/demande.dart';
import '../utils/date_utils.dart';
import '../utils/helpers.dart';

class DemandeCard extends StatelessWidget {
  const DemandeCard({
    super.key,
    required this.demande,
    required this.typeLabel,
    this.title,
    this.subtitle,
    this.actions = const <Widget>[],
  });

  final Demande demande;
  final String typeLabel;
  final String? title;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final tone = AppHelpers.demandeStatusColor(demande.statut);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: tone.withOpacity(0.16)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                CircleAvatar(
                  backgroundColor: tone.withOpacity(0.12),
                  foregroundColor: tone,
                  child: Icon(AppHelpers.demandeTypeIcon(demande.type)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        title ?? typeLabel,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      if ((subtitle ?? '').isNotEmpty)
                        Text(
                          subtitle!,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    ],
                  ),
                ),
                Chip(
                  backgroundColor: tone.withOpacity(0.12),
                  label: Text(
                    demande.statutLabel,
                    style: TextStyle(
                      color: tone,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                _InfoPill(
                  icon: Icons.calendar_today_outlined,
                  label: AppDateUtils.shortDate(demande.date),
                ),
                _InfoPill(
                  icon: Icons.schedule_outlined,
                  label: '${demande.heureDebut} - ${demande.heureFin}',
                ),
                _InfoPill(
                  icon: Icons.timelapse_outlined,
                  label: '${demande.dureeHeures.toStringAsFixed(2)} h',
                ),
              ],
            ),
            if ((demande.commentaire ?? '').isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              Text(
                demande.commentaire!,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
            if ((demande.motifRejet ?? '').isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF3F1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  'Motif de rejet : ${demande.motifRejet}',
                  style: const TextStyle(
                    color: Color(0xFFC62828),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
            if (actions.isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              Wrap(spacing: 8, runSpacing: 8, children: actions),
            ],
          ],
        ),
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF4F7FB),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 16, color: const Color(0xFF64748B)),
            const SizedBox(width: 6),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
