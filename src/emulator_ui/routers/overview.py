from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter

from emulator_ui import aws, regions
from emulator_ui.net import http_request

router = APIRouter(tags=["overview"])


def _count(fn: Callable[[], int]) -> int | str:
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - one failing service must not break the dashboard
        return f"error: {type(exc).__name__}"


def _search_len(service: str, op: str, expr: str, **kw) -> int:
    pages = aws.client(service).get_paginator(op).paginate(**kw)
    return len(aws.collect(pages, expr))


COUNTERS: dict[str, Callable[[], int]] = {
    "dynamodb": lambda: _search_len("dynamodb", "list_tables", "TableNames[]"),
    "s3": lambda: len(aws.client("s3").list_buckets().get("Buckets", [])),
    "lambda": lambda: _search_len("lambda", "list_functions", "Functions[]"),
    "apigateway": lambda: (
        _search_len("apigateway", "get_rest_apis", "items[]")
        + _search_len("apigatewayv2", "get_apis", "Items[]")
    ),
    "stepfunctions": lambda: _search_len("stepfunctions", "list_state_machines", "stateMachines[]"),
    "eventbridge": lambda: len(aws.client("events").list_event_buses().get("EventBuses", [])),
    "sqs": lambda: _search_len("sqs", "list_queues", "QueueUrls[]"),
    "appsync": lambda: _search_len("appsync", "list_graphql_apis", "graphqlApis[]"),
    "iam": lambda: _search_len("iam", "list_roles", "Roles[]"),
}


@router.get("/health")
def health() -> dict:
    """Health of the emulator serving the request's region."""
    target = aws.target()
    endpoint = target.endpoint
    try:
        status, _ = http_request(f"{endpoint}/__admin/health", cafile=target.ca_bundle)
        healthy = status == 200
    except OSError:
        healthy = False
    identity = None
    if healthy:
        try:
            identity = aws.client("sts").get_caller_identity()
        except Exception:  # noqa: BLE001 - shown as "unknown" in the header
            identity = None
    return {
        "endpoint": endpoint,
        "healthy": healthy,
        "region": target.region,
        "dedicated": target.dedicated,
        "account": identity and identity["Account"],
        "arn": identity and identity["Arn"],
    }


@router.get("/overview")
def overview() -> dict[str, int | str]:
    return {name: _count(fn) for name, fn in COUNTERS.items()}


@router.get("/regions")
def list_regions() -> dict:
    """Regions the switcher offers; `dedicated` ones have their own (isolated) emulator."""
    dedicated = regions.dedicated_ports()
    return {
        "default": regions.default_region(),
        "regions": list(regions.known_regions()),
        "dedicated": {r: f"https://127.0.0.1:{p}" for r, p in dedicated.items()},
    }
