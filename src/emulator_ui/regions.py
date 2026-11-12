"""Region -> emulator resolution.

One emulator does not reliably isolate resources by region (AWS docs: run one emulator per region).
So a region either has a **dedicated** emulator (EMULATOR_REGION_PORTS, set by `make up REGIONS=...`)
or falls back to the **default** emulator, with the region still sent on every SDK call.

Endpoints only ever come from server-side configuration, never from the client.
"""

from __future__ import annotations

import contextvars
import functools
import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import botocore.session

from emulator_ui import relay

REGION_HEADER = "x-emulator-region"
_REGION_RE = re.compile(r"^[a-z]{2}(-[a-z]+)+-\d{1,2}$")
_current: contextvars.ContextVar[str | None] = contextvars.ContextVar("emulator_region", default=None)


class InvalidRegionError(ValueError):
    """Raised for a region that is malformed or not in the aws partition."""


@dataclass(frozen=True)
class Target:
    region: str
    endpoint: str
    credentials_file: str | None
    config_file: str | None
    ca_bundle: str | None
    dedicated: bool

    @property
    def port(self) -> int:
        return urlparse(self.endpoint).port or 443


@functools.cache
def _partition_regions() -> frozenset[str]:
    return frozenset(botocore.session.get_session().get_available_regions("ec2", partition_name="aws"))


def known_regions() -> tuple[str, ...]:
    """Commercial (aws partition) regions known to this botocore, plus any with a dedicated emulator."""
    return tuple(sorted(_partition_regions() | set(dedicated_ports())))


def default_region() -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"


def emulator_home() -> Path:
    return Path(os.environ.get("EMULATOR_HOME", Path.home() / ".aws" / "emulator"))


def parse_region_ports(raw: str) -> dict[str, int]:
    """'us-east-1=9297, eu-west-2=9298' -> {'us-east-1': 9297, 'eu-west-2': 9298}."""
    out: dict[str, int] = {}
    for part in filter(None, (p.strip() for p in raw.split(","))):
        region, sep, port = part.partition("=")
        region = region.strip()
        if not sep or not _REGION_RE.match(region) or not port.strip().isdigit():
            raise InvalidRegionError(f"bad EMULATOR_REGION_PORTS entry: {part!r}")
        out[region] = int(port)
    return out


def dedicated_ports() -> dict[str, int]:
    """Regions with their own emulator: EMULATOR_REGION_PORTS if set, else the emulator repo's live map
    (~/.aws/emulator/regions, written by its `make up REGIONS=...`), so the console follows emulator
    restarts without being restarted itself."""
    raw = os.environ.get("EMULATOR_REGION_PORTS")
    if raw is None:
        try:
            raw = ",".join((emulator_home() / "regions").read_text().split())
        except OSError:
            raw = ""
    return parse_region_ports(raw)


def validate(region: str) -> str:
    if not _REGION_RE.match(region) or region not in known_regions():
        raise InvalidRegionError(f"unknown region {region!r}")
    return region


def resolve(region: str | None = None) -> Target:
    target = _resolve(validate(region or current()))
    if target.endpoint:
        relay.ensure(target.port)  # console in its own container: reach the emulator via a loopback relay
    return target


def _resolve(region: str) -> Target:
    ports = dedicated_ports()
    if region in ports:
        port = ports[region]
        state = emulator_home() / str(port)
        return Target(
            region=region,
            endpoint=f"https://127.0.0.1:{port}",
            credentials_file=str(state / "emulator_credentials"),
            config_file=str(state / "config"),
            ca_bundle=str(state / "ca.pem"),
            dedicated=True,
        )
    return Target(
        region=region,
        endpoint=os.environ.get("AWS_ENDPOINT_URL", ""),
        credentials_file=os.environ.get("AWS_SHARED_CREDENTIALS_FILE"),
        config_file=os.environ.get("AWS_CONFIG_FILE"),
        ca_bundle=os.environ.get("AWS_CA_BUNDLE"),
        dedicated=False,
    )


def current() -> str:
    return _current.get() or default_region()


def set_current(region: str | None) -> contextvars.Token:
    return _current.set(validate(region) if region else None)


def reset_current(token: contextvars.Token) -> None:
    _current.reset(token)
