"""FastAPI app: JSON API under /api, compiled React console under /."""

from __future__ import annotations

import os
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from emulator_ui.local import NotLocalEndpointError
from emulator_ui.routers import (
    apigateway,
    appsync,
    dynamodb,
    eventbridge,
    iam,
    lambda_,
    overview,
    s3,
    services,
    sqs,
    stepfunctions,
)
from emulator_ui.security import LocalOnlyMiddleware

STATIC_DIR = Path(os.environ.get("EMULATOR_UI_STATIC", Path(__file__).parent / "static"))

app = FastAPI(title="Emulator UI", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(LocalOnlyMiddleware)

api = APIRouter(prefix="/api")
for module in (
    overview,
    services,
    dynamodb,
    s3,
    lambda_,
    apigateway,
    stepfunctions,
    eventbridge,
    sqs,
    appsync,
    iam,
):
    api.include_router(module.router)
app.include_router(api)


@app.exception_handler(ClientError)
async def client_error(_: Request, exc: ClientError) -> JSONResponse:
    err = exc.response.get("Error", {})
    status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 400)
    return JSONResponse(
        {"error": err.get("Code", "ClientError"), "message": err.get("Message", str(exc))},
        status_code=status if 400 <= status < 600 else 400,
    )


@app.exception_handler(ParamValidationError)
async def param_error(_: Request, exc: ParamValidationError) -> JSONResponse:
    return JSONResponse({"error": "ParamValidationError", "message": str(exc)}, status_code=400)


@app.exception_handler(BotoCoreError)
async def botocore_error(_: Request, exc: BotoCoreError) -> JSONResponse:
    return JSONResponse({"error": type(exc).__name__, "message": str(exc)}, status_code=502)


@app.exception_handler(NotLocalEndpointError)
async def not_local(_: Request, exc: NotLocalEndpointError) -> JSONResponse:
    return JSONResponse({"error": "NotLocalEndpoint", "message": str(exc)}, status_code=500)


@app.exception_handler(ValueError)
async def bad_value(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse({"error": "ValidationError", "message": str(exc)}, status_code=400)


if (STATIC_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
    if (STATIC_DIR / "icons").is_dir():
        app.mount("/icons", StaticFiles(directory=STATIC_DIR / "icons"), name="icons")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> Response:
        if path == "api" or path.startswith("api/"):  # unknown API routes must 404, not return the page
            return JSONResponse({"error": "NotFound", "message": f"no API route /{path}"}, status_code=404)
        # Top-level files from the build (e.g. /logo.svg from ui/public), confined to STATIC_DIR.
        root = STATIC_DIR.resolve()
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        return FileResponse(root / "index.html")
