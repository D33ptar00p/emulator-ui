#!/usr/bin/env bash
# Build and start the console as its own container (independent of the emulator containers).
#
#   ./scripts/console-up.sh        # -> http://127.0.0.1:8080
#
# The console joins the shared Docker network `aws-emulator` (where emulator containers named
# `aws-emulator-<port>` run) and reaches each one through a loopback relay, so the
# emulator certificate (valid for 127.0.0.1) verifies. Emulators can start/stop at any time; the console
# shows them as unreachable meanwhile. Start order doesn't matter.
set -euo pipefail

PORT="${EMULATOR_PORT:-9297}"                     # default emulator (regions without their own emulator)
NETWORK="${EMULATOR_NETWORK:-aws-emulator}"
CONSOLE_NAME="${EMULATOR_CONSOLE_CONTAINER:-emulator-ui}"
CONSOLE_PORT="${EMULATOR_CONSOLE_PORT:-8080}"
CONSOLE_IMAGE="${EMULATOR_CONSOLE_IMAGE:-emulator-ui}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMU_DIR="${HOME}/.aws/emulator"
STATE_DIR="${EMU_DIR}/${PORT}"

echo "==> Building ${CONSOLE_IMAGE}"
build_log="$(mktemp)"
trap 'rm -f "${build_log}"' EXIT
if ! docker build -f "${ROOT}/docker/console.Dockerfile" -t "${CONSOLE_IMAGE}" "${ROOT}" >"${build_log}" 2>&1; then
  echo "!!  console image build failed:" >&2
  tail -40 "${build_log}" >&2
  exit 1
fi

# Must exist before mounting, otherwise Docker creates it owned by root.
mkdir -p "${EMU_DIR}"
docker network inspect "${NETWORK}" >/dev/null 2>&1 || docker network create "${NETWORK}" >/dev/null

# `docker rm -f` is synchronous, unlike `docker stop` on an --rm container, so the name is free afterwards.
docker rm -f "${CONSOLE_NAME}" >/dev/null 2>&1 || true
docker run -d --rm --name "${CONSOLE_NAME}" --label "emulator-ui.role=console" \
  --user "$(id -u):$(id -g)" \
  --ulimit nofile=65536:65536 \
  --network "${NETWORK}" \
  -p "127.0.0.1:${CONSOLE_PORT}:8080" \
  -e HOME="${HOME}" \
  -v "${EMU_DIR}:${EMU_DIR}:ro" \
  -e EMULATOR_HOME="${EMU_DIR}" \
  -e EMULATOR_RELAY=1 \
  -e EMULATOR_RELAY_HOST="aws-emulator-{port}" \
  -e AWS_ENDPOINT_URL="https://127.0.0.1:${PORT}" \
  -e AWS_SHARED_CREDENTIALS_FILE="${STATE_DIR}/emulator_credentials" \
  -e AWS_CONFIG_FILE="${STATE_DIR}/config" \
  -e AWS_CA_BUNDLE="${STATE_DIR}/ca.pem" \
  -e AWS_EC2_METADATA_DISABLED=true \
  -e AWS_DISABLE_HOST_PREFIX_INJECTION=true \
  -e AWS_REGION="${AWS_REGION:-us-east-1}" \
  -e AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}" \
  "${CONSOLE_IMAGE}" >/dev/null

echo -n "==> Waiting for console"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${CONSOLE_PORT}/api/regions" >/dev/null 2>&1; then
    echo " OK -> http://127.0.0.1:${CONSOLE_PORT}"
    exit 0
  fi
  echo -n "."
  sleep 1
done
echo " FAILED"
docker logs "${CONSOLE_NAME}" 2>&1 | tail -20 || true
exit 1
