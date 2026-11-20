// Copyright (c) 2024 Daftari POS. All rights reserved.

/// Health-checked wrapper around a [PrintService].
///
/// The PrintServer sidecar runs as a separate process. When it is not
/// running, a print request fails without telling the cashier anything
/// useful. This wrapper checks the sidecar before every operation that
/// produces output and fails fast with a clear [PrintException] instead of
/// leaving the user with a silent no-op.
library;

import 'print_service_interface.dart';

/// A [PrintService] that verifies the print server is reachable before it
/// runs an operation that produces output.
class PrintServiceHealthGuard implements PrintService {
  /// Creates a guard around [inner].
  PrintServiceHealthGuard(this.inner);

  /// The wrapped print service.
  final PrintService inner;

  @override
  String get baseUrl => inner.baseUrl;

  @override
  Future<List<String>> getLocalPrinters() => inner.getLocalPrinters();

  @override
  Future<void> printReceipt(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    await inner.printReceipt(payload);
  }

  @override
  Future<void> printBarcode(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    await inner.printBarcode(payload);
  }

  @override
  Future<void> printTicket(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    await inner.printTicket(payload);
  }

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    return inner.saveReceiptPng(payload);
  }

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    return inner.saveReceiptPdf(payload);
  }

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    return inner.saveSalesPdf(payload);
  }

  @override
  Future<List<String>> validateSvg(String base64Data) =>
      inner.validateSvg(base64Data);

  @override
  Future<bool> healthCheck() => inner.healthCheck();

  @override
  void dispose() => inner.dispose();

  /// Fails with a [PrintException] when the print server is not reachable.
  Future<void> _ensurePrintServerAvailable() async {
    if (await inner.healthCheck()) {
      return;
    }
    throw PrintException(
      'Print server is not running at ${inner.baseUrl}. '
      'Start the print service and try again.',
    );
  }
}
