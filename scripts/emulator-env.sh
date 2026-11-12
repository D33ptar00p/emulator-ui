# shellcheck shell=bash
# Usage: source scripts/emulator-env.sh [region]
# Points the AWS CLI and SDKs at the local emulator and removes any real AWS credentials from this shell.
# With a region that has its own emulator (make up REGIONS=...), that emulator is used; otherwise the
# default emulator is used with the given region (default: the first REGIONS entry, else us-east-1).
_EMU_HOME="${HOME}/.aws/emulator"
_EMU_REGION="${1:-}"
_EMU_PORT="${EMULATOR_PORT:-9297}"
if [[ -s "${_EMU_HOME}/regions" ]]; then
  [[ -z "${_EMU_REGION}" ]] && _EMU_REGION="$(head -n1 "${_EMU_HOME}/regions" | cut -d= -f1)"
  _EMU_MATCH="$(grep -E "^${_EMU_REGION}=" "${_EMU_HOME}/regions" | cut -d= -f2 || true)"
  [[ -n "${_EMU_MATCH}" ]] && _EMU_PORT="${_EMU_MATCH}"
fi
_EMU_REGION="${_EMU_REGION:-us-east-1}"
_EMU_DIR="${_EMU_HOME}/${_EMU_PORT}"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE

export AWS_ENDPOINT_URL="https://127.0.0.1:${_EMU_PORT}"
export AWS_SHARED_CREDENTIALS_FILE="${_EMU_DIR}/emulator_credentials"
export AWS_CONFIG_FILE="${_EMU_DIR}/config"
export AWS_CA_BUNDLE="${_EMU_DIR}/ca.pem"
export AWS_EC2_METADATA_DISABLED=true
export AWS_DISABLE_HOST_PREFIX_INJECTION=true
export AWS_REGION="${_EMU_REGION}"
export AWS_DEFAULT_REGION="${_EMU_REGION}"

unset _EMU_HOME _EMU_REGION _EMU_PORT _EMU_DIR _EMU_MATCH
