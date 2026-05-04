import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../utils/helpers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  late final TextEditingController _passwordController;
  bool _hidePassword = true;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
    _passwordController = TextEditingController();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    await ref.read(authControllerProvider).login(
          email: _emailController.text.trim(),
          password: _passwordController.text.trim(),
        );

    final state = ref.read(authControllerProvider).state;
    if (!mounted) {
      return;
    }

    if (state.isAuthenticated) {
      context.go('/dashboard');
      return;
    }

    if (state.error != null) {
      AppHelpers.showErrorSnackBar(context, state.error!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final theme = Theme.of(context);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFF0B3B5F), // Bleu profond médical
              const Color(0xFF1B5A7A),
              const Color(0xFF2C7DA0),
            ],
            stops: const [0.0, 0.5, 1.0],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo avec animation et ombre
                  TweenAnimationBuilder(
                    tween: Tween<double>(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 800),
                    builder: (context, double value, child) {
                      return Transform.scale(
                        scale: value,
                        child: Opacity(
                          opacity: value,
                          child: child,
                        ),
                      );
                    },
                    child: Container(
                      width: 200,
                      height: 120,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(32),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.25),
                            blurRadius: 30,
                            offset: const Offset(0, 15),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Image.asset(
                        'assets/images/logo.png',
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  // Titre principal
                  Text(
                    'MediPlan',
                    style: theme.textTheme.headlineLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 32,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Gestion mobile du planning médical',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: Colors.white.withOpacity(0.85),
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 48),
                  // Carte de connexion
                  TweenAnimationBuilder(
                    tween: Tween<double>(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 900),
                    curve: Curves.easeOutCubic,
                    builder: (context, double value, child) {
                      return Transform.translate(
                        offset: Offset(0, 30 * (1 - value)),
                        child: Opacity(
                          opacity: value,
                          child: child,
                        ),
                      );
                    },
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(32),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.15),
                            blurRadius: 40,
                            offset: const Offset(0, 20),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Connexion',
                                style: theme.textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: const Color(0xFF0B3B5F),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Accédez à votre espace staff, chef ou super admin.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: const Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 32),
                              // Champ email avec icône et bordure personnalisée
                              TextFormField(
                                controller: _emailController,
                                keyboardType: TextInputType.emailAddress,
                                decoration: InputDecoration(
                                  labelText: 'Email',
                                  labelStyle: const TextStyle(color: Color(0xFF64748B)),
                                  prefixIcon: Container(
                                    margin: const EdgeInsets.only(right: 8),
                                    child: const Icon(
                                      Icons.mail_outline,
                                      color: Color(0xFF2C7DA0),
                                    ),
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    borderSide: BorderSide(color: Colors.grey.shade300),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    borderSide: BorderSide(color: Colors.grey.shade300),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF2C7DA0),
                                      width: 2,
                                    ),
                                  ),
                                  filled: true,
                                  fillColor: const Color(0xFFF8FAFC),
                                ),
                                validator: (value) {
                                  if (value == null || value.trim().isEmpty) {
                                    return 'Veuillez saisir votre email.';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 20),
                              // Champ mot de passe
                              TextFormField(
                                controller: _passwordController,
                                obscureText: _hidePassword,
                                decoration: InputDecoration(
                                  labelText: 'Mot de passe',
                                  labelStyle: const TextStyle(color: Color(0xFF64748B)),
                                  prefixIcon: Container(
                                    margin: const EdgeInsets.only(right: 8),
                                    child: const Icon(
                                      Icons.lock_outline,
                                      color: Color(0xFF2C7DA0),
                                    ),
                                  ),
                                  suffixIcon: IconButton(
                                    onPressed: () {
                                      setState(() => _hidePassword = !_hidePassword);
                                    },
                                    icon: Icon(
                                      _hidePassword
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                      color: const Color(0xFF64748B),
                                    ),
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    borderSide: BorderSide(color: Colors.grey.shade300),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    borderSide: BorderSide(color: Colors.grey.shade300),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    borderSide: const BorderSide(
                                      color: Color(0xFF2C7DA0),
                                      width: 2,
                                    ),
                                  ),
                                  filled: true,
                                  fillColor: const Color(0xFFF8FAFC),
                                ),
                                validator: (value) {
                                  if (value == null || value.trim().isEmpty) {
                                    return 'Veuillez saisir votre mot de passe.';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 32),
                              // Bouton de connexion avec effet de gradient
                              Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  gradient: const LinearGradient(
                                    colors: [Color(0xFF2C7DA0), Color(0xFF1B5A7A)],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF2C7DA0).withOpacity(0.4),
                                      blurRadius: 12,
                                      offset: const Offset(0, 6),
                                    ),
                                  ],
                                ),
                                child: FilledButton(
                                  onPressed: auth.loading ? null : _submit,
                                  style: FilledButton.styleFrom(
                                    backgroundColor: Colors.transparent,
                                    shadowColor: Colors.transparent,
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                  child: auth.loading
                                      ? const SizedBox(
                                          width: 24,
                                          height: 24,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Text(
                                          'Se connecter',
                                          style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w600,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                ),
                              ),
                              const SizedBox(height: 16),
                              // Lien "Mot de passe oublié ?" (optionnel)
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: () {
                                    // Ajouter la logique de récupération de mot de passe si besoin
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Fonctionnalité à venir'),
                                        behavior: SnackBarBehavior.floating,
                                      ),
                                    );
                                  },
                                  style: TextButton.styleFrom(
                                    foregroundColor: const Color(0xFF2C7DA0),
                                  ),
                                  child: const Text('Mot de passe oublié ?'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}