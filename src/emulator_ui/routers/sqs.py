from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/sqs", tags=["sqs"])

COUNT_ATTRS = ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "QueueArn"]


class QueueRef(BaseModel):
    url: str


class SendMessage(QueueRef):
    body: str


class Receive(QueueRef):
    max: int = 10


@router.get("/queues")
def list_queues() -> list[dict]:
    sqs = aws.client("sqs")
    urls = aws.collect(sqs.get_paginator("list_queues").paginate(), "QueueUrls[]")
    out = []
    for url in urls:
        attrs = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=COUNT_ATTRS)["Attributes"]
        out.append({"url": url, "name": url.rsplit("/", 1)[-1], **attrs})
    return to_jsonable(out)


@router.post("/send")
def send(req: SendMessage) -> dict:
    return to_jsonable(aws.client("sqs").send_message(QueueUrl=req.url, MessageBody=req.body))


@router.post("/peek")
def peek(req: Receive) -> list[dict]:
    """Receive without consuming: visibility timeout 0 makes messages immediately visible again."""
    resp = aws.client("sqs").receive_message(
        QueueUrl=req.url,
        MaxNumberOfMessages=max(1, min(req.max, 10)),
        VisibilityTimeout=0,
        WaitTimeSeconds=1,
        MessageSystemAttributeNames=["All"],
    )
    return to_jsonable(resp.get("Messages", []))


@router.post("/purge")
def purge(req: QueueRef) -> dict:
    aws.client("sqs").purge_queue(QueueUrl=req.url)
    return {"purged": req.url}
