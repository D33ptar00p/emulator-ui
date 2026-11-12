"""Fixtures for console tests against a running AWS Emulator.

Safety/health gate, unique naming, cleanup, IAM roles, Lambda functions."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable, Iterator

import boto3
import pytest

from emulator_ui.local import assert_local_endpoint
from emulator_ui.net import http_request
from emulator_ui.routers.lambda_ import zip_code


@pytest.fixture(scope="session")
def aws() -> boto3.Session:
    """boto3 session guaranteed to point at a healthy *local* emulator (never real AWS)."""
    try:
        endpoint = assert_local_endpoint()
    except RuntimeError as exc:
        pytest.exit(str(exc), returncode=2)
    try:
        status, _ = http_request(f"{endpoint}/__admin/health")
    except OSError as exc:
        pytest.exit(
            f"AWS Emulator not reachable at {endpoint}: {exc}. Start an emulator, then `source scripts/emulator-env.sh`.",
            returncode=2,
        )
    if status != 200:
        pytest.exit(
            f"AWS Emulator unhealthy at {endpoint} (HTTP {status}). Start an emulator, then `source scripts/emulator-env.sh`.",
            returncode=2,
        )
    return boto3.Session()


@pytest.fixture
def name() -> str:
    """Unique resource-name prefix so tests sharing one emulator never collide."""
    return f"poc-{uuid.uuid4().hex[:8]}"


@pytest.fixture
def cleanup() -> Iterator[list[Callable[[], object]]]:
    """Register teardown callables; they run in reverse order, best-effort."""
    callbacks: list[Callable[[], object]] = []
    yield callbacks
    for callback in reversed(callbacks):
        try:
            callback()
        except Exception as exc:  # noqa: BLE001 - teardown must not mask the test result
            print(f"cleanup failed: {exc!r}")


@pytest.fixture
def make_role(aws: boto3.Session, name: str, cleanup) -> Callable[..., str]:
    """Create an IAM role trusted by the given service principals, with an optional inline policy."""
    iam = aws.client("iam")
    counter = iter(range(100))

    def _make(services: list[str], actions: list[str] | None = None) -> str:
        role_name = f"{name}-role{next(counter)}"
        trust = {
            "Version": "2012-10-17",
            "Statement": [
                {"Effect": "Allow", "Principal": {"Service": services}, "Action": "sts:AssumeRole"}
            ],
        }
        arn = iam.create_role(RoleName=role_name, AssumeRolePolicyDocument=json.dumps(trust))["Role"]["Arn"]
        if actions:
            policy = {
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Action": actions, "Resource": "*"}],
            }
            iam.put_role_policy(RoleName=role_name, PolicyName="inline", PolicyDocument=json.dumps(policy))
            cleanup.append(lambda: iam.delete_role_policy(RoleName=role_name, PolicyName="inline"))
        cleanup.append(lambda: iam.delete_role(RoleName=role_name))
        return arn

    return _make


@pytest.fixture
def make_function(aws: boto3.Session, name: str, make_role, cleanup) -> Callable[..., dict]:
    """Create an ACTIVE Lambda function; returns its configuration dict."""
    lam = aws.client("lambda")
    counter = iter(range(100))

    def _make(
        source: str,
        *,
        runtime: str = "python3.12",
        actions: list[str] | None = None,
        env: dict[str, str] | None = None,
        role_arn: str | None = None,
    ) -> dict:
        fn_name = f"{name}-fn{next(counter)}"
        filename = "index.js" if runtime.startswith("nodejs") else "index.py"
        conf = lam.create_function(
            FunctionName=fn_name,
            Runtime=runtime,
            Role=role_arn or make_role(["lambda.amazonaws.com"], actions),
            Handler="index.handler",
            Timeout=15,
            Environment={"Variables": env or {}},
            Code={"ZipFile": zip_code({filename: source})},
        )
        cleanup.append(lambda: lam.delete_function(FunctionName=fn_name))
        lam.get_waiter("function_active_v2").wait(FunctionName=fn_name)
        return conf

    return _make
