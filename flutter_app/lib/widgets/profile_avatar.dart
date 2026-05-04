import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.radius = 28,
  });

  final String name;
  final String? photoUrl;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(name);
    final validUrl = (photoUrl ?? '').trim();

    if (validUrl.isNotEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: Colors.white,
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: validUrl,
            width: radius * 2,
            height: radius * 2,
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) => _fallback(initials),
          ),
        ),
      );
    }

    return _fallback(initials);
  }

  Widget _fallback(String initials) {
    return CircleAvatar(
      radius: radius,
      backgroundColor: const Color(0xFFEAF4FF),
      foregroundColor: const Color(0xFF0F6CBD),
      child: Text(
        initials,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: radius * 0.6,
        ),
      ),
    );
  }

  String _initials(String value) {
    final parts = value.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) {
      return 'MP';
    }
    if (parts.length == 1) {
      return parts.first.substring(0, 1).toUpperCase();
    }
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
}
