import 'package:flutter/material.dart';

import '../models/demande.dart';
import '../models/user.dart';

class AppHelpers {
  const AppHelpers._();

  static void showErrorSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFFB3261E),
      ),
    );
  }

  static void showSuccessSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFF0A8F5A),
      ),
    );
  }

  static String roleLabel(UserSession user) {
    final role = user.normalizedRole;
    if (role.contains('SUPER')) {
      return 'Super admin';
    }
    if (role.contains('POLE')) {
      return 'Chef de pole';
    }
    if (role.contains('CHEF')) {
      return 'Chef de service';
    }
    return 'Staff';
  }

  static Color shiftColor(String? shiftType) {
    final normalized = (shiftType ?? '').toUpperCase();
    if (normalized.contains('NUIT')) {
      return const Color(0xFF1E3A8A);
    }
    if (normalized.contains('GARDE')) {
      return const Color(0xFF7C3AED);
    }
    if (normalized.contains('SOIR')) {
      return const Color(0xFFEA580C);
    }
    return const Color(0xFF0F6CBD);
  }

  static Color demandeStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'APPROUVEE':
        return const Color(0xFF0A8F5A);
      case 'REJETEE':
        return const Color(0xFFC62828);
      case 'EN_ATTENTE':
        return const Color(0xFFEF8C00);
      case 'INFORMATIF':
        return const Color(0xFF0F6CBD);
      default:
        return const Color(0xFF64748B);
    }
  }

  static IconData demandeTypeIcon(String type) {
    switch (type.toUpperCase()) {
      case 'HS':
        return Icons.more_time_outlined;
      case 'RC+':
        return Icons.trending_up_outlined;
      case 'RC-':
        return Icons.trending_down_outlined;
      case 'ARRET':
      case 'AT':
        return Icons.health_and_safety_outlined;
      case 'ABSENCE':
      case 'AS':
      case 'AL':
      case 'VA':
        return Icons.beach_access_outlined;
      default:
        return Icons.description_outlined;
    }
  }

  static String demandeTypeLabel(String type, List<DemandeTypeOption> options) {
    final match = options.where((DemandeTypeOption item) => item.code == type);
    if (match.isNotEmpty) {
      return match.first.label;
    }
    return type;
  }
}
