#!/usr/bin/env bash
# Stop the console container only. Emulator containers are not touched.
set -euo pipefail
CONSOLE_NAME="${EMULATOR_CONSOLE_CONTAINER:-emulator-ui}"
if docker ps --format '{{.Names}}' | grep -qx "${CONSOLE_NAME}"; then
  docker stop "${CONSOLE_NAME}" >/dev/null
  echo "==> Stopped ${CONSOLE_NAME}"
else
  echo "==> ${CONSOLE_NAME} not running"
fi
