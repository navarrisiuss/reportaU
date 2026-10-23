# ReportaU

Sistema distribuido de gestión de reportes y quejas universitarias.
Proyecto Unidad 2 — Sistemas Operativos y Distribuidos.

Un reporte entra por el **gateway** (TypeScript), se guarda en **PostgreSQL** a través del servicio de **reportes** (Python) y deja una traza con hash SHA-256 en **MongoDB** a través del servicio de **auditoría** (Rust). Todo corre en contenedores Docker conectados por redes virtuales.

## Arquitectura

| Contenedor | Rol | Tecnología | Puerto interno | Puerto en el host | Redes (IP) |
|---|---|---|---|---|---|
| `frontend` | Interfaz web | React + Vite, servido por nginx | 80 | **8090** | frontend_net (172.20.0.20) |
| `gateway` | Módulo A: ingesta y orquestación | Node.js 20 + TypeScript + Express | 3000 | **8080** | frontend_net (172.20.0.10), backend_net (172.21.0.10) |
| `reportes` | Módulo B: servicio de dominio | Python 3.12 + FastAPI + SQLAlchemy | 8001 | — | backend_net (172.21.0.11) |
| `auditoria` | Módulo C: servicio de auditoría | Rust + Axum + driver MongoDB | 8002 | — | backend_net (172.21.0.12) |
| `postgres` | BD 1 (relacional) | PostgreSQL 16 | 5432 | — | backend_net (172.21.0.20) |
| `mongo` | BD 2 (documental) | MongoDB 7 | 27017 | — | backend_net (172.21.0.21) |

```
 Navegador ──:8090──► frontend ──/api──┐
                                       ▼
 curl/Postman ──────────:8080──► gateway            (frontend_net 172.20.0.0/24)
                         ─────────────┼──────────────────────────────────────────
                         http://reportes:8001   http://auditoria:8002
                                 │                       │      (backend_net 172.21.0.0/24, internal)
                           postgres:5432            mongo:27017
                           [vol pg_data]          [vol mongo_data]
```

- **frontend_net**: red de entrada. Solo el frontend y el gateway publican puertos al host.
- **backend_net**: red `internal: true`, sin salida a internet y sin puertos publicados. Los módulos se comunican por **nombre de host** usando el DNS interno de Docker; nunca usan `localhost` ni IPs.
- **Volúmenes**: `pg_data` y `mongo_data` mantienen los datos aunque se borren los contenedores.
- **Healthchecks y `depends_on`**: el orden de arranque es BD → servicios → gateway → frontend. Cada servicio espera a que su dependencia esté sana.

## Requisitos

- Docker Desktop (o Docker Engine) con Docker Compose v2.
- Los puertos 8080 (gateway) y 8090 (frontend) libres.

## Cómo levantarlo

```bash
docker compose up -d --build
```

La primera vez tarda algunos minutos, sobre todo por la compilación del servicio en Rust. Para ver el estado de los contenedores:

```bash
docker compose ps
```

`postgres`, `mongo` y `reportes` deben aparecer como `healthy`; el resto, como `Up`. Después se puede abrir **http://localhost:8090** en el navegador.

Para detenerlo:

```bash
docker compose down        # mantiene los datos
docker compose down -v     # borra también los volúmenes
```

## Pruebas con curl

> En PowerShell usa `curl.exe` en lugar de `curl`, o ejecuta los comandos desde Git Bash.

**Estado del sistema** (el gateway consulta a reportes y auditoría por la red interna):

```bash
curl http://localhost:8080/health
```

**Crear un reporte** (flujo completo: gateway → reportes → PostgreSQL, y gateway → auditoría → MongoDB):

```bash
curl -X POST http://localhost:8080/api/reportes \
  -H "Content-Type: application/json" \
  -d '{"categoria":"INFRAESTRUCTURA","titulo":"Proyector roto en sala B-204","descripcion":"El proyector no enciende desde hace dos semanas.","ubicacion":"Edificio B, sala 204","anonimo":true}'
```

Respuesta esperada (`201 Created`):

```json
{"id":"…","estado":"RECIBIDO","creado_en":"…","auditoria":"REGISTRADA","hash":"sha256:…"}
```

**Payload inválido** (debe responder `400`):

```bash
curl -X POST http://localhost:8080/api/reportes -H "Content-Type: application/json" -d '{"categoria":"X"}'
```

**Listar reportes** y **ver la auditoría** de un reporte:

```bash
curl http://localhost:8080/api/reportes
curl http://localhost:8080/api/reportes/<id>/auditoria
```

### Verificar que el reporte quedó en ambas bases de datos

```bash
docker compose exec postgres psql -U reportau_user -d reportau_db -c "SELECT id, categoria, titulo, estado, creado_en FROM reportes;"
docker compose exec mongo mongosh reportau_audit --quiet --eval "db.eventos_auditoria.find().toArray()"
```

### Verificar el aislamiento de la red

```bash
# Los servicios internos NO son accesibles desde el host (debe fallar):
curl --max-time 3 http://localhost:8001/health

# Dentro de la red interna sí se resuelven por nombre:
docker compose exec gateway wget -qO- http://reportes:8001/health
docker compose exec gateway wget -qO- http://auditoria:8002/health

# Inspeccionar las redes y las IPs asignadas:
docker network inspect reportau_backend_net
```

## Módulo de auditoría

Implementado en Rust con Axum y el driver oficial de MongoDB (`auditoria/src/main.rs`).

Variables de entorno configurables (`MONGO_URI=mongodb://mongo:27017`, `MONGO_DB=reportau_audit`, `PORT=8002`, `NODO_NOMBRE=auditoria`):

- Escuchar en `0.0.0.0:8002`.
- `GET /health` → `200` si MongoDB responde.
- `POST /eventos` recibe:
  ```json
  {"reporte_id":"<uuid>","operacion":"CREAR_REPORTE","payload":{...reporte original...},
   "ip_origen":"172.20.0.1","nodo_origen":"gateway","recibido_en":"2026-10-23T02:02:16.960Z"}
  ```
  Calcula el SHA-256 del `payload`, guarda la traza en la colección `eventos_auditoria` y responde `201` con `{"evento_id":"...","hash":"sha256:..."}`.
- `GET /eventos?reporte_id=<uuid>` → lista de trazas de ese reporte. La usa el frontend en "Ver auditoría"; los campos que muestra son `evento_id`, `hash`, `ip_origen`, `nodo_origen`, `nodo_auditor`, `registrado_en` y `duracion_ms`.

## Contratos internos

| Origen → Destino | Endpoint | Descripción |
|---|---|---|
| Cliente → gateway | `POST /api/reportes` | Crear un reporte (valida con JSON Schema/Ajv) |
| Cliente → gateway | `GET /api/reportes` | Listar los últimos reportes |
| Cliente → gateway | `GET /api/reportes/:id/auditoria` | Trazas de auditoría de un reporte |
| Cliente → gateway | `GET /health` | Estado del gateway y de los servicios internos |
| gateway → reportes | `POST http://reportes:8001/reportes` | Insertar en PostgreSQL (estado `RECIBIDO`) |
| gateway → reportes | `GET http://reportes:8001/reportes` | Listar reportes |
| gateway → auditoria | `POST http://auditoria:8002/eventos` | Guardar hash, IP, nodo y tiempos en MongoDB |
| gateway → auditoria | `GET http://auditoria:8002/eventos?reporte_id=` | Consultar trazas |

Si el servicio de auditoría falla, el reporte igual queda guardado y el gateway responde `201` con `"auditoria": "PENDIENTE"`. Si falla el servicio de reportes, responde `503`.

## Estructura del repositorio

```
├── docker-compose.yml   # orquestación: redes, contenedores y volúmenes
├── db/init.sql          # esquema de la tabla reportes (PostgreSQL)
├── gateway/             # Módulo A: TypeScript
├── reportes/            # Módulo B: Python
├── auditoria/           # Módulo C: Rust (en desarrollo)
└── frontend/            # React + Vite + nginx
```

## Desarrollo local del frontend

Con los contenedores levantados se puede trabajar en el frontend con recarga en caliente. Vite redirige `/api` al gateway en `localhost:8080`:

```bash
cd frontend
npm install
npm run dev
```
