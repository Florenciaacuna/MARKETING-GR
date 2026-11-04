import * as XLSX from 'xlsx'

// ── parseFile ────────────────────────────────────────────────────────────────
export async function parseFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type:'binary', raw:true, cellDates:true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval:'' })
        res(data)
      } catch(err) { rej(err) }
    }
    r.onerror = () => rej(new Error('Error leyendo archivo'))
    r.readAsBinaryString(file)
  })
}

// ── normalizeDate ─────────────────────────────────────────────────────────────
function normalizeDate(val) {
  if (!val) return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    return val.getFullYear() + '-' +
      String(val.getMonth()+1).padStart(2,'0') + '-' +
      String(val.getDate()).padStart(2,'0')
  }
  const s = String(val).trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const garbled = s.match(/(\d{4}).*?(\d{2})-(\d{2})$/)
  if (garbled) return `${garbled[1]}-${garbled[2]}-${garbled[3]}`
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T].*)?$/)
  if (slash) {
    const [, d, m, y] = slash
    return `${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  try { const d=new Date(s); if(!isNaN(d.getTime())) return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') } catch(e){}
  return null
}

function normalizePhone(val) {
  if (!val) return null
  const p = String(val).replace(/[^0-9]/g,'')
  if (p.length < 8 || p === '00000000' || p === '0000000000') return null
  return p
}

function normalizeDNI(val) {
  if (!val) return null
  const d = String(val).replace(/\D/g,'').replace(/\.0$/, '')
  if (d.length < 7 || d.length > 9) return null
  return d
}

// ── helpers ───────────────────────────────────────────────────────────────────
function cleanUrl(val) {
  const s = String(val||'').trim()
  if (!s || s === '0') return null
  if (/^https?:\/\//i.test(s)) return s
  if (/^www\./i.test(s)) return 'https://' + s
  return s
}
const clean = v => { const s = String(v==null?'':v).trim(); return s && s !== '0' ? s : null }

// ── normalizeFacilitadoresRow ─────────────────────────────────────────────────
// Columnas Celer: E Apellido, F Nombre, G Email, H TELCODAREA, I TELNUMERO,
// J Consulta, Q DNI, AB url (link al anuncio / página de origen)
export function normalizeFacilitadoresRow(row) {
  const pv = row['ID'] ? String(row['ID']) : null
  if (!pv) return null
  const num  = String(row['TELNUMERO']||'').replace(/\D/g,'')
  const area = String(row['TELCODAREA']||'').replace(/\D/g,'')
  // TELNUMERO a veces ya viene completo (+54...) → no anteponer el código de área
  const telFull = !num ? null : (num.length >= 10 || !area ? num : area + num)
  const origen = (() => {
    const ws = String(row['websiteName']||'').toLowerCase()
    if (ws.includes('mercado')) return 'Mercado Libre'
    if (ws.includes('whatsapp')||ws.includes('wpp')) return 'WhatsApp'
    return 'Internet'
  })()
  const nombre   = clean(row['Nombre']||row['NOMBRE'])
  let   apellido = clean(row['Apellido']||row['APELLIDO'])
  if (apellido && nombre && apellido.toLowerCase() === nombre.toLowerCase()) apellido = null // Celer repite el nombre completo
  const consulta = clean(row['Consulta']||row['CONSULTA'])
  const subOrigen = /darwin/i.test(consulta||'') ? 'Darwin' : clean(row['Origen'])
  return {
    nro_tramite:    pv,
    job_seq:        row['JOB_SEQ'] ? String(row['JOB_SEQ']).trim() : null,
    fecha_consulta: normalizeDate(row['Fecha de consulta']||row['FECHA_CONSULTA']),
    apellido,
    nombre,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(telFull),
    celular:        normalizePhone(telFull),
    email:          clean(row['Email']||row['EMAIL']),
    origen,
    sub_origen:     subOrigen,
    canal:          row['campania']||row['websiteName']||null,
    codigo_campana: (() => { const m=String(row['campania']||'').match(/\[([^\]]+)\]/); return m?m[1].toLowerCase():null })(),
    consulta,
    link_anuncio:   cleanUrl(row['url']||row['URL']||row['Url']),
    vendedor:       row['USUARIO_DERIVO']||null,
    fuente:         'celer',
    estado:         'nuevo',
  }
}

// ── normalizeDerivadoLeadRow ──────────────────────────────────────────────────
export function normalizeDerivadoLeadRow(row) {
  const pv = row['Nro Tramite']||row['NRO TRAMITE']||row['nro_tramite']
  if (!pv) return null
  const nombre = row['Cliente']||row['CLIENTE']||row['Nombre']||''
  if (String(nombre).toUpperCase().includes('NO USAR')) return null
  const origen = (() => {
    const raw = String(row['Origen']||row['ORIGEN']||row['origen']||'').trim()
    if (!raw) return null
    const o = raw.toLowerCase()
    if (o === 'de paso' || o.includes('paso')) return 'De paso'
    if (o === 'llamadas entrantes' || o === 'llamada entrante') return 'Llamadas entrantes'
    if (o === 'entrante') return 'Entrante'
    if (o === 'internet') return 'Internet'
    if (o.includes('whatsapp') || o.includes('wpp')) return 'WhatsApp'
    if (o.includes('mercado')) return 'Mercado Libre'
    if (o === 'cita vendedor' || o.startsWith('cita')) return 'Cita Vendedor'
    if (o === 'compra') return 'Compra'
    if (o === 'saliente') return 'Saliente'
    // Capitalize first letter of each word for any other value
    return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  })()
  return {
    nro_tramite:    String(pv),
    fecha_consulta: normalizeDate(row['Fecha de Consulta']||row['FECHA DE CONSULTA']),
    nombre:         nombre||null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(row['Telefono']||row['TELEFONO']),
    celular:        normalizePhone(row['Celular']||row['CELULAR']),
    email:          row['Email']||row['EMAIL']||null,
    origen,
    sub_origen:     clean(row['Sub Origen']||row['SUB ORIGEN']),
    campana_web:    clean(row['Campaña Web']||row['CAMPAÑA WEB']||row['Campana Web']),
    canal:          row['Origen']||row['origen']||null,
    codigo_campana: (() => { const m=String(row['Campaña']||row['CAMPAÑA']||row['campana']||'').match(/\[([^\]]+)\]/); return m?m[1].toLowerCase():null })(),
    vendedor:       row['Vendedor']||row['VENDEDOR']||null,
    fuente:         'derivado',
    estado:         'nuevo',
  }
}

// ── normalizePVRow ────────────────────────────────────────────────────────────
// Soporta múltiples formatos del reporte Celer
export function normalizePVRow(row) {
  // PV: puede llamarse PV, PV/SOLICITUD, PV SOLICITUD o PV/SOL
  const pv = String(
    row['PV'] || row['PV/SOLICITUD'] || row['PV SOLICITUD'] ||
    row['PV/SOL'] || row['SOLICITUD'] || ''
  ).trim()
  if (!pv) return null
  if (pv.toUpperCase().includes('NO USAR')) return null

  // CLIENTE puede llamarse CLIENTE, NOMBRE o RAZON SOCIAL
  const nombre = String(
    row['CLIENTE'] || row['NOMBRE'] || row['RAZON SOCIAL'] || ''
  ).trim()
  if (nombre.toUpperCase().includes('NO USAR')) return null

  // ASESOR puede llamarse ASESOR o VENDEDOR
  const vendedor = row['ASESOR'] || row['VENDEDOR'] || null

  // MARCA puede venir de EMPRESA, SISTEMA o MARCA
  const marca = row['EMPRESA'] || row['SISTEMA'] || row['Marca'] || row['MARCA'] || null

  // Teléfonos: múltiples columnas posibles
  const tel = normalizePhone(
    row['TEL'] || row['TELEFONO PERSONAL'] || row['TELEFONO LABORAL'] || row['TEL 1'] || ''
  )
  const cel = normalizePhone(
    row['CELULAR'] || row['CELULAR PERSONAL'] || row['CELULAR LABORAL'] || row['TEL 2'] || ''
  )

  return {
    pv_solicitud:      pv,
    fecha:             normalizeDate(row['FECHA']),
    tipo:              row['TIPO'] || null,
    nombre:            nombre || null,
    dni:               normalizeDNI(row['DNI'] || row['CUIL'] || row['CUIL CUIT'] || ''),
    cuil_cuit:         clean(row['CUIL CUIT'] || row['CUIL']),
    email:             clean(row['EMAIL'] || row['Email']),
    nombre_conyuge:    clean(row['NombreConyuge'] || row['NOMBRECONYUGE'] || row['NOMBRE CONYUGE']),
    telefono_personal: tel,
    celular_personal:  cel,
    vendedor:          vendedor || null,
    marca:             marca || null,
    proceso:           row['Proceso'] ? String(row['Proceso']).trim() : null,
    fuente:            'pv_vinculadas',
  }
}

// ── normalizeEntregaRow ───────────────────────────────────────────────────────
export function normalizeEntregaRow(row) {
  const preventa = String(row['PV/SOLICITUD']||row['PREVENTA']||row['preventa']||'').trim()
  if (!preventa) return null
  const tipo = String(row['TIPO']||row['tipo_preventa']||'').trim()
  if (tipo.toUpperCase().includes('VENTA ESPECIAL')) return null
  return {
    preventa,
    fecha_entrega: normalizeDate(row['FECHA']||row['FECHA ENTREGA']||row['fecha_entrega']),
    sistema:       row['SISTEMA']||row['sistema']||null,
    tipo_preventa: tipo||null,
    vendedor:      row['VENDEDOR']||row['vendedor']||null,
    salon:         row['SALON']||row['salon']||row['EMPRESA']||null,
  }
}
