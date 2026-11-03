// Copyright (c) 2024 Daftari POS. All rights reserved.

/// PostHog Analytics Service for tracking events across all services.
class PostHogAnalytics {
  void track(String eventName, Map<String, dynamic> properties) {
    // ignore: avoid_print — TODO: migrate to structured logger (DAFTARI-160)
    print('[PostHog] $eventName: $properties');
  }

  void identify(String userId, Map<String, dynamic> traits) {
    // ignore: avoid_print — TODO: migrate to structured logger (DAFTARI-160)
    print('[PostHog] identify: $userId, $traits');
  }

  void captureException(
    Object error, {
    StackTrace? stackTrace,
    Map<String, dynamic>? context,
  }) {
    // ignore: avoid_print — TODO: migrate to structured logger (DAFTARI-160)
    print('[PostHog] Exception: $error, ${stackTrace ?? ''}');
  }
}
