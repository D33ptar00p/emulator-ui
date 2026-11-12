"""Background resource inventory: which services hold resources, per region.

Calls each catalog service's browse operations (List*/Describe* with no required input) in parallel.
Results are cached per region for CACHE_SECONDS; the dashboard polls while a scan is running.
"""

from __future__ import annotations

import functools
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from botocore import xform_name
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from emulator_ui import aws, catalog

CACHE_SECONDS = 30
MAX_OPS_PER_SERVICE = 3
WORKERS = 24
SCAN_CONFIG = Config(connect_timeout=2, read_timeout=5, retries={"total_max_attempts": 1})

BASELINE_PATH = Path(__file__).with_name("inventory_baseline.json")

_lock = threading.Lock()
_scans: dict[str, dict[str, Any]] = {}  # region -> scan state


@functools.cache
def baseline() -> dict[str, int]:
    """Items a fresh emulator already lists per "service.Operation" (see capture_inventory_baseline.py)."""
    try:
        return json.loads(BASELINE_PATH.read_text())["ops"]
    except (OSError, ValueError, KeyError):
        return {}


def _probe(
    service: str, ops: list[str], region: str, apply_baseline: bool = True
) -> tuple[str, dict[str, Any]]:
    """count = user-created items (above the built-in baseline); total = everything listed."""
    result: dict[str, Any] = {"count": 0, "total": 0, "ops": {}}
    builtin = baseline() if apply_baseline else {}
    client = aws.client(service, region=region, config=SCAN_CONFIG)
    for op in ops[:MAX_OPS_PER_SERVICE]:
        try:
            out = getattr(client, xform_name(op))()
            total = catalog.list_member_count(out)
            user = max(0, total - builtin.get(f"{service}.{op}", 0))
            result["ops"][op] = user
            result["total"] += total
            result["count"] += user
        except ClientError as err:
            status = err.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = err.response.get("Error", {}).get("Code", "Error")
            result["ops"][op] = (
                "not implemented" if status == 501 or code == "NotImplemented" else f"error: {code}"
            )
        except (BotoCoreError, ValueError) as err:
            result["ops"][op] = f"error: {type(err).__name__}"
        except Exception as err:  # noqa: BLE001 - one broken service must never stop the scan
            result["ops"][op] = f"error: {type(err).__name__}"
    return service, result


def _run(region: str, state: dict[str, Any]) -> None:
    jobs = {sid: entry["listOps"] for sid, entry in catalog.services().items() if entry["listOps"]}
    try:
        with ThreadPoolExecutor(max_workers=WORKERS, thread_name_prefix=f"inventory-{region}") as pool:
            for service, result in pool.map(lambda item: _probe(item[0], item[1], region), jobs.items()):
                with _lock:
                    state["services"][service] = result
    finally:
        with _lock:
            state["scanning"] = False
            state["finishedAt"] = time.time()


def snapshot(region: str, refresh: bool = False) -> dict[str, Any]:
    """Current inventory for a region; starts a background scan if stale (or `refresh`)."""
    with _lock:
        state = _scans.get(region)
        stale = state is None or (
            not state["scanning"] and (refresh or time.time() - (state["finishedAt"] or 0) > CACHE_SECONDS)
        )
        if stale:
            previous = state["services"] if state else {}
            state = {
                "region": region,
                "scanning": True,
                "startedAt": time.time(),
                "finishedAt": None,
                "services": dict(previous),  # keep showing the last results while rescanning
            }
            _scans[region] = state
            threading.Thread(target=_run, args=(region, state), daemon=True).start()
        return {
            "region": state["region"],
            "scanning": state["scanning"],
            "startedAt": state["startedAt"],
            "finishedAt": state["finishedAt"],
            "services": dict(state["services"]),
        }
