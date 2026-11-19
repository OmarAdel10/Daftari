// Copyright (c) 2024 Daftari POS. All rights reserved.

/// Factory for creating platform-specific PrintService implementations.
library;

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
  static PrintService _createService() {
    // Platform detection would go here.
    // Until then the factory returns the no-op stub, so callers keep the
    // previous behaviour (successful calls, no output).
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
