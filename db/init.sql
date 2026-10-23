-- BD 1 (PostgreSQL): reportes registrados por el Módulo B.
-- Se ejecuta automáticamente la primera vez que se crea el volumen pg_data.

CREATE TABLE IF NOT EXISTS reportes (
  id            UUID PRIMARY KEY,
  categoria     VARCHAR(20)  NOT NULL
                CHECK (categoria IN ('INFRAESTRUCTURA', 'DOCENTE', 'ADMINISTRATIVO', 'SERVICIOS', 'OTRO')),
  titulo        VARCHAR(120) NOT NULL,
  descripcion   TEXT         NOT NULL,
  ubicacion     VARCHAR(120),
  anonimo       BOOLEAN      NOT NULL DEFAULT TRUE,
  autor_correo  VARCHAR(255),
  estado        VARCHAR(20)  NOT NULL DEFAULT 'RECIBIDO'
                CHECK (estado IN ('RECIBIDO', 'EN_REVISION', 'RESUELTO', 'RECHAZADO')),
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reportes_creado_en ON reportes (creado_en DESC);
