import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  const AppTheme._();

  static const Color medicalBlue = Color(0xFF0F6CBD);
  static const Color medicalBlueDark = Color(0xFF0B4F8A);
  static const Color mint = Color(0xFF13A89E);
  static const Color softGreen = Color(0xFF0A8F5A);
  static const Color softOrange = Color(0xFFF59E0B);
  static const Color softRed = Color(0xFFC62828);
  static const Color shell = Color(0xFFF4F7FB);
  static const Color shellBlue = Color(0xFFEAF4FF);
  static const Color card = Colors.white;
  static const Color textStrong = Color(0xFF10243E);
  static const Color textMuted = Color(0xFF64748B);
  static const Color border = Color(0xFFD9E4F1);

  static ThemeData get lightTheme {
    final textTheme = GoogleFonts.manropeTextTheme().copyWith(
      headlineLarge: GoogleFonts.manrope(
        fontSize: 30,
        fontWeight: FontWeight.w800,
        color: textStrong,
      ),
      headlineMedium: GoogleFonts.manrope(
        fontSize: 24,
        fontWeight: FontWeight.w800,
        color: textStrong,
      ),
      headlineSmall: GoogleFonts.manrope(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: textStrong,
      ),
      titleLarge: GoogleFonts.manrope(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        color: textStrong,
      ),
      titleMedium: GoogleFonts.manrope(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: textStrong,
      ),
      bodyLarge: GoogleFonts.manrope(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: textStrong,
      ),
      bodyMedium: GoogleFonts.manrope(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: textStrong,
      ),
      bodySmall: GoogleFonts.manrope(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: textMuted,
      ),
      labelLarge: GoogleFonts.manrope(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: textStrong,
      ),
    );

    final colorScheme = ColorScheme.fromSeed(
      seedColor: medicalBlue,
      brightness: Brightness.light,
    ).copyWith(
      primary: medicalBlue,
      secondary: mint,
      surface: card,
      error: softRed,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: shell,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: shell,
        foregroundColor: textStrong,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shadowColor: medicalBlue.withOpacity(0.08),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        hintStyle: textTheme.bodyMedium?.copyWith(color: textMuted),
        labelStyle: textTheme.bodyMedium?.copyWith(color: textMuted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: medicalBlue, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: softRed),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: medicalBlue,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          textStyle: textTheme.labelLarge,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: medicalBlue,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          textStyle: textTheme.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: medicalBlue,
          side: const BorderSide(color: border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          textStyle: textTheme.labelLarge,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        side: BorderSide.none,
        labelStyle: textTheme.bodySmall,
      ),
      dividerTheme: const DividerThemeData(
        color: border,
        thickness: 1,
      ),
    );
  }
}
