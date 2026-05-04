import 'package:flutter/material.dart';

class CompteursWidget extends StatelessWidget {
  const CompteursWidget({
    super.key,
    required this.rcPlus,
    required this.rcMoins,
    this.onTapRcPlus,
    this.onTapRcMoins,
  });

  final String rcPlus;
  final String rcMoins;
  final VoidCallback? onTapRcPlus;
  final VoidCallback? onTapRcMoins;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(
          child: _CounterCard(
            label: 'RC+',
            value: rcPlus,
            icon: Icons.trending_up,
            tone: const Color(0xFF0A8F5A),
            onTap: onTapRcPlus,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _CounterCard(
            label: 'RC-',
            value: rcMoins,
            icon: Icons.trending_down,
            tone: const Color(0xFFEF8C00),
            onTap: onTapRcMoins,
          ),
        ),
      ],
    );
  }
}

class _CounterCard extends StatelessWidget {
  const _CounterCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.tone,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Ink(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: <Color>[
              tone.withOpacity(0.16),
              Colors.white,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: tone.withOpacity(0.18)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              CircleAvatar(
                radius: 18,
                backgroundColor: tone.withOpacity(0.14),
                foregroundColor: tone,
                child: Icon(icon, size: 18),
              ),
              const SizedBox(height: 14),
              Text(label, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 6),
              Text(
                value,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: const Color(0xFF10243E),
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
