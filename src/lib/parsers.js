import * as XLSX from 'xlsx'

// ── LECTURA DE ARCHIVO ────────────────────────────────────

async function readFileText(file) {
  const buffer = await file.arrayBuffer()
  try { return new TextDecoder('windows-1252').decode(buffer) }
  catch { return new TextDecoder('utf-8').decode(buffer) }
}

function isRealXLSX(buffer) {
  const arr = new Uint8Array(buffer)
  return arr[0] === 0x50 && arr[1] === 0x4B
}

function parseXLSXBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false, dateNF: 'dd/mm/yyyy' })
}

function parseCSVSemicolon(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const startIdx = lines[0].toLowerCase().startsWith('sep=') ? 1 : 0
  const headers = lines[startIdx].split(';').map(h => h.trim().replace(/^["']|["']$/g, ''))
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

function parseHTMLTable(text) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return []
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length < 2) return []
  const headers = Array.from(rows[0].querySelectorAll('th, td')).map(td => td.textContent.trim())
  return rows.slice(1).filter(r => r.querySelectorAll('td').length > 0).map(row => {
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] || null })
    return obj
  })
}

export async function parseFile(file) {
  const buffer = await file.arrayBuffer()
  if (isRealXLSX(buffer)) {
    try {
      const data = parseXLSXBuffer(buffer)
      return { data, format: 'xlsx' }
    } catch(e) { console.error('Error XLSX:', e) }
  }
  const text = new TextDecoder('windows-1252').decode(buffer)
  if (text.includes('<html') || text.includes('<table')) return { data: parseHTMLTable(text), format: 'html' }
  if (text.includes(';')) return { data: parseCSVSemicolon(text), format: 'csv' }
  return { data: [], format: 'unknown' }
}

// ── NORMALIZACIÓN ─────────────────────────────────────────

export function normalizeDNI(dni) {
  if (!dni) return null
  return String(dni).replace(/\D/g, '').trim() || null
}

export function normalizePhone(phone) {
  if (!phone) return null
  let str = String(phone).trim()

  // Notación científica: 5.43816E+11 → 543816000000
  if (/^[\d.]+[eE][+\-]?\d+$/.test(str)) {
    const num = parseFloat(str)
    if (!isNaN(num)) str = Math.round(num).toString()
  }

  let digits = str.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2)
  if (digits.startsWith('9')  && digits.length > 10) digits = digits.slice(1)
  if (digits.startsWith('0'))                         digits = digits.slice(1)
  digits = digits.replace(/^(\d{3,4})15(\d{6,7})$/, '$1$2')
  const last10 = digits.slice(-10)
  return last10.length >= 8 ? last10 : null
}

// Convierte dd/mm/yyyy o dd/mm/yyyy HH:MM:SS → yyyy-mm-dd o yyyy-mm-dd HH:MM:SS
function convertDate(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().replace('T', ' ').slice(0, 19)
  const s = String(val).trim()
  // dd/mm/yyyy HH:MM:SS
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})(:\d{2})?/)
  if (m1) return m1[3] + '-' + m1[2].padStart(2, '0') + '-' + m1[1].padStart(2, '0') + ' ' + m1[4].padStart(5, '0') + ':00'
  // dd/mm/yyyy solo
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m2) return m2[3] + '-' + m2[2].padStart(2, '0') + '-' + m2[1].padStart(2, '0')
  // dd-mm-yyyy
  const m3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (m3) return m3[3] + '-' + m3[2].padStart(2, '0') + '-' + m3[1].padStart(2, '0')
  // ya en formato ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  return null
}

export function normalizeDate(val) {
  const result = convertDate(val)
  return result ? result.slice(0, 10) : null  // solo fecha yyyy-mm-dd
}

export function normalizeDatetime(val) {
  return convertDate(val)  // fecha + hora yyyy-mm-dd HH:MM:SS
}

export function extractCampaignCode(consulta) {
  if (!consulta) return null
  const text = String(consulta)
  const m1 = text.match(/\[([a-zA-Z0-9_-]{2,20})\]/)
  if (m1) return m1[1].toLowerCase()
  const m2 = text.match(/[Cc]ampa[nN][aA][:\s\[]+([a-zA-Z0-9_-]{2,20})/i)
  if (m2) return m2[1].toLowerCase()
  return null
}


// ── EXTRACCIÓN DESDE COLUMNA CONSULTA ────────────────────

// Extraer teléfono desde texto libre (WhatsApp, formularios, chats)
function extractPhoneFromConsulta(text) {
  if (!text) return null
  const t = String(text)
  // phone_number = +543816090401
  const m1 = t.match(/phone_number\s*[=:]\s*\+?([\d\s\-]{8,15})/i)
  if (m1) return normalizePhone(m1[1])
  // wa.me/541131557987
  const m2 = t.match(/wa\.me\/\+?(\d{10,13})/i)
  if (m2) return normalizePhone(m2[1])
  // +54 seguido de dígitos (internacional)
  const m3 = t.match(/\+54[\s\-]?9?[\s\-]?(\d{2,4})[\s\-]?(\d{6,8})/)
  if (m3) return normalizePhone('+54' + m3[1] + m3[2])
  // teléfono: XXXXXXXX
  const m4 = t.match(/tel[éeEÉ]fono[:\s]+\+?([\d\s\-]{8,15})/i)
  if (m4) return normalizePhone(m4[1])
  return null
}

// Extraer email desde texto libre
function extractEmailFromConsulta(text) {
  if (!text) return null
  const t = String(text)
  // email = xxx@xxx.com
  const m1 = t.match(/email\s*[=:]\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i)
  if (m1) return m1[1].toLowerCase().trim()
  // cualquier email en el texto
  const m2 = t.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/)
  if (m2) return m2[1].toLowerCase().trim()
  return null
}

// Extraer DNI desde texto libre
function extractDNIFromConsulta(text) {
  if (!text) return null
  const t = String(text)
  // dni = 40436959
  const m1 = t.match(/dni\s*[=:]\s*(\d{7,8})/i)
  if (m1) return m1[1]
  return null
}

// ── NORMALIZADORES POR TIPO DE REPORTE ───────────────────

// REPORTE LEADS POR FACILITADORES
export function normalizeFacilitadoresRow(row) {
  const tel = row['TELNUMERO'] || ''
  const telArea = row['TELCODAREA'] || ''
  const fullPhone = tel || (telArea ? telArea + tel : '')
  const codigoCampana =
    extractCampaignCode(row['Consulta']) ||
    (row['campania'] && String(row['campania']).trim() !== '0'
      ? String(row['campania']).trim().toLowerCase()
      : null)
  // Extraer datos adicionales del texto de Consulta como fallback
  const consulta    = row['Consulta'] || ''
  const telConsulta = extractPhoneFromConsulta(consulta)
  const mailConsulta = extractEmailFromConsulta(consulta)
  const dniConsulta  = extractDNIFromConsulta(consulta)

  // Prioridad: columna estructurada → extraído de Consulta
  const dniFinal   = normalizeDNI(row['DNI']) || dniConsulta
  const telFinal   = normalizePhone(fullPhone) || telConsulta
  const emailFinal = row['Email'] || mailConsulta

  return {
    nro_tramite:    row['ID'] ? String(row['ID']) : (row['JOB_SEQ'] ? String(row['JOB_SEQ']) : null),
    job_seq:        row['JOB_SEQ'] ? String(row['JOB_SEQ']) : null,
    fecha_consulta: normalizeDatetime(row['Fecha de consulta']),
    apellido:       row['Apellido'] || null,
    nombre:         row['Nombre'] || null,
    dni:            dniFinal,
    telefono:       telFinal,
    celular:        null,
    email:          emailFinal,
    origen:         'Internet',  // Facilitadores = siempre digital
    sub_origen:     row['Rubro'] || null,
    canal:          row['websiteName'] || row['entryMethod'] || row['clave_atencion'] || null,
    codigo_campana: codigoCampana,
    consulta:       consulta || null,
    website_name:   row['websiteName'] || null,
    entry_method:   row['entryMethod'] || null,
    vendedor:       row['USUARIO_DERIVO'] || null,
    marca:          null,
    estado:         null,
    fuente:        'celer',
  }
}

// REPORTE PV VINCULADAS
export function normalizePVRow(row) {
  // Ignorar filas con nombre "NO USAR"
  const nombre = String(row['NOMBRE'] || '').toUpperCase().trim()
  if (nombre.includes('NO USAR') || nombre === 'NO_USAR') return null

  // Ignorar PVs que terminan en /45 (plan ahorro externo, no relevante)
  const pv = row['PV/SOLICITUD'] || null
  if (pv && String(pv).trim().endsWith('/45')) return null

  return {
    pv_solicitud:      pv,
    fecha:             normalizeDate(row['FECHA']),
    tipo:              row['TIPO'] || null,
    nombre:            row['NOMBRE'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL'] || row['CELULAR LABORAL']),
    vendedor:          row['VENDEDOR'] || null,
    marca:             row['EMPRESA'] || null,
    proceso:           row['Proceso'] ? String(row['Proceso']).trim() : null,
    fuente:           'pv_vinculadas',
  }
}

// REPORTE DERIVADO (para pestaña Ventas)
export function normalizeDerivadoVentaRow(row) {
  const nro = row['Nro Tramite'] || null
  return {
    pv_solicitud:      nro ? 'DER-' + nro : null,
    fecha:             normalizeDate(row['Fecha de Consulta'] || row['Fecha de consulta']),
    tipo:              row['Sub Tipo de Seguimiento'] || row['Tipo de Seguimiento'] || null,
    nombre:            row['Cliente'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['Telefono']),
    celular_personal:  normalizePhone(row['Celular']),
    vendedor:          row['Vendedor'] || null,
    marca:             row['Unidad'] || null,
    fuente:           'derivado',
  }
}

// REPORTE DERIVADO (para pestaña Leads)
// Cols: Nro Tramite, Fecha de Consulta, Cliente, DNI,
//       Telefono, Celular, Email, Vendedor, Origen, Sub Origen, Campaña
export function normalizeDerivadoLeadRow(row) {
  const codigoCampana =
    extractCampaignCode(row['Campaña']) ||
    extractCampaignCode(row['Comentario Derivado'])
  return {
    nro_tramite:    row['Nro Tramite'] ? String(row['Nro Tramite']) : null,
    fecha_consulta: row['Fecha de Consulta'] || row['Fecha de consulta'] || null,
    apellido:       null,
    nombre:         row['Cliente'] || null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(row['Telefono']),
    celular:        normalizePhone(row['Celular']),
    email:          row['Email'] || null,
    origen: (() => {
      const o = String(row['Origen'] || '').trim()
      if (!o) return null
      const l = o.toLowerCase()
      if (l.includes('internet')) return 'Internet'
      if (l.includes('paso'))     return 'De paso'
      if (l.includes('llamada') || l.includes('entrante')) return 'Llamadas entrantes'
      return o
    })(),
    sub_origen:     row['Sub Origen'] || null,
    canal:          row['Metodo De Ingreso'] || row['Sistema'] || null,
    codigo_campana: codigoCampana,
    consulta:       row['Comentario Derivado'] || null,
    website_name:   null,
    entry_method:   row['Metodo De Ingreso'] || null,
    vendedor:       row['Vendedor'] || null,
    marca:          null,
    estado:         row['Estado Tramite'] || null,
    fuente:        'derivado',
  }
}

// Alias para compatibilidad con código anterior
export const normalizeK1Row = normalizePVRow
export const normalizeDerivadoRow = normalizeDerivadoVentaRow
