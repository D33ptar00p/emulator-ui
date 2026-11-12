"""Console API (FastAPI) exercised in-process against the live emulator."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from support import wait_for

from emulator_ui.app import app

HEADERS = {"X-Emulator-UI": "1"}


@pytest.fixture(scope="module")
def console(aws) -> TestClient:  # `aws` enforces the local-endpoint + health gate first
    return TestClient(app, base_url="http://127.0.0.1", headers=HEADERS)


# ---- security guards ---------------------------------------------------------------------------


def test_rejects_non_local_host(aws) -> None:
    client = TestClient(app, base_url="http://evil.example")
    assert client.get("/api/health").status_code == 403


def test_mutations_require_csrf_header(aws, name) -> None:
    client = TestClient(app, base_url="http://127.0.0.1")
    resp = client.post("/api/s3/buckets", json={"name": name})
    assert resp.status_code == 403
    assert client.get("/api/s3/buckets").status_code == 200  # reads are fine


# ---- overview ----------------------------------------------------------------------------------


def test_health(console) -> None:
    body = console.get("/api/health").json()
    assert body["healthy"] is True
    assert body["account"] == "000000000000"


def test_overview_counts_every_service(console) -> None:
    body = console.get("/api/overview").json()
    expected = {
        "dynamodb",
        "s3",
        "lambda",
        "apigateway",
        "stepfunctions",
        "eventbridge",
        "sqs",
        "appsync",
        "iam",
    }
    assert set(body) == expected
    assert all(isinstance(v, int) for v in body.values()), body


def test_aws_errors_are_mapped(console, name) -> None:
    resp = console.get(f"/api/dynamodb/tables/{name}-missing")
    assert resp.status_code == 400
    assert resp.json()["error"] == "ResourceNotFoundException"


# ---- DynamoDB ----------------------------------------------------------------------------------


def test_dynamodb_table_and_item_crud(console, name) -> None:
    assert console.post("/api/dynamodb/tables", json={"name": name, "partitionKey": "id"}).status_code == 200
    wait_for(lambda: console.get(f"/api/dynamodb/tables/{name}").json()["TableStatus"] == "ACTIVE")
    assert name in [t["name"] for t in console.get("/api/dynamodb/tables").json()]

    for i in range(3):
        item = {"id": f"i{i}", "score": 1.5, "tags": ["a"], "blob": {"__bytes__": "AAE="}}
        assert console.put(f"/api/dynamodb/tables/{name}/items", json={"item": item}).status_code == 200

    page1 = console.get(f"/api/dynamodb/tables/{name}/items", params={"limit": 2}).json()
    assert len(page1["items"]) == 2 and page1["next"]
    page2 = console.get(
        f"/api/dynamodb/tables/{name}/items", params={"limit": 2, "start": page1["next"]}
    ).json()
    ids = {it["id"] for it in page1["items"] + page2["items"]}
    assert ids == {"i0", "i1", "i2"}
    assert page1["items"][0]["score"] == 1.5
    assert page1["items"][0]["blob"] == {"__bytes__": "AAE="}

    console.post(f"/api/dynamodb/tables/{name}/items/delete", json={"key": {"id": "i0"}})
    remaining = console.get(f"/api/dynamodb/tables/{name}/items").json()["items"]
    assert {it["id"] for it in remaining} == {"i1", "i2"}
    assert console.delete(f"/api/dynamodb/tables/{name}").status_code == 200


# ---- S3 ----------------------------------------------------------------------------------------


def test_s3_bucket_browse_upload_download(console, name) -> None:
    console.post("/api/s3/buckets", json={"name": name})
    up = console.post(
        f"/api/s3/buckets/{name}/upload",
        files={"file": ("take.json", b'{"frames": 120}', "application/json")},
        data={"prefix": "captures/"},
    )
    assert up.json() == {"key": "captures/take.json"}

    root = console.get(f"/api/s3/buckets/{name}/objects").json()
    assert root["prefixes"] == ["captures/"] and root["objects"] == []
    inner = console.get(f"/api/s3/buckets/{name}/objects", params={"prefix": "captures/"}).json()
    assert [o["Key"] for o in inner["objects"]] == ["captures/take.json"]

    got = console.get(f"/api/s3/buckets/{name}/object", params={"key": "captures/take.json"})
    assert got.content == b'{"frames": 120}'
    assert got.headers["content-security-policy"] == "sandbox"
    meta = console.get(f"/api/s3/buckets/{name}/object/meta", params={"key": "captures/take.json"}).json()
    assert meta["ContentType"] == "application/json"

    assert console.delete(f"/api/s3/buckets/{name}", params={"force": "true"}).status_code == 200
    assert name not in [b["Name"] for b in console.get("/api/s3/buckets").json()]


# ---- Lambda ------------------------------------------------------------------------------------


def test_lambda_list_detail_invoke(console, make_function) -> None:
    fn = make_function(
        "def handler(e, c):\n    if e.get('fail'):\n        raise ValueError('nope')\n    return {'got': e}\n"
    )
    name = fn["FunctionName"]
    assert name in [f["FunctionName"] for f in console.get("/api/lambda/functions").json()]
    detail = console.get(f"/api/lambda/functions/{name}").json()
    assert detail["Configuration"]["Runtime"] == "python3.12"
    assert "$LATEST" in detail["Versions"]

    ok = console.post(f"/api/lambda/functions/{name}/invoke", json={"payload": {"a": 1}}).json()
    assert ok["statusCode"] == 200 and ok["functionError"] is None
    assert ok["payload"] == {"got": {"a": 1}}
    assert ok["log"] and "REPORT RequestId" in ok["log"]

    bad = console.post(f"/api/lambda/functions/{name}/invoke", json={"payload": {"fail": True}}).json()
    assert bad["functionError"] == "Unhandled"
    assert bad["payload"]["errorType"] == "ValueError"


# ---- API Gateway -------------------------------------------------------------------------------


def test_apigateway_routes_and_invoke(console, aws, name, cleanup) -> None:
    ag = aws.client("apigateway")
    api_id = ag.create_rest_api(name=name)["id"]
    cleanup.append(lambda: ag.delete_rest_api(restApiId=api_id))
    root = next(r["id"] for r in ag.get_resources(restApiId=api_id)["items"] if r["path"] == "/")
    res = ag.create_resource(restApiId=api_id, parentId=root, pathPart="ping")["id"]
    ag.put_method(restApiId=api_id, resourceId=res, httpMethod="GET", authorizationType="NONE")
    ag.put_integration(
        restApiId=api_id,
        resourceId=res,
        httpMethod="GET",
        type="MOCK",
        requestTemplates={"application/json": '{"statusCode": 200}'},
    )
    ag.put_method_response(restApiId=api_id, resourceId=res, httpMethod="GET", statusCode="200")
    ag.put_integration_response(
        restApiId=api_id,
        resourceId=res,
        httpMethod="GET",
        statusCode="200",
        responseTemplates={"application/json": '{"pong": true}'},
    )
    ag.create_deployment(restApiId=api_id, stageName="dev")

    detail = console.get(f"/api/apigateway/rest/{api_id}").json()
    assert [(r["method"], r["path"], r["integration"]) for r in detail["routes"]] == [
        ("GET", "/ping", "MOCK")
    ]
    assert detail["invokeBase"].endswith(f"/_aws/execute-api/{api_id}/")

    resp = console.post("/api/apigateway/invoke", json={"apiId": api_id, "path": "dev/ping"}).json()
    assert resp["status"] == 200 and resp["body"] == {"pong": True}


# ---- Step Functions ----------------------------------------------------------------------------


def test_stepfunctions_start_and_inspect(console, aws, name, make_role, cleanup) -> None:
    sfn = aws.client("stepfunctions")
    definition = {
        "StartAt": "Hi",
        "States": {"Hi": {"Type": "Pass", "Parameters": {"hello.$": "$.who"}, "End": True}},
    }
    arn = sfn.create_state_machine(
        name=name, definition=json.dumps(definition), roleArn=make_role(["states.amazonaws.com"])
    )["stateMachineArn"]
    cleanup.append(lambda: sfn.delete_state_machine(stateMachineArn=arn))

    assert arn in [m["stateMachineArn"] for m in console.get("/api/stepfunctions/machines").json()]
    started = console.post(
        "/api/stepfunctions/machine/start", json={"arn": arn, "input": {"who": "genesis"}}
    ).json()

    def finished() -> dict | None:
        body = console.get("/api/stepfunctions/execution", params={"arn": started["executionArn"]}).json()
        return body if body["execution"]["status"] != "RUNNING" else None

    body = wait_for(finished)
    assert body["execution"]["status"] == "SUCCEEDED"
    assert body["execution"]["output"] == {"hello": "genesis"}
    assert body["history"][0]["type"] == "ExecutionStarted"

    machine = console.get("/api/stepfunctions/machine", params={"arn": arn}).json()
    assert machine["machine"]["definition"]["StartAt"] == "Hi"
    assert len(machine["executions"]) == 1


# ---- EventBridge + SQS -------------------------------------------------------------------------


def test_eventbridge_put_event_lands_in_sqs(console, aws, name, cleanup) -> None:
    sqs, events = aws.client("sqs"), aws.client("events")
    url = sqs.create_queue(QueueName=name)["QueueUrl"]
    cleanup.append(lambda: sqs.delete_queue(QueueUrl=url))
    qarn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    rule_arn = events.put_rule(Name=name, EventPattern=json.dumps({"source": ["console.test"]}))["RuleArn"]
    cleanup.append(lambda: events.delete_rule(Name=name))
    cleanup.append(lambda: events.remove_targets(Rule=name, Ids=["q"]))
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "events.amazonaws.com"},
                "Action": "sqs:SendMessage",
                "Resource": qarn,
                "Condition": {"ArnEquals": {"aws:SourceArn": rule_arn}},
            }
        ],
    }
    sqs.set_queue_attributes(QueueUrl=url, Attributes={"Policy": json.dumps(policy)})
    events.put_targets(Rule=name, Targets=[{"Id": "q", "Arn": qarn}])

    rules = console.get("/api/eventbridge/rules", params={"bus": "default"}).json()
    rule = next(r for r in rules if r["Name"] == name)
    assert rule["EventPattern"] == {"source": ["console.test"]} and rule["Targets"][0]["Arn"] == qarn

    put = console.post(
        "/api/eventbridge/events", json={"source": "console.test", "detailType": "T", "detail": {"n": 1}}
    )
    assert put.json()["FailedEntryCount"] == 0

    msgs = wait_for(lambda: console.post("/api/sqs/peek", json={"url": url}).json(), timeout=10)
    assert json.loads(msgs[0]["Body"])["detail"] == {"n": 1}
    # Peek must not consume: the message is still there.
    assert console.post("/api/sqs/peek", json={"url": url}).json()


def test_sqs_send_and_purge(console, aws, name, cleanup) -> None:
    sqs = aws.client("sqs")
    url = sqs.create_queue(QueueName=name)["QueueUrl"]
    cleanup.append(lambda: sqs.delete_queue(QueueUrl=url))
    console.post("/api/sqs/send", json={"url": url, "body": "hello"})
    queue = next(qu for qu in console.get("/api/sqs/queues").json() if qu["url"] == url)
    assert queue["name"] == name and queue["ApproximateNumberOfMessages"] == "1"
    console.post("/api/sqs/purge", json={"url": url})
    assert console.post("/api/sqs/peek", json={"url": url}).json() == []


# ---- AppSync / IAM -----------------------------------------------------------------------------


def test_appsync_detail(console, aws, name, cleanup) -> None:
    appsync = aws.client("appsync")
    api_id = appsync.create_graphql_api(name=name, authenticationType="API_KEY")["graphqlApi"]["apiId"]
    cleanup.append(lambda: appsync.delete_graphql_api(apiId=api_id))
    appsync.start_schema_creation(
        apiId=api_id, definition=b"type Query { hello: String }\nschema { query: Query }"
    )
    wait_for(lambda: appsync.get_schema_creation_status(apiId=api_id)["status"] == "SUCCESS")

    detail = console.get(f"/api/appsync/apis/{api_id}").json()
    assert detail["api"]["name"] == name
    assert "hello: String" in detail["rootTypes"]["Query"]


def test_iam_roles_include_inline_policies(console, make_role) -> None:
    arn = make_role(["lambda.amazonaws.com"], ["s3:GetObject"])
    role = next(r for r in console.get("/api/iam/roles").json() if r["Arn"] == arn)
    assert role["InlinePolicies"]["inline"]["Statement"][0]["Action"] == ["s3:GetObject"]
