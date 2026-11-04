# Etapa 1: Compilación
FROM rust:1.90-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
# Crear un main.rs dummy para cachear la compilación de dependencias
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
# Copiar el código real y compilar el binario
COPY src ./src
RUN touch src/main.rs && cargo build --release

# Etapa 2: Ejecución ligera
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/auditoria /usr/local/bin/auditoria
EXPOSE 8002
CMD ["auditoria"]