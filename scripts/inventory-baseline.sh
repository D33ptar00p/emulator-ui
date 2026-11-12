#!/usr/bin/env bash
# Record what a *fresh* emulator already lists (managed policies, default VPC, quotas, ...) into
# src/emulator_ui/inventory_baseline.json, so the console's inventory only counts user-created resources.
#
# Starts a throwaway emulator from the `aws-emulator` image on port 9399, captures, then stops it.
set -euo pipefail

PORT=9399
IMAGE="${EMULATOR_IMAGE:-aws-emulator}"
NAME="aws-emulator-baseline-${PORT}"
EMU_DIR="${HOME}/.aws/emulator"
STATE_DIR="${EMU_DIR}/${PORT}"

if [[ -z "$(docker images -q "${IMAGE}" 2>/dev/null)" ]]; then
  echo "!!  Docker image '${IMAGE}' not found. Build the AWS Emulator image first (EMULATOR_IMAGE=... to override)." >&2
  exit 1
fi

mkdir -p "${EMU_DIR}"
docker run -d --rm --name "${NAME}" \
  --user "$(id -u):$(id -g)" --memory=2g --memory-swap=2g \
  -p "127.0.0.1:${PORT}:${PORT}" \
  -e HOME="${HOME}" -v "${EMU_DIR}:${EMU_DIR}" \
  "${IMAGE}" -p "${PORT}" --telemetry off >/dev/null
trap 'docker stop "${NAME}" >/dev/null 2>&1 || true' EXIT

echo -n "==> Waiting for throwaway emulator on 127.0.0.1:${PORT}"
for _ in $(seq 1 60); do
  if [[ -f "${STATE_DIR}/ca.pem" ]] && \
     curl -fsS --cacert "${STATE_DIR}/ca.pem" "https://127.0.0.1:${PORT}/__admin/health" >/dev/null 2>&1; then
    echo " OK"
    break
  fi
  echo -n "."
  sleep 1
done

AWS_ENDPOINT_URL="https://127.0.0.1:${PORT}" \
AWS_SHARED_CREDENTIALS_FILE="${STATE_DIR}/emulator_credentials" \
AWS_CONFIG_FILE="${STATE_DIR}/config" \
AWS_CA_BUNDLE="${STATE_DIR}/ca.pem" \
AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 \
AWS_EC2_METADATA_DISABLED=true AWS_DISABLE_HOST_PREFIX_INJECTION=true \
  uv run python scripts/capture_inventory_baseline.py
