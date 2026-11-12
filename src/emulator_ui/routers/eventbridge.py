from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/eventbridge", tags=["eventbridge"])


class PutEvent(BaseModel):
    bus: str = "default"
    source: str
    detailType: str
    detail: Any = {}


@router.get("/buses")
def list_buses() -> list[dict]:
    return to_jsonable(aws.client("events").list_event_buses().get("EventBuses", []))


@router.get("/rules")
def list_rules(bus: str = Query("default")) -> list[dict]:
    ev = aws.client("events")
    rules = aws.collect(ev.get_paginator("list_rules").paginate(EventBusName=bus), "Rules[]")
    for rule in rules:
        rule["Targets"] = ev.list_targets_by_rule(Rule=rule["Name"], EventBusName=bus).get("Targets", [])
        if rule.get("EventPattern"):
            rule["EventPattern"] = json.loads(rule["EventPattern"])
    return to_jsonable(rules)


@router.post("/events")
def put_event(req: PutEvent) -> dict:
    resp = aws.client("events").put_events(
        Entries=[
            {
                "EventBusName": req.bus,
                "Source": req.source,
                "DetailType": req.detailType,
                "Detail": json.dumps(req.detail),
            }
        ]
    )
    return to_jsonable(resp)
