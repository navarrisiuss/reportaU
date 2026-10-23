//! Módulo C: Servicio de Auditoría (Rust + Axum + MongoDB).
//! Registra trazas de auditoría inmutables con hash SHA-256 en MongoDB.

use std::env;
use std::sync::Arc;
use std::time::Instant;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use futures_util::TryStreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId},
    options::{ClientOptions, FindOptions},
    Client, Database,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};


#[derive(Clone)]
struct AppState {
    db: Database,
    nodo: String,
}

#[derive(Debug, Deserialize)]
struct NuevoEventoReq {
    reporte_id: String,
    #[serde(default = "default_operacion")]
    operacion: String,
    payload: serde_json::Value,
    #[serde(default)]
    ip_origen: String,
    #[serde(default = "default_nodo_origen")]
    nodo_origen: String,
    recibido_en: Option<String>,
}

fn default_operacion() -> String {
    "CREAR_REPORTE".to_string()
}

fn default_nodo_origen() -> String {
    "gateway".to_string()
}

#[derive(Debug, Serialize)]
struct EventoCreadoResp {
    evento_id: String,
    hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EventoAuditoria {
    evento_id: String,
    reporte_id: String,
    operacion: String,
    payload: serde_json::Value,
    hash: String,
    ip_origen: String,
    nodo_origen: String,
    nodo_auditor: String,
    recibido_en: Option<String>,
    registrado_en: String,
    duracion_ms: i64,
}

#[derive(Debug, Deserialize)]
struct EventosQuery {
    reporte_id: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = env::var("PORT").unwrap_or_else(|_| "8002".to_string());
    let mongo_uri = env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://mongo:27017".to_string());
    let mongo_db = env::var("MONGO_DB").unwrap_or_else(|_| "reportau_audit".to_string());
    let nodo = env::var("NODO_NOMBRE")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "auditoria".to_string());

    println!("[auditoria] conectando a MongoDB en {} (bd: {})...", mongo_uri, mongo_db);
    let client_options = ClientOptions::parse(&mongo_uri).await?;
    let client = Client::with_options(client_options)?;
    let db = client.database(&mongo_db);

    let state = Arc::new(AppState {
        db,
        nodo: nodo.clone(),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/eventos", post(crear_evento).get(listar_eventos))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("[auditoria] escuchando en {} (nodo: {})", addr, nodo);

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.run_command(doc! { "ping": 1 }, None).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "servicio": "auditoria",
                "bd": "mongodb",
                "nodo": state.nodo,
            })),
        ),
        Err(err) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "error",
                "servicio": "auditoria",
                "error": format!("MongoDB no disponible: {}", err),
            })),
        ),
    }
}

async fn crear_evento(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NuevoEventoReq>,
) -> Result<(StatusCode, Json<EventoCreadoResp>), (StatusCode, Json<serde_json::Value>)> {
    let start_instant = Instant::now();
    let registrado_dt = Utc::now();

    // 1) Calcular SHA-256 del payload
    let payload_bytes = serde_json::to_vec(&input.payload).map_err(|err| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "SERIALIZACION", "detalles": err.to_string() })),
        )
    })?;

    let mut hasher = Sha256::new();
    hasher.update(&payload_bytes);
    let hash = format!("sha256:{}", hex::encode(hasher.finalize()));

    let evento_id = ObjectId::new().to_hex();

    // 2) Calcular duración estimada de procesamiento o latencia recibida
    let duracion_ms = if let Some(ref recibido_str) = input.recibido_en {
        if let Ok(recibido_dt) = chrono::DateTime::parse_from_rfc3339(recibido_str) {
            let diff = (registrado_dt - recibido_dt.with_timezone(&Utc)).num_milliseconds();
            if diff >= 0 {
                diff
            } else {
                start_instant.elapsed().as_millis() as i64
            }
        } else {
            start_instant.elapsed().as_millis() as i64
        }
    } else {
        start_instant.elapsed().as_millis() as i64
    };

    let evento = EventoAuditoria {
        evento_id: evento_id.clone(),
        reporte_id: input.reporte_id,
        operacion: input.operacion,
        payload: input.payload,
        hash: hash.clone(),
        ip_origen: input.ip_origen,
        nodo_origen: input.nodo_origen,
        nodo_auditor: state.nodo.clone(),
        recibido_en: input.recibido_en,
        registrado_en: registrado_dt.to_rfc3339(),
        duracion_ms,
    };

    // 3) Guardar en colección eventos_auditoria de MongoDB
    let collection = state.db.collection::<EventoAuditoria>("eventos_auditoria");
    collection.insert_one(evento, None).await.map_err(|err| {
        eprintln!("[auditoria] error al insertar en MongoDB: {}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "BD_ERROR", "detalles": err.to_string() })),
        )
    })?;

    Ok((
        StatusCode::CREATED,
        Json(EventoCreadoResp { evento_id, hash }),
    ))
}

async fn listar_eventos(
    State(state): State<Arc<AppState>>,
    Query(query): Query<EventosQuery>,
) -> Result<Json<Vec<EventoAuditoria>>, (StatusCode, Json<serde_json::Value>)> {
    let collection = state.db.collection::<EventoAuditoria>("eventos_auditoria");

    let filter = if let Some(ref rid) = query.reporte_id {
        if !rid.trim().is_empty() {
            doc! { "reporte_id": rid }
        } else {
            doc! {}
        }
    } else {
        doc! {}
    };

    let find_options = FindOptions::builder()
        .sort(doc! { "registrado_en": -1 })
        .limit(100)
        .build();

    let mut cursor = collection.find(filter, find_options).await.map_err(|err| {
        eprintln!("[auditoria] error al consultar MongoDB: {}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "BD_ERROR", "detalles": err.to_string() })),
        )
    })?;

    let mut eventos = Vec::new();
    while let Some(ev) = cursor.try_next().await.map_err(|err| {
        eprintln!("[auditoria] error al leer cursor de MongoDB: {}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "CURSOR_ERROR", "detalles": err.to_string() })),
        )
    })? {
        eventos.push(ev);
    }

    Ok(Json(eventos))
}
