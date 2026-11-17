// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'package:flutter_test/flutter_test.dart';
import 'package:daftari/core/printing/print_service_factory.dart';
import 'package:daftari/core/printing/print_service_interface.dart';
import 'package:daftari/core/printing/print_service_stub.dart';

void main() {
  group('PrintServiceFactory', () {
    test('returns PrintServiceStub by default', () {
      PrintServiceFactory.reset();
      final service = PrintServiceFactory.instance;
      expect(service, isA<PrintServiceStub>());
    });

    test('create returns a new PrintServiceStub on every call', () {
      final first = PrintServiceFactory.create();
      final second = PrintServiceFactory.create();

      expect(first, isA<PrintServiceStub>());
      expect(second, isA<PrintServiceStub>());
      expect(second, isNot(same(first)));
    });

    test('can override for testing', () {
      final mockService = MockPrintService();
      PrintServiceFactory.overrideForTesting(mockService);
      expect(PrintServiceFactory.instance, same(mockService));
      PrintServiceFactory.reset();
    });

    test('stub print operations complete without throwing', () async {
      final service = PrintServiceFactory.create();

      await expectLater(service.printReceipt(const {}), completes);
      await expectLater(service.printBarcode(const {}), completes);
      await expectLater(service.printTicket(const {}), completes);
      expect(await service.saveReceiptPng(const {}), isEmpty);
      expect(await service.saveReceiptPdf(const {}), isEmpty);
      expect(await service.saveSalesPdf(const {}), isEmpty);
      expect(await service.validateSvg('data'), isEmpty);
      expect(await service.getLocalPrinters(), isEmpty);
      expect(await service.healthCheck(), isFalse);
    });
  });
}

class MockPrintService implements PrintService {
  @override
  String get baseUrl => 'http://test:5001';

  @override
  Future<bool> healthCheck() async => true;

  @override
  Future<List<String>> getLocalPrinters() async => ['Test Printer'];

  @override
  Future<void> printReceipt(Map<String, dynamic> payload) async {}

  @override
  Future<void> printBarcode(Map<String, dynamic> payload) async {}

  @override
  Future<void> printTicket(Map<String, dynamic> payload) async {}

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> payload) async =>
      'test.png';

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> payload) async =>
      'test.pdf';

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> payload) async => 'test.pdf';

  @override
  Future<List<String>> validateSvg(String base64Data) async => [];

  @override
  void dispose() {}
}
