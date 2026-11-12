"""Loopback TCP relay to emulators running in *separate* containers.

The emulator's self-signed certificate is only valid for 127.0.0.1. When the console runs in its own
container, it reaches an emulator on a shared Docker network (container `aws-emulator-<port>`) - a
host name the certificate doesn't cover. So, when EMULATOR_RELAY=1, the console listens on its own
127.0.0.1:<port> and forwards raw bytes to `<EMULATOR_RELAY_HOST pattern>:<port>`. TLS still runs end to
end between boto3 and the emulator, with full certificate verification against the emulator's CA.

Relays start lazily, the first time a port is resolved, so emulators can be started, stopped or added
(e.g. a new region) at any time without restarting the console.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading

log = logging.getLogger(__name__)

_lock = threading.Lock()
_loop: asyncio.AbstractEventLoop | None = None
_ports: set[int] = set()  # ports we've set up (or found already bound) - never retried
CONNECT_TIMEOUT = 3.0


def enabled() -> bool:
    return os.environ.get("EMULATOR_RELAY") == "1"


def upstream_host(port: int) -> str:
    """Where the emulator for `port` is reachable, e.g. `aws-emulator-9297` on the shared network."""
    return os.environ.get("EMULATOR_RELAY_HOST", "aws-emulator-{port}").format(port=port)


def _event_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is None:
        _loop = asyncio.new_event_loop()
        threading.Thread(target=_loop.run_forever, name="emulator-relay", daemon=True).start()
    return _loop


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, OSError):
        pass
    finally:
        writer.close()


async def _handle(port: int, client_r: asyncio.StreamReader, client_w: asyncio.StreamWriter) -> None:
    try:
        connect = asyncio.open_connection(upstream_host(port), port)
        up_r, up_w = await asyncio.wait_for(connect, CONNECT_TIMEOUT)
    except (OSError, TimeoutError):
        client_w.close()  # emulator not running: the client sees a closed connection (=> "unreachable")
        return
    await asyncio.gather(_pipe(client_r, up_w), _pipe(up_r, client_w))


async def _start(port: int) -> asyncio.AbstractServer:
    return await asyncio.start_server(lambda r, w: _handle(port, r, w), "127.0.0.1", port)


def ensure(port: int) -> None:
    """Make 127.0.0.1:<port> reach the emulator on that port (no-op unless EMULATOR_RELAY=1)."""
    if not enabled():
        return
    with _lock:
        if port in _ports:
            return
        _ports.add(port)
        try:
            asyncio.run_coroutine_threadsafe(_start(port), _event_loop()).result(timeout=5)
            log.info("relay 127.0.0.1:%s -> %s:%s", port, upstream_host(port), port)
        except OSError as exc:  # already bound (e.g. a real emulator on this port) - use it as-is
            log.warning("relay for port %s not started: %s", port, exc)
