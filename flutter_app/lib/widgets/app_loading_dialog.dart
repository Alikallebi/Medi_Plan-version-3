import 'package:flutter/material.dart';

class AppLoadingDialog extends StatelessWidget {
  final String? message;

  const AppLoadingDialog({
    Key? key,
    this.message,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                strokeWidth: 2,
              ),
            ),
            const SizedBox(height: 16),
            if (message != null)
              Text(
                message!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14),
              ),
          ],
        ),
      ),
    );
  }
}
