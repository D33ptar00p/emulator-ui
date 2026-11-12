from __future__ import annotations

import base64
import io
import json
import zipfile
from typing import Any

from fastapi import APIRouter, Body
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/lambda", tags=["lambda"])

SOURCE_FILES = {"python": "index.py", "nodejs": "index.js"}


def zip_code(files: dict[str, str]) -> bytes:
    """In-memory Lambda deployment package from {filename: source}."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, source in files.items():
            zf.writestr(name, source)
    return buf.getvalue()


class CreateFunction(BaseModel):
    name: str
    runtime: str = "python3.12"
    handler: str = "index.handler"
    code: str
    role: str
    timeout: int = 15
    memory: int = 128
    environment: dict[str, str] = {}


class UpdateCode(BaseModel):
    code: str


def _package(runtime: str, code: str) -> bytes:
    family = next((f for f in SOURCE_FILES if runtime.startswith(f)), None)
    if family is None:
        raise ValueError(f"inline code is supported for python and nodejs runtimes, not {runtime!r}")
    return zip_code({SOURCE_FILES[family]: code})


@router.post("/functions")
def create_function(req: CreateFunction) -> dict:
    """Create a function from inline source (zipped server-side as index.py / index.js)."""
    lam = aws.client("lambda")
    conf = lam.create_function(
        FunctionName=req.name,
        Runtime=req.runtime,
        Handler=req.handler,
        Role=req.role,
        Timeout=req.timeout,
        MemorySize=req.memory,
        Environment={"Variables": req.environment},
        Code={"ZipFile": _package(req.runtime, req.code)},
    )
    lam.get_waiter("function_active_v2").wait(
        FunctionName=req.name, WaiterConfig={"Delay": 1, "MaxAttempts": 30}
    )
    return to_jsonable(conf)


@router.put("/functions/{name}/code")
def update_code(name: str, req: UpdateCode) -> dict:
    lam = aws.client("lambda")
    runtime = lam.get_function_configuration(FunctionName=name)["Runtime"]
    conf = lam.update_function_code(FunctionName=name, ZipFile=_package(runtime, req.code))
    lam.get_waiter("function_updated_v2").wait(
        FunctionName=name, WaiterConfig={"Delay": 1, "MaxAttempts": 30}
    )
    return to_jsonable(conf)


@router.get("/functions")
def list_functions() -> list[dict]:
    pages = aws.client("lambda").get_paginator("list_functions").paginate()
    return to_jsonable(
        [
            {
                k: f.get(k)
                for k in ("FunctionName", "Runtime", "Handler", "MemorySize", "Timeout", "LastModified")
            }
            for f in aws.collect(pages, "Functions[]")
        ]
    )


@router.get("/functions/{name}")
def get_function(name: str) -> dict:
    lam = aws.client("lambda")
    fn = lam.get_function(FunctionName=name)
    fn.pop("Code", None)  # presigned code URL is noise here
    try:
        fn["Policy"] = json.loads(lam.get_policy(FunctionName=name)["Policy"])
    except lam.exceptions.ResourceNotFoundException:
        fn["Policy"] = None  # no resource policy attached
    fn["Aliases"] = lam.list_aliases(FunctionName=name).get("Aliases", [])
    fn["Versions"] = [v["Version"] for v in lam.list_versions_by_function(FunctionName=name)["Versions"]]
    return to_jsonable(fn)


@router.post("/functions/{name}/invoke")
def invoke(
    name: str, payload: Any = Body(None, embed=True), qualifier: str | None = Body(None, embed=True)
) -> dict:
    kwargs: dict[str, Any] = {
        "FunctionName": name,
        "Payload": json.dumps(payload).encode(),
        "LogType": "Tail",
    }
    if qualifier:
        kwargs["Qualifier"] = qualifier
    resp = aws.client("lambda").invoke(**kwargs)
    raw = resp["Payload"].read().decode(errors="replace")
    try:
        body: Any = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        body = raw
    log = resp.get("LogResult")
    return {
        "statusCode": resp["StatusCode"],
        "functionError": resp.get("FunctionError"),
        "executedVersion": resp.get("ExecutedVersion"),
        "payload": to_jsonable(body),
        "log": base64.b64decode(log).decode(errors="replace") if log else None,
    }


@router.delete("/functions/{name}")
def delete_function(name: str) -> dict:
    aws.client("lambda").delete_function(FunctionName=name)
    return {"deleted": name}
