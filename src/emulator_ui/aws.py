"""boto3 access for the console, per region / per emulator.

Each emulator rotates its keys on every start, so its session is rebuilt whenever its credentials
file changes. Clients are cached per (endpoint, region, service).
"""

from __future__ import annotations

import os
import threading
from typing import Any
from urllib.parse import urlparse

import boto3
import botocore.session
from botocore.config import Config

from emulator_ui import regions
from emulator_ui.local import LOCAL_HOSTS, NotLocalEndpointError

_CONFIG = Config(retries={"total_max_attempts": 2, "mode": "standard"}, connect_timeout=3, read_timeout=30)
_lock = threading.Lock()
# (endpoint, region) -> {"mtime", "session": boto3.Session, "clients": {(kind, service, cfg): client}}
# Each entry owns its botocore session: boto3 registers S3/DynamoDB customisations on the botocore
# session it wraps, so sharing one botocore session between boto3 Sessions breaks (duplicate injection).
_sessions: dict[tuple[str, str], dict[str, Any]] = {}


def _mtime(path: str | None) -> float | None:
    try:
        return os.path.getmtime(path) if path else None
    except OSError:
        return None


def _assert_local(endpoint: str) -> None:
    if urlparse(endpoint).hostname not in LOCAL_HOSTS:
        raise NotLocalEndpointError(f"emulator endpoint {endpoint!r} is not local; refusing to call it")


def _session_state(target: regions.Target) -> dict[str, Any]:
    _assert_local(target.endpoint)  # never let the console talk to real AWS
    mtime = _mtime(target.credentials_file)
    key = (target.endpoint, target.region)
    with _lock:
        state = _sessions.get(key)
        if state is None or state["mtime"] != mtime:  # new emulator run -> new keys
            core = botocore.session.get_session()
            if target.credentials_file:
                core.set_config_variable("credentials_file", target.credentials_file)
            if target.config_file:
                core.set_config_variable("config_file", target.config_file)
            core.set_config_variable("profile", None)
            state = {
                "mtime": mtime,
                "session": boto3.Session(botocore_session=core, region_name=target.region),
                "clients": {},
            }
            _sessions[key] = state
        return state


def _get(kind: str, service: str, region: str | None, config: Config | None) -> Any:
    target = regions.resolve(region)
    state = _session_state(target)
    key = (kind, service, id(config) if config else None)
    with _lock:
        cached = state["clients"].get(key)
        if cached is None:
            factory = state["session"].client if kind == "client" else state["session"].resource
            cached = factory(
                service,
                endpoint_url=target.endpoint,
                verify=target.ca_bundle or True,
                config=_CONFIG.merge(config) if config else _CONFIG,
            )
            state["clients"][key] = cached
        return cached


def client(service: str, region: str | None = None, config: Config | None = None) -> Any:
    """Client for the request's region (X-Emulator-Region), or an explicit region."""
    return _get("client", service, region, config)


def ephemeral_client(service: str, region: str | None = None, config: Config | None = None) -> Any:
    """An uncached client the caller must close() - for bulk work like the inventory scan, so hundreds of
    services don't each keep idle keep-alive connections (and file descriptors) open afterwards."""
    target = regions.resolve(region)
    state = _session_state(target)
    with _lock:  # boto3 Session.client isn't documented as thread-safe
        return state["session"].client(
            service,
            endpoint_url=target.endpoint,
            verify=target.ca_bundle or True,
            config=_CONFIG.merge(config) if config else _CONFIG,
        )


def dynamodb(region: str | None = None) -> Any:
    """DynamoDB resource (native-type marshalling)."""
    return _get("resource", "dynamodb", region, None)


def target(region: str | None = None) -> regions.Target:
    return regions.resolve(region)


def collect(pages: Any, expression: str) -> list[Any]:
    """Flatten a paginator with a JMESPath expression.

    `PageIterator.search` yields None for a page where the expression matches nothing
    (e.g. ListQueues with no queues omits `QueueUrls`), so those are dropped here.
    """
    return [value for value in pages.search(expression) if value is not None]
