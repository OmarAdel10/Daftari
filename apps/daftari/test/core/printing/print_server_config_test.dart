// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'package:flutter_test/flutter_test.dart';
import 'package:daftari/core/printing/print_server_config.dart';
import 'package:daftari/core/printing/print_service_desktop.dart';
import 'package:daftari/core/printing/print_service_linux.dart';
import 'package:daftari/core/printing/print_service_stub.dart';
import 'package:daftari/core/printing/print_service_web.dart';
import 'package:daftari/core/printing/print_service_windows.dart';

void main() {
  group('PrintServer config', () {
    test('points at the port the .NET sidecar binds to', () {
      expect(kPrintServerPort, 5150);
      expect(kPrintServerBaseUrl, 'http://127.0.0.1:5150');
      expect(
        kPrintServerHealthEndpoint,
        'http://127.0.0.1:5150/api/printing/health',
      );
    });

    test('every print service implementation shares the same base URL', () {
      final baseUrls = <String>[
        PrintServiceStub().baseUrl,
        PrintServiceDesktop().baseUrl,
        WindowsPrintService().baseUrl,
        LinuxPrintService().baseUrl,
        WebPrintService().baseUrl,
      ];

      expect(baseUrls, everyElement(kPrintServerBaseUrl));
    });
  });
}
