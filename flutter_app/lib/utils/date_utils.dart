import 'package:intl/intl.dart';

class AppDateUtils {
  const AppDateUtils._();

  static DateTime startOfWeek(DateTime date) {
    final normalized = DateTime(date.year, date.month, date.day);
    final delta = normalized.weekday - DateTime.monday;
    return normalized.subtract(Duration(days: delta));
  }

  static DateTime endOfWeek(DateTime date) {
    return startOfWeek(date).add(const Duration(days: 6));
  }

  static String apiDate(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  static String shortDate(DateTime date) {
    return DateFormat('dd/MM/yyyy').format(date);
  }

  static String shortTime(DateTime date) {
    return DateFormat('HH:mm').format(date);
  }

  static String weekdayLabel(DateTime date) {
    return DateFormat('EEEE', 'fr_FR').format(date);
  }

  static String monthLabel(DateTime date) {
    return DateFormat('MMMM yyyy', 'fr_FR').format(date);
  }

  static String relativeDayLabel(DateTime date) {
    final today = DateTime.now();
    final normalizedToday = DateTime(today.year, today.month, today.day);
    final normalizedDate = DateTime(date.year, date.month, date.day);
    final difference = normalizedDate.difference(normalizedToday).inDays;

    if (difference == 0) {
      return 'Aujourd\'hui';
    }
    if (difference == -1) {
      return 'Hier';
    }
    if (difference == 1) {
      return 'Demain';
    }
    return '${weekdayLabel(date)} ${DateFormat('dd/MM').format(date)}';
  }
}
