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

    setUp(() {
      tempDir = Directory.systemTemp.createTempSync('gen_kdf_fixtures_test_');
    });

    tearDown(() {
      tempDir.deleteSync(recursive: true);
    });

    String outputPath() => '${tempDir.path}/kdf_vectors.json';

    ProcessResult runTool({
      Map<String, String>? environment,
      String? workingDirectory,
    }) {
      return Process.runSync(
        'dart',
        [scriptPath],
        environment: environment,
        workingDirectory: workingDirectory,
      );
    }

    void expectSuccess(ProcessResult result) {
      expect(
        result.exitCode,
        0,
        reason:
            'gen_kdf_fixtures.dart exited ${result.exitCode}: ${result.stderr}',
      );
    }

    test('main() writes valid JSON fixture with 5 vectors', () {
      final result = runTool(
        environment: {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path},
      );
      expectSuccess(result);

      final file = File(outputPath());
      expect(file.existsSync(), isTrue);

      final vectors = jsonDecode(file.readAsStringSync()) as List<dynamic>;
      expect(vectors.length, 5);

      for (final v in vectors) {
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
      final env = {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path};
      expectSuccess(runTool(environment: env));
      final first = File(outputPath()).readAsStringSync();

      expectSuccess(runTool(environment: env));
      final second = File(outputPath()).readAsStringSync();

      expect(second, equals(first));
    });

    test('each expected hash matches hashTagged round-trip', () {
      expectSuccess(
        runTool(environment: {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path}),
      );

      final vectors = jsonDecode(File(outputPath()).readAsStringSync()) as List;

      for (final v in vectors) {
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
      expectSuccess(
        runTool(environment: {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path}),
      );

      final vectors = jsonDecode(File(outputPath()).readAsStringSync()) as List;

      expect((vectors[0] as Map)['password'], 'abc123');
      expect((vectors[0] as Map)['iterations'], 1000);
      expect((vectors[0] as Map)['salt_b64url'], 'c2FsdHNhbHQ');
      expect(
        (vectors[0] as Map)['expected'],
        r'pbkdf2-sha512$1000$c2FsdHNhbHQ$Eco9WRT2ISifrauSAE7fKpTReo4CJ3d88LINw4A6yeE=',
      );

      expect((vectors[1] as Map)['password'], 'سلام123');
      expect((vectors[1] as Map)['iterations'], 1000);
      expect((vectors[1] as Map)['salt_b64url'], 'c2FsdHNhbHQ');
      expect(
        (vectors[1] as Map)['expected'],
        r'pbkdf2-sha512$1000$c2FsdHNhbHQ$R8m9GqMxQgX4B1Ql6klEagOUKH1Qx65PBiCySbbiUoY=',
      );

      expect((vectors[2] as Map)['password'], 'p@ssw0rd!9');
      expect((vectors[2] as Map)['iterations'], 5000);
      expect((vectors[2] as Map)['salt_b64url'], 'c2hvcnQ');
      expect(
        (vectors[2] as Map)['expected'],
        r'pbkdf2-sha512$5000$c2hvcnQ$N5hrgGog1Fmd6gZqwPfOwYBCyjThM3bmWgztfBHasF8=',
      );

      expect(
        (vectors[3] as Map)['password'],
        'a-very-long-password-with-ن-و-ع-و-م-ر-06',
      );
      expect((vectors[3] as Map)['iterations'], 1000);
      expect((vectors[3] as Map)['salt_b64url'], 'MTIzNDU2Nzg5MGFiY2RlZg');
      expect(
        (vectors[3] as Map)['expected'],
        r'pbkdf2-sha512$1000$MTIzNDU2Nzg5MGFiY2RlZg$wpYYUpelyvFL5rEQEXSbTAR/dNylHt1rxbrIl5bMS8w=',
      );

      expect((vectors[4] as Map)['password'], 'abc123');
      expect((vectors[4] as Map)['iterations'], 1000);
      expect((vectors[4] as Map)['salt_b64url'], 'c2FsdHNhbHQ=');
      expect(
        (vectors[4] as Map)['expected'],
        r'pbkdf2-sha512$1000$c2FsdHNhbHQ=$Eco9WRT2ISifrauSAE7fKpTReo4CJ3d88LINw4A6yeE=',
      );
    });

    test('generated fixture matches the committed backend fixture', () {
      expectSuccess(
        runTool(environment: {'KDF_FIXTURES_OUTPUT_DIR': tempDir.path}),
      );

      final generated = File(outputPath()).readAsStringSync();
      final committed = File(
        '${repoRoot.path}/backend/shared/fixtures/kdf_vectors.json',
      ).readAsStringSync();

      expect(
        generated,
        equals(committed),
        reason: 'Regenerate with KDF_FIXTURES_OUTPUT_DIR=../backend/shared/fixtures',
      );
    });

    test('main() falls back to the current directory when unset', () {
      // Run the tool from a temp working directory with no
      // KDF_FIXTURES_OUTPUT_DIR override: the script defaults to
      // Directory.current.path inside the spawned process.
      final result = runTool(workingDirectory: tempDir.path);
      expectSuccess(result);

      final file = File(outputPath());
      expect(file.existsSync(), isTrue);
      final vectors = jsonDecode(file.readAsStringSync()) as List<dynamic>;
      expect(vectors.length, 5);
    });

    test('main() treats an empty override as unset', () {
      final result = runTool(
        environment: {'KDF_FIXTURES_OUTPUT_DIR': ''},
        workingDirectory: tempDir.path,
      );
      expectSuccess(result);

      final file = File(outputPath());
      expect(file.existsSync(), isTrue);
      final vectors = jsonDecode(file.readAsStringSync()) as List<dynamic>;
      expect(vectors.length, 5);
    });

    test('main() creates nested output directories recursively', () {
      final nested = '${tempDir.path}/nested/a/b';
      final result = runTool(environment: {'KDF_FIXTURES_OUTPUT_DIR': nested});
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

      final result = runTool(
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
