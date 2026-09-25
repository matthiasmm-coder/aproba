#!/usr/bin/env bash
# Ejecuta un guion de scripts/migracion con los alias del proyecto y las claves de .env.local.
# Uso (desde cualquier carpeta):  scripts/migracion/correr.sh scripts/migracion/<guion>.ts
# «@/lib/supabase/server» apunta a sesion-stub.ts: la ruta de import corre como en producción.
set -euo pipefail
WEB="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$WEB"
export JITI_ALIAS="{\"@/lib/supabase/server\": \"$WEB/scripts/migracion/sesion-stub.ts\", \"@\": \"$WEB\", \"server-only\": \"$WEB/scripts/migracion/server-only-stub.mjs\"}"
exec node --env-file=.env.local node_modules/jiti/lib/jiti-cli.mjs "$@"
