"""Generic explorer for every emulator service: catalog, operations, an operation runner, inventory."""

from __future__ import annotations

import base64
import json
import time
from typing import Any

from botocore import xform_name
from botocore.response import StreamingBody
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from emulator_ui import aws, catalog, inventory, regions
from emulator_ui.jsonutil import revive_bytes, to_jsonable

router = APIRouter(tags=["services"])

MAX_ITEMS = 1000
MAX_STREAM_BYTES = 1024 * 1024


class RunRequest(BaseModel):
    params: dict[str, Any] = {}
    paginate: bool = False


def _op_or_404(service: str, op: str):
    try:
        return catalog.operation(service, op)
    except KeyError as exc:
        raise HTTPException(404, f"unknown service or operation: {exc}") from exc


def _read_streams(value: Any) -> Any:
    """Replace StreamingBody values (e.g. S3 GetObject Body) with up to 1 MB of their content."""
    if isinstance(value, dict):
        return {k: _read_streams(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_read_streams(v) for v in value]
    if isinstance(value, StreamingBody):
        data = value.read(MAX_STREAM_BYTES + 1)
        truncated = len(data) > MAX_STREAM_BYTES
        data = data[:MAX_STREAM_BYTES]
        try:
            return {"__stream__": data.decode("utf-8"), "truncated": truncated}
        except UnicodeDecodeError:
            return {
                "__stream__": base64.b64encode(data).decode(),
                "encoding": "base64",
                "truncated": truncated,
            }
    return value


def _revive(params: dict[str, Any]) -> dict[str, Any]:
    """{"__bytes__": b64} -> bytes anywhere in the params (blob members). Numbers stay as-is: unlike the
    DynamoDB resource layer, generic serializers expect plain int/float, not Decimal."""
    return json.loads(json.dumps(params), object_hook=revive_bytes) if params else {}


@router.get("/catalog")
def get_catalog() -> dict:
    return {"iconPackage": catalog.icon_package(), "services": list(catalog.services().values())}


@router.get("/services/{service}")
def describe_service(service: str) -> dict:
    try:
        m = catalog.model(service)
    except KeyError as exc:
        raise HTTPException(404, f"unknown service {service!r}") from exc
    ops = []
    for name in m.operation_names:
        op = m.operation_model(name)
        ops.append(
            {
                "name": name,
                "group": catalog.group_of(name),
                "destructive": catalog.is_destructive(name),
                "required": op.input_shape.required_members if op.input_shape else [],
                "eventStream": bool(op.has_event_stream_output or op.has_event_stream_input),
                "deprecated": op.deprecated,
            }
        )
    entry = catalog.services()[service]
    return {**entry, "apiVersion": m.api_version, "operationsDetail": ops}


@router.get("/services/{service}/operations/{op}")
def describe_operation(service: str, op: str) -> dict:
    model = _op_or_404(service, op)
    shape = model.input_shape
    return {
        "service": service,
        "name": op,
        "group": catalog.group_of(op),
        "destructive": catalog.is_destructive(op),
        "docs": catalog.plain_docs(model.documentation),
        "required": shape.required_members if shape else [],
        "members": catalog.member_docs(shape),
        "skeleton": catalog.skeleton(shape, required_only=True),
        "fullSkeleton": catalog.skeleton(shape, required_only=False),
        "paginated": aws.client(service).can_paginate(xform_name(op)),
        "eventStream": bool(model.has_event_stream_output or model.has_event_stream_input),
    }


@router.post("/services/{service}/operations/{op}")
def run_operation(service: str, op: str, req: RunRequest) -> dict:
    model = _op_or_404(service, op)
    if model.has_event_stream_output or model.has_event_stream_input:
        raise HTTPException(400, f"{op} uses an event stream, which the console can't run")
    client = aws.client(service)
    method = xform_name(op)
    params = _revive(req.params)
    started = time.perf_counter()
    if req.paginate and client.can_paginate(method):
        result = (
            client.get_paginator(method)
            .paginate(**params, PaginationConfig={"MaxItems": MAX_ITEMS})
            .build_full_result()
        )
    else:
        result = getattr(client, method)(**params)
    return {
        "service": service,
        "operation": op,
        "region": regions.current(),
        "durationMs": round((time.perf_counter() - started) * 1000, 1),
        "result": to_jsonable(_read_streams(result)),
    }


@router.get("/inventory")
def get_inventory(refresh: bool = False) -> dict:
    return inventory.snapshot(regions.current(), refresh=refresh)
