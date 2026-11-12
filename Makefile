SHELL := /bin/bash
# Point boto3 / the AWS CLI at the running emulator (needed by tests and dev mode).
ENV := source scripts/emulator-env.sh &&
REPORTS := reports

.PHONY: social-preview up up-image down open sync test ui-test lint dev build catalog inventory-baseline

up:        ## build + start the console container -> http://127.0.0.1:8080 (emulator can start before or after)
	./scripts/console-up.sh

up-image:  ## pull the prebuilt image from GHCR + start the console (no local build)
	EMULATOR_CONSOLE_BUILD=0 EMULATOR_CONSOLE_IMAGE=ghcr.io/d33ptar00p/emulator-ui:latest ./scripts/console-up.sh

down:      ## stop the console (emulators keep running)
	./scripts/console-down.sh

open:      ## open the console in a browser
	xdg-open http://127.0.0.1:$${EMULATOR_CONSOLE_PORT:-8080} 2>/dev/null || open http://127.0.0.1:$${EMULATOR_CONSOLE_PORT:-8080}

sync:
	uv sync

test: sync ## backend tests (unit + live tests against the running emulator)
	mkdir -p $(REPORTS)
	$(ENV) uv run pytest -v --junitxml=$(REPORTS)/junit.xml --html=$(REPORTS)/report.html --self-contained-html

ui-test:   ## frontend typecheck + vitest
	cd ui && npm ci --no-fund --no-audit && npm run typecheck && npm test

lint: sync
	uv run ruff check . && uv run ruff format --check .
	uvx --from shellcheck-py shellcheck scripts/*.sh

build:     ## build the React UI into src/emulator_ui/static (to run the API on the host)
	cd ui && npm ci --no-fund --no-audit && npm run build

dev: sync  ## hot reload on the host: API on :8081 + Vite on http://127.0.0.1:5173
	cd ui && npm ci --no-fund --no-audit
	$(ENV) trap 'kill 0' EXIT; \
		uv run uvicorn emulator_ui.app:app --host 127.0.0.1 --port 8081 --reload & \
		(cd ui && npm run dev)

catalog:   ## regenerate src/emulator_ui/catalog.json + ui/public/icons (offline, from botocore)
	uv run python scripts/build_service_catalog.py
	uv run python scripts/build_icons.py

inventory-baseline: ## record a fresh emulator's built-in items (throwaway emulator on port 9399, `aws-emulator` image)
	./scripts/inventory-baseline.sh

social-preview: ## render assets/brand/social-preview.png (1280x640) for GitHub Settings -> Social preview
	python3 assets/brand/generate.py
	google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size=1280,900 \
		--screenshot=$(CURDIR)/assets/brand/.social-preview-raw.png file://$(CURDIR)/assets/brand/social-preview.svg
	uv run --no-project --with pillow python -c "from PIL import Image; \
		Image.open('assets/brand/.social-preview-raw.png').convert('RGB').crop((0, 0, 1280, 640)) \
		.save('assets/brand/social-preview.png', optimize=True)"
	rm -f assets/brand/.social-preview-raw.png
