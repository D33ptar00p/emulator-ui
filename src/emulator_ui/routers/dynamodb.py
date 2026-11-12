from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Body, Query
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import parse_item, to_jsonable

router = APIRouter(prefix="/dynamodb", tags=["dynamodb"])


class CreateTable(BaseModel):
    name: str
    partitionKey: str
    partitionKeyType: str = "S"
    sortKey: str | None = None
    sortKeyType: str = "S"


@router.get("/tables")
def list_tables() -> list[dict]:
    ddb = aws.client("dynamodb")
    names = aws.collect(ddb.get_paginator("list_tables").paginate(), "TableNames[]")
    out = []
    for name in names:
        t = ddb.describe_table(TableName=name)["Table"]
        out.append(
            {
                "name": name,
                "status": t["TableStatus"],
                "itemCount": t.get("ItemCount", 0),
                "keys": {k["KeyType"]: k["AttributeName"] for k in t["KeySchema"]},
                "indexes": [g["IndexName"] for g in t.get("GlobalSecondaryIndexes", [])],
                "created": t.get("CreationDateTime"),
            }
        )
    return to_jsonable(out)


@router.post("/tables")
def create_table(spec: CreateTable) -> dict:
    attrs = [{"AttributeName": spec.partitionKey, "AttributeType": spec.partitionKeyType}]
    keys = [{"AttributeName": spec.partitionKey, "KeyType": "HASH"}]
    if spec.sortKey:
        attrs.append({"AttributeName": spec.sortKey, "AttributeType": spec.sortKeyType})
        keys.append({"AttributeName": spec.sortKey, "KeyType": "RANGE"})
    resp = aws.client("dynamodb").create_table(
        TableName=spec.name, AttributeDefinitions=attrs, KeySchema=keys, BillingMode="PAY_PER_REQUEST"
    )
    return to_jsonable(resp["TableDescription"])


@router.get("/tables/{name}")
def describe_table(name: str) -> dict:
    return to_jsonable(aws.client("dynamodb").describe_table(TableName=name)["Table"])


@router.delete("/tables/{name}")
def delete_table(name: str) -> dict:
    aws.client("dynamodb").delete_table(TableName=name)
    return {"deleted": name}


@router.get("/tables/{name}/items")
def scan_items(
    name: str,
    limit: int = Query(50, ge=1, le=500),
    start: str | None = Query(None, description="JSON LastEvaluatedKey from the previous page"),
) -> dict:
    kwargs: dict[str, Any] = {"Limit": limit}
    if start:
        kwargs["ExclusiveStartKey"] = parse_item(start)
    resp = aws.dynamodb().Table(name).scan(**kwargs)
    last = resp.get("LastEvaluatedKey")
    return {
        "items": to_jsonable(resp.get("Items", [])),
        "next": json.dumps(to_jsonable(last)) if last else None,
    }


@router.put("/tables/{name}/items")
def put_item(name: str, item: dict = Body(..., embed=True)) -> dict:
    aws.dynamodb().Table(name).put_item(Item=parse_item(item))
    return {"ok": True}


@router.post("/tables/{name}/items/delete")
def delete_item(name: str, key: dict = Body(..., embed=True)) -> dict:
    aws.dynamodb().Table(name).delete_item(Key=parse_item(key))
    return {"ok": True}
