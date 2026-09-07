import * as XLSX from 'xlsx'

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

export function normalizeDNI(dni) {
  if (!dni) return null
  return String(dni).replace(/\D/g, '').trim() || null
}

export function normalizePhone(phone) {
  if (!phone) return null
  let digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length > 10) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.replace(/^(\d{3,4})15(\d{6,7})$/, '$1$2')
  const last10 = digits.slice(-10)
  return last10.length >= 8 ? last10 : null
}

export function normalizeDate(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m1) return m1[3] + '-' + m1[2].padStart(2,'0') + '-' + m1[1].padStart(2,'0')
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (m2) return m2[3] + '-' + m2[2].padStart(2,'0') + '-' + m2[1].padStart(2,'0')
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  return null
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

// REPORTE LEADS POR FACILITADORES
// Cols: Fecha de consulta, ID, Apellido, Nombre, Email,
//       TELCODAREA, TELNUMERO, Consulta, USUARIO_DERIVO,
//       JOB_SEQ, DNI, campania, websiteName, entryMethod, Empresa
export function normalizeFacilitadoresRow(row) {
  const tel = row['TELNUMERO'] || ''
  const telArea = row['TELCODAREA'] || ''
  const fullPhone = tel || (telArea ? telArea + tel : '')
  const codigoCampana =
    extractCampaignCode(row['Consulta']) ||
    (row['campania'] && String(row['campania']).trim() !== '0'
      ? String(row['campania']).trim().toLowerCase()
      : null)
  return {
    nro_tramite:    row['ID'] || row['JOB_SEQ'] || null,
    fecha_consulta: row['Fecha de consulta'] || null,
    apellido:       row['Apellido'] || null,
    nombre:         row['Nombre'] || null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(fullPhone),
    celular:        null,
    email:          row['Email'] || null,
    origen:         row['Empresa'] || null,
    sub_origen:     row['Rubro'] || null,
    canal:          row['websiteName'] || row['entryMethod'] || row['clave_atencion'] || null,
    codigo_campana: codigoCampana,
    consulta:       row['Consulta'] || null,
    website_name:   row['websiteName'] || null,
    entry_method:   row['entryMethod'] || null,
    vendedor:       row['USUARIO_DERIVO'] || null,
    marca:          null,
    estado:         null,
    fuente:        'celer',
  }
}

// REPORTE PV VINCULADAS
// Cols: HISTORIAL, EMPRESA, PV/SOLICITUD, FECHA, TIPO, NOMBRE,
//       CELULAR PERSONAL, TELEFONO PERSONAL, DNI, VENDEDOR, UNIDAD
export function normalizePVRow(row) {
  return {
    pv_solicitud:      row['PV/SOLICITUD'] || null,
    fecha:             normalizeDate(row['FECHA']),
    tipo:              row['TIPO'] || null,
    nombre:            row['NOMBRE'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL'] || row['CELULAR LABORAL']),
    vendedor:          row['VENDEDOR'] || null,
    marca:             row['EMPRESA'] || null,
    fuente:           'pv_vinculadas',
  }
}

// REPORTE DERIVADO (para pestaña Ventas)
// Cols: Nro Tramite, Fecha de Consulta, Cliente, DNI,
//       Telefono, Celular, Vendedor, Unidad, Sub Tipo de Seguimiento
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
