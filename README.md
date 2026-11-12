<p align="center">
  <img src="assets/brand/logo.svg" alt="Emulator UI logo" width="120">
</p>

<p align="center">
  <img src="assets/brand/banner.svg" alt="Emulator UI" width="560">
</p>

<h1 align="center">Emulator UI</h1>

<h3 align="center">A web console for AWS Emulator.</h3>

<p align="center">
  Browse and interact with the resources in a locally running
  <a href="https://github.com/aws/aws-emulator">AWS Emulator</a>, for <b>every one of the 436 services</b> it
  supports. Tested with AWS Emulator v1.0.322.
</p>

<p align="center">
  <img src="assets/brand/badges/services.svg" alt="services: 436">
  <img src="assets/brand/badges/emulator.svg" alt="tested with: emulator v1.0.322">
  <img src="assets/brand/badges/python.svg" alt="Python: 3.11+">
  <img src="assets/brand/badges/react.svg" alt="React: 18.3">
  <img src="assets/brand/badges/fastapi.svg" alt="FastAPI: 0.115+">
  <img src="assets/brand/badges/license.svg" alt="license: Apache 2.0">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ◆
  <a href="#emulator-requirements">Emulator requirements</a> ◆
  <a href="#troubleshooting">Troubleshooting</a> ◆
  <a href="#development">Development</a> ◆
  <a href="#contact-and-support">Contact</a> ◆
  <a href="#license">License</a>
</p>

The console runs in **its own container** and connects to emulator containers over a shared Docker network. It never
starts, stops or changes emulator containers. Start the console and the emulator in any order.

## Quick start

Prerequisites: Docker, `uv`, and a running AWS Emulator (see [Emulator requirements](#emulator-requirements)).
Node 22 is only needed for UI development.

```bash
git clone https://github.com/D33ptar00p/emulator-ui.git && cd emulator-ui
make up      # build + start the console -> http://127.0.0.1:8080
make open    # open it in a browser
make down    # stop the console (emulators are not touched)
```

The console picks up emulator starts, stops and restarts without being restarted itself. That includes new
per-region emulators and each run's new keys.

## Emulator requirements

The console expects each emulator to follow these conventions:

| Requirement | Details |
|---|---|
| Container name | `aws-emulator-<port>`. The default emulator uses port `9297`. |
| Docker network | Attached to the Docker network `aws-emulator`, and listening on `<port>` inside the container (`aws-emulator -b 0.0.0.0 -p <port>`). `make up` here creates the network if it's missing. |
| Per-run files | The emulator's `emulator_credentials`, `config` and `ca.pem` in `~/.aws/emulator/<port>/` on the host. Mount your home path into the emulator container with `-e HOME=$HOME -v $HOME/.aws/emulator:$HOME/.aws/emulator`. |
| Host port (for `make dev` / `make test`) | Published on `127.0.0.1:<port>`. |
| Isolated regions (optional) | `~/.aws/emulator/regions` with one `region=port` line per region that has its own emulator, e.g. `eu-west-2=9298`. It's read live. |

For example, with an image built from the [official Dockerfile](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-docker.html)
(entrypoint `aws-emulator -b 0.0.0.0`) tagged `aws-emulator`:

```bash
docker network create aws-emulator 2>/dev/null || true
mkdir -p ~/.aws/emulator
docker run -d --rm --name aws-emulator-9297 --network aws-emulator \
  --user "$(id -u):$(id -g)" -p 127.0.0.1:9297:9297 \
  -e HOME="$HOME" -v "$HOME/.aws/emulator:$HOME/.aws/emulator" \
  aws-emulator -p 9297 --telemetry off
```

## Troubleshooting

| You see | Why | Do |
|---|---|---|
| Red dot and **"Emulator unreachable"**; sidebar says **"Emulator is off."** | No emulator container matches the requirements above | Start one (see above), or check its name, network and port |
| Emulator healthy, but **no resources** anywhere | The emulator is new or was restarted. It keeps state in memory, so every run starts empty | Create resources with the AWS CLI, your tests or this console, then click **Rescan resources** or wait up to 30 s |
| A service has data but isn't under **Resources** | The scan only counts what you created, and it refreshes every 15–30 s | Click **Rescan resources** on the Dashboard |
| A resource exists in one region but not another | Region switcher. Regions can be isolated | Check the region in the top bar (see [Regions](#regions)) |
| **"Not implemented by the emulator yet (501)"** | The emulator doesn't support that operation yet | Use a different operation, or check the emulator's published fidelity scores on its [releases page](https://github.com/aws/aws-emulator/releases) |

## What it does

| Area | What you can do |
|---|---|
| **Dashboard** | A search bar over all 436 services, with **active services on top** (services holding resources, most first) and then every service grouped by category with its icon. **Rescan resources** refreshes the inventory. |
| **Sidebar → Resources** | Lists **only services that currently hold resources** in the selected region, with counts, refreshed every 15 s. |
| **Any service** (`#/svc/<id>`) | **Resources tab:** each browse operation (List/Describe without required input) as a table, with row actions (Describe/Get/Delete) pre-filled from the row. **Operations tab:** run *any* operation of the service with a JSON editor pre-filled from the AWS API model (required fields, parameter docs, enums, "fetch all pages"). |
| Hand-built pages | DynamoDB item editor, S3 browser (upload/download), Lambda invoke + log tail, API Gateway "send request", Step Functions executions + live history, EventBridge put-events, SQS send/peek/purge, AppSync, IAM roles. Each has an **All operations** button for the generic runner. |
| **Region switcher** (top bar) | Every call goes to the selected region. "Isolated" regions have their own emulator; the others share the default one. |

**Operation colours** in the Operations tab are worked out from the verb in the operation name. They're a heuristic,
not part of the AWS model:
- **green:** create / write (`Create`, `Put`, `Start`, `Send`, `Tag`, ...);
- **red:** delete / remove (`Delete`, `Remove`, `Terminate`, `Stop`, `Untag`, ...);
- **white:** read, update and other.

**Confirmations:** destructive operations (`Delete*`, `Terminate*`, `Remove*`, `Purge*`, `Deregister*`, ...) and
delete buttons open a confirmation modal that shows the exact input. Cancel has focus by default.

**Resource counts exclude built-in data.** A fresh emulator already lists managed IAM policies, a default VPC, service
quotas, Polly voices and similar. `src/emulator_ui/inventory_baseline.json` records those, so counts show only what
was created.

### Regions

| Emulator setup | In the switcher |
|---|---|
| One emulator (port `9297`), no `~/.aws/emulator/regions` entries | Every region is "shared": one emulator, with the region sent on every call. Many services keep resources per region, but AWS doesn't guarantee it for all. Global services such as IAM look the same in every region. |
| One emulator per region, listed in `~/.aws/emulator/regions` | The listed regions appear under **Isolated emulators**, each routed to its own emulator. Other regions use the default emulator. |

## How it's built

```
src/emulator_ui/              FastAPI backend (one process serves API + UI on :8080)
  app.py                      app, error mapping, static files
  security.py                 localhost-only Host check, CSRF header check, per-request region
  regions.py                  region -> emulator (dedicated port, or the default emulator)
  relay.py                    loopback TCP relay to emulator containers (see below)
  aws.py                      boto3 sessions per (emulator, region); rebuilt when the emulator rotates keys
  catalog.py / catalog.json   all 436 services: names, categories, icons, browse operations
  inventory.py                background resource scan per region (+ inventory_baseline.json)
  routers/services.py         generic explorer: catalog, operations, operation runner, inventory
  routers/<service>.py        hand-built pages' APIs
  local.py, net.py            "local endpoint only" guard; HTTPS helpers trusting the emulator CA
ui/                           React + TypeScript (Vite); public/icons/ = generated service icons
docker/console.Dockerfile     multi-stage image (Vite build + Python)
scripts/console-up.sh         build + run the console container (own port 8080, network `aws-emulator`)
scripts/console-down.sh       stop the console container
scripts/emulator-env.sh       `source [region]` to point CLI/SDKs (and `make dev` / `make test`) at the emulator
scripts/build_service_catalog.py, service_categories.json                   -> catalog.json (from botocore)
scripts/build_icons.py, pixelfont.py, catalog_overrides.json               -> ui/public/icons/*.svg
scripts/inventory-baseline.sh, capture_inventory_baseline.py               -> inventory_baseline.json
tests/                        backend tests (unit, relay, live API); ui/src/*.test.ts = frontend tests
```

**How the console reaches an emulator.** The console container joins the Docker network `aws-emulator`, where the
emulator runs as `aws-emulator-<port>`. The emulator's self-signed certificate is only valid for `127.0.0.1`, so the
console runs a small **loopback relay** (`EMULATOR_RELAY=1`): it listens on the console container's own
`127.0.0.1:<port>` and forwards raw bytes to `aws-emulator-<port>:<port>`. TLS still runs end to end between boto3 and
the emulator, verified against that emulator's CA. Relays start on first use, so emulators can come and go freely.

The console reads each emulator's per-run credentials and CA from `~/.aws/emulator/<port>/` (mounted read-only). It
reads the region-to-port map live from `~/.aws/emulator/regions`.

**Security.** The console holds emulator credentials, so it's locked to local use:
- It's published on `127.0.0.1` only.
- The backend refuses non-localhost `Host` headers, which blocks DNS rebinding.
- Every state-changing request must carry `X-Emulator-UI: 1`. That's a CSRF guard; no CORS is granted.
- Region endpoints come only from server config, never from the client.
- It refuses any non-local endpoint.
- Downloaded S3 objects are served with `Content-Security-Policy: sandbox` and `nosniff`.

## Development

```bash
make dev           # host mode: API on :8081 with reload + Vite on http://127.0.0.1:5173 (emulator must be running)
make test          # backend tests: 26 (unit + relay + live API tests against the running emulator)
make ui-test       # frontend typecheck + vitest (14 tests)
make lint          # ruff + shellcheck
make build         # build the UI into src/emulator_ui/static (to run the API on the host)
```

`make dev` and `make test` run on your host and reach the emulator's published `127.0.0.1:<port>` directly; no relay is
needed there. API docs (OpenAPI): http://127.0.0.1:8080/api/docs.

### Regenerating data files (committed so Docker builds stay offline)

```bash
make catalog              # catalog.json + ui/public/icons/ (offline: botocore models + our own icon generator)
make inventory-baseline   # built-in items of a fresh emulator: starts a throwaway one on port 9399 from the `aws-emulator` image
```

Re-run both when you move to a new emulator release (or botocore version). The current baseline is from emulator
`v1.0.322`.

## Icons and artwork

Every icon and image in this repository is original and generated by code in this repository:

- **Service icons** (`ui/public/icons/`, 436 files) are tiles coloured by service category, with a 2–4 character
  monogram (e.g. `DDB`, `S3`, `FN`, `SQS`) in the project's own pixel font. `scripts/build_icons.py` generates
  them. Monograms are derived from each service's id; overrides are in `scripts/catalog_overrides.json`.
- **Logo, banner and badges** (`assets/brand/`) come from `assets/brand/generate.py`.
- **Pixel font** is in `scripts/pixelfont.py`.

No AWS or other third-party artwork is used.

## Contact and support

| For | Use |
|---|---|
| Bugs, questions, feature ideas | [GitHub Issues](https://github.com/D33ptar00p/emulator-ui/issues) |
| **Security vulnerabilities** | **Not** a public issue. Follow [SECURITY.md](SECURITY.md): GitHub private vulnerability reporting, or email |
| Anything else | Deeptaroop Mojumdar, deeptaroop2015@gmail.com, or [@D33ptar00p on GitHub](https://github.com/D33ptar00p) |

Emulator UI is a personal project maintained in spare time, so replies may take a few days. Problems with AWS Emulator
itself belong in the [aws/aws-emulator](https://github.com/aws/aws-emulator) repository.

## License

[Apache License 2.0](LICENSE), copyright 2026 Deeptaroop Mojumdar ([D33ptar00p](https://github.com/D33ptar00p)). Emulator UI is a personal open-source project. See [NOTICE](NOTICE) for attributions:
- the service metadata in `catalog.json` is derived from botocore's API models (Apache 2.0);
- the inventory baseline was recorded from AWS Emulator (CC0 1.0).

AWS, AWS Emulator and AWS service names are trademarks of Amazon.com, Inc. or its affiliates. They're used here in
plain text only, to say what this project works with. Emulator UI is an independent project, not affiliated with or
endorsed by AWS.

### Publishing checklist

- [x] Copyright holder: Deeptaroop Mojumdar, as a personal project published from https://github.com/D33ptar00p.
- [ ] `make lint test ui-test` pass.
- [ ] Only generated icons ship: `ui/public/icons/` (and no `aws-icons/` directory anywhere).
- [ ] Repository and package names contain no AWS marks (`emulator-ui`).
- [ ] On GitHub, enable **Settings → Code security → Private vulnerability reporting**, which [SECURITY.md](SECURITY.md) relies on.
