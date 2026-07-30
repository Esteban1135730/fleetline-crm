# Despliegue Fleetline en VPS (convivencia con otro Docker)

Guía para clonar el repo, conectar por SSH y levantar Fleetline **sin tocar** el otro stack Docker que ya corre en el mismo servidor.

## Principio de convivencia

| Recurso | Fleetline | Qué evitar |
|---------|-----------|------------|
| Proyecto Compose | `-p fleetline` / `name: fleetline` | No uses el mismo `-p` que el otro proyecto |
| Red | `fleetline_net` | No te unas a la red del otro compose |
| Contenedores | `fleetline-*` | No renombres a nombres genéricos (`postgres`, `redis`) |
| Volúmenes | `fleetline_*` | Nunca `docker compose down -v` del otro proyecto |
| Puertos host | `3010` (web), `4010` (api), `55432` (pg local) | Comprueba que estén libres antes |

Un solo daemon Docker puede hostear muchos compose. Cada proyecto es independiente si tiene **nombre, red, volúmenes y puertos** distintos.

---

## 0. En tu PC (antes del VPS)

1. Ten el código en GitHub (este repo).
2. Anota la IP o dominio del VPS y tu usuario SSH.

---

## 1. Conectarte al VPS

```bash
ssh usuario@IP_DEL_VPS
```

Si usas clave:

```bash
ssh -i ruta/a/tu_clave.pem usuario@IP_DEL_VPS
```

---

## 2. Comprobar el Docker existente (no lo detengas)

```bash
docker ps
docker compose ls
ss -tlnp | grep -E ':(80|443|3000|3010|4000|4010|5432|55432|6379)\s'
```

- Si `3010` o `4010` están ocupados, elige otros en `.env.production` (`FLEETLINE_WEB_HOST_PORT`, `FLEETLINE_API_HOST_PORT`).
- Si ves Redis en `6379`, **no importa**: Fleetline en producción **no publica** Redis al host.

---

## 3. Clonar el repositorio

```bash
sudo mkdir -p /opt/fleetline
sudo chown $USER:$USER /opt/fleetline
cd /opt/fleetline
git clone https://github.com/ESTEBAN_USER/fleetline-crm.git .
```

(Sustituye la URL por la de tu repo.)

---

## 4. Configurar variables de producción

```bash
cp .env.production.example .env.production
nano .env.production
```

Obligatorio cambiar:

- `POSTGRES_PASSWORD` — clave fuerte
- `JWT_SECRET` — secreto largo aleatorio
- `NEXT_PUBLIC_API_URL` — URL pública de la API (IP:4010 o `https://api.tudominio.com`)
- `NEXT_PUBLIC_WS_URL` — normalmente igual que la API
- `CORS_ORIGINS` — origen del front (`http://IP:3010` o `https://crm.tudominio.com`)

Ejemplo por IP:

```env
NEXT_PUBLIC_API_URL=http://203.0.113.10:4010
NEXT_PUBLIC_WS_URL=http://203.0.113.10:4010
CORS_ORIGINS=http://203.0.113.10:3010
FLEETLINE_API_HOST_PORT=4010
FLEETLINE_WEB_HOST_PORT=3010
```

> `NEXT_PUBLIC_*` se **hornea en el build** de Next. Si cambias dominio/IP, hay que **rebuild** del servicio `web`.

---

## 5. Abrir firewall (solo puertos Fleetline)

```bash
# UFW (ejemplo)
sudo ufw allow 3010/tcp comment 'fleetline-web'
sudo ufw allow 4010/tcp comment 'fleetline-api'
sudo ufw status
```

No abras `5432`/`55432` a internet salvo que sepas lo que haces (el compose ya limita Postgres a `127.0.0.1`).

---

## 6. Levantar Fleetline

```bash
cd /opt/fleetline
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Primera vez puede tardar varios minutos (build de API + Next).

Ver estado:

```bash
docker compose -p fleetline -f docker-compose.prod.yml ps
docker compose -p fleetline -f docker-compose.prod.yml logs -f api
```

Seed opcional (datos demo):

```bash
docker exec -it fleetline-api sh -c "pnpm --filter @fsg/db seed"
```

---

## 7. Verificar

- Web: `http://IP:3010`
- API: `http://IP:4010` (login vía web)

Comprueba que el **otro** stack sigue arriba:

```bash
docker ps
docker compose ls
```

---

## 8. Actualizar después de un push

```bash
cd /opt/fleetline
git pull
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build
```

---

## 9. Comandos seguros vs peligrosos

**Seguros (solo Fleetline):**

```bash
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production stop
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production start
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production down
```

**Peligrosos (pueden afectar al otro Docker):**

```bash
# NO uses en un VPS compartido sin saber el alcance:
docker stop $(docker ps -q)
docker system prune -a --volumes
docker compose down -v   # si estás en el directorio/proyecto equivocado
```

`down` **sin** `-v` detiene contenedores Fleetline y conserva datos.  
`down -v` **borra volúmenes** `fleetline_*` (pierdes la BD de Fleetline).

---

## 10. Nginx / Caddy delante (opcional)

Si el otro proyecto ya usa `:80`/`:443`, añade un virtual host que haga proxy a Fleetline **sin** cambiar ese stack:

```nginx
# crm.tudominio.com → web
server {
  server_name crm.tudominio.com;
  location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# api.tudominio.com → api (+ WebSocket)
server {
  server_name api.tudominio.com;
  location / {
    proxy_pass http://127.0.0.1:4010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Luego en `.env.production`:

```env
NEXT_PUBLIC_API_URL=https://api.tudominio.com
NEXT_PUBLIC_WS_URL=https://api.tudominio.com
CORS_ORIGINS=https://crm.tudominio.com
```

y rebuild de `web`.

---

## Resumen rápido

```bash
ssh usuario@IP
cd /opt/fleetline   # o git clone ...
cp .env.production.example .env.production && nano .env.production
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Web → puerto **3010** · API → puerto **4010** · proyecto Compose → **fleetline**.
