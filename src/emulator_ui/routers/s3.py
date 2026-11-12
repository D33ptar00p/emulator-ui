from __future__ import annotations

import mimetypes
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from emulator_ui import aws
from emulator_ui.jsonutil import to_jsonable

router = APIRouter(prefix="/s3", tags=["s3"])


class CreateBucket(BaseModel):
    name: str


@router.get("/buckets")
def list_buckets() -> list[dict]:
    return to_jsonable(aws.client("s3").list_buckets().get("Buckets", []))


@router.post("/buckets")
def create_bucket(spec: CreateBucket) -> dict:
    aws.client("s3").create_bucket(Bucket=spec.name)
    return {"created": spec.name}


@router.delete("/buckets/{bucket}")
def delete_bucket(bucket: str, force: bool = False) -> dict:
    s3 = aws.client("s3")
    if force:  # empty every version + delete marker first
        for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket):
            objs = [{"Key": v["Key"], "VersionId": v["VersionId"]} for v in page.get("Versions", [])]
            objs += [{"Key": m["Key"], "VersionId": m["VersionId"]} for m in page.get("DeleteMarkers", [])]
            if objs:
                s3.delete_objects(Bucket=bucket, Delete={"Objects": objs})
    s3.delete_bucket(Bucket=bucket)
    return {"deleted": bucket}


@router.get("/buckets/{bucket}/objects")
def list_objects(bucket: str, prefix: str = "", token: str | None = None, limit: int = 200) -> dict:
    kwargs = {"Bucket": bucket, "Prefix": prefix, "Delimiter": "/", "MaxKeys": limit}
    if token:
        kwargs["ContinuationToken"] = token
    resp = aws.client("s3").list_objects_v2(**kwargs)
    return to_jsonable(
        {
            "prefixes": [p["Prefix"] for p in resp.get("CommonPrefixes", [])],
            "objects": resp.get("Contents", []),
            "next": resp.get("NextContinuationToken"),
        }
    )


@router.get("/buckets/{bucket}/object")
def get_object(bucket: str, key: str = Query(...), download: bool = False):
    obj = aws.client("s3").get_object(Bucket=bucket, Key=key)
    filename = key.rsplit("/", 1)[-1] or "object"
    disposition = "attachment" if download else "inline"
    return StreamingResponse(
        obj["Body"].iter_chunks(64 * 1024),
        media_type=obj.get("ContentType") or "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",  # never execute stored HTML/JS in the console origin
        },
    )


@router.get("/buckets/{bucket}/object/meta")
def head_object(bucket: str, key: str = Query(...)) -> dict:
    return to_jsonable(aws.client("s3").head_object(Bucket=bucket, Key=key))


@router.post("/buckets/{bucket}/upload")
def upload(bucket: str, file: UploadFile = File(...), prefix: str = Form("")) -> dict:
    key = f"{prefix}{file.filename}"
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "binary/octet-stream"
    aws.client("s3").upload_fileobj(file.file, bucket, key, ExtraArgs={"ContentType": content_type})
    return {"key": key}


@router.delete("/buckets/{bucket}/object")
def delete_object(bucket: str, key: str = Query(...)) -> dict:
    aws.client("s3").delete_object(Bucket=bucket, Key=key)
    return {"deleted": key}
