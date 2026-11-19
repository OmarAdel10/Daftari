// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'dart:async';

import 'package:daftari/core/printing/print_service_interface.dart';
import 'package:daftari/core/printing/print_service_linux.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

/// Records the request the service issues and replays a canned response.
class _FakeHttpClient extends http.BaseClient {
  _FakeHttpClient({this.statusCode = 200, this.body = '[]', this.error});

  final int statusCode;
  final String body;
  final Object? error;
  final List<http.BaseRequest> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    if (error != null) throw error!;
    return http.StreamedResponse(
      Stream.value(body.codeUnits),
      statusCode,
      headers: const {'content-type': 'application/json'},
    );
  }
}

void main() {
  group('LinuxPrintService.getLocalPrinters', () {
    test('returns the printer names reported by the sidecar', () async {
      final client = _FakeHttpClient(body: '["EPSON","Brother"]');
      final service = LinuxPrintService(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      final printers = await service.getLocalPrinters();

      expect(printers, equals(['EPSON', 'Brother']));
    });

    test(
      'returns an empty list when the sidecar reports no printers',
      () async {
        final client = _FakeHttpClient(body: '[]');
        final service = LinuxPrintService(
          baseUrl: 'http://127.0.0.1:5150',
          client: client,
        );
        addTearDown(service.dispose);

        expect(await service.getLocalPrinters(), isEmpty);
      },
    );

    test('queries the local-printers endpoint with an Accept header', () async {
      final client = _FakeHttpClient();
      final service = LinuxPrintService(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await service.getLocalPrinters();

      expect(client.requests, hasLength(1));
      final request = client.requests.single;
      expect(request.method, equals('GET'));
      expect(
        request.url.toString(),
        equals('http://127.0.0.1:5150/api/printing/local-printers'),
      );
      expect(request.headers['Accept'], equals('application/json'));
    });

    test('targets the configured base URL', () async {
      final client = _FakeHttpClient();
      final service = LinuxPrintService(
        baseUrl: 'http://example.test:9999',
        client: client,
      );
      addTearDown(service.dispose);

      await service.getLocalPrinters();

      expect(
        client.requests.single.url.toString(),
        equals('http://example.test:9999/api/printing/local-printers'),
      );
    });

    test(
      'throws PrintException carrying the status code when the sidecar rejects',
      () async {
        final client = _FakeHttpClient(statusCode: 503, body: 'unavailable');
        final service = LinuxPrintService(
          baseUrl: 'http://127.0.0.1:5150',
          client: client,
        );
        addTearDown(service.dispose);

        await expectLater(
          service.getLocalPrinters(),
          throwsA(
            isA<PrintException>()
                .having(
                  (e) => e.endpoint,
                  'endpoint',
                  '/api/printing/local-printers',
                )
                .having((e) => e.statusCode, 'statusCode', 503),
          ),
        );
      },
    );

    test(
      'throws PrintException preserving the original transport error',
      () async {
        final failure = http.ClientException('connection refused');
        final client = _FakeHttpClient(error: failure);
        final service = LinuxPrintService(
          baseUrl: 'http://127.0.0.1:5150',
          client: client,
        );
        addTearDown(service.dispose);

        await expectLater(
          service.getLocalPrinters(),
          throwsA(
            isA<PrintException>()
                .having(
                  (e) => e.endpoint,
                  'endpoint',
                  '/api/printing/local-printers',
                )
                .having((e) => e.originalError, 'originalError', same(failure)),
          ),
        );
      },
    );

    test('throws PrintException preserving a timeout error', () async {
      final failure = TimeoutException('sidecar timed out');
      final client = _FakeHttpClient(error: failure);
      final service = LinuxPrintService(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await expectLater(
        service.getLocalPrinters(),
        throwsA(
          isA<PrintException>()
              .having(
                (e) => e.endpoint,
                'endpoint',
                '/api/printing/local-printers',
              )
              .having((e) => e.originalError, 'originalError', same(failure)),
        ),
      );
    });

    test(
      'throws PrintException when the response body is not a JSON list',
      () async {
        final client = _FakeHttpClient(body: '{"not":"a list"}');
        final service = LinuxPrintService(
          baseUrl: 'http://127.0.0.1:5150',
          client: client,
        );
        addTearDown(service.dispose);

        await expectLater(
          service.getLocalPrinters(),
          throwsA(
            isA<PrintException>()
                .having(
                  (e) => e.endpoint,
                  'endpoint',
                  '/api/printing/local-printers',
                )
                .having((e) => e.originalError, 'originalError', isNotNull),
          ),
        );
      },
    );
  });
}
