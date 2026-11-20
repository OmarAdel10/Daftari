// Copyright (c) 2024 Daftari POS. All rights reserved.

/// Health-checked wrapper around a [PrintService].
///
/// The PrintServer sidecar runs as a separate process. When it is not
/// running, a print request fails without telling the cashier anything
/// useful. This wrapper checks the sidecar before every operation that
/// produces output and fails fast with a clear [PrintException] instead of
/// leaving the user with a silent no-op.
library;

import 'dart:async';

import 'print_service_interface.dart';

/// A [PrintService] that verifies the print server is reachable before it
/// runs an operation that produces output.
class PrintServiceHealthGuard implements PrintService {
  /// Creates a guard around [inner].
  ///
  /// [operationTimeout] bounds the health check and every print, export and
  /// save operation, so a sidecar that stops answering cannot leave the
  /// caller loading forever.
  PrintServiceHealthGuard(
    this.inner, {
    this.operationTimeout = const Duration(seconds: 30),
  });

  /// The wrapped print service.
  final PrintService inner;

  /// Deadline applied to the health check and to every output operation.
  final Duration operationTimeout;

  @override
  String get baseUrl => inner.baseUrl;

  @override
  Future<List<String>> getLocalPrinters() => inner.getLocalPrinters();

  @override
  Future<void> printReceipt(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    await _withDeadline(inner.printReceipt(payload), _operationTimeoutMessage);
  }

  @override
  Future<void> printBarcode(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    await _withDeadline(inner.printBarcode(payload), _operationTimeoutMessage);
  }

  @override
  Future<void> printTicket(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    await _withDeadline(inner.printTicket(payload), _operationTimeoutMessage);
  }

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    return _withDeadline(
      inner.saveReceiptPng(payload),
      _operationTimeoutMessage,
    );
  }

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    return _withDeadline(
      inner.saveReceiptPdf(payload),
      _operationTimeoutMessage,
    );
  }

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> payload) async {
    await _ensurePrintServerAvailable();
    return _withDeadline(inner.saveSalesPdf(payload), _operationTimeoutMessage);
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
    final healthy = await _runHealthCheck();
    if (healthy) {
      return;
    }
    throw PrintException(
      'Print server is not running at ${inner.baseUrl}. '
      'Start the print service and try again.',
    );
  }

  /// Runs the health check with a deadline and normalises its failures.
  Future<bool> _runHealthCheck() async {
    try {
      return await _withDeadline(inner.healthCheck(), _healthTimeoutMessage);
    } on PrintException {
      rethrow;
    } catch (e) {
      throw PrintException(
        'Print server health check failed at ${inner.baseUrl}. '
        'Start the print service and try again.',
        originalError: e,
      );
    }
  }

  /// Bounds [operation] and turns a missed deadline into a [PrintException].
  Future<T> _withDeadline<T>(Future<T> operation, String timeoutMessage) async {
    try {
      return await operation.timeout(operationTimeout);
    } on TimeoutException catch (e) {
      throw PrintException(timeoutMessage, originalError: e);
    }
  }

  String get _healthTimeoutMessage =>
      'Print server health check did not respond in time ($_deadlineLabel). '
      'Start the print service and try again.';

  String get _operationTimeoutMessage =>
      'Print server did not respond in time ($_deadlineLabel). '
      'The job may already have been printed - check the printer before retrying.';

  String get _deadlineLabel => operationTimeout.inMilliseconds >= 1000
      ? '${operationTimeout.inSeconds}s'
      : '${operationTimeout.inMilliseconds}ms';
}
