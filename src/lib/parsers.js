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
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
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

// ── normalizeFacilitadoresRow ─────────────────────────────────────────────────
export function normalizeFacilitadoresRow(row) {
  const pv = row['ID'] ? String(row['ID']) : null
  if (!pv) return null
  const telefono = row['TELNUMERO'] ? String(row['TELNUMERO']||'').replace(/\D/g,'') || null : null
  const codArea  = row['TELCODAREA'] ? String(row['TELCODAREA']||'').replace(/\D/g,'') : ''
  const telFull  = codArea && telefono ? codArea+telefono : telefono
  const origen = (() => {
    const ws = String(row['websiteName']||'').toLowerCase()
    if (ws.includes('mercado')) return 'Mercado Libre'
    if (ws.includes('whatsapp')||ws.includes('wpp')) return 'WhatsApp'
    return 'Internet'
  })()
  return {
    nro_tramite:    pv,
    job_seq:        row['JOB_SEQ'] ? String(row['JOB_SEQ']).trim() : null,
    fecha_consulta: String(row['Fecha de consulta']||row['FECHA_CONSULTA']||'').slice(0,10)||null,
    nombre:         row['Nombre']||row['NOMBRE']||null,
    dni:            normalizeDNI(row['DNI']),
    telefono:       normalizePhone(telFull),
    celular:        normalizePhone(telFull),
    email:          row['Email']||row['EMAIL']||null,
    origen,
    canal:          row['campania']||row['websiteName']||null,
    codigo_campana: (() => { const m=String(row['campania']||'').match(/\[([^\]]+)\]/); return m?m[1].toLowerCase():null })(),
    consulta:       row['Consulta']||row['CONSULTA']||null,
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
    const o = String(row['Origen']||row['origen']||'').toLowerCase()
    if (o.includes('paso')) return 'De paso'
    if (o.includes('llamada')||o.includes('entrante')) return 'Llamadas entrantes'
    return 'Internet'
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
    sub_origen:     row['Sub Origen']||row['SUB ORIGEN']||null,
    canal:          row['Origen']||row['origen']||null,
    codigo_campana: (() => { const m=String(row['Campaña']||row['CAMPAÑA']||row['campana']||'').match(/\[([^\]]+)\]/); return m?m[1].toLowerCase():null })(),
    vendedor:       row['Vendedor']||row['VENDEDOR']||null,
    fuente:         'derivado',
    estado:         'nuevo',
  }
}

// ── normalizePVRow ────────────────────────────────────────────────────────────
export function normalizePVRow(row) {
  const pv = String(row['PV/SOLICITUD']||row['PV SOLICITUD']||'').trim()
  if (!pv) return null
  if (pv.includes('/45')) return null
  if (pv.toUpperCase().includes('NO USAR')) return null
  const nombre = String(row['NOMBRE']||'').trim()
  if (nombre.toUpperCase().includes('NO USAR')) return null
  return {
    pv_solicitud:      pv,
    fecha:             normalizeDate(row['FECHA']),
    tipo:              row['TIPO']||null,
    nombre:            nombre||null,
    dni:               normalizeDNI(row['DNI']||row['CUIL CUIT']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL']||row['TELEFONO LABORAL']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL']||row['CELULAR LABORAL']),
    vendedor:          row['VENDEDOR']||null,
    marca:             row['EMPRESA']||row['Marca']||row['MARCA']||null,
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
