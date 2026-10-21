#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /banco/papeis.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v senha_migracao="$SENHA_BANCO_MIGRACAO" \
  -v senha_api="$SENHA_BANCO_API" \
  -v senha_worker="$SENHA_BANCO_WORKER" \
  -f /banco/usuarios.sql
