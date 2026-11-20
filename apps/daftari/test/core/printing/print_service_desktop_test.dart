import 'dart:async';
import 'dart:convert';

import 'package:daftari/core/printing/print_service_desktop.dart';
import 'package:daftari/core/printing/print_service_interface.dart';
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
  group('PrintServiceDesktop.getLocalPrinters', () {
    test('returns the printer names reported by the sidecar', () async {
      final client = _FakeHttpClient(body: '["EPSON","Brother"]');
      final service = PrintServiceDesktop(
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
        final service = PrintServiceDesktop(
          baseUrl: 'http://127.0.0.1:5150',
          client: client,
        );
        addTearDown(service.dispose);

        expect(await service.getLocalPrinters(), isEmpty);
      },
    );

    test('queries the local-printers endpoint with an Accept header', () async {
      final client = _FakeHttpClient();
      final service = PrintServiceDesktop(
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
      final service = PrintServiceDesktop(
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
        final service = PrintServiceDesktop(
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
        final service = PrintServiceDesktop(
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
      final service = PrintServiceDesktop(
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
        final service = PrintServiceDesktop(
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

  group('PrintServiceDesktop print routes', () {
    test('printReceipt posts to the receipt endpoint', () async {
      final client = _FakeHttpClient(body: '{"printed":true}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await service.printReceipt(const {'id': 'r1'});

      expect(client.requests, hasLength(1));
      expect(client.requests.single.method, 'POST');
      expect(client.requests.single.url.path, '/api/printing/receipt');
    });

    test('printBarcode posts to the barcode endpoint', () async {
      final client = _FakeHttpClient(body: '{"printed":true}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await service.printBarcode(const {'barcode': '123'});

      expect(client.requests.single.url.path, '/api/printing/barcode');
    });

    test('printTicket posts to the ticket endpoint', () async {
      final client = _FakeHttpClient(body: '{"printed":true}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await service.printTicket(const {'table_name': 'T1'});

      expect(client.requests.single.url.path, '/api/printing/ticket');
    });
  });

  group('PrintServiceDesktop exports', () {
    test('saveReceiptPng returns the saved png path', () async {
      final client = _FakeHttpClient(body: '{"pngPath":"/tmp/receipt.png"}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      final path = await service.saveReceiptPng(const {'id': 'r1'});

      expect(path, '/tmp/receipt.png');
      expect(client.requests.single.url.path, '/api/printing/save-png');
    });

    test('saveReceiptPdf returns the saved pdf path', () async {
      final client = _FakeHttpClient(
        body: '{"pdfPath":"/tmp/receipt.pdf","saved":true}',
      );
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      final path = await service.saveReceiptPdf(const {'id': 'r1'});

      expect(path, '/tmp/receipt.pdf');
      expect(client.requests.single.url.path, '/api/printing/save-pdf');
    });

    test('saveSalesPdf returns the saved pdf path', () async {
      final client = _FakeHttpClient(
        body: '{"pdfPath":"/tmp/sales.pdf","saved":true}',
      );
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      final path = await service.saveSalesPdf(const {'title': 'Sales'});

      expect(path, '/tmp/sales.pdf');
      expect(client.requests.single.url.path, '/api/printing/sales-export');
    });

    test('saveReceiptPng throws when the response carries no path', () async {
      final client = _FakeHttpClient(body: '{}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await expectLater(
        service.saveReceiptPng(const {'id': 'r1'}),
        throwsA(isA<PrintException>()),
      );
    });
  });

  group('PrintServiceDesktop.validateSvg', () {
    test('sends the svg in the data field', () async {
      final client = _FakeHttpClient(body: '{"valid":true,"errors":[]}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      await service.validateSvg('PHN2Zz48L3N2Zz4=');

      final request = client.requests.single as http.Request;
      expect(request.url.path, '/api/printing/validate-svg');
      expect(jsonDecode(request.body), {'data': 'PHN2Zz48L3N2Zz4='});
    });

    test('returns the validation errors of an invalid svg', () async {
      final client = _FakeHttpClient(
        body: '{"valid":false,"errors":["Element not closed"]}',
      );
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      final errors = await service.validateSvg('bad');

      expect(errors, ['Element not closed']);
    });

    test('returns no errors for a valid svg', () async {
      final client = _FakeHttpClient(body: '{"valid":true,"errors":[]}');
      final service = PrintServiceDesktop(
        baseUrl: 'http://127.0.0.1:5150',
        client: client,
      );
      addTearDown(service.dispose);

      final errors = await service.validateSvg('PHN2Zz48L3N2Zz4=');

      expect(errors, isEmpty);
    });
  });
}
