#!/usr/bin/env bash
# Runs once, on first start of an empty data volume.
# - <db>_test: database for API integration tests
# - bseat_readonly: SELECT-only role used by the Postgres MCP server (AI agents)
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE "${POSTGRES_DB}_test" OWNER "$POSTGRES_USER";

  CREATE ROLE bseat_readonly LOGIN PASSWORD '${POSTGRES_READONLY_PASSWORD}';
  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO bseat_readonly;
  GRANT USAGE ON SCHEMA public TO bseat_readonly;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO bseat_readonly;
  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
    GRANT SELECT ON TABLES TO bseat_readonly;
  ALTER ROLE bseat_readonly SET default_transaction_read_only = on;
SQL

# btree_gist powers the "no overlapping bookings" exclusion constraint.
for db in "$POSTGRES_DB" "${POSTGRES_DB}_test"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" \
    -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'
done
