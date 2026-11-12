"""Generate the console's service catalog from botocore's API models (offline, no third-party artwork).

    uv run python scripts/build_service_catalog.py

Writes src/emulator_ui/catalog.json: one entry per botocore service (= every service the emulator
scaffolds) with its name, category, icon path, protocol, operation count and browse operations.
Service metadata comes from botocore (Apache-2.0). Categories come from scripts/service_categories.json.
Icons are generated separately by scripts/build_icons.py.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import botocore.session

ROOT = Path(__file__).resolve().parent.parent
CATALOG_OUT = ROOT / "src" / "emulator_ui" / "catalog.json"
OVERRIDES = Path(__file__).with_name("catalog_overrides.json")
CATEGORIES = Path(__file__).with_name("service_categories.json")
DEFAULT_CATEGORY = "Other"

LIST_NOISE = re.compile(
    r"(Limits|Endpoints|AccountAttributes|AccountSettings|Regions|AvailabilityZones|Quotas|Versions|"
    r"Settings|Configuration|Configurations|SupportedLanguages|Engines|EngineVersions|InstanceTypes|"
    r"Offerings|OrderableOptions|Capabilities|Metadata|Tags|TagKeys|Types|Policies|Status|Statuses|"
    r"Recommendations|Templates)$"
)


def list_ops(model, overrides: dict, service: str) -> list[str]:
    """Read-only List/Describe operations that need no input and return a list - i.e. 'browse' calls."""
    if service in overrides["listOps"]:
        return overrides["listOps"][service]
    ops = []
    for name in model.operation_names:
        if not re.match(r"^(List|Describe)", name) or LIST_NOISE.search(name):
            continue
        op = model.operation_model(name)
        if op.input_shape is not None and op.input_shape.required_members:
            continue
        out = op.output_shape
        if out is None or op.has_event_stream_output:
            continue
        if any(m.type_name == "list" for m in out.members.values()):
            ops.append(name)
    return ops[:6]


def build() -> list[dict]:
    overrides = json.loads(OVERRIDES.read_text())
    categories: dict[str, str] = json.loads(CATEGORIES.read_text())
    session = botocore.session.get_session()
    entries = []
    for service in session.get_available_services():
        model = session.get_service_model(service)
        meta = model.metadata
        entries.append(
            {
                "id": service,
                "fullName": meta.get("serviceFullName", service),
                "serviceId": meta.get("serviceId", service),
                "category": categories.get(service, DEFAULT_CATEGORY),
                "icon": f"icons/{service}.svg",
                "protocol": meta.get("protocol"),
                "operations": len(model.operation_names),
                "listOps": list_ops(model, overrides, service),
            }
        )
    CATALOG_OUT.write_text(json.dumps({"source": "botocore", "services": entries}, indent=1) + "\n")
    uncategorised = [e["id"] for e in entries if e["category"] == DEFAULT_CATEGORY]
    print(f"{len(entries)} services -> {CATALOG_OUT.name}; uncategorised: {uncategorised or 'none'}")
    return entries


def main() -> int:
    build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
