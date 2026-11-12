"""Guards for a local-only console that holds emulator credentials.

* Host check: only answer to localhost names, which blocks DNS-rebinding from web pages.
* CSRF check: state-changing requests must carry a custom header, which a cross-site
  form post or simple fetch cannot add without a CORS preflight (which we never grant).
* Region: X-Emulator-Region is validated and scoped to the request (see regions.py).
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from emulator_ui import regions

ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost", "[::1]"})
CSRF_HEADER = "x-emulator-ui"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def hostname(host_header: str) -> str:
    """Host header without its port; IPv6 literals keep their brackets."""
    if host_header.startswith("["):
        return host_header.split("]", 1)[0] + "]"
    return host_header.rsplit(":", 1)[0]


class LocalOnlyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if hostname(request.headers.get("host", "")) not in ALLOWED_HOSTS:
            return JSONResponse({"error": "Forbidden", "message": "console only serves localhost"}, 403)
        if (
            request.url.path.startswith("/api/")
            and request.method not in SAFE_METHODS
            and request.headers.get(CSRF_HEADER) != "1"
        ):
            return JSONResponse({"error": "Forbidden", "message": f"missing {CSRF_HEADER} header"}, 403)
        try:
            token = regions.set_current(request.headers.get(regions.REGION_HEADER))
        except regions.InvalidRegionError as exc:
            return JSONResponse({"error": "InvalidRegion", "message": str(exc)}, 400)
        try:
            return await call_next(request)
        finally:
            regions.reset_current(token)
