// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:daftari/core/printing/print_service_desktop.dart';
import 'package:daftari/core/printing/print_service_factory.dart';
import 'package:daftari/core/printing/print_service_health_guard.dart';
import 'package:daftari/core/printing/print_service_interface.dart';
import 'package:daftari/core/printing/print_service_stub.dart';

void main() {
  group('PrintServiceFactory', () {
    tearDown(() {
      debugDefaultTargetPlatformOverride = null;
      PrintServiceFactory.reset();
    });

    test('returns the desktop service on Windows', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;

      final service = PrintServiceFactory.instance;

      expect(service, isA<PrintServiceHealthGuard>());
      expect(
        (service as PrintServiceHealthGuard).inner,
        isA<PrintServiceDesktop>(),
      );
      service.dispose();
    });

    test('returns the desktop service on Linux', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.linux;

      final service = PrintServiceFactory.instance;

      expect(service, isA<PrintServiceHealthGuard>());
      expect(
        (service as PrintServiceHealthGuard).inner,
        isA<PrintServiceDesktop>(),
      );
      service.dispose();
    });

    test('returns the no-op stub on unsupported platforms', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.macOS;

      final service = PrintServiceFactory.instance;

      expect(service, isA<PrintServiceStub>());
      service.dispose();
    });

    test('create returns a new instance on every call', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.linux;

      final first = PrintServiceFactory.create();
      final second = PrintServiceFactory.create();

      expect(first, isNot(same(second)));
      first.dispose();
      second.dispose();
    });

    test('can override for testing', () {
      final mockService = MockPrintService();
      PrintServiceFactory.overrideForTesting(mockService);
      expect(PrintServiceFactory.instance, same(mockService));
      PrintServiceFactory.reset();
    });

    test('stub print operations complete without throwing', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.macOS;

      final service = PrintServiceFactory.create();
      expect(service, isA<PrintServiceStub>());

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

  group('PrintServiceFactory.createForPlatform', () {
    test('returns the desktop service on Windows and Linux', () {
      for (final platform in [TargetPlatform.windows, TargetPlatform.linux]) {
        final service = PrintServiceFactory.createForPlatform(
          isWeb: false,
          targetPlatform: platform,
        );

        expect(service, isA<PrintServiceHealthGuard>(), reason: '$platform');
        expect(
          (service as PrintServiceHealthGuard).inner,
          isA<PrintServiceDesktop>(),
          reason: '$platform',
        );
        service.dispose();
      }
    });

    test('returns the no-op stub on the other desktop targets', () {
      for (final platform in [
        TargetPlatform.macOS,
        TargetPlatform.android,
        TargetPlatform.iOS,
        TargetPlatform.fuchsia,
      ]) {
        final service = PrintServiceFactory.createForPlatform(
          isWeb: false,
          targetPlatform: platform,
        );

        expect(service, isA<PrintServiceStub>(), reason: '$platform');
        service.dispose();
      }
    });

    test('returns the no-op stub on the web', () {
      for (final platform in [
        TargetPlatform.windows,
        TargetPlatform.linux,
        TargetPlatform.macOS,
        TargetPlatform.android,
        TargetPlatform.iOS,
      ]) {
        final service = PrintServiceFactory.createForPlatform(
          isWeb: true,
          targetPlatform: platform,
        );

        expect(service, isA<PrintServiceStub>(), reason: '$platform');
        service.dispose();
      }
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
