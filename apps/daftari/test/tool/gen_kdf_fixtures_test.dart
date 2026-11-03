import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:daftari/core/crypto/password_hasher.dart';

/// Resolves the repository root from the test runner's CWD so these tests work
/// from `apps/daftari` (`flutter test`) or from the repository root.
Directory _repoRoot() {
  var dir = Directory.current;
  while (true) {
    if (File('${dir.path}/melos.yaml').existsSync()) return dir;
    final parent = dir.parent;
    if (parent.path == dir.path) {
      throw StateError(
        'Could not locate melos.yaml above ${Directory.current.path}',
      );
    }
    dir = parent;
  }
}

void main() {
  final repoRoot = _repoRoot();
  final scriptPath = '${repoRoot.path}/apps/daftari/tool/gen_kdf_fixtures.dart';

  group('gen_kdf_fixtures', () {
    late Directory tempDir;
    late String generatedFixturePath;
    late List<dynamic> cachedVectors;
    late String toolBinary;

    setUpAll(() async {
      tempDir = Directory.systemTemp.createTempSync('gen_kdf_fixtures_test_');
      generatedFixturePath = '${tempDir.path}/kdf_vectors.json';
      toolBinary = '${tempDir.path}/gen_kdf_fixtures';

      // Compile the tool ONCE (avoids build_runner hooks on every run).
      final compileResult = Process.runSync('dart', [
        'compile',
        'exe',
        scriptPath,
        '-o',
        toolBinary,
      ]);
      if (compileResult.exitCode != 0) {
        throw StateError(
          'setUpAll: compile failed ${compileResult.exitCode}: ${compileResult.stderr}',
        );
      }

      // Generate the fixture ONCE for all tests (hermetic, fast, deterministic).
      final result = Process.runSync(
        toolBinary,
        [],
        environment: {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path},
      );
      if (result.exitCode != 0) {
        throw StateError(
          'setUpAll: gen_kdf_fixtures.dart exited ${result.exitCode}: ${result.stderr}',
        );
      }
      final content = File(generatedFixturePath).readAsStringSync();
      cachedVectors = jsonDecode(content) as List<dynamic>;
    });

    tearDownAll(() {
      tempDir.deleteSync(recursive: true);
    });

    void expectSuccess(ProcessResult result) {
      expect(
        result.exitCode,
        0,
        reason:
            'gen_kdf_fixtures.dart exited ${result.exitCode}: ${result.stderr}',
      );
    }

    test('main() writes valid JSON fixture with 5 vectors', () {
      expect(cachedVectors.length, 5);

      for (final v in cachedVectors) {
        final map = v as Map<String, dynamic>;
        expect(map.keys.toSet(), {
          'password',
          'iterations',
          'salt_b64url',
          'expected',
        });
      }
    });

    test('main() is idempotent — re-run produces identical output', () {
      final result = Process.runSync(
        toolBinary,
        [],
        environment: {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path},
      );
      expectSuccess(result);
      final second = jsonDecode(File(generatedFixturePath).readAsStringSync());
      expect(second, equals(cachedVectors));
    });

    test('each expected hash matches hashTagged round-trip', () {
      for (final v in cachedVectors) {
        final map = v as Map<String, dynamic>;
        final expected = hashTagged(
          map['password'] as String,
          iterations: map['iterations'] as int,
          saltB64Url: map['salt_b64url'] as String,
        );
        expect(map['expected'], equals(expected));
      }
    });

    test('fixture values and frozen hashes are pinned per vector index', () {
      expect((cachedVectors[0] as Map)['password'], 'abc123');
      expect((cachedVectors[0] as Map)['iterations'], 1000);
      expect((cachedVectors[0] as Map)['salt_b64url'], 'c2FsdHNhbHQ');
      expect(
        (cachedVectors[0] as Map)['expected'],
        r'pbkdf2-sha512$1000$c2FsdHNhbHQ$Eco9WRT2ISifrauSAE7fKpTReo4CJ3d88LINw4A6yeE=',
      );

      expect((cachedVectors[1] as Map)['password'], 'سلام123');
      expect((cachedVectors[1] as Map)['iterations'], 1000);
      expect((cachedVectors[1] as Map)['salt_b64url'], 'c2FsdHNhbHQ');
      expect(
        (cachedVectors[1] as Map)['expected'],
        r'pbkdf2-sha512$1000$c2FsdHNhbHQ$R8m9GqMxQgX4B1Ql6klEagOUKH1Qx65PBiCySbbiUoY=',
      );

      expect((cachedVectors[2] as Map)['password'], 'p@ssw0rd!9');
      expect((cachedVectors[2] as Map)['iterations'], 5000);
      expect((cachedVectors[2] as Map)['salt_b64url'], 'c2hvcnQ');
      expect(
        (cachedVectors[2] as Map)['expected'],
        r'pbkdf2-sha512$5000$c2hvcnQ$N5hrgGog1Fmd6gZqwPfOwYBCyjThM3bmWgztfBHasF8=',
      );

      expect(
        (cachedVectors[3] as Map)['password'],
        'a-very-long-password-with-ن-و-ع-و-م-ر-06',
      );
      expect((cachedVectors[3] as Map)['iterations'], 1000);
      expect(
        (cachedVectors[3] as Map)['salt_b64url'],
        'MTIzNDU2Nzg5MGFiY2RlZg',
      );
      expect(
        (cachedVectors[3] as Map)['expected'],
        r'pbkdf2-sha512$1000$MTIzNDU2Nzg5MGFiY2RlZg$wpYYUpelyvFL5rEQEXSbTAR/dNylHt1rxbrIl5bMS8w=',
      );

      expect((cachedVectors[4] as Map)['password'], 'abc123');
      expect((cachedVectors[4] as Map)['iterations'], 1000);
      expect((cachedVectors[4] as Map)['salt_b64url'], 'c2FsdHNhbHQ=');
      expect(
        (cachedVectors[4] as Map)['expected'],
        r'pbkdf2-sha512$1000$c2FsdHNhbHQ=$Eco9WRT2ISifrauSAE7fKpTReo4CJ3d88LINw4A6yeE=',
      );
    });

    test('generated fixture matches the committed backend fixture', () {
      final committed = jsonDecode(
        File('${repoRoot.path}/backend/shared/fixtures/kdf_vectors.json')
            .readAsStringSync(),
      );
      expect(cachedVectors, equals(committed));
    });

    test('main() falls back to the current directory when unset', () {
      final fallbackDir = Directory.systemTemp.createTempSync(
        'gen_kdf_fixtures_fallback_',
      );
      try {
        final result = Process.runSync(
          toolBinary,
          [],
          workingDirectory: fallbackDir.path,
        );
        expectSuccess(result);

        final file = File('${fallbackDir.path}/kdf_vectors.json');
        expect(file.existsSync(), isTrue);
        final vectors = jsonDecode(file.readAsStringSync()) as List<dynamic>;
        expect(vectors.length, 5);
      } finally {
        fallbackDir.deleteSync(recursive: true);
      }
    });

    test('main() treats an empty override as unset', () {
      final fallbackDir = Directory.systemTemp.createTempSync(
        'gen_kdf_fixtures_empty_',
      );
      try {
        final result = Process.runSync(
          toolBinary,
          [],
          environment: {'KDF_FIXTURES_OUTPUT_DIR': ''},
          workingDirectory: fallbackDir.path,
        );
        expectSuccess(result);

        final file = File('${fallbackDir.path}/kdf_vectors.json');
        expect(file.existsSync(), isTrue);
        final vectors = jsonDecode(file.readAsStringSync()) as List<dynamic>;
        expect(vectors.length, 5);
      } finally {
        fallbackDir.deleteSync(recursive: true);
      }
    });

    test('main() creates nested output directories recursively', () {
      final nested = '${tempDir.path}/nested/a/b';
      final result = Process.runSync(
        toolBinary,
        [],
        environment: {'KDF_FIXTURES_OUTPUT_DIR': nested},
      );
      expectSuccess(result);

      final file = File('$nested/kdf_vectors.json');
      expect(file.existsSync(), isTrue);
      final vectors = jsonDecode(file.readAsStringSync()) as List<dynamic>;
      expect(vectors.length, 5);
    });

    test('main() surfaces a clear failure when the output path is a file', () {
      // A file where a directory is expected fails identically on POSIX,
      // Windows, and as root (unlike chmod-based permission tests).
      final blocker = File('${tempDir.path}/not-a-dir')..writeAsStringSync('x');

      final result = Process.runSync(
        toolBinary,
        [],
        environment: {'KDF_FIXTURES_OUTPUT_DIR': '${blocker.path}/sub'},
      );

      expect(
        result.exitCode,
        isNot(0),
        reason:
            'expected non-zero exit when the output path is a file, '
            'got ${result.exitCode}',
      );
      expect(result.stderr.toString(), isNotEmpty);
    });
  });
}
