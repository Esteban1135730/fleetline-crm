#!/usr/bin/env bash
# Fleetline — desplegar / actualizar en VPS (pegar en sesión SSH como root)
# IP esperada: 76.13.101.203 · puertos host 3010 (web) / 4010 (api)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Esteban1135730/fleetline-crm.git}"
APP_DIR="${APP_DIR:-/opt/fleetline}"
VPS_IP="${VPS_IP:-76.13.101.203}"

echo "==> Docker / puertos"
docker compose ls || true
ss -tlnp | grep -E ':(3010|4010|55432)\s' || echo "Puertos Fleetline libres (OK)"

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ -d .git ]; then
  echo "==> git pull"
  git fetch origin
  git reset --hard origin/main
else
  echo "==> git clone"
  git clone "$REPO_URL" .
fi

if [ ! -f .env.production ]; then
  echo "==> Creando .env.production"
  cp .env.production.example .env.production
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  JWT_SECRET="$(openssl rand -hex 32)"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${POSTGRES_PASSWORD}/" .env.production
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env.production
  sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${VPS_IP}:4010|" .env.production
  sed -i "s|^NEXT_PUBLIC_WS_URL=.*|NEXT_PUBLIC_WS_URL=http://${VPS_IP}:4010|" .env.production
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://${VPS_IP}:3010|" .env.production
  echo "Archivo .env.production generado (guarda POSTGRES_PASSWORD / JWT_SECRET)."
else
  echo "==> .env.production ya existe — se conserva"
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow 3010/tcp comment 'fleetline-web' || true
  ufw allow 4010/tcp comment 'fleetline-api' || true
fi

echo "==> docker compose build + up (puede tardar varios minutos)"
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build

echo "==> Estado"
docker compose -p fleetline -f docker-compose.prod.yml ps

echo "==> Seed demo (usuarios fsg2026)"
docker exec fleetline-api sh -c "pnpm --filter @fsg/db seed" || {
  echo "Seed falló — reintenta cuando api esté healthy:"
  echo "  docker exec fleetline-api sh -c 'pnpm --filter @fsg/db seed'"
}

echo ""
echo "Listo."
echo "  Web: http://${VPS_IP}:3010"
echo "  API: http://${VPS_IP}:4010"
echo "  Login: logistica@fsg.co / fsg2026"
