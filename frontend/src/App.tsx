import { useEffect, useState, type FormEvent } from 'react'

const CATEGORIAS = ['INFRAESTRUCTURA', 'DOCENTE', 'ADMINISTRATIVO', 'SERVICIOS', 'OTRO'] as const
const ESTADOS = ['RECIBIDO', 'EN_REVISION', 'RESUELTO', 'RECHAZADO'] as const

type Estado = typeof ESTADOS[number]

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
  operacion: string
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

function fechaRelativa(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora mismo'
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `Hace ${days}d`
}

const PAGE_SIZE = 5

async function obtenerReportes(filtros: { categoria?: string; estado?: string }): Promise<Reporte[]> {
  const params = new URLSearchParams()
  if (filtros.categoria) params.set('categoria', filtros.categoria)
  if (filtros.estado) params.set('estado', filtros.estado)
  const qs = params.toString() ? `?${params}` : ''
  const res = await fetch(`/api/reportes${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function IconCheck({ cls = 'w-4 h-4' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  )
}
function IconX({ cls = 'w-4 h-4' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconPin({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function IconDoc({ cls = 'w-5 h-5' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
function IconRefresh({ cls = 'w-4 h-4' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
function IconShield({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}
function IconChevron({ cls = 'w-4 h-4', open = false }: { cls?: string; open?: boolean }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={`${cls} transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
function IconSpin({ cls = 'w-5 h-5' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={`${cls} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.941l3-2.647z" />
    </svg>
  )
}
function IconUser({ cls = 'w-3.5 h-3.5' }: { cls?: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

// ─── Estado badge & button ───────────────────────────────────────────────────

type EstadoStyle = { dot: string; badge: string; btn: string }
const ESTADO_STYLES: Record<string, EstadoStyle> = {
  RECIBIDO:    { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800', btn: 'bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800 dark:hover:bg-blue-900/50' },
  EN_REVISION: { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800', btn: 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800 dark:hover:bg-amber-900/50' },
  RESUELTO:    { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800', btn: 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800 dark:hover:bg-emerald-900/50' },
  RECHAZADO:   { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800', btn: 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800 dark:hover:bg-rose-900/50' },
}
const CATEGORIA_STYLES: Record<string, string> = {
  INFRAESTRUCTURA: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800',
  DOCENTE: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800',
  ADMINISTRATIVO: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:ring-orange-800',
  SERVICIOS: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:ring-teal-800',
  OTRO: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600',
}

function EstadoBadge({ estado }: { estado: string }) {
  const s = ESTADO_STYLES[estado] ?? ESTADO_STYLES['RECIBIDO']
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ring-1 ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {estado.replace('_', ' ')}
    </span>
  )
}

function EstadoBtn({ estado, disabled, onClick }: { estado: string; disabled: boolean; onClick: () => void }) {
  const s = ESTADO_STYLES[estado] ?? ESTADO_STYLES['RECIBIDO']
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide ring-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${s.btn}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {estado.replace('_', ' ')}
    </button>
  )
}

function CategoriaBadge({ cat }: { cat: string }) {
  const s = CATEGORIA_STYLES[cat] ?? CATEGORIA_STYLES['OTRO']
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ring-1 ${s}`}>
      {cat.charAt(0) + cat.slice(1).toLowerCase()}
    </span>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <div className="flex flex-col items-center justify-center gap-0.5 p-3 rounded-xl bg-white dark:bg-gray-800/60 ring-1 ring-gray-200 dark:ring-gray-700 shadow-sm min-w-[72px]">
      <span className={`text-2xl font-black tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 text-center leading-tight">{label}</span>
    </div>
  )
}

// ─── Form input wrapper ───────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</label>
        {hint && <span className="text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls = 'block w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 outline-none transition-all duration-150'

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [form, setForm] = useState(formularioVacio)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [eventos, setEventos] = useState<Record<string, Evento[]>>({})
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [cambiando, setCambiando] = useState<Record<string, boolean>>({})
  const [charCount, setCharCount] = useState(0)
  const [pagina, setPagina] = useState(1)

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

  useEffect(() => { cargarReportes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        texto: `✓ Reporte #${cuerpo.id.slice(0, 8)} registrado correctamente`,
      })
      setForm(formularioVacio)
      setCharCount(0)
      cargarReportes()
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo conectar con el gateway.' })
    } finally {
      setEnviando(false)
    }
  }

  async function verAuditoria(id: string) {
    if (abierto === id) { setAbierto(null); return }
    setAbierto(id)
    if (!eventos[id]) {
      const res = await fetch(`/api/reportes/${id}/auditoria`)
      const datos: Evento[] = res.ok ? await res.json() : []
      setEventos(prev => ({ ...prev, [id]: datos }))
    }
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    setCambiando(prev => ({ ...prev, [id]: true }))
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
      setReportes(prev => prev.map(r => r.id === id ? { ...r, estado: actualizado.estado } : r))
      setAviso({ tipo: 'ok', texto: `Reporte actualizado a ${actualizado.estado.replace('_', ' ')}` })
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo cambiar el estado del reporte.' })
    } finally {
      setCambiando(prev => ({ ...prev, [id]: false }))
    }
  }

  function aplicarFiltros(cat: string, est: string) {
    setFiltroCat(cat)
    setFiltroEst(est)
    cargarReportes(cat, est)
  }

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return () => clearTimeout(t)
  }, [aviso])

  // Stats
  const stats = {
    total: reportes.length,
    recibido: reportes.filter(r => r.estado === 'RECIBIDO').length,
    revision: reportes.filter(r => r.estado === 'EN_REVISION').length,
    resuelto: reportes.filter(r => r.estado === 'RESUELTO').length,
  }

  // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900 text-gray-900 dark:text-gray-100">

      {/* ── Toast ── */}
      {aviso && (
        <div
          role="alert"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border backdrop-blur-sm text-sm font-medium transition-all
            ${aviso.tipo === 'ok'
              ? 'bg-emerald-50/95 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50/95 dark:bg-rose-900/80 border-rose-200 dark:border-rose-700 text-rose-800 dark:text-rose-200'
            }`}
        >
          <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${aviso.tipo === 'ok' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            {aviso.tipo === 'ok' ? <IconCheck cls="w-3.5 h-3.5" /> : <IconX cls="w-3.5 h-3.5" />}
          </span>
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="ml-2 p-1 rounded-lg opacity-60 hover:opacity-100 transition">
            <IconX cls="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ── */}
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 dark:bg-blue-500 shadow-lg shadow-blue-200 dark:shadow-blue-900/50 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">ReportaU</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Sistema de reportes y quejas universitarias</p>
              </div>
            </div>
            {/* Stats rápidas */}
            {!cargando && reportes.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <StatCard label="Total" value={stats.total} color="text-gray-700 dark:text-gray-200" />
                <StatCard label="Recibido" value={stats.recibido} color="text-blue-600 dark:text-blue-400" />
                <StatCard label="En revisión" value={stats.revision} color="text-amber-500 dark:text-amber-400" />
                <StatCard label="Resuelto" value={stats.resuelto} color="text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
          </div>
        </header>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

          {/* ── Formulario (col 1-2) ── */}
          <section className="xl:col-span-2 space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-sm ring-1 ring-gray-200 dark:ring-gray-700/60 overflow-hidden">
              {/* Form header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700/60 bg-gradient-to-r from-blue-600 to-indigo-600">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  Nuevo reporte
                </h2>
                <p className="text-xs text-blue-100 mt-0.5">Completa los campos para enviar tu reporte</p>
              </div>

              <form onSubmit={enviar} className="p-6 space-y-5">

                {/* Categoría */}
                <Field label="Categoría">
                  <div className="relative">
                    <select
                      value={form.categoria}
                      onChange={e => setForm({ ...form, categoria: e.target.value })}
                      className={inputCls + ' appearance-none pr-9 cursor-pointer'}
                    >
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <IconChevron cls="w-4 h-4" />
                    </div>
                  </div>
                </Field>

                {/* Título */}
                <Field label="Título">
                  <input
                    value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    minLength={5}
                    maxLength={120}
                    required
                    placeholder="Ej: Proyector roto en sala B-204"
                    className={inputCls}
                  />
                </Field>

                {/* Descripción */}
                <Field label="Descripción" hint={`${charCount}/2000`}>
                  <textarea
                    value={form.descripcion}
                    onChange={e => { setForm({ ...form, descripcion: e.target.value }); setCharCount(e.target.value.length) }}
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    required
                    placeholder="Describe el problema con el mayor detalle posible…"
                    className={inputCls + ' resize-none'}
                  />
                  {charCount > 1800 && (
                    <p className="text-xs text-amber-500 dark:text-amber-400">
                      Quedan {2000 - charCount} caracteres.
                    </p>
                  )}
                </Field>

                {/* Ubicación */}
                <Field label="Ubicación" hint="(opcional)">
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <IconPin />
                    </div>
                    <input
                      value={form.ubicacion}
                      onChange={e => setForm({ ...form, ubicacion: e.target.value })}
                      maxLength={120}
                      placeholder="Edificio B, sala 204"
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                </Field>

                {/* Anonimato */}
                <div className={`rounded-xl p-4 ring-1 transition-colors duration-200 ${form.anonimo ? 'bg-gray-50 dark:bg-gray-700/40 ring-gray-200 dark:ring-gray-600' : 'bg-blue-50 dark:bg-blue-900/20 ring-blue-200 dark:ring-blue-800'}`}>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <div className="mt-0.5 relative">
                      <input
                        id="anonimo"
                        type="checkbox"
                        checked={form.anonimo}
                        onChange={e => setForm({ ...form, anonimo: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${form.anonimo ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700'}`}>
                        {form.anonimo && <IconCheck cls="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Enviar de forma anónima</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tu identidad no quedará registrada en el reporte.</p>
                    </div>
                  </label>

                  {!form.anonimo && (
                    <div className="mt-4 pt-4 border-t border-blue-100 dark:border-blue-800/50 space-y-1.5">
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                        <IconUser />
                        Correo institucional
                      </label>
                      <input
                        type="email"
                        value={form.autor_correo}
                        onChange={e => setForm({ ...form, autor_correo: e.target.value })}
                        required
                        placeholder="tu@universidad.cl"
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-150 shadow-md shadow-blue-200 dark:shadow-blue-900/40"
                >
                  {enviando ? (
                    <>
                      <IconSpin cls="w-4 h-4" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Enviar reporte
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          {/* ── Lista de reportes (col 3-5) ── */}
          <section className="xl:col-span-3 space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-sm ring-1 ring-gray-200 dark:ring-gray-700/60 overflow-hidden">

              {/* List header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <IconDoc cls="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      Reportes recientes
                    </h2>
                    {!cargando && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {reportes.length} {reportes.length === 1 ? 'reporte' : 'reportes'} encontrados
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => cargarReportes()}
                    disabled={cargando}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 transition px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    <IconRefresh cls={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filtrar:</span>
                  <select
                    value={filtroCat}
                    onChange={e => aplicarFiltros(e.target.value, filtroEst)}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  >
                    <option value="">Categoría: todas</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                  </select>
                  <select
                    value={filtroEst}
                    onChange={e => aplicarFiltros(filtroCat, e.target.value)}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  >
                    <option value="">Estado: todos</option>
                    {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
                  </select>
                  {(filtroCat || filtroEst) && (
                    <button
                      type="button"
                      onClick={() => aplicarFiltros('', '')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition"
                    >
                      <IconX cls="w-3 h-3" />
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {cargando ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                      <IconSpin cls="w-5 h-5 text-blue-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cargando reportes…</p>
                  </div>
                ) : reportes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <IconDoc cls="w-8 h-8 text-gray-300 dark:text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Sin reportes</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No hay reportes con los filtros seleccionados.</p>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {reportes.map(r => {
                      const siguientes = TRANSICIONES[r.estado] ?? []
                      const auditOpen = abierto === r.id
                      // Paginacion
  const totalPaginas = Math.max(1, Math.ceil(reportes.length / PAGE_SIZE))
  const reportesPagina = reportes.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  return (
                        <li
                          key={r.id}
                          className="rounded-xl ring-1 ring-gray-200 dark:ring-gray-700/60 bg-gray-50/50 dark:bg-gray-800/40 hover:ring-gray-300 dark:hover:ring-gray-600 transition-all duration-150"
                        >
                          <div className="p-4">
                            {/* Top row: badges */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <CategoriaBadge cat={r.categoria} />
                              <EstadoBadge estado={r.estado} />
                              <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 tabular-nums">
                                {fechaRelativa(r.creado_en)}
                              </span>
                            </div>

                            {/* Title */}
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{r.titulo}</h3>

                            {/* Description */}
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1 leading-relaxed">{r.descripcion}</p>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] text-gray-400 dark:text-gray-500">
                              {r.ubicacion && (
                                <span className="flex items-center gap-1">
                                  <IconPin />
                                  {r.ubicacion}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <IconUser />
                                {r.anonimo ? 'Anónimo' : 'Con autor'}
                              </span>
                              <span className="text-gray-300 dark:text-gray-600 font-mono">#{r.id.slice(0, 8)}</span>
                            </div>

                            {/* Estado actions */}
                            {siguientes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
                                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                                  Mover a:
                                </span>
                                {siguientes.map(sig => (
                                  <EstadoBtn
                                    key={sig}
                                    estado={sig}
                                    disabled={!!cambiando[r.id]}
                                    onClick={() => cambiarEstado(r.id, sig)}
                                  />
                                ))}
                                {cambiando[r.id] && <IconSpin cls="w-3.5 h-3.5 text-gray-400" />}
                              </div>
                            )}

                            {/* Auditoria toggle */}
                            <button
                              type="button"
                              onClick={() => verAuditoria(r.id)}
                              className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition group"
                            >
                              <IconShield cls="w-3.5 h-3.5 group-hover:text-blue-500 transition" />
                              {auditOpen ? 'Ocultar auditoría' : 'Ver auditoría'}
                              <IconChevron cls="w-3 h-3" open={auditOpen} />
                            </button>
                          </div>

                          {/* Auditoria panel */}
                          {auditOpen && (
                            <div className="border-t border-gray-100 dark:border-gray-700/60 bg-gray-900/5 dark:bg-gray-900/40 px-4 py-3 rounded-b-xl">
                              {!eventos[r.id] ? (
                                <div className="flex items-center gap-2 py-2">
                                  <IconSpin cls="w-3.5 h-3.5 text-gray-400" />
                                  <span className="text-xs text-gray-400">Cargando eventos…</span>
                                </div>
                              ) : eventos[r.id].length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 py-1">Sin eventos de auditoría registrados.</p>
                              ) : (
                                <div className="space-y-3">
                                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {eventos[r.id].length} evento{eventos[r.id].length !== 1 ? 's' : ''} registrado{eventos[r.id].length !== 1 ? 's' : ''}
                                  </p>
                                  {eventos[r.id].map((ev, i) => (
                                    <div key={ev.evento_id} className="rounded-lg bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 p-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Evento #{i + 1}</span>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{ev.duracion_ms} ms</span>
                                      </div>
                                      <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                                        <span className="font-semibold text-gray-500 dark:text-gray-400">Hash</span>
                                        <span className="font-mono text-gray-700 dark:text-gray-300 break-all leading-tight">{ev.hash}</span>
                                        <span className="font-semibold text-gray-500 dark:text-gray-400">IP origen</span>
                                        <span className="text-gray-700 dark:text-gray-300 font-mono">{ev.ip_origen}</span>
                                        <span className="font-semibold text-gray-500 dark:text-gray-400">Nodos</span>
                                        <span className="text-gray-700 dark:text-gray-300">
                                          <span className="font-mono">{ev.nodo_origen}</span>
                                          <span className="mx-1 text-gray-400">→</span>
                                          <span className="font-mono">{ev.nodo_auditor}</span>
                                        </span>
                                        <span className="font-semibold text-gray-500 dark:text-gray-400">Registrado</span>
                                        <span className="text-gray-700 dark:text-gray-300">{fecha(ev.registrado_en)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer ── */}
        <footer className="mt-10 text-center text-xs text-gray-400 dark:text-gray-600">
          ReportaU · Sistema universitario de reportes y quejas · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  )
}

export default App
