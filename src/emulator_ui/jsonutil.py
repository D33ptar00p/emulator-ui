"""Conversion between AWS SDK values and JSON."""

from __future__ import annotations

import base64
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any


def to_jsonable(value: Any) -> Any:
    """Recursively convert SDK output (Decimal, bytes, sets, datetimes) into JSON-safe values."""
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items() if k != "ResponseMetadata"}
    if isinstance(value, list | tuple):
        return [to_jsonable(v) for v in value]
    if isinstance(value, set | frozenset):
        return sorted((to_jsonable(v) for v in value), key=str)
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, bytes | bytearray):
        return {"__bytes__": base64.b64encode(bytes(value)).decode()}
    if isinstance(value, datetime | date):
        return value.isoformat()
    if hasattr(value, "value") and type(value).__name__ == "Binary":  # boto3.dynamodb.types.Binary
        return {"__bytes__": base64.b64encode(value.value).decode()}
    return value


def revive_bytes(obj: dict) -> Any:
    """json object_hook: {"__bytes__": b64} -> bytes."""
    if set(obj) == {"__bytes__"}:
        return base64.b64decode(obj["__bytes__"])
    return obj


def parse_item(raw: str | dict) -> dict:
    """Parse a user-supplied DynamoDB item: floats become Decimal, {"__bytes__": b64} becomes bytes."""
    text = raw if isinstance(raw, str) else json.dumps(raw)
    item = json.loads(text, parse_float=Decimal, object_hook=revive_bytes)
    if not isinstance(item, dict):
        raise ValueError("item must be a JSON object")
    return item
