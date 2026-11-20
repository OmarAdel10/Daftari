// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'print_server_config.dart';
import 'print_service_interface.dart';

/// Desktop Print Service implementation using C# PrintServer sidecar.
class PrintServiceDesktop implements PrintService {
  static const String _receiptEndpoint = '/api/printing/receipt';
  static const String _barcodeEndpoint = '/api/printing/barcode';
  static const String _ticketEndpoint = '/api/printing/ticket';
  static const String _savePngEndpoint = '/api/printing/save-png';
  static const String _savePdfEndpoint = '/api/printing/save-pdf';
  static const String _salesExportEndpoint = '/api/printing/sales-export';
  static const String _validateSvgEndpoint = '/api/printing/validate-svg';
  static const String _healthEndpoint = '/api/printing/health';
  static const String _localPrintersEndpoint = '/api/printing/local-printers';

  @override
  final String baseUrl;
  final http.Client _client;

  PrintServiceDesktop({String? baseUrl, http.Client? client})
    : baseUrl = baseUrl ?? kPrintServerBaseUrl,
      _client = client ?? http.Client();

  @override
  Future<void> printReceipt(Map<String, dynamic> data) async {
    await _post(_receiptEndpoint, data);
  }

  @override
  Future<void> printBarcode(Map<String, dynamic> data) async {
    await _post(_barcodeEndpoint, data);
  }

  @override
  Future<void> printTicket(Map<String, dynamic> data) async {
    await _post(_ticketEndpoint, data);
  }

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> data) async {
    final body = await _postJson(_savePngEndpoint, data);
    return _extractPath(body, 'pngPath', _savePngEndpoint);
  }

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> data) async {
    final body = await _postJson(_savePdfEndpoint, data);
    return _extractPath(body, 'pdfPath', _savePdfEndpoint);
  }

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> data) async {
    final body = await _postJson(_salesExportEndpoint, data);
    return _extractPath(body, 'pdfPath', _salesExportEndpoint);
  }

  @override
  Future<List<String>> validateSvg(String base64Data) async {
    final body = await _postJson(_validateSvgEndpoint, {'data': base64Data});
    if (body['valid'] == true) {
      return const <String>[];
    }
    final errors = body['errors'];
    if (errors is List) {
      return errors.whereType<String>().toList();
    }
    return const <String>[];
  }

  @override
  Future<bool> healthCheck() async {
    try {
      final response = await _client
          .get(Uri.parse('$baseUrl$_healthEndpoint'))
          .timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<String>> getLocalPrinters() async {
    try {
      final response = await _client
          .get(
            Uri.parse('$baseUrl$_localPrintersEndpoint'),
            headers: {'Accept': 'application/json'},
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.cast<String>();
      }
      throw PrintException(
        'Failed to fetch printers: ${response.statusCode}',
        endpoint: _localPrintersEndpoint,
        statusCode: response.statusCode,
      );
    } on PrintException {
      rethrow;
    } on http.ClientException catch (e) {
      throw PrintException(
        'Network error getting printers: $e',
        endpoint: _localPrintersEndpoint,
        originalError: e,
      );
    } catch (e) {
      throw PrintException(
        'Failed to get local printers: $e',
        endpoint: _localPrintersEndpoint,
        originalError: e,
      );
    }
  }

  @override
  void dispose() {
    _client.close();
  }

  /// Posts [data] as JSON and fails on an error response.
  Future<void> _post(String endpoint, Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$endpoint'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    _handleResponse(response, endpoint);
  }

  /// Posts [data] as JSON and returns the decoded JSON object.
  Future<Map<String, dynamic>> _postJson(
    String endpoint,
    Map<String, dynamic> data,
  ) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$endpoint'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    return _handleJsonResponse(response, endpoint);
  }

  void _handleResponse(http.Response response, String endpoint) {
    if (response.statusCode >= 400) {
      throw PrintException(
        'Print server error: ${response.statusCode} - ${response.body}',
        endpoint: endpoint,
        statusCode: response.statusCode,
      );
    }
  }

  Map<String, dynamic> _handleJsonResponse(
    http.Response response,
    String endpoint,
  ) {
    _handleResponse(response, endpoint);
    final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException catch (e) {
      throw PrintException(
        'Print server returned a malformed response payload.',
        endpoint: endpoint,
        originalError: e,
      );
    }
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    throw PrintException(
      'Print server returned an unexpected response payload.',
      endpoint: endpoint,
    );
  }

  /// Reads the saved file path from a PrintServer export response.
  ///
  /// The sidecar always answers with a json object: the save png endpoint
  /// returns `{ pngPath }` and the save pdf and sales export endpoints
  /// return `{ pdfPath, saved }` (PrintServer/Program.cs and
  /// PrintServer.Linux/Program.cs). A raw path body is not part of the
  /// contract.
  String _extractPath(Map<String, dynamic> body, String key, String endpoint) {
    final value = body[key];
    if (value is String && value.isNotEmpty) {
      return value;
    }
    throw PrintException(
      'Print server response did not include "$key".',
      endpoint: endpoint,
    );
  }
}
