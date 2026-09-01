// =============================================
// PARSERS — Grupo Randazzo Marketing Dashboard
// Maneja: XLSX real, CSV con punto y coma, HTML
// =============================================
import * as XLSX from 'xlsx'

/** Leer archivo como texto con encoding Windows-1252 */
async function readFileText(file) {
  const buffer = await file.arrayBuffer()
  try { return new TextDecoder('windows-1252').decode(buffer) }
  catch { return new TextDecoder('utf-8').decode(buffer) }
}

/** Detectar si es un archivo XLSX real (firma ZIP: PK) */
function isRealXLSX(buffer) {
  const arr = new Uint8Array(buffer)
  return arr[0] === 0x50 && arr[1] === 0x4B
}

/** Parsear XLSX real con SheetJS */
function parseXLSXBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,          // Fechas como strings
    dateNF: 'dd/mm/yyyy'
  })
  return data
}

/** Parsear CSV con separador punto y coma (formato Celer) */
function parseCSVSemicolon(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const startIdx = lines[0].toLowerCase().startsWith('sep=') ? 1 : 0
  const headers  = lines[startIdx].split(';').map(h => h.trim().replace(/^["']|["']$/g, ''))
  return lines.slice(startIdx + 1).filter(l => l.trim()).map(line => {
    const values = line.split(';')
    const obj = {}
    headers.forEach((h, i) => {
      const val = (values[i] || '').trim().replace(/^["']|["']$/g, '')
      obj[h] = val === '' || val === 'nan' ? null : val
    })
    return obj
  })
}

/** Parsear tabla HTML (Darwin, Chery, etc.) */
function parseHTMLTable(text) {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(text, 'text/html')
  const table  = doc.querySelector('table')
  if (!table) return []
  const rows   = Array.from(table.querySelectorAll('tr'))
  if (rows.length < 2) return []
  const headers = Array.from(rows[0].querySelectorAll('th, td')).map(td => td.textContent.trim())
  return rows.slice(1).filter(row => row.querySelectorAll('td').length > 0).map(row => {
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] || null })
    return obj
  })
}

/** AUTO-DETECTAR FORMATO Y PARSEAR */
export async function parseFile(file) {
  const buffer = await file.arrayBuffer()

  // 1. XLSX real (firma ZIP PK)
  if (isRealXLSX(buffer)) {
    try {
      const data = parseXLSXBuffer(buffer)
      console.log(`XLSX: ${data.length} filas, columnas:`, Object.keys(data[0] || {}))
      return { data, format: 'xlsx' }
    } catch(e) {
      console.error('Error leyendo XLSX:', e)
    }
  }

  // 2. HTML o CSV (texto)
  const text = new TextDecoder('windows-1252').decode(buffer)
  if (text.includes('<html') || text.includes('<table')) {
    return { data: parseHTMLTable(text), format: 'html' }
  }
  if (text.includes(';')) {
    return { data: parseCSVSemicolon(text), format: 'csv' }
  }

  return { data: [], format: 'unknown' }
}

// =============================================
// NORMALIZACIÓN
// =============================================

export function normalizeDNI(dni) {
  if (!dni) return null
  const clean = String(dni).replace(/\D/g, '').trim()
  return clean || null
}

export function normalizePhone(phone) {
  if (!phone) return null
  let digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.replace(/^(\d{3,4})15(\d{6,7})$/, '$1$2')
  const last10 = digits.slice(-10)
  return last10.length >= 8 ? last10 : null
}

export function extractCampaignCode(consulta) {
  if (!consulta) return null
  const text = String(consulta)
  const bracketMatch = text.match(/\[([a-zA-Z0-9_-]{2,20})\]/)
  if (bracketMatch) return bracketMatch[1].toLowerCase()
  const campMatch = text.match(/[Cc]ampa[ñn]a[:\s\[]+([a-zA-Z0-9_-]{2,20})/i)
  if (campMatch) return campMatch[1].toLowerCase()
  return null
}

// =============================================
// NORMALIZACIÓN POR TIPO DE ARCHIVO
// =============================================

export function normalizeFacilitadoresRow(row) {
  const telArea = row['TELCODAREA'] || ''
  const telNum  = row['TELNUMERO'] || ''
  const telCombined = telArea && telNum ? `${telArea}${telNum}` : (telNum || telArea)
  return {
    nro_tramite:    row['ID'] || row['JOB_SEQ'] || null,
    fecha_consulta: row['Fecha de consulta'] || row['FECHA CONSULTARON'] || null,
    apellido:       row['Apellido'] || null,
    nombre:         row['Nombre'] || null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(telCombined),
    celular:        null,
    email:          row['Email'] || row['MAIL'] || null,
    origen:         row['Origen'] || row['Empresa'] || null,
    sub_origen:     row['Rubro'] || null,
    canal:          row['websiteName'] || row['entryMethod'] || row['clave_atencion'] || null,
    codigo_campana: extractCampaignCode(row['Consulta'] || row['campania']),
    consulta:       row['Consulta'] || null,
    website_name:   row['websiteName'] || null,
    entry_method:   row['entryMethod'] || null,
    vendedor:       row['USUARIO_DERIVO'] || null,
    marca:          null,
    estado:         null,
    fuente:        'celer',
  }
}

export function normalizeDerivadoRow(row, fuente = 'celer') {
  return {
    nro_tramite:    row['Nro Tramite'] || row['#TRAMITE'] || null,
    fecha_consulta: row['Fecha de Consulta'] || row['FECHA CONSULTARON'] || null,
    apellido:       row['Cliente'] ? row['Cliente'].split(',')[0] : (row['APELLIDO'] || null),
    nombre:         row['NOMBRE'] || null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(row['Telefono'] || row['TELNUMERO']),
    celular:        normalizePhone(row['Celular']),
    email:          row['Email'] || row['MAIL'] || null,
    origen:         row['Origen'] || null,
    sub_origen:     row['Sub Origen'] || null,
    canal:          row['CANAL'] || row['Campaña Web'] || null,
    codigo_campana: extractCampaignCode(row['Campaña'] || row['CAMPAÑA']),
    consulta:       row['Comentario Derivado'] || null,
    website_name:   null,
    entry_method:   row['Metodo De Ingreso'] || null,
    vendedor:       row['Vendedor'] || row['USUARIO DERIVO'] || null,
    marca:          row['Unidad'] || null,
    estado:         row['Estado Tramite'] || null,
    fuente,
  }
}

export function normalizeK1Row(row) {
  return {
    pv_solicitud:      row['PV/SOLICITUD'] || null,
    fecha:             row['FECHA'] || row['Fecha'] || null,
    tipo:              row['TIPO'] || null,
    nombre:            row['NOMBRE'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL']),
    vendedor:          row['VENDEDOR'] || null,
    marca:             row['Marca'] || row['MARCA'] || null,
    fuente:           'k1',
  }
}

export function normalizePVRow(row) {
  return {
    pv_solicitud:      row['PV/SOLICITUD'] || null,
    fecha:             row['FECHA'] || null,
    tipo:              row['TIPO'] || null,
    nombre:            row['NOMBRE'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL']),
    vendedor:          row['VENDEDOR'] || null,
    marca:             row['UNIDAD'] || null,
    fuente:           'autodealer',
  }
}

export function detectFileType(filename) {
  const name = filename.toLowerCase()
  if (name.includes('facilitad'))  return 'facilitadores'
  if (name.includes('derivad') && name.includes('autodealer')) return 'derivado_autodealer'
  if (name.includes('derivad'))    return 'derivado_celer'
  if (name.includes('vinculad'))   return 'pv_autodealer'
  if (name.includes('k1') || name.includes('venta')) return 'k1'
  return 'desconocido'
}
