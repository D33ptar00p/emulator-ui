"""Test helpers shared by the console test modules (importable thanks to pytest `pythonpath`)."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


def wait_for(probe: Callable[[], T | None], timeout: float = 15.0, interval: float = 0.25) -> T:
    """Poll probe() until it returns a truthy value, or raise TimeoutError."""
    deadline = time.monotonic() + timeout
    while True:
        value = probe()
        if value:
            return value
        if time.monotonic() > deadline:
            raise TimeoutError(f"condition not met within {timeout}s")
        time.sleep(interval)
