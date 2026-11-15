// Copyright (c) 2024 Daftari POS. All rights reserved.

import 'print_server_config.dart';
import 'print_service_interface.dart';

/// No-op [PrintService] used until platform detection is wired up.
///
/// Every operation completes successfully without side effects: print and
/// export calls resolve without output, printer enumeration is empty and the
/// health check reports the sidecar as unavailable.
class PrintServiceStub implements PrintService {
  @override
  String get baseUrl => kPrintServerBaseUrl;

  @override
  Future<List<String>> getLocalPrinters() async => [];

  @override
  Future<void> printReceipt(Map<String, dynamic> data) async {}

  @override
  Future<void> printBarcode(Map<String, dynamic> data) async {}

  @override
  Future<void> printTicket(Map<String, dynamic> data) async {}

  @override
  Future<String> saveReceiptPng(Map<String, dynamic> data) async => '';

  @override
  Future<String> saveReceiptPdf(Map<String, dynamic> data) async => '';

  @override
  Future<String> saveSalesPdf(Map<String, dynamic> data) async => '';

  @override
  Future<List<String>> validateSvg(String base64Data) async => [];

  @override
  Future<bool> healthCheck() async => false;

  @override
  void dispose() {}
}
