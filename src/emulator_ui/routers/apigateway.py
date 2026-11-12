from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable
from emulator_ui.net import execute_api_url, http_request

router = APIRouter(prefix="/apigateway", tags=["apigateway"])


class InvokeRequest(BaseModel):
    apiId: str
    path: str  # REST: "{stage}/resource"; HTTP API: "resource" (or "{stage}/resource")
    method: str = "GET"
    body: str | None = None
    headers: dict[str, str] = {}


@router.get("/rest")
def list_rest_apis() -> list[dict]:
    pages = aws.client("apigateway").get_paginator("get_rest_apis").paginate()
    return to_jsonable(aws.collect(pages, "items[]"))


@router.get("/rest/{api_id}")
def rest_api(api_id: str) -> dict:
    ag = aws.client("apigateway")
    resources = aws.collect(
        ag.get_paginator("get_resources").paginate(restApiId=api_id, embed=["methods"]), "items[]"
    )
    routes = []
    for r in sorted(resources, key=lambda r: r["path"]):
        for method, m in (r.get("resourceMethods") or {}).items():
            integ = m.get("methodIntegration") or {}
            routes.append(
                {
                    "path": r["path"],
                    "method": method,
                    "resourceId": r["id"],
                    "auth": m.get("authorizationType"),
                    "integration": integ.get("type"),
                    "uri": integ.get("uri"),
                }
            )
    return to_jsonable(
        {
            "api": ag.get_rest_api(restApiId=api_id),
            "routes": routes,
            "stages": ag.get_stages(restApiId=api_id).get("item", []),
            "invokeBase": execute_api_url(api_id, endpoint=aws.target().endpoint),
        }
    )


@router.get("/http")
def list_http_apis() -> list[dict]:
    pages = aws.client("apigatewayv2").get_paginator("get_apis").paginate()
    return to_jsonable(aws.collect(pages, "Items[]"))


@router.get("/http/{api_id}")
def http_api(api_id: str) -> dict:
    v2 = aws.client("apigatewayv2")
    integrations = {i["IntegrationId"]: i for i in v2.get_integrations(ApiId=api_id).get("Items", [])}
    routes = []
    for r in v2.get_routes(ApiId=api_id).get("Items", []):
        target = (r.get("Target") or "").removeprefix("integrations/")
        integ = integrations.get(target, {})
        routes.append(
            {
                "routeKey": r["RouteKey"],
                "auth": r.get("AuthorizationType"),
                "integration": integ.get("IntegrationType"),
                "uri": integ.get("IntegrationUri"),
            }
        )
    return to_jsonable(
        {
            "api": v2.get_api(ApiId=api_id),
            "routes": sorted(routes, key=lambda r: r["routeKey"]),
            "stages": v2.get_stages(ApiId=api_id).get("Items", []),
            "invokeBase": execute_api_url(api_id, endpoint=aws.target().endpoint),
        }
    )


@router.post("/invoke")
def invoke(req: InvokeRequest) -> dict:
    """Send a real HTTP request to the API's local data plane and return what came back."""
    target = aws.target()
    url = execute_api_url(req.apiId, req.path, endpoint=target.endpoint)
    status, raw = http_request(
        url,
        method=req.method.upper(),
        body=req.body.encode() if req.body else None,
        headers=req.headers,
        cafile=target.ca_bundle,
    )
    text = raw.decode(errors="replace")
    body: Any
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        body = text
    return {"status": status, "body": body, "url": url}
