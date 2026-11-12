from __future__ import annotations

from fastapi import APIRouter

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/iam", tags=["iam"])


@router.get("/roles")
def list_roles() -> list[dict]:
    iam = aws.client("iam")
    roles = aws.collect(iam.get_paginator("list_roles").paginate(), "Roles[]")
    for role in roles:
        role["InlinePolicies"] = {
            p: iam.get_role_policy(RoleName=role["RoleName"], PolicyName=p)["PolicyDocument"]
            for p in iam.list_role_policies(RoleName=role["RoleName"]).get("PolicyNames", [])
        }
    return to_jsonable(roles)
