// Copyright (c) 2024 Daftari POS. All rights reserved.

/// Web PrintService implementation (stub for web platform).
library;

import 'package:http/http.dart' as http;

import 'dart:convert';

import 'print_server_config.dart';
import 'print_service_interface.dart';

/// Web print service - delegates to PrintServer via HTTP.
class WebPrintService implements PrintService {
  @override
  final String baseUrl;

  WebPrintService({this.baseUrl = kPrintServerBaseUrl});

  @override
  Future<bool> healthCheck() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/printing/health'));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<String>> getLocalPrinters() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/printing/local-printers'));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as List<dynamic>;
        return data.cast<String>();
      }
    } catch (_) {}
    return [];
  }

  @override
  Future<void> printReceipt(Map<String, dynamic> payload) async {
    await _post('$baseUrl/api/printing/receipt', payload);
  }

  @override
  Future<void> printBarcode(Map<String, dynamic> payload) async {
    await _post('$baseUrl/api/printing/barcode', payload);
  }

  @override
  Future<void> printTicket(Map<String, dynamic> payload) async {
    await _post('$baseUrl/api/printing/ticket', payload);
  }

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> payload) async {
    final response = await _post('$baseUrl/api/printing/receipt/png', payload);
    return response.body;
  }

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> payload) async {
    final response = await _post('$baseUrl/api/printing/receipt/pdf', payload);
    return response.body;
  }

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> payload) async {
    final response = await _post('$baseUrl/api/printing/sales/pdf', payload);
    return response.body;
  }

  @override
  Future<List<String>> validateSvg(String base64Data) async {
    try {
      final response = await _post('$baseUrl/api/printing/validate-svg', {
        'data': base64Data,
      });
      final data = jsonDecode(response.body) as List<dynamic>;
      return data.cast<String>();
    } catch (_) {
      return ['Validation failed'];
    }
  }

  Future<http.Response> _post(String url, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse(url),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    if (response.statusCode != 200) {
      throw Exception(
        'PrintServer error: ${response.statusCode} ${response.body}',
      );
    }
    return response;
  }

  @override
  void dispose() {}
}