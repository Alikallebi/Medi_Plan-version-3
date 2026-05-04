import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class CustomBottomNavBar extends StatelessWidget {
  const CustomBottomNavBar({
    super.key,
    required this.currentIndex,
    required this.unreadCount,
  });

  final int currentIndex;
  final int unreadCount;

  static const List<String> _routes = <String>[
    '/dashboard',
    '/planning',
    '/demandes',
    '/notifications',
    '/profile',
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x120F6CBD),
                blurRadius: 24,
                offset: Offset(0, 12),
              ),
            ],
          ),
          child: NavigationBar(
            height: 70,
            selectedIndex: currentIndex,
            backgroundColor: Colors.transparent,
            indicatorColor: const Color(0xFFEAF4FF),
            onDestinationSelected: (int index) {
              if (index == currentIndex) {
                return;
              }
              context.go(_routes[index]);
            },
            destinations: <NavigationDestination>[
              const NavigationDestination(
                icon: Icon(Icons.space_dashboard_outlined),
                selectedIcon: Icon(Icons.space_dashboard),
                label: 'Accueil',
              ),
              const NavigationDestination(
                icon: Icon(Icons.calendar_month_outlined),
                selectedIcon: Icon(Icons.calendar_month),
                label: 'Planning',
              ),
              const NavigationDestination(
                icon: Icon(Icons.assignment_outlined),
                selectedIcon: Icon(Icons.assignment),
                label: 'Demandes',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: unreadCount > 0,
                  label: Text(unreadCount.toString()),
                  child: const Icon(Icons.notifications_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: unreadCount > 0,
                  label: Text(unreadCount.toString()),
                  child: const Icon(Icons.notifications),
                ),
                label: 'Alertes',
              ),
              const NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Profil',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
