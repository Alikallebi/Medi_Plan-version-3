import 'package:flutter/material.dart';

import '../models/notification.dart';
import '../utils/date_utils.dart';

class NotificationCard extends StatelessWidget {
  const NotificationCard({
    super.key,
    required this.notification,
    required this.onTap,
    this.footer,
  });

  final AppNotification notification;
  final VoidCallback onTap;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final unread = notification.isUnread;
    return Material(
      color: unread ? const Color(0xFFEFF7FF) : Colors.white,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              CircleAvatar(
                backgroundColor: unread
                    ? const Color(0xFF0F6CBD).withOpacity(0.14)
                    : const Color(0xFFF4F7FB),
                foregroundColor:
                    unread ? const Color(0xFF0F6CBD) : const Color(0xFF64748B),
                child: Icon(_iconForType(notification.type)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            notification.titre,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight:
                                      unread ? FontWeight.w800 : FontWeight.w700,
                                ),
                          ),
                        ),
                        Text(
                          AppDateUtils.shortDate(notification.dateCreation),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      notification.message,
                      maxLines: footer == null ? 3 : 5,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    if (footer != null) ...<Widget>[
                      const SizedBox(height: 14),
                      footer!,
                    ],
                  ],
                ),
              ),
              if (unread) ...<Widget>[
                const SizedBox(width: 8),
                const Icon(Icons.fiber_manual_record, size: 10, color: Color(0xFF0F6CBD)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  IconData _iconForType(String type) {
    final normalized = type.toUpperCase();
    if (normalized.contains('WORKFLOW')) {
      return Icons.account_tree_outlined;
    }
    if (normalized.contains('DEMANDE')) {
      return Icons.assignment_turned_in_outlined;
    }
    if (normalized.contains('ARRET')) {
      return Icons.health_and_safety_outlined;
    }
    return Icons.notifications_active_outlined;
  }
}
