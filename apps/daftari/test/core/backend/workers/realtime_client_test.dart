// Copyright (c) 2026 Daftari POS. All rights reserved.

import 'dart:async';
import 'dart:convert';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:daftari/core/backend/workers/realtime_client.dart';
import 'package:daftari/features/admin_dashboard/dashboard/dashboard_bloc.dart';
import 'package:daftari/core/backend/workers/api_client.dart';
import 'package:daftari/core/error/either.dart';

class MockApiClient extends Mock implements ApiClient {}

class MockWebSocketChannel extends Mock implements WebSocketChannel {}

class MockWebSocketSink extends Mock implements WebSocketSink {}

final _channelLedger = <MockWebSocketChannel>[];
final _controllerLedger = <StreamController<dynamic>>[];

MockWebSocketChannel makeChannel(Uri uri) {
  final c = MockWebSocketChannel();
  final controller = StreamController<dynamic>();
  when(() => c.stream).thenAnswer((_) => controller.stream);
  final sink = MockWebSocketSink();
  when(() => sink.close()).thenAnswer((_) async {});
  when(() => c.sink).thenReturn(sink);
  // The client now awaits channel.ready before resetting the backoff ladder;
  // a mocked channel opens immediately.
  when(() => c.ready).thenAnswer((_) async {});
  _channelLedger.add(c);
  _controllerLedger.add(controller);
  return c;
}

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('RealtimeClient', () {
    setUp(() {
      // Each test starts with an empty ledger: the absolute indices below
      // stay valid regardless of test order.
      _channelLedger.clear();
      _controllerLedger.clear();
    });

    test('injected events flow through to listeners', () async {
      final controller = StreamController<Map<String, dynamic>>();
      final client = RealtimeClient(
        wsUrl: 'wss://x/ws',
        ticketProvider: () async => 'tok',
        incomingForTest: controller.stream,
      );
      final events = <Map<String, dynamic>>[];
      final sub = client.events.listen(events.add);
      controller.add({'type': 'sale', 'count': 1});
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(events, [
        {'type': 'sale', 'count': 1},
      ]);
      await sub.cancel();
      await client.close();
      expect(client.isClosed, isTrue);
    });

    test('reconnects with the backoff ladder on done (fake async)', () {
      fakeAsync((async) {
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: makeChannel,
        );
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(_channelLedger, hasLength(1)); // connected

        // The socket dies → the 2s backoff → reconnect.
        _controllerLedger[0].close();
        async.elapse(const Duration(seconds: 3));
        expect(_channelLedger, hasLength(2));

        // Die again → the 4s backoff → reconnect.
        _controllerLedger[1].close();
        async.elapse(const Duration(seconds: 5));
        expect(_channelLedger, hasLength(3));

        // After close: no more reconnects (the ladder stops).
        client.close();
        _controllerLedger[2].close();
        async.elapse(const Duration(seconds: 40));
        expect(_channelLedger, hasLength(3));
      });
    });

    test('a live message resets the backoff ladder (fake async)', () {
      fakeAsync((async) {
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: makeChannel,
        );
        final events = <Map<String, dynamic>>[];
        final sub = client.events.listen(events.add);
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(_channelLedger, hasLength(1)); // connected

        // Die twice → the ladder records 2 attempts.
        _controllerLedger[0].close();
        async.elapse(const Duration(seconds: 3)); // the 2s backoff → reconnect
        _controllerLedger[1].close();
        async.elapse(const Duration(seconds: 5)); // the 4s backoff → reconnect
        expect(_channelLedger, hasLength(3));

        // A live message on the new channel resets the ladder and broadcasts.
        _controllerLedger[2].add(jsonEncode({'type': 'sale', 'count': 2}));
        async.elapse(const Duration(milliseconds: 10));
        expect(events, [
          {'type': 'sale', 'count': 2},
        ]);

        // Die again → the next backoff is 2s (reset), not 8s.
        _controllerLedger[2].close();
        async.elapse(const Duration(seconds: 3)); // an 8s ladder would not fire
        expect(_channelLedger, hasLength(4));
        sub.cancel();
        client.close();
      });
    });

    test('the backoff ladder resets after a successful open (fake async)', () {
      fakeAsync((async) {
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: makeChannel,
        );
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(_channelLedger, hasLength(1)); // connected

        // Die twice → the ladder reaches 2 attempts.
        _controllerLedger[0].close();
        async.elapse(const Duration(seconds: 3)); // 2s → reconnect
        _controllerLedger[1].close();
        async.elapse(const Duration(seconds: 5)); // 4s → reconnect
        expect(_channelLedger, hasLength(3)); // a successful OPEN

        // T26: opening the socket resets the ladder — the next drop waits
        // 2s, not the 8s the old message-only reset would have used.
        _controllerLedger[2].close();
        async.elapse(const Duration(seconds: 3));
        expect(_channelLedger, hasLength(4));
        client.close();
      });
    });

    test('connected emits true once a socket opens (fake async)', () {
      fakeAsync((async) {
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: makeChannel,
        );
        final connectivity = <bool>[];
        final sub = client.connected.listen(connectivity.add);
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(connectivity, [true]);
        expect(client.isConnected, isTrue);
        sub.cancel();
        client.close();
      });
    });

    test('connected emits false after the 5th failure (fake async)', () {
      fakeAsync((async) {
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) => throw StateError('down'),
        );
        final connectivity = <bool>[];
        final sub = client.connected.listen(connectivity.add);
        client.connect();
        async.elapse(const Duration(seconds: 70));
        expect(connectivity, isNotEmpty);
        expect(connectivity.last, isFalse);
        expect(client.isConnected, isFalse);
        sub.cancel();
        client.close();
      });
    });

    test('a throwing channel factory schedules a reconnect (fake async)', () {
      fakeAsync((async) {
        var calls = 0;
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) {
            calls++;
            if (calls == 1) throw StateError('boom');
            return makeChannel(uri);
          },
        );
        // The factory throws → connect() catches → the 2s backoff.
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(_channelLedger, isEmpty); // the throw left no channel behind

        async.elapse(const Duration(seconds: 3)); // the 2s timer → a retry
        expect(_channelLedger, hasLength(1)); // the retry succeeded
        expect(calls, 2);
        expect(client.isClosed, isFalse);
        client.close();
      });
    });

    test(
      'the ladder stops after 5 failed attempts without close (fake async)',
      () {
        fakeAsync((async) {
          var calls = 0;
          final client = RealtimeClient(
            wsUrl: 'wss://x/ws',
            ticketProvider: () async => 'tok',
            channelFactory: (uri) {
              calls++;
              throw StateError('down');
            },
          );
          client.connect(); // every connect fails: the ladder runs 2+4+8+16+32
          async.elapse(const Duration(seconds: 70));
          expect(calls, 6); // the initial connect plus the 5 backoff retries
          expect(client.isClosed, isFalse); // no close(): the cap stopped it

          // The 6th failure schedules nothing — the ladder is capped at 5.
          async.elapse(const Duration(seconds: 40));
          expect(calls, 6);
        });
      },
    );

    test('an error event also schedules a reconnect (fake async)', () {
      fakeAsync((async) {
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: makeChannel,
        );
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(_channelLedger, hasLength(1)); // connected

        // A socket error routes to onError → the 2s backoff → reconnect.
        _controllerLedger[0].addError(StateError('boom'));
        async.elapse(const Duration(seconds: 3));
        expect(_channelLedger, hasLength(2));
        client.close();
      });
    });

    test('close cancels the reconnect timer and stops connecting', () async {
      final client = RealtimeClient(
        wsUrl: 'wss://x/ws',
        ticketProvider: () async => 'tok',
      );
      await client.close();
      // connect() after close is a no-op (no crash).
      await client.connect();
      expect(client.isClosed, isTrue);
    });

    test('a null token does not open a connection', () async {
      final client = RealtimeClient(
        wsUrl: 'wss://x/ws',
        ticketProvider: () async => null,
      );
      await client.connect(); // no crash, no socket
      expect(client.isClosed, isFalse);
      await client.close();
    });

    test('a malformed frame is dropped without crashing', () async {
      final controllers = <StreamController<dynamic>>[];
      final client = RealtimeClient(
        wsUrl: 'wss://x/ws',
        ticketProvider: () async => 'tok',
        channelFactory: (uri) {
          final c = MockWebSocketChannel();
          final controller = StreamController<dynamic>();
          when(() => c.stream).thenAnswer((_) => controller.stream);
          final sink = MockWebSocketSink();
          when(() => sink.close()).thenAnswer((_) async {});
          when(() => c.sink).thenReturn(sink);
          // The client now awaits channel.ready before resetting the backoff ladder.
          when(() => c.ready).thenAnswer((_) async {});
          controllers.add(controller);
          return c;
        },
      );
      final events = <Map<String, dynamic>>[];
      final sub = client.events.listen(events.add);
      await client.connect();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      // A non-JSON text frame and a binary frame must not escape to the zone
      // (an exception in a data handler is not routed to onError).
      controllers.last.add('not json');
      controllers.last.add([1, 2]);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(events, isEmpty);
      await sub.cancel();
      await client.close();
    });

    test('a null ticket schedules a reconnect on the backoff ladder', () {
      fakeAsync((async) {
        final tickets = <String?>[null, 'tok'];
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => tickets.removeAt(0),
          channelFactory: makeChannel,
        );
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(_channelLedger, isEmpty); // no socket opened on null ticket
        async.elapse(const Duration(seconds: 3)); // 2s backoff rung → retry
        expect(_channelLedger, hasLength(1)); // retry succeeded, socket opened
        client.close();
      });
    });

    test('a stalled handshake does not connect or reset the ladder', () {
      fakeAsync((async) {
        var calls = 0;
        final readyCompleter = Completer<void>();
        final connectivity = <bool>[];
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) {
            calls++;
            if (calls <= 2) throw StateError('down');
            final c = MockWebSocketChannel();
            final ctrl = StreamController<dynamic>();
            final sink = MockWebSocketSink();
            when(() => sink.close()).thenAnswer((_) async {});
            when(() => c.stream).thenAnswer((_) => ctrl.stream);
            when(() => c.sink).thenReturn(sink);
            when(() => c.ready).thenAnswer((_) => readyCompleter.future);
            return c;
          },
        );
        final sub = client.connected.listen(connectivity.add);
        client.connect(); // call 1: throw → 2s, attempts→1
        async.elapse(
          const Duration(seconds: 2),
        ); // call 2: throw → 4s, attempts→2
        async.elapse(
          const Duration(seconds: 4),
        ); // call 3: channel created, awaiting ready (stalled)
        expect(connectivity, [
          false,
          false,
        ]); // two failed connects, not connected
        expect(client.isConnected, isFalse);
        async.elapse(
          const Duration(seconds: 8),
        ); // past the 8s rung: no false retry
        expect(connectivity, [
          false,
          false,
        ]); // no new emission while awaiting ready
        expect(client.isConnected, isFalse);
        readyCompleter
            .complete(); // handshake completes → reset applies post-ready
        async.elapse(const Duration(milliseconds: 10));
        expect(connectivity, [false, false, true]);
        expect(client.isConnected, isTrue);
        sub.cancel();
        client.close();
      });
    });

    test('backoff ladder resets only after the handshake completes', () {
      fakeAsync((async) {
        final readyCompleter = Completer<void>();
        final connectivity = <bool>[];
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) {
            final c = MockWebSocketChannel();
            final ctrl = StreamController<dynamic>();
            final sink = MockWebSocketSink();
            when(() => sink.close()).thenAnswer((_) async {});
            when(() => c.stream).thenAnswer((_) => ctrl.stream);
            when(() => c.sink).thenReturn(sink);
            when(() => c.ready).thenAnswer((_) => readyCompleter.future);
            return c;
          },
        );
        final sub = client.connected.listen(connectivity.add);
        client.connect();
        async.elapse(const Duration(seconds: 2));
        expect(connectivity, isEmpty); // reset not applied before handshake
        expect(client.isConnected, isFalse);
        readyCompleter.complete();
        async.elapse(const Duration(milliseconds: 10));
        expect(connectivity, [true]); // reset applied after handshake
        expect(client.isConnected, isTrue);
        sub.cancel();
        client.close();
      });
    });

    test('a rejecting handshake schedules a reconnect', () {
      fakeAsync((async) {
        var failReady = true;
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) {
            final c = MockWebSocketChannel();
            final ctrl = StreamController<dynamic>();
            final sink = MockWebSocketSink();
            when(() => sink.close()).thenAnswer((_) async {});
            when(() => c.stream).thenAnswer((_) => ctrl.stream);
            when(() => c.sink).thenReturn(sink);
            when(() => c.ready).thenAnswer((_) {
              if (failReady) {
                failReady = false;
                return Future<void>.error(StateError('handshake failed'));
              }
              return Future.value();
            });
            return c;
          },
        );
        client.connect();
        async.elapse(const Duration(milliseconds: 10));
        expect(client.isConnected, isFalse); // handshake failed, not connected
        async.elapse(const Duration(seconds: 3)); // 2s backoff → retry succeeds
        expect(client.isConnected, isTrue);
        client.close();
      });
    });

    test('a close during a pending handshake does not connect', () {
      fakeAsync((async) {
        final readyCompleter = Completer<void>();
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) {
            final c = MockWebSocketChannel();
            final ctrl = StreamController<dynamic>();
            final sink = MockWebSocketSink();
            when(() => sink.close()).thenAnswer((_) async {});
            when(() => c.stream).thenAnswer((_) => ctrl.stream);
            when(() => c.sink).thenReturn(sink);
            when(() => c.ready).thenAnswer((_) => readyCompleter.future);
            return c;
          },
        );
        client.connect();
        async.elapse(
          const Duration(milliseconds: 10),
        ); // reach await ready (stalled)
        client.close(); // close while ready is pending (sets _closed)
        async.elapse(
          const Duration(milliseconds: 10),
        ); // flush close() microtasks
        readyCompleter.complete();
        async.elapse(const Duration(milliseconds: 10));
        expect(client.isConnected, isFalse); // _closed guard short-circuits
      });
    });

    test('a stalled handshake times out and schedules a reconnect', () {
      fakeAsync((async) {
        final readyCompleter = Completer<void>(); // never completes
        var channels = 0;
        final client = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          channelFactory: (uri) {
            channels++;
            final c = MockWebSocketChannel();
            final ctrl = StreamController<dynamic>();
            final sink = MockWebSocketSink();
            when(() => sink.close()).thenAnswer((_) async {});
            when(() => c.stream).thenAnswer((_) => ctrl.stream);
            when(() => c.sink).thenReturn(sink);
            when(() => c.ready).thenAnswer((_) => readyCompleter.future);
            return c;
          },
        );
        client.connect(); // channel #1, ready stalls
        async.elapse(const Duration(milliseconds: 10));
        expect(client.isConnected, isFalse);
        expect(channels, 1);
        // Elapse past the 10s ready timeout → TimeoutException → reconnect scheduled
        async.elapse(const Duration(seconds: 12));
        // Retry fired after the timeout → channel #2 created, ready stalls again
        expect(channels, 2);
        expect(client.isConnected, isFalse);
        client.close();
      });
    });

    test(
      'repeated null tickets retry on fixed interval without burning rungs',
      () {
        fakeAsync((async) {
          final tickets = <String?>[null, null, null, 'tok'];
          var ticketCalls = 0;
          final client = RealtimeClient(
            wsUrl: 'wss://x/ws',
            ticketProvider: () async => tickets[ticketCalls++],
            channelFactory: makeChannel,
          );
          client.connect(); // null → fixed 2s retry, no socket
          async.elapse(const Duration(milliseconds: 10));
          expect(_channelLedger, isEmpty);
          // 3 null retries at 2s fixed interval → 'tok' on the 4th call
          async.elapse(const Duration(seconds: 7));
          expect(
            _channelLedger,
            hasLength(1),
          ); // channel opened on fixed interval
          expect(ticketCalls, 4); // null, null, null, tok
          expect(client.isConnected, isTrue);
          client.close();
        });
      },
    );
  });

  group('DashboardBloc realtime wiring', () {
    test('a realtime sale event triggers a refresh', () async {
      final api = MockApiClient();
      final controller = StreamController<Map<String, dynamic>>();
      when(
        () => api.get(
          any(),
          idToken: any(named: 'idToken'),
          query: any(named: 'query'),
        ),
      ).thenAnswer((inv) {
        final path = inv.positionalArguments[0] as String;
        return switch (path) {
          '/admin/overview' => Future.value(
            const Right(<String, dynamic>{
              'ok': true,
              'data': {
                'stats': {'saleCount': 0, 'totalPiastres': 0},
                'active_sessions': 0,
              },
            }),
          ),
          '/admin/devices' => Future.value(
            const Right(<String, dynamic>{
              'ok': true,
              'data': {'devices': []},
            }),
          ),
          '/admin/activity' => Future.value(
            const Right(<String, dynamic>{
              'ok': true,
              'data': {'events': []},
            }),
          ),
          _ => Future.value(
            const Right(<String, dynamic>{
              'ok': true,
              'data': {'sessions': []},
            }),
          ),
        };
      });
      final realtime = RealtimeClient(
        wsUrl: 'wss://x/ws',
        ticketProvider: () async => 'tok',
        incomingForTest: controller.stream,
        channelFactory: (uri) => makeChannel(uri),
      );
      final bloc = DashboardBloc(
        api: api,
        tokenProvider: () async => 'tok',
        realtime: realtime,
      );
      final states = <DashboardState>[];
      final sub = bloc.stream.listen(states.add);
      bloc.add(const OverviewRequested());
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final loadsAfterFirst = states.whereType<DashboardLoaded>().length;
      controller.add(
        jsonDecode('{"type": "sale", "count": 1}') as Map<String, dynamic>,
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final loadsAfterEvent = states.whereType<DashboardLoaded>().length;
      expect(loadsAfterEvent, greaterThan(loadsAfterFirst));
      await sub.cancel();
      await bloc.close(); // also closes the realtime client
      expect(realtime.isClosed, isTrue);
    });

    test(
      'surfaces the realtime connectivity flag in the loaded state',
      () async {
        final api = MockApiClient();
        final controller = StreamController<Map<String, dynamic>>();
        when(
          () => api.get(
            any(),
            idToken: any(named: 'idToken'),
            query: any(named: 'query'),
          ),
        ).thenAnswer((inv) {
          final path = inv.positionalArguments[0] as String;
          return switch (path) {
            '/admin/overview' => Future.value(
              const Right(<String, dynamic>{
                'ok': true,
                'data': {
                  'stats': {'saleCount': 0, 'totalPiastres': 0},
                  'active_sessions': 0,
                },
              }),
            ),
            '/admin/devices' => Future.value(
              const Right(<String, dynamic>{
                'ok': true,
                'data': {'devices': []},
              }),
            ),
            '/admin/activity' => Future.value(
              const Right(<String, dynamic>{
                'ok': true,
                'data': {'events': []},
              }),
            ),
            _ => Future.value(
              const Right(<String, dynamic>{
                'ok': true,
                'data': {'sessions': []},
              }),
            ),
          };
        });
        final realtime = RealtimeClient(
          wsUrl: 'wss://x/ws',
          ticketProvider: () async => 'tok',
          incomingForTest: controller.stream,
          channelFactory: (uri) => makeChannel(uri),
        );
        final bloc = DashboardBloc(
          api: api,
          tokenProvider: () async => 'tok',
          realtime: realtime,
        );
        final states = <DashboardState>[];
        final sub = bloc.stream.listen(states.add);
        bloc.add(const OverviewRequested());
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(bloc.realtimeConnected, isTrue);
        expect((states.last as DashboardLoaded).realtimeConnected, isTrue);
        await sub.cancel();
        await bloc.close();
      },
    );
  });
}
