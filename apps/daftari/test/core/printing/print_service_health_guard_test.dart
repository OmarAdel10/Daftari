// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'package:daftari/core/printing/print_service_health_guard.dart';
import 'package:daftari/core/printing/print_service_interface.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PrintServiceHealthGuard', () {
    test(
      'throws a PrintException when the print server is unhealthy',
      () async {
        final inner = _FakePrintService(healthy: false);
        final guard = PrintServiceHealthGuard(inner);

        await expectLater(
          guard.printReceipt(const {'id': 'r1'}),
          throwsA(
            isA<PrintException>().having(
              (e) => e.message,
              'message',
              contains('http://127.0.0.1:5150'),
            ),
          ),
        );
        expect(inner.printReceiptCalls, isEmpty);
      },
    );

    test('prints through when the print server is healthy', () async {
      final inner = _FakePrintService(healthy: true);
      final guard = PrintServiceHealthGuard(inner);

      await guard.printReceipt(const {'id': 'r1'});

      expect(inner.printReceiptCalls, hasLength(1));
    });

    test('guards every operation that produces output', () async {
      final inner = _FakePrintService(healthy: false);
      final guard = PrintServiceHealthGuard(inner);

      await expectLater(
        guard.printBarcode(const {}),
        throwsA(isA<PrintException>()),
      );
      await expectLater(
        guard.printTicket(const {}),
        throwsA(isA<PrintException>()),
      );
      await expectLater(
        guard.saveReceiptPng(const {}),
        throwsA(isA<PrintException>()),
      );
      await expectLater(
        guard.saveReceiptPdf(const {}),
        throwsA(isA<PrintException>()),
      );
      await expectLater(
        guard.saveSalesPdf(const {}),
        throwsA(isA<PrintException>()),
      );

      expect(inner.printBarcodeCalls, isEmpty);
      expect(inner.printTicketCalls, isEmpty);
      expect(inner.saveReceiptPngCalls, isEmpty);
      expect(inner.saveReceiptPdfCalls, isEmpty);
      expect(inner.saveSalesPdfCalls, isEmpty);
    });

    test('runs the operation when healthy', () async {
      final inner = _FakePrintService(healthy: true);
      final guard = PrintServiceHealthGuard(inner);

      await guard.printBarcode(const {});
      await guard.printTicket(const {});
      await guard.saveReceiptPng(const {});
      await guard.saveReceiptPdf(const {});
      await guard.saveSalesPdf(const {});

      expect(inner.printBarcodeCalls, hasLength(1));
      expect(inner.printTicketCalls, hasLength(1));
      expect(inner.saveReceiptPngCalls, hasLength(1));
      expect(inner.saveReceiptPdfCalls, hasLength(1));
      expect(inner.saveSalesPdfCalls, hasLength(1));
    });

    test('healthCheck delegates to the inner service', () async {
      final inner = _FakePrintService(healthy: true);
      final guard = PrintServiceHealthGuard(inner);

      expect(await guard.healthCheck(), isTrue);
      expect(inner.healthCheckCalls, 1);
    });

    test('delegates the read-only operations without a health check', () async {
      final inner = _FakePrintService(healthy: false);
      final guard = PrintServiceHealthGuard(inner);

      expect(await guard.getLocalPrinters(), ['Test Printer']);
      expect(await guard.validateSvg('data'), isEmpty);
      expect(inner.healthCheckCalls, 0);
    });

    test('exposes the inner service and its base url', () {
      final inner = _FakePrintService(healthy: true);
      final guard = PrintServiceHealthGuard(inner);

      expect(guard.inner, same(inner));
      expect(guard.baseUrl, 'http://127.0.0.1:5150');
    });

    test('dispose disposes the inner service', () {
      final inner = _FakePrintService(healthy: true);
      final guard = PrintServiceHealthGuard(inner);

      guard.dispose();

      expect(inner.disposed, isTrue);
    });
  });
}

class _FakePrintService implements PrintService {
  _FakePrintService({required this.healthy});

  final bool healthy;

  final List<Map<String, dynamic>> printReceiptCalls = [];
  final List<Map<String, dynamic>> printBarcodeCalls = [];
  final List<Map<String, dynamic>> printTicketCalls = [];
  final List<Map<String, dynamic>> saveReceiptPngCalls = [];
  final List<Map<String, dynamic>> saveReceiptPdfCalls = [];
  final List<Map<String, dynamic>> saveSalesPdfCalls = [];
  int healthCheckCalls = 0;
  bool disposed = false;

  @override
  String get baseUrl => 'http://127.0.0.1:5150';

  @override
  Future<bool> healthCheck() async {
    healthCheckCalls++;
    return healthy;
  }

  @override
  Future<List<String>> getLocalPrinters() async => ['Test Printer'];

  @override
  Future<void> printReceipt(Map<String, dynamic> payload) async {
    printReceiptCalls.add(payload);
  }

  @override
  Future<void> printBarcode(Map<String, dynamic> payload) async {
    printBarcodeCalls.add(payload);
  }

  @override
  Future<void> printTicket(Map<String, dynamic> payload) async {
    printTicketCalls.add(payload);
  }

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> payload) async {
    saveReceiptPngCalls.add(payload);
    return '/tmp/receipt.png';
  }

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> payload) async {
    saveReceiptPdfCalls.add(payload);
    return '/tmp/receipt.pdf';
  }

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> payload) async {
    saveSalesPdfCalls.add(payload);
    return '/tmp/sales.pdf';
  }

  @override
  Future<List<String>> validateSvg(String base64Data) async => [];

  @override
  void dispose() {
    disposed = true;
  }
}
