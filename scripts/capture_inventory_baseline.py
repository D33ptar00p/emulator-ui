"""Record what a *fresh* emulator already lists (reference data: managed policies, default VPC,
service quotas, Polly voices, ...) so the console's inventory only highlights resources users created.

Run via `make inventory-baseline`: scripts/inventory-baseline.sh starts a throwaway emulator
and sets the environment.

Writes src/emulator_ui/inventory_baseline.json: {"emulator": version, "ops": {"svc.Op": count}}.
Refuses to run against an emulator that isn't empty of user resources (checked via a few services).
"""

from __future__ import annotations

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from emulator_ui import catalog, inventory
from emulator_ui.local import NotLocalEndpointError, assert_local_endpoint

OUT = Path(__file__).resolve().parent.parent / "src" / "emulator_ui" / "inventory_baseline.json"
MUST_BE_EMPTY = {
    "sqs": "ListQueues",
    "dynamodb": "ListTables",
    "s3": "ListBuckets",
    "lambda": "ListFunctions",
}


def emulator_version() -> str:
    try:
        out = subprocess.run(
            ["docker", "run", "--rm", "--entrypoint", "aws-emulator", "aws-emulator", "-v"],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return out.stdout.strip() or out.stderr.strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def main() -> int:
    try:
        assert_local_endpoint()
    except NotLocalEndpointError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    region = "us-east-1"
    jobs = {sid: e["listOps"] for sid, e in catalog.services().items() if e["listOps"]}
    with ThreadPoolExecutor(max_workers=inventory.WORKERS) as pool:
        results = dict(
            pool.map(
                lambda item: inventory._probe(item[0], item[1], region, apply_baseline=False), jobs.items()
            )
        )

    def has_items(svc: str, op: str) -> bool:
        n = results.get(svc, {}).get("ops", {}).get(op)
        return isinstance(n, int) and n > 0

    dirty = [svc for svc, op in MUST_BE_EMPTY.items() if has_items(svc, op)]
    if dirty:
        print(f"Error: emulator already has user resources in {dirty}; use a fresh one", file=sys.stderr)
        return 1

    ops = {
        f"{svc}.{op}": n
        for svc, result in sorted(results.items())
        for op, n in result["ops"].items()
        if isinstance(n, int) and n > 0
    }
    OUT.write_text(
        json.dumps({"emulator": emulator_version(), "region": region, "ops": ops}, indent=1) + "\n"
    )
    print(f"baseline: {len(ops)} operations return built-in items -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
