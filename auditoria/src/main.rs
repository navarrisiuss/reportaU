use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use mongodb::{bson::doc, Client};
use serde::Serialize;
use std::{env, sync::Arc, time::Duration};
use tokio::net::{lookup_host, TcpListener, TcpStream};
use tokio::time::timeout;

#[derive(Clone)]
struct AppState {
    mongo_client: Option<Client>,
    mongo_db_name: String,
}

#[derive(Serialize)]
struct ContainerCheck {
    target: String,
    dns_resolved: bool,
    tcp_connected: bool,
    details: String,
    status: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    timestamp: String,
    database: DatabaseStatus,
    containers_connectivity: Vec<ContainerCheck>,
    note: String,
}

#[derive(Serialize)]
struct DatabaseStatus {
    configured_uri: String,
    database_name: String,
    connected: bool,
    details: String,
}

#[tokio::main]
async fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "8002".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    let mongo_uri = env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://mongo:27017".to_string());
    let mongo_db_name = env::var("MONGO_DB").unwrap_or_else(|_| "reportau_audit".to_string());

    println!("Iniciando servicio de Auditoria...");
    println!("Configuracion: MONGO_URI={}, MONGO_DB={}", mongo_uri, mongo_db_name);

    // intentar inicar cliente de mongo
    let mongo_client = match Client::with_uri_str(&mongo_uri).await {
        Ok(client) => {
            println!("Cliente MongoDB configurado correctamente.");
            Some(client)
        }
        Err(err) => {
            eprintln!("Aviso: No se pudo crear el cliente MongoDB ({}), reintentara en /health", err);
            None
        }
    };

    let state = Arc::new(AppState {
        mongo_client,
        mongo_db_name,
    });

    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .with_state(state);

    let listener = TcpListener::bind(&bind_addr)
        .await
        .unwrap_or_else(|e| panic!("Error al enlazar en {}: {}", bind_addr, e));

    println!("Servidor Auditoria escuchando en http://{}", bind_addr);

    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("Error en el servidor Axum: {}", e));
}

async fn root_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "service": "auditoria",
        "description": "Modulo de Auditoria de ReportaU",
        "endpoints": ["/health"]
    }))
}

async fn check_target_reachability(host: &str, port: u16, is_implemented: bool) -> ContainerCheck {
    let target = format!("{}:{}", host, port);

    // Probar resolucion DNS dentro de la red Docker
    let dns_resolved = lookup_host(&target).await.is_ok();

    if !dns_resolved {
        return ContainerCheck {
            target,
            dns_resolved: false,
            tcp_connected: false,
            details: "No resuelve DNS (el contenedor no esta en la red o aun no existe)".to_string(),
            status: if is_implemented { "ERROR".to_string() } else { "PENDIENTE (Compañero)".to_string() },
        };
    }

    // Probar conexion TCP con 1 segundo de timeout
    let tcp_result = timeout(Duration::from_millis(1000), TcpStream::connect(&target)).await;

    match tcp_result {
        Ok(Ok(_stream)) => ContainerCheck {
            target,
            dns_resolved: true,
            tcp_connected: true,
            details: "Conexion TCP exitosa al contenedor por nombre".to_string(),
            status: "OK".to_string(),
        },
        Ok(Err(err)) => ContainerCheck {
            target,
            dns_resolved: true,
            tcp_connected: false,
            details: if !is_implemented {
                format!("DNS resolvio nombre del contenedor, pero puerto cerrado o servicio no iniciado ({}) [Esperado: pendiente por compañero]", err)
            } else {
                format!("DNS resolvio nombre, pero error TCP: {}", err)
            },
            status: if is_implemented { "ERROR".to_string() } else { "PENDIENTE (Compañero)".to_string() },
        },
        Err(_) => ContainerCheck {
            target,
            dns_resolved: true,
            tcp_connected: false,
            details: "Timeout de conexion TCP (1000ms)".to_string(),
            status: if is_implemented { "TIMEOUT".to_string() } else { "PENDIENTE (Compañero)".to_string() },
        },
    }
}

async fn health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Verificar mongo
    let (db_connected, db_details) = match &state.mongo_client {
        Some(client) => {
            let db = client.database(&state.mongo_db_name);
            let ping_result = timeout(
                Duration::from_millis(1500),
                db.run_command(doc! { "ping": 1 }, None),
            )
            .await;

            match ping_result {
                Ok(Ok(_)) => (true, "Ping a MongoDB exitoso".to_string()),
                Ok(Err(e)) => (false, format!("Error en ping a MongoDB: {}", e)),
                Err(_) => (false, "Timeout al hacer ping a MongoDB".to_string()),
            }
        }
        None => (false, "Cliente MongoDB no inicializado".to_string()),
    };

    let mongo_uri = env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://mongo:27017".to_string());

    // Verificar alcance de los otros contenedores en backend_net
    // Nota: 'reportes' y 'gateway' estan marcados con is_implemented = false (temporales hasta juntar codigos)
    let checks = vec![
        check_target_reachability("mongo", 27017, true).await,
        check_target_reachability("postgres", 5432, true).await,
        check_target_reachability("reportes", 8001, false).await,
        check_target_reachability("gateway", 3000, false).await,
    ];

    let overall_status = if db_connected { "OK" } else { "DEGRADED" };

    let response = HealthResponse {
        status: overall_status.to_string(),
        service: "auditoria".to_string(),
        timestamp: Utc::now().to_rfc3339(),
        database: DatabaseStatus {
            configured_uri: mongo_uri,
            database_name: state.mongo_db_name.clone(),
            connected: db_connected,
            details: db_details,
        },
        containers_connectivity: checks,
        note: "Las verificaciones hacia 'reportes' y 'gateway' son temporales/tolerantes a fallas mientras no este todo junto.".to_string(),
    };

    (StatusCode::OK, Json(response))
}
