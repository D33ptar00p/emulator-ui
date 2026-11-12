"""Unit tests (no emulator needed) for the console's JSON conversion and host parsing."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from emulator_ui.jsonutil import parse_item, to_jsonable
from emulator_ui.security import hostname


def test_to_jsonable_converts_sdk_types() -> None:
    value = {
        "int": Decimal("3"),
        "float": Decimal("1.5"),
        "bytes": b"\x00\x01",
        "set": {"b", "a"},
        "when": datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
        "nested": [{"n": Decimal("10")}],
        "ResponseMetadata": {"dropped": True},
    }
    assert to_jsonable(value) == {
        "int": 3,
        "float": 1.5,
        "bytes": {"__bytes__": "AAE="},
        "set": ["a", "b"],
        "when": "2026-01-02T03:04:05+00:00",
        "nested": [{"n": 10}],
    }


def test_parse_item_round_trips_numbers_and_bytes() -> None:
    item = parse_item('{"id": "x", "price": 19.99, "n": 2, "blob": {"__bytes__": "AAE="}, "m": {"k": [1.0]}}')
    assert item == {
        "id": "x",
        "price": Decimal("19.99"),
        "n": 2,
        "blob": b"\x00\x01",
        "m": {"k": [Decimal("1.0")]},
    }
    assert parse_item({"a": 1.25})["a"] == Decimal("1.25")


def test_parse_item_rejects_non_objects() -> None:
    with pytest.raises(ValueError):
        parse_item("[1, 2]")


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("127.0.0.1:8080", "127.0.0.1"),
        ("localhost", "localhost"),
        ("[::1]:8080", "[::1]"),
        ("evil.com:80", "evil.com"),
    ],
)
def test_hostname(header: str, expected: str) -> None:
    assert hostname(header) == expected


def test_collect_drops_none_from_empty_pages() -> None:
    from emulator_ui.aws import collect

    class FakePages:
        def search(self, expression: str):
            assert expression == "QueueUrls[]"
            yield None  # what botocore yields for a page without QueueUrls

    assert collect(FakePages(), "QueueUrls[]") == []


def test_sqs_list_with_no_queues_is_empty_not_an_error(monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from emulator_ui import aws
    from emulator_ui.app import app

    class FakeSqs:
        def get_paginator(self, _op):
            class P:
                def paginate(self):
                    class Pages:
                        def search(self, _e):
                            yield None

                    return Pages()

            return P()

    monkeypatch.setattr(aws, "client", lambda _svc: FakeSqs())
    resp = TestClient(app, base_url="http://127.0.0.1").get("/api/sqs/queues")
    assert (resp.status_code, resp.json()) == (200, [])


def test_unknown_api_route_is_404_not_the_spa(tmp_path, monkeypatch) -> None:
    """The SPA fallback must not swallow /api/* (e.g. a removed endpoint would silently return HTML)."""
    import importlib

    from fastapi.testclient import TestClient

    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>spa</html>")
    monkeypatch.setenv("EMULATOR_UI_STATIC", str(tmp_path))
    import emulator_ui.app as app_module

    app = importlib.reload(app_module).app
    client = TestClient(app, base_url="http://127.0.0.1")
    assert client.get("/api/no-such-thing").status_code == 404
    assert client.get("/dashboard").text == "<html>spa</html>"


def test_spa_serves_public_files_but_not_outside_static(tmp_path, monkeypatch) -> None:
    import importlib

    from fastapi.testclient import TestClient

    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>spa</html>")
    (static / "logo.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("nope")
    monkeypatch.setenv("EMULATOR_UI_STATIC", str(static))
    import emulator_ui.app as app_module

    client = TestClient(importlib.reload(app_module).app, base_url="http://127.0.0.1")
    assert client.get("/logo.svg").text == "<svg/>"
    assert client.get("/..%2Fsecret.txt").text == "<html>spa</html>"  # traversal falls back to the SPA
    assert client.get("/some/route").text == "<html>spa</html>"


def test_inventory_probe_closes_its_client(monkeypatch) -> None:
    """Regression: the scan touches ~355 services; leaving their clients' connections open exhausted
    file descriptors ("Too many open files") and broke other requests through the relay."""
    from emulator_ui import aws, inventory

    closed = []

    class FakeClient:
        def list_things(self):
            raise RuntimeError("boom")  # even when a call fails, the client must be closed

        def describe_widgets(self):
            return {"Widgets": [1, 2]}

        def close(self):
            closed.append(True)

    monkeypatch.setattr(aws, "ephemeral_client", lambda *a, **k: FakeClient())
    monkeypatch.setattr(inventory, "baseline", lambda: {})
    _, result = inventory._probe("svc", ["ListThings", "DescribeWidgets"], "us-east-1")
    assert closed == [True]
    assert result["count"] == 2 and result["ops"]["ListThings"].startswith("error")
