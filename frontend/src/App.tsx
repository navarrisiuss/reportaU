import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

const CATEGORIAS = ['INFRAESTRUCTURA', 'DOCENTE', 'ADMINISTRATIVO', 'SERVICIOS', 'OTRO'] as const
const ESTADOS = ['RECIBIDO', 'EN_REVISION', 'RESUELTO', 'RECHAZADO'] as const

type Estado = typeof ESTADOS[number]

// Transiciones permitidas (espejo del backend)
const TRANSICIONES: Record<string, Estado[]> = {
  RECIBIDO:    ['EN_REVISION', 'RECHAZADO'],
  EN_REVISION: ['RESUELTO', 'RECHAZADO'],
  RESUELTO:    [],
  RECHAZADO:   [],
}

type Reporte = {
  id: string
  categoria: string
  titulo: string
  descripcion: string
  ubicacion: string | null
  anonimo: boolean
  estado: string
  creado_en: string
}

type Evento = {
  evento_id: string
  hash: string
  ip_origen: string
  nodo_origen: string
  nodo_auditor: string
  recibido_en: string | null
  registrado_en: string | null
  duracion_ms: number
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

const formularioVacio = {
  categoria: 'INFRAESTRUCTURA',
  titulo: '',
  descripcion: '',
  ubicacion: '',
  anonimo: true,
  autor_correo: '',
}

function fecha(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('es-CL') : '—'
}

async function obtenerReportes(filtros: { categoria?: string; estado?: string }): Promise<Reporte[]> {
  const params = new URLSearchParams()
  if (filtros.categoria) params.set('categoria', filtros.categoria)
  if (filtros.estado) params.set('estado', filtros.estado)
  const qs = params.toString() ? `?${params}` : ''
  const res = await fetch(`/api/reportes${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function App() {
  const [form, setForm] = useState(formularioVacio)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Record<string, Evento[]>>({})

  // Filtros activos
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroEst, setFiltroEst] = useState('')

  // Estado de cambio de estado por tarjeta
  const [cambiando, setCambiando] = useState<Record<string, boolean>>({})

  async function cargarReportes(cat = filtroCat, est = filtroEst) {
    setCargando(true)
    try {
      setReportes(await obtenerReportes({ categoria: cat, estado: est }))
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo obtener la lista de reportes.' })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarReportes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setAviso(null)
    const payload: Record<string, unknown> = {
      categoria: form.categoria,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      anonimo: form.anonimo,
    }
    if (form.ubicacion.trim()) payload.ubicacion = form.ubicacion.trim()
    if (!form.anonimo) payload.autor_correo = form.autor_correo.trim()

    try {
      const res = await fetch('/api/reportes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const cuerpo = await res.json()
      if (!res.ok) {
        const detalle = cuerpo.detalles?.join(' · ') ?? cuerpo.servicio ?? ''
        setAviso({ tipo: 'error', texto: `Error ${res.status}: ${cuerpo.error}. ${detalle}` })
        return
      }
      setAviso({
        tipo: 'ok',
        texto: `Reporte ${cuerpo.id.slice(0, 8)} registrado (${cuerpo.estado}) · auditoría ${cuerpo.auditoria}`,
      })
      setForm(formularioVacio)
      cargarReportes()
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo conectar con el gateway.' })
    } finally {
      setEnviando(false)
    }
  }

  async function verAuditoria(id: string) {
    if (abierto === id) {
      setAbierto(null)
      return
    }
    setAbierto(id)
    const res = await fetch(`/api/reportes/${id}/auditoria`)
    const datos: Evento[] = res.ok ? await res.json() : []
    setEventos((prev) => ({ ...prev, [id]: datos }))
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    setCambiando((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/reportes/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (!res.ok) {
        const cuerpo = await res.json()
        setAviso({ tipo: 'error', texto: cuerpo.detail ?? `Error ${res.status}` })
        return
      }
      const actualizado: Reporte = await res.json()
      setReportes((prev) => prev.map((r) => (r.id === id ? { ...r, estado: actualizado.estado } : r)))
      setAviso({ tipo: 'ok', texto: `Reporte actualizado a ${actualizado.estado}` })
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo cambiar el estado del reporte.' })
    } finally {
      setCambiando((prev) => ({ ...prev, [id]: false }))
    }
  }

  function aplicarFiltros(cat: string, est: string) {
    setFiltroCat(cat)
    setFiltroEst(est)
    cargarReportes(cat, est)
  }

  return (
    <div className="pagina">
      <header className="cabecera">
        <h1>ReportaU</h1>
        <p>Reportes y quejas de la universidad</p>
      </header>

      <main className="grilla">
        <section className="panel">
          <h2>Nuevo reporte</h2>
          <form onSubmit={enviar} className="formulario">
            <label>
              Categoría
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título
              <input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                minLength={5}
                maxLength={120}
                required
                placeholder="Proyector roto en sala B-204"
              />
            </label>
            <label>
              Descripción
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                minLength={10}
                maxLength={2000}
                rows={4}
                required
              />
            </label>
            <label>
              Ubicación <span className="opcional">(opcional)</span>
              <input
                value={form.ubicacion}
                onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                maxLength={120}
                placeholder="Edificio B, sala 204"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.anonimo}
                onChange={(e) => setForm({ ...form, anonimo: e.target.checked })}
              />
              Enviar de forma anónima
            </label>
            {!form.anonimo && (
              <label>
                Correo
                <input
                  type="email"
                  value={form.autor_correo}
                  onChange={(e) => setForm({ ...form, autor_correo: e.target.value })}
                  required
                />
              </label>
            )}
            <button type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar reporte'}
            </button>
            {aviso && <p className={`aviso ${aviso.tipo}`}>{aviso.texto}</p>}
          </form>
        </section>

        <section className="panel">
          <div className="titulo-lista">
            <h2>Reportes recientes</h2>
            <button type="button" className="secundario" onClick={() => cargarReportes()}>
              Actualizar
            </button>
          </div>

          {/* ── Filtros ── */}
          <div className="filtros">
            <label>
              Categoría
              <select
                value={filtroCat}
                onChange={(e) => aplicarFiltros(e.target.value, filtroEst)}
              >
                <option value="">Todas</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={filtroEst}
                onChange={(e) => aplicarFiltros(filtroCat, e.target.value)}
              >
                <option value="">Todos</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
            {(filtroCat || filtroEst) && (
              <button type="button" className="secundario" onClick={() => aplicarFiltros('', '')}>
                Limpiar filtros
              </button>
            )}
          </div>

          {cargando && <p className="vacio">Cargando…</p>}
          {!cargando && reportes.length === 0 && <p className="vacio">No hay reportes con esos filtros.</p>}
          <ul className="lista">
            {reportes.map((r) => {
              const siguientes = TRANSICIONES[r.estado] ?? []
              return (
                <li key={r.id} className="tarjeta">
                  <div className="meta">
                    <span className="etiqueta">{r.categoria}</span>
                    <span className={`estado estado-${r.estado.toLowerCase()}`}>{r.estado.replace('_', ' ')}</span>
                  </div>
                  <h3>{r.titulo}</h3>
                  <p>{r.descripcion}</p>
                  <p className="detalle">
                    {r.ubicacion ? `${r.ubicacion} · ` : ''}
                    {fecha(r.creado_en)} · {r.anonimo ? 'Anónimo' : 'Con autor'}
                  </p>

                  {/* ── Cambio de estado ── */}
                  {siguientes.length > 0 && (
                    <div className="acciones-estado">
                      <span className="label-accion">Cambiar estado:</span>
                      {siguientes.map((sig) => (
                        <button
                          key={sig}
                          type="button"
                          className={`btn-estado btn-estado-${sig.toLowerCase()}`}
                          disabled={cambiando[r.id]}
                          onClick={() => cambiarEstado(r.id, sig)}
                        >
                          {cambiando[r.id] ? '…' : sig.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  )}

                  <button type="button" className="secundario" onClick={() => verAuditoria(r.id)}>
                    {abierto === r.id ? 'Ocultar auditoría' : 'Ver auditoría'}
                  </button>
                  {abierto === r.id && (
                    <div className="auditoria">
                      {(eventos[r.id] ?? []).length === 0 && <p>Sin eventos de auditoría registrados.</p>}
                      {(eventos[r.id] ?? []).map((ev) => (
                        <dl key={ev.evento_id}>
                          <dt>Hash</dt>
                          <dd className="mono">{ev.hash}</dd>
                          <dt>IP origen</dt>
                          <dd>{ev.ip_origen}</dd>
                          <dt>Nodos</dt>
                          <dd>
                            {ev.nodo_origen} → {ev.nodo_auditor}
                          </dd>
                          <dt>Registrado</dt>
                          <dd>
                            {fecha(ev.registrado_en)} ({ev.duracion_ms} ms)
                          </dd>
                        </dl>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
