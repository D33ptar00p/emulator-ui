from __future__ import annotations

from fastapi import APIRouter

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/appsync", tags=["appsync"])

ROOT_TYPES = ("Query", "Mutation", "Subscription")


@router.get("/apis")
def list_apis() -> list[dict]:
    pages = aws.client("appsync").get_paginator("list_graphql_apis").paginate()
    return to_jsonable(aws.collect(pages, "graphqlApis[]"))


@router.get("/apis/{api_id}")
def get_api(api_id: str) -> dict:
    a = aws.client("appsync")
    resolvers = []
    root_types = {}
    for type_name in ROOT_TYPES:
        try:
            root_types[type_name] = a.get_type(apiId=api_id, typeName=type_name, format="SDL")["type"][
                "definition"
            ]
            resolvers += a.list_resolvers(apiId=api_id, typeName=type_name).get("resolvers", [])
        except a.exceptions.NotFoundException:
            continue  # schema has no such root type
    return to_jsonable(
        {
            "api": a.get_graphql_api(apiId=api_id)["graphqlApi"],
            "rootTypes": root_types,  # ListTypes / introspection schema are 501 in the emulator
            "dataSources": a.list_data_sources(apiId=api_id).get("dataSources", []),
            "resolvers": resolvers,
            "apiKeys": a.list_api_keys(apiId=api_id).get("apiKeys", []),
        }
    )
