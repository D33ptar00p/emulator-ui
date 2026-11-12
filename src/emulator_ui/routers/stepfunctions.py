from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/stepfunctions", tags=["stepfunctions"])


class StartExecution(BaseModel):
    arn: str
    input: Any = {}
    name: str | None = None


@router.get("/machines")
def list_machines() -> list[dict]:
    pages = aws.client("stepfunctions").get_paginator("list_state_machines").paginate()
    return to_jsonable(aws.collect(pages, "stateMachines[]"))


@router.get("/machine")
def describe_machine(arn: str = Query(...)) -> dict:
    sfn = aws.client("stepfunctions")
    machine = sfn.describe_state_machine(stateMachineArn=arn)
    machine["definition"] = json.loads(machine["definition"])
    executions = sfn.list_executions(stateMachineArn=arn, maxResults=50).get("executions", [])
    return to_jsonable({"machine": machine, "executions": executions})


@router.post("/machine/start")
def start(req: StartExecution) -> dict:
    sfn = aws.client("stepfunctions")
    machine = sfn.describe_state_machine(stateMachineArn=req.arn)
    payload = json.dumps(req.input)
    if machine.get("type") == "EXPRESS":
        resp = sfn.start_sync_execution(stateMachineArn=req.arn, input=payload)
        return to_jsonable({"executionArn": resp.get("executionArn"), "sync": resp})
    kwargs = {"stateMachineArn": req.arn, "input": payload}
    if req.name:
        kwargs["name"] = req.name
    return to_jsonable(sfn.start_execution(**kwargs))


@router.get("/execution")
def describe_execution(arn: str = Query(...)) -> dict:
    sfn = aws.client("stepfunctions")
    execution = sfn.describe_execution(executionArn=arn)
    for field in ("input", "output"):
        if execution.get(field):
            execution[field] = json.loads(execution[field])
    history = aws.collect(sfn.get_paginator("get_execution_history").paginate(executionArn=arn), "events[]")
    return to_jsonable({"execution": execution, "history": history})
