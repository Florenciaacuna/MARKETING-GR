import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PAGE = 50

export default function Leads() {
  const [leads,    setLeads]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [filters,  setFilters]  = useState({ marca: '', canal: '', campana: '', fuente: '', search: '' })

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('mkt_leads')
      .select('id,nro_tramite,fecha_consulta,apellido,nombre,dni,telefono,origen,canal,codigo_campana,vendedor,marca,fuente,campana_id,estado', { count: 'exact' })
      .order('fecha_consulta', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (filters.marca)   q = q.eq('marca', filters.marca)
    if (filters.canal)   q = q.ilike('canal', `%${filters.canal}%`)
    if (filters.fuente)  q = q.eq('fuente', filters.fuente)
    if (filters.campana) q = q.not('campana_id', 'is', null)
    if (filters.search)  q = q.or(`apellido.ilike.%${filters.search}%,nombre.ilike.%${filters.search}%,dni.eq.${filters.search}`)

    const { data, count } = await q
    setLeads(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const setFilter = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Leads</h1>
          <p className="text-gray-500 text-sm mt-1">{total.toLocaleString('es-AR')} registros totales</p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Buscar nombre, DNI..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-52"
          />
          {[
            { key: 'fuente', label: 'Fuente', options: ['', 'celer', 'autodealer'] },
            { key: 'marca',  label: 'Marca',  options: ['', 'KIARA', 'CIARA', 'PEARA', 'MOVILIS'] },
          ].map(f => (
            <select
              key={f.key}
              value={filters[f.key]}
              onChange={e => setFilter(f.key, e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{f.label}: Todos</option>
              {f.options.filter(Boolean).map(o => <option key={o}>{o}</option>)}
            </select>
          ))}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!filters.campana}
              onChange={e => setFilter('campana', e.target.checked ? '1' : '')}
              className="rounded"
            />
            Solo con campaña
          </label>
          <button
            onClick={() => { setFilters({ marca: '', canal: '', campana: '', fuente: '', search: '' }); setPage(0) }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ✕ Limpiar
          </button>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">DNI</th>
                <th className="text-left px-4 py-3">Canal / Origen</th>
                <th className="text-left px-4 py-3">Campaña</th>
                <th className="text-left px-4 py-3">Vendedor</th>
                <th className="text-left px-4 py-3">Marca</th>
                <th className="text-left px-4 py-3">Fuente</th>
                <th className="text-left px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center py-8 text-gray-400">Cargando...</td></tr>}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Sin resultados</td></tr>
              )}
              {leads.map(l => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap text-xs">
                    {l.fecha_consulta ? new Date(l.fecha_consulta).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="px-4 py-2 font-medium">{l.apellido} {l.nombre}</td>
                  <td className="px-4 py-2 text-gray-500 font-mono text-xs">{l.dni || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">
                    <div>{l.canal || '—'}</div>
                    <div className="text-xs text-gray-400">{l.origen}</div>
                  </td>
                  <td className="px-4 py-2">
                    {l.codigo_campana
                      ? <span className={`text-xs px-2 py-0.5 rounded-full font-mono
                          ${l.campana_id ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          [{l.codigo_campana}]
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-gray-600">{l.vendedor || '—'}</td>
                  <td className="px-4 py-2">
                    {l.marca && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{l.marca}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full
                      ${l.fuente === 'celer' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                      {l.fuente}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{l.estado || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINACIÓN */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <span className="text-xs text-gray-500">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total.toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-gray-200 rounded text-xs hover:bg-white disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE >= total}
              className="px-3 py-1 border border-gray-200 rounded text-xs hover:bg-white disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
