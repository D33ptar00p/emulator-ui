"""HTTPS helpers for talking to emulator data planes (trusts the emulator's per-run CA)."""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from collections.abc import Mapping


def _ssl_context(cafile: str | None = None) -> ssl.SSLContext:
    return ssl.create_default_context(cafile=cafile or os.environ["AWS_CA_BUNDLE"])


def http_request(
    url: str,
    method: str = "GET",
    body: bytes | dict | None = None,
    headers: Mapping[str, str] | None = None,
    cafile: str | None = None,
) -> tuple[int, bytes]:
    """Unsigned HTTPS request trusting the emulator CA. Returns (status, body) for any status.

    `cafile` defaults to AWS_CA_BUNDLE; pass another emulator's ca.pem to talk to it instead.
    """
    data = json.dumps(body).encode() if isinstance(body, dict) else body
    req = urllib.request.Request(url, data=data, method=method, headers=dict(headers or {}))
    try:
        with urllib.request.urlopen(req, context=_ssl_context(cafile), timeout=10) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def execute_api_url(api_id: str, path: str = "", endpoint: str | None = None) -> str:
    """Local address of an API Gateway data plane (REST: path starts with the stage name).

    On AWS this is https://{api_id}.execute-api.{region}.amazonaws.com/...; the emulator
    serves it on its own endpoint under the reserved /_aws/execute-api/{api_id} prefix.
    """
    base = endpoint or os.environ["AWS_ENDPOINT_URL"]
    return f"{base}/_aws/execute-api/{api_id}/{path.lstrip('/')}"
