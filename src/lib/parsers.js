// =============================================
// PARSERS — Grupo Randazzo Marketing Dashboard
// Maneja: CSV con punto y coma (Celer/Autodealer)
//         Tablas HTML (Darwin, Chery, etc.)
// =============================================

/** Leer archivo como texto con encoding Windows-1252 (para archivos argentinos) */
async function readFileText(file) {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('windows-1252').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/** Parsear CSV con separador punto y coma (formato Celer) */
function parseCSVSemicolon(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  // Saltar la línea "sep=;" si existe
  const startIdx = lines[0].toLowerCase().startsWith('sep=') ? 1 : 0

  // Encabezados
  const rawHeaders = lines[startIdx].split(';')
  const headers = rawHeaders.map(h => h.trim().replace(/^["']|["']$/g, ''))

  // Filas de datos
  const data = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const values = line.split(';')
    const obj = {}
    headers.forEach((h, idx) => {
      const val = (values[idx] || '').trim().replace(/^["']|["']$/g, '')
      obj[h] = val === '' || val === 'nan' || val === 'NaN' ? null : val
    })
    data.push(obj)
  }
  return data
}

/** Parsear tabla HTML (formato Darwin, Chery, CompramosTuAuto) */
function parseHTMLTable(text) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return []

  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length < 2) return []

  // Primera fila = encabezados
  const headers = Array.from(rows[0].querySelectorAll('th, td'))
    .map(td => td.textContent.trim())

  // Resto = datos
  return rows.slice(1)
    .filter(row => row.querySelectorAll('td').length > 0)
    .map(row => {
      const cells = Array.from(row.querySelectorAll('td'))
        .map(td => td.textContent.trim())
      const obj = {}
      headers.forEach((h, i) => {
        const val = cells[i] || ''
        obj[h] = val === '' ? null : val
      })
      return obj
    })
}

/** Detectar formato y parsear automáticamente */
export async function parseFile(file) {
  const text = await readFileText(file)

  if (
    text.trimStart().startsWith('<html') ||
    text.trimStart().startsWith('<HTML') ||
    text.includes('<table') ||
    text.includes('<TABLE')
  ) {
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
  // Sacar código de país +54
  if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2)
  // Sacar 0 inicial
  if (digits.startsWith('0')) digits = digits.slice(1)
  // Sacar prefijo móvil 15 (221-15-XXXXXX → 221XXXXXX)
  digits = digits.replace(/^(\d{3,4})15(\d{6,7})$/, '$1$2')
  // Tomar últimos 10 dígitos
  const last10 = digits.slice(-10)
  return last10.length >= 8 ? last10 : null
}

/** Extraer código de campaña del texto de la consulta */
export function extractCampaignCode(consulta) {
  if (!consulta) return null
  const text = String(consulta)

  // Patrón [código]
  const bracketMatch = text.match(/\[([a-zA-Z0-9_-]{2,20})\]/)
  if (bracketMatch) return bracketMatch[1].toLowerCase()

  // Patrón "Campaña: código" o "Campaña [código]"
  const campMatch = text.match(/[Cc]ampa[ñn]a[:\s\[]+([a-zA-Z0-9_-]{2,20})/i)
  if (campMatch) return campMatch[1].toLowerCase()

  return null
}

// =============================================
// NORMALIZACIÓN POR TIPO DE ARCHIVO
// =============================================

/** Reporte Leads por Facilitadores (Celer) */
export function normalizeFacilitadoresRow(row) {
  const telArea = row['TELCODAREA'] || ''
  const telNum  = row['TELNUMERO'] || ''
  const telCombined = telArea && telNum ? `${telArea}${telNum}` : (telNum || telArea)

  return {
    nro_tramite:    row['ID'] || row['JOB_SEQ'] || null,
    fecha_consulta: row['Fecha de consulta'] || row['Fecha'] || null,
    apellido:       row['Apellido'] || null,
    nombre:         row['Nombre'] || null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(telCombined),
    celular:        null,
    email:          row['Email'] || null,
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

/** Reporte Derivado (Celer y Autodealer) */
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

/** Ventas K1 */
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

/** PV Vinculadas Autodealer */
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

// =============================================
// DETECTAR TIPO DE ARCHIVO POR NOMBRE Y CONTENIDO
// =============================================
export function detectFileType(filename, headers) {
  const name = filename.toLowerCase()

  if (name.includes('facilitad')) return 'facilitadores'
  if (name.includes('derivad') && name.includes('autodealer')) return 'derivado_autodealer'
  if (name.includes('derivad')) return 'derivado_celer'
  if (name.includes('pv_vinculad') || name.includes('vinculad')) return 'pv_autodealer'
  if (name.includes('k1') || name.includes('venta')) return 'k1'

  // Detección por columnas
  const h = headers.map(x => (x || '').toLowerCase())
  if (h.includes('fecha de consulta') && h.includes('consulta')) return 'facilitadores'
  if (h.includes('nro tramite') && h.includes('vendedor')) return 'derivado_celer'
  if (h.includes('pv/solicitud') && h.includes('celular personal')) return 'k1'
  if (h.includes('#tramite') && h.includes('canal')) return 'canal'

  return 'desconocido'
}
