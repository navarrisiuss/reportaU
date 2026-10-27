"""Módulo B: Servicio de Reportes (Python + FastAPI + PostgreSQL)."""

import os
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import Boolean, DateTime, String, Text, create_engine, select, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://reportau_user:reportau_pass@postgres:5432/reportau_db")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


class Base(DeclarativeBase):
    pass


class Reporte(Base):
    __tablename__ = "reportes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    categoria: Mapped[str] = mapped_column(String(20))
    titulo: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text)
    ubicacion: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    anonimo: Mapped[bool] = mapped_column(Boolean, default=True)
    autor_correo: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="RECIBIDO")
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True))


Categoria = Literal["INFRAESTRUCTURA", "DOCENTE", "ADMINISTRATIVO", "SERVICIOS", "OTRO"]
Estado = Literal["RECIBIDO", "EN_REVISION", "RESUELTO", "RECHAZADO"]

# Transiciones de estado válidas (RECIBIDO -> EN_REVISION -> RESUELTO/RECHAZADO)
TRANSICIONES: dict[str, list[str]] = {
    "RECIBIDO":    ["EN_REVISION", "RECHAZADO"],
    "EN_REVISION": ["RESUELTO", "RECHAZADO"],
    "RESUELTO":    [],
    "RECHAZADO":   [],
}


class NuevoReporte(BaseModel):
    categoria: Categoria
    titulo: str = Field(min_length=5, max_length=120)
    descripcion: str = Field(min_length=10, max_length=2000)
    ubicacion: Optional[str] = Field(default=None, max_length=120)
    anonimo: bool
    autor_correo: Optional[EmailStr] = None

    @model_validator(mode="after")
    def correo_si_no_es_anonimo(self):
        if not self.anonimo and not self.autor_correo:
            raise ValueError("autor_correo es obligatorio cuando anonimo es false")
        return self


class CambioEstado(BaseModel):
    estado: Estado


class ReporteCreado(BaseModel):
    id: uuid.UUID
    estado: str
    creado_en: datetime


class ReporteDetalle(ReporteCreado):
    categoria: str
    titulo: str
    descripcion: str
    ubicacion: Optional[str]
    anonimo: bool


app = FastAPI(title="ReportaU - Servicio de Reportes")


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"PostgreSQL no disponible: {exc}")
    return {"status": "ok", "servicio": "reportes", "bd": "postgresql"}


@app.post("/reportes", status_code=201, response_model=ReporteCreado)
def crear_reporte(datos: NuevoReporte):
    reporte = Reporte(
        id=uuid.uuid4(),
        categoria=datos.categoria,
        titulo=datos.titulo,
        descripcion=datos.descripcion,
        ubicacion=datos.ubicacion,
        anonimo=datos.anonimo,
        autor_correo=None if datos.anonimo else datos.autor_correo,
        estado="RECIBIDO",
        creado_en=datetime.now(timezone.utc),
    )
    with Session(engine) as session:
        session.add(reporte)
        session.commit()
        return ReporteCreado(id=reporte.id, estado=reporte.estado, creado_en=reporte.creado_en)


@app.get("/reportes", response_model=list[ReporteDetalle])
def listar_reportes(
    limite: int = 50,
    categoria: Optional[str] = None,
    estado: Optional[str] = None,
):
    with Session(engine) as session:
        stmt = select(Reporte).order_by(Reporte.creado_en.desc()).limit(limite)
        if categoria:
            stmt = stmt.where(Reporte.categoria == categoria.upper())
        if estado:
            stmt = stmt.where(Reporte.estado == estado.upper())
        filas = session.scalars(stmt).all()
        return [
            ReporteDetalle(
                id=r.id,
                estado=r.estado,
                creado_en=r.creado_en,
                categoria=r.categoria,
                titulo=r.titulo,
                descripcion=r.descripcion,
                ubicacion=r.ubicacion,
                anonimo=r.anonimo,
            )
            for r in filas
        ]


@app.patch("/reportes/{reporte_id}/estado", response_model=ReporteDetalle)
def cambiar_estado(reporte_id: str, datos: CambioEstado):
    try:
        rid = uuid.UUID(reporte_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de reporte inválido")

    with Session(engine) as session:
        reporte = session.get(Reporte, rid)
        if not reporte:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")

        permitidos = TRANSICIONES.get(reporte.estado, [])
        if datos.estado not in permitidos:
            raise HTTPException(
                status_code=422,
                detail=f"Transición inválida: {reporte.estado} -> {datos.estado}. Permitidos: {permitidos}",
            )

        reporte.estado = datos.estado
        session.commit()
        session.refresh(reporte)
        return ReporteDetalle(
            id=reporte.id,
            estado=reporte.estado,
            creado_en=reporte.creado_en,
            categoria=reporte.categoria,
            titulo=reporte.titulo,
            descripcion=reporte.descripcion,
            ubicacion=reporte.ubicacion,
            anonimo=reporte.anonimo,
        )
