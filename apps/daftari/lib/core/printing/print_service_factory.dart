// Copyright (c) 2024 Daftari POS. All rights reserved.

/// Factory for creating platform-specific PrintService implementations.
library;

import 'package:flutter/foundation.dart';

import 'print_service_desktop.dart';
import 'print_service_health_guard.dart';
import 'print_service_interface.dart';
import 'print_service_stub.dart';

/// Factory for creating PrintService instances.
class PrintServiceFactory {
  static PrintService? _instance;

  /// Get or create the platform-appropriate PrintService (singleton).
  static PrintService get instance {
    _instance ??= _createService();
    return _instance!;
  }

  /// Create a new platform-specific PrintService instance (non-singleton).
  static PrintService create() {
    return _createService();
  }

  /// Create platform-specific service.
  ///
  /// Windows and Linux builds talk to the local PrintServer sidecar through
  /// the health-checked desktop client. Every other target (web, macOS,
  /// mobile) has no local print server, so the no-op stub is returned.
  static PrintService _createService() {
    return createForPlatform(
      isWeb: kIsWeb,
      targetPlatform: defaultTargetPlatform,
    );
  }

  /// Creates the service for an explicit platform.
  ///
  /// The platform arguments are explicit so the whole platform matrix can be
  /// covered without depending on the host the tests run on.
  static PrintService createForPlatform({
    required bool isWeb,
    required TargetPlatform targetPlatform,
  }) {
    if (!isWeb &&
        (targetPlatform == TargetPlatform.windows ||
            targetPlatform == TargetPlatform.linux)) {
      return PrintServiceHealthGuard(PrintServiceDesktop());
    }
    return PrintServiceStub();
  }

  /// Override for testing.
  static void overrideForTesting(PrintService service) {
    _instance = service;
  }

  /// Reset singleton (for testing).
  static void reset() {
    _instance = null;
  }
}
