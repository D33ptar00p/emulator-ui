"""The loopback relay forwards bytes to `EMULATOR_RELAY_HOST:<same port>` (no emulator needed)."""

from __future__ import annotations

import socket
import socketserver
import threading

import pytest

from emulator_ui import relay


class _Echo(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        while data := self.request.recv(1024):
            self.request.sendall(b"echo:" + data)


@pytest.fixture
def upstream():
    """An 'emulator' on 127.0.0.2:<free port> (Linux routes all of 127/8 to loopback)."""
    server = socketserver.ThreadingTCPServer(("127.0.0.2", 0), _Echo)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


def test_relay_forwards_to_upstream_on_same_port(monkeypatch, upstream) -> None:
    monkeypatch.setenv("EMULATOR_RELAY", "1")
    monkeypatch.setenv("EMULATOR_RELAY_HOST", "127.0.0.2")
    relay.ensure(upstream)
    relay.ensure(upstream)  # idempotent
    with socket.create_connection(("127.0.0.1", upstream), timeout=3) as conn:
        conn.sendall(b"hello")
        assert conn.recv(1024) == b"echo:hello"


def test_relay_closes_connection_when_upstream_is_down(monkeypatch) -> None:
    with socket.socket() as probe:  # a port nobody listens on
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    monkeypatch.setenv("EMULATOR_RELAY", "1")
    monkeypatch.setenv("EMULATOR_RELAY_HOST", "127.0.0.2")
    relay.ensure(port)
    with socket.create_connection(("127.0.0.1", port), timeout=5) as conn:
        assert conn.recv(1024) == b""  # emulator "off": clean close, no hang


def test_relay_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("EMULATOR_RELAY", raising=False)
    relay.ensure(1)  # no-op: nothing is bound, no error
