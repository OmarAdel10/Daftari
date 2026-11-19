// Copyright (c) 2024 Daftari POS. All rights reserved.

/// Single source of truth for the Dart print clients' PrintServer network
/// configuration.
///
/// The .NET sidecars (`PrintServer` and `PrintServer.Linux`) bind to
/// `http://127.0.0.1:5150` via `builder.WebHost.UseUrls(...)`, and the
/// packaging scripts carry their own copy of that port. This file is the
/// single source of truth for the Dart clients only -- the .NET hosts and
/// the packaging scripts keep their own literals.
library;

/// TCP port the PrintServer sidecar listens on.
const int kPrintServerPort = 5150;

/// Host the PrintServer sidecar binds to.
const String kPrintServerHost = '127.0.0.1';

/// Base URL of the PrintServer sidecar.
const String kPrintServerBaseUrl = 'http://$kPrintServerHost:$kPrintServerPort';

/// Health-check endpoint of the PrintServer sidecar.
const String kPrintServerHealthEndpoint =
    '$kPrintServerBaseUrl/api/printing/health';
