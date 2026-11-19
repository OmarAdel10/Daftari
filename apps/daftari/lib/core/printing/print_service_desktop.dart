// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'print_server_config.dart';
import 'print_service_interface.dart';

/// Desktop Print Service implementation using C# PrintServer sidecar.
class PrintServiceDesktop implements PrintService {
  @override
  final String baseUrl;
  final http.Client _client;

  PrintServiceDesktop({String? baseUrl, http.Client? client})
    : baseUrl = baseUrl ?? kPrintServerBaseUrl,
      _client = client ?? http.Client();

  @override
  Future<void> printReceipt(Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/print-receipt'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    _handleResponse(response);
  }

  @override
  Future<void> printBarcode(Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/print-barcode'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    _handleResponse(response);
  }

  @override
  Future<void> printTicket(Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/print-ticket'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    _handleResponse(response);
  }

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/save-png'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    return _handleStringResponse(response);
  }

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/save-pdf'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    return _handleStringResponse(response);
  }

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/sales-export'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );
    return _handleStringResponse(response);
  }

  @override
  Future<List<String>> validateSvg(String base64Data) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/printing/validate-svg'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'svg_base64': base64Data}),
    );
    final data = _handleJsonResponse(response);
    return (data as List).cast<String>();
  }

  @override
  Future<bool> healthCheck() async {
    try {
      final response = await _client
          .get(Uri.parse('$baseUrl/api/printing/health'))
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
            Uri.parse('$baseUrl/api/printing/local-printers'),
            headers: {'Accept': 'application/json'},
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.cast<String>();
      }
      throw PrintException(
        'Failed to fetch printers: ${response.statusCode}',
        endpoint: '/api/printing/local-printers',
        statusCode: response.statusCode,
      );
    } on PrintException {
      rethrow;
    } on http.ClientException catch (e) {
      throw PrintException(
        'Network error getting printers: $e',
        endpoint: '/api/printing/local-printers',
        originalError: e,
      );
    } catch (e) {
      throw PrintException(
        'Failed to get local printers: $e',
        endpoint: '/api/printing/local-printers',
        originalError: e,
      );
    }
  }

  @override
  void dispose() {
    _client.close();
  }

  void _handleResponse(http.Response response) {
    if (response.statusCode >= 400) {
      throw Exception(
        'Print server error: ${response.statusCode} - ${response.body}',
      );
    }
  }

  String _handleStringResponse(http.Response response) {
    _handleResponse(response);
    return response.body;
  }

  Map<String, dynamic> _handleJsonResponse(http.Response response) {
    _handleResponse(response);
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
