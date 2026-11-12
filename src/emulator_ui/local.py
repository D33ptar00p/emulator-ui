"""Safety guard: the console only ever talks to an emulator on this machine, never to real AWS."""

from __future__ import annotations

import os
from urllib.parse import urlparse

LOCAL_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


class NotLocalEndpointError(RuntimeError):
    """Raised when an endpoint that must be the local emulator points somewhere else."""


def assert_local_endpoint(endpoint: str | None = None) -> str:
    """Return the endpoint (default: AWS_ENDPOINT_URL), or raise if it isn't on localhost."""
    endpoint = os.environ.get("AWS_ENDPOINT_URL", "") if endpoint is None else endpoint
    if urlparse(endpoint).hostname not in LOCAL_HOSTS:
        raise NotLocalEndpointError(
            f"emulator endpoint {endpoint!r} is not local; start the emulator and "
            "`source scripts/emulator-env.sh` first."
        )
    return endpoint
