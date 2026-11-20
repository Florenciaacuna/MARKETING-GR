import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { detectarReporte, leadDesdeCeler, leadDesdeDerivado, preventaDesdePV, leerDerivadoTexto } from './normalizar'

export const TIPOS = {
  celer:     { nombre: 'Celer · Leads por Facilitadores', tabla: 'leads',     conflicto: 'fuente,id_externo', convertir: leadDesdeCeler,     clave: x => x.fuente + '|' + x.id_externo },
  derivado:  { nombre: 'Derivado · Autodealer',           tabla: 'leads',     conflicto: 'fuente,id_externo', convertir: leadDesdeDerivado,  clave: x => x.fuente + '|' + x.id_externo },
  preventas: { nombre: 'Preventas · PV Vinculadas',       tabla: 'preventas', conflicto: 'marca,pv',          convertir: preventaDesdePV,    clave: x => x.marca + '|' + x.pv },
}

// Lee un archivo (Excel o texto con ";" que se llama .xls) y devuelve sus filas
export async function leerArchivo(file) {
  const buf = await file.arrayBuffer()
  const b = new Uint8Array(buf.slice(0, 4))
  const esExcel = (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf)
  if (esExcel) {
    const wb = XLSX.read(buf, { cellDates: true })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true })
  }
  let texto = new TextDecoder('utf-8').decode(buf)
  if (texto.includes('�')) texto = new TextDecoder('latin1').decode(buf)
  if (texto.split(/\r?\n/, 3).some(l => l.includes(';'))) return leerDerivadoTexto(texto)
  const wb = XLSX.read(texto, { type: 'string', cellDates: true })   // CSV común
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true })
}

// Analiza el archivo: qué reporte es y cuántos registros válidos trae
export async function analizar(file) {
  const filas = await leerArchivo(file)
  const tipo = detectarReporte(filas[0])
  if (!tipo) return { file, tipo: null, filas: filas.length, registros: [], error: 'No reconozco las columnas de este archivo' }
  const t = TIPOS[tipo]
  const mapa = new Map()
  for (const f of filas) { const r = t.convertir(f); if (r) mapa.set(t.clave(r), r) }
  const registros = [...mapa.values()]
  const fechas = registros.map(r => r.fecha).filter(Boolean).sort()
  return { file, tipo, filas: filas.length, registros, desde: fechas[0]?.slice(0, 10), hasta: fechas[fechas.length - 1]?.slice(0, 10) }
}

// Guarda de a lotes (si el registro ya existía, se actualiza)
export async function guardar(analisis, avance) {
  const t = TIPOS[analisis.tipo]
  const lote = 400
  for (let i = 0; i < analisis.registros.length; i += lote) {
    const { error } = await supabase.from(t.tabla).upsert(analisis.registros.slice(i, i + lote), { onConflict: t.conflicto })
    if (error) throw new Error(error.message)
    avance?.(Math.min(i + lote, analisis.registros.length), analisis.registros.length)
  }
}

export async function correrCruce() {
  const { data, error } = await supabase.rpc('ejecutar_cruce')
  if (error) throw new Error(error.message)
  return data
}

export async function totales() {
  const c = async (tabla, f) => {
    let q = supabase.from(tabla).select('*', { count: 'exact', head: true })
    if (f) q = f(q)
    const { count } = await q
    return count ?? 0
  }
  const [celer, derivado, preventas] = await Promise.all([
    c('leads', q => q.eq('fuente', 'celer')), c('leads', q => q.eq('fuente', 'derivado')), c('preventas'),
  ])
  return { celer, derivado, preventas }
}
