#!/usr/bin/env bash
# Rotates the password of the `app` database role while the API keeps running.
#
# Order matters:
#   1. ALTER ROLE  - the database starts accepting the new password for NEW connections
#   2. write file  - right after, so the API (which reads the file for every new connection) uses it
#   3. terminate   - close the connections that were authenticated with the old password
# Between 1 and 2 there is a short window in which a brand-new connection would still send the old
# password and be refused; it is as short as the file write.
set -euo pipefail

cd "$(dirname "$0")/.."

SECRET_FILE="${DB_PASSWORD_FILE:-secrets/db_password}"
ROLE="app"

psql_admin() {
  # The superuser connects over the container's local socket, so no admin password is needed.
  docker compose exec -T postgres psql -U postgres -d marketplace -v ON_ERROR_STOP=1 "$@"
}

NEW_PASSWORD="$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"

echo "1/3 ALTER ROLE ${ROLE}"
psql_admin -c "ALTER ROLE ${ROLE} PASSWORD '${NEW_PASSWORD}'"

echo "2/3 writing ${SECRET_FILE}"
printf '%s\n' "${NEW_PASSWORD}" > "${SECRET_FILE}.tmp"
mv -f "${SECRET_FILE}.tmp" "${SECRET_FILE}"

echo "3/3 closing old connections of ${ROLE}"
psql_admin -tA -c "SELECT count(*) || ' connection(s) terminated' FROM (SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${ROLE}' AND pid <> pg_backend_pid()) AS closed"

echo "Done. The API keeps running and picks up the new password on its next connection."
