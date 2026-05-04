import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class BottomNavBar extends StatelessWidget {
  const BottomNavBar({
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
    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: (int index) {
        if (index == currentIndex) {
          return;
        }
        context.go(_routes[index]);
      },
      destinations: <NavigationDestination>[
        const NavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          selectedIcon: Icon(Icons.dashboard),
          label: 'Accueil',
        ),
        const NavigationDestination(
          icon: Icon(Icons.calendar_month_outlined),
          selectedIcon: Icon(Icons.calendar_month),
          label: 'Planning',
        ),
        const NavigationDestination(
          icon: Icon(Icons.description_outlined),
          selectedIcon: Icon(Icons.description),
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
          label: 'Notifications',
        ),
        const NavigationDestination(
          icon: Icon(Icons.person_outline),
          selectedIcon: Icon(Icons.person),
          label: 'Profil',
        ),
      ],
    );
  }
}
