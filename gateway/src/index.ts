// Módulo A: Gateway / Ingesta (TypeScript + Express).
// Único punto de entrada al sistema: valida y orquesta las llamadas a B (reportes) y C (auditoría).
import "dotenv/config";
import os from "node:os";
import express, { type Request, type Response } from "express";
import cors from "cors";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const PORT = Number(process.env.PORT ?? 3000);
const REPORTES_URL = process.env.REPORTES_URL ?? "http://reportes:8001";
const AUDITORIA_URL = process.env.AUDITORIA_URL ?? "http://auditoria:8002";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 3000);
const NODO = process.env.NODO_NOMBRE ?? os.hostname();

const nuevoReporteSchema = {
  type: "object",
  required: ["categoria", "titulo", "descripcion", "anonimo"],
  properties: {
    categoria: { type: "string", enum: ["INFRAESTRUCTURA", "DOCENTE", "ADMINISTRATIVO", "SERVICIOS", "OTRO"] },
    titulo: { type: "string", minLength: 5, maxLength: 120 },
    descripcion: { type: "string", minLength: 10, maxLength: 2000 },
    ubicacion: { type: "string", maxLength: 120 },
    anonimo: { type: "boolean" },
    autor_correo: { type: "string", format: "email" },
  },
  if: { required: ["anonimo"], properties: { anonimo: { const: false } } },
  then: { required: ["autor_correo"] },
  additionalProperties: false,
};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validarReporte = ajv.compile(nuevoReporteSchema);

class ServicioError extends Error {
  constructor(public servicio: string, public status: number, mensaje: string) {
    super(mensaje);
  }
}

async function llamar(servicio: string, url: string, init?: RequestInit): Promise<any> {
  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ServicioError(servicio, 503, (err as Error).message);
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ServicioError(servicio, res.status, JSON.stringify(cuerpo));
  }
  return cuerpo;
}

function ipCliente(req: Request): string {
  const reenviada = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(reenviada) ? reenviada[0] : reenviada?.split(",")[0]) ?? req.socket.remoteAddress ?? "";
  return ip.trim().replace(/^::ffff:/, "");
}

function responderError(res: Response, err: unknown) {
  if (err instanceof ServicioError) {
    console.error(`[gateway] fallo en ${err.servicio}: ${err.message}`);
    res.status(503).json({ error: "SERVICIO_NO_DISPONIBLE", servicio: err.servicio });
    return;
  }
  console.error("[gateway] error inesperado", err);
  res.status(500).json({ error: "ERROR_INTERNO" });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.get("/health", async (_req, res) => {
  const [reportes, auditoria] = await Promise.all(
    [
      ["reportes", `${REPORTES_URL}/health`],
      ["auditoria", `${AUDITORIA_URL}/health`],
    ].map(([nombre, url]) =>
      llamar(nombre, url)
        .then(() => "ok")
        .catch(() => "caido"),
    ),
  );
  const ok = reportes === "ok" && auditoria === "ok";
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degradado", nodo: NODO, servicios: { reportes, auditoria } });
});

app.post("/api/reportes", async (req, res) => {
  const recibidoEn = new Date().toISOString();

  if (!validarReporte(req.body)) {
    res.status(400).json({
      error: "VALIDACION",
      detalles: (validarReporte.errors ?? []).map((e) => `${e.instancePath || "payload"} ${e.message}`),
    });
    return;
  }

  // 1) Módulo B: persistir el reporte en PostgreSQL (síncrono, obligatorio).
  let creado: { id: string; estado: string; creado_en: string };
  try {
    creado = await llamar("reportes", `${REPORTES_URL}/reportes`, {
      method: "POST",
      body: JSON.stringify(req.body),
    });
  } catch (err) {
    responderError(res, err);
    return;
  }

  // 2) Módulo C: registrar la traza en MongoDB. Si falla, el reporte ya quedó guardado.
  let auditoria: "REGISTRADA" | "PENDIENTE" = "REGISTRADA";
  let hash: string | undefined;
  try {
    const evento = await llamar("auditoria", `${AUDITORIA_URL}/eventos`, {
      method: "POST",
      body: JSON.stringify({
        reporte_id: creado.id,
        operacion: "CREAR_REPORTE",
        payload: req.body,
        ip_origen: ipCliente(req),
        nodo_origen: NODO,
        recibido_en: recibidoEn,
      }),
    });
    hash = evento.hash;
  } catch (err) {
    auditoria = "PENDIENTE";
    console.error(`[gateway] auditoría pendiente para ${creado.id}: ${(err as Error).message}`);
  }

  res.status(201).json({ ...creado, auditoria, hash });
});

app.get("/api/reportes", async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (typeof req.query.categoria === "string") params.set("categoria", req.query.categoria);
    if (typeof req.query.estado === "string") params.set("estado", req.query.estado);
    if (typeof req.query.pagina === "string") params.set("pagina", req.query.pagina);
    if (typeof req.query.por_pagina === "string") params.set("por_pagina", req.query.por_pagina);
    const qs = params.toString() ? `?${params}` : "";
    res.json(await llamar("reportes", `${REPORTES_URL}/reportes${qs}`));
  } catch (err) {
    responderError(res, err);
  }
});

app.patch("/api/reportes/:id/estado", async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  if (!req.body?.estado || typeof req.body.estado !== "string") {
    res.status(400).json({ error: "VALIDACION", detalles: ["estado es requerido"] });
    return;
  }
  try {
    const resultado = await llamar("reportes", `${REPORTES_URL}/reportes/${id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado: req.body.estado }),
    });
    res.json(resultado);
  } catch (err) {
    responderError(res, err);
  }
});

app.get("/api/reportes/:id/auditoria", async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);
    res.json(await llamar("auditoria", `${AUDITORIA_URL}/eventos?reporte_id=${id}`));
  } catch (err) {
    responderError(res, err);
  }
});

app.listen(PORT, () => {
  console.log(`gateway escuchando en :${PORT} (reportes=${REPORTES_URL}, auditoria=${AUDITORIA_URL})`);
});
