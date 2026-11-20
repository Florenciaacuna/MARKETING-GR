// =============================================================
// NORMALIZAR — convierte cada fila de los reportes en un registro limpio
// Una sola versión de las reglas, usada por la carga de archivos.
// =============================================================

const soloDigitos = v => (v == null ? '' : String(v).replace(/\.0+$/, '').replace(/\D/g, ''))

// Valores basura: todos iguales, o 6+ dígitos repetidos seguidos (1111111111, 0000000)
const esBasura = d => !d || new Set(d).size <= 2 || /(\d)\1{5,}/.test(d)

// ── Teléfono ────────────────────────────────────────────────
// Devuelve 10 dígitos (característica + número) cuando se puede, o 7-9 si vino sin característica.
// Quita: 00 internacional, 54 país, 9 móvil, 0 troncal, 15 de celular.
export function normTel(v) {
  let d = soloDigitos(v)
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2)
  if (d.startsWith('9') && d.length === 11) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 12) {
    for (const a of [2, 3, 4]) {
      if (d.slice(a, a + 2) === '15') { d = d.slice(0, a) + d.slice(a + 2); break }
    }
  }
  if (d.length === 9 && d.startsWith('15')) d = d.slice(2)
  if (d.length > 10) d = d.slice(-10)
  if (d.length < 7 || esBasura(d)) return null
  return d
}

// ── DNI / CUIL / CUIT ───────────────────────────────────────
// CUIL de persona (20/23/24/27-XXXXXXXX-X) → los 8 del medio son el DNI.
// CUIT de empresa (30/33/34) → no es DNI.
export function normDni(v) {
  let d = soloDigitos(v)
  if (d.length === 11) {
    if (['20', '23', '24', '27'].includes(d.slice(0, 2))) d = d.slice(2, 10)
    else return null
  }
  d = d.replace(/^0+/, '')
  if (d.length < 6 || d.length > 8 || esBasura(d)) return null
  return d
}
export const esCuitEmpresa = v => ['30', '33', '34'].includes(soloDigitos(v).slice(0, 2)) && soloDigitos(v).length === 11

// ── Email ───────────────────────────────────────────────────
const MAIL_BASURA = /posee|nopos|notiene|no_?tiene|sin_?mail|nomail|^nn@|^no@|^x+@|ejemplo|^correo@|mail@mail|^-/
export function normEmail(v) {
  if (v == null) return null
  const m = String(v).trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!m.includes('@') || MAIL_BASURA.test(m)) return null
  return m
}

// ── Nombre ──────────────────────────────────────────────────
// Palabras de 3+ letras, sin acentos, en mayúscula, sin repetir y ordenadas.
// "ROBERTO MORBELLI ROBERTO MORBELLI" y "Morbelli, Roberto" dan lo mismo: [MORBELLI, ROBERTO]
const NO_NOMBRE = new Set(['SRL', 'SAS', 'SOCIEDAD', 'ANONIMA', 'DEL', 'LOS', 'LAS'])
export function tokensNombre(v) {
  if (!v) return []
  const s = String(v).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
  return [...new Set(s.match(/[A-Z]{3,}/g) || [])].filter(t => !NO_NOMBRE.has(t)).sort()
}

// Apellido: en la preventa viene "APELLIDO, Nombre". Sin coma, se toma la primera palabra.
export function tokensApellido(v) {
  if (!v) return []
  const s = String(v)
  if (s.includes(',')) return tokensNombre(s.split(',')[0])
  return tokensNombre(s.trim().split(/\s+/)[0])
}

// Email "base" para detectar errores de tipeo: corrige dominios mal escritos
// y en Gmail ignora puntos y lo que va después de "+".
const DOMINIOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com',
  'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hormail.com': 'hotmail.com', 'yahoo.com.ar.': 'yahoo.com.ar',
  'yaho.com.ar': 'yahoo.com.ar', 'yahoo.con.ar': 'yahoo.com.ar', 'outlok.com': 'outlook.com' }
export function emailBase(m) {
  if (!m) return null
  let [local, dom] = m.split('@')
  if (!local || !dom) return null
  dom = DOMINIOS[dom] || dom
  if (dom === 'gmail.com') local = local.split('+')[0].replace(/\./g, '')
  return `${local}@${dom}`
}

// ── Fecha ───────────────────────────────────────────────────
// Acepta objetos Date (Excel) o textos "2026-07-31 18:27:58" / "31/07/2026".
export function normFecha(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString()
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}-03:00`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '0').padStart(2, '0')}:${m[5] || '00'}:00-03:00`
  }
  return null
}
const soloDia = iso => (iso ? iso.slice(0, 10) : null)

// ── Datos escondidos en el texto de la consulta ─────────────
const RE_DNI   = /dni[^=:\d]{0,15}[=:]\s*([\d.]{7,11})/gi
const RE_TEL   = /(?:whats ?app|tel[eé]fono|phone_number|n[uú]mero_de_tel[eé]fono|n[uú]mero_de_whatsapp|celular)[^\d+]{0,25}(\+?[\d\s-]{8,18})/gi
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const RE_CAMP  = /\[([a-z0-9]{1,4})\]/i
const RE_LINK_ANUNCIO = /https?:\/\/(?:www\.)?(?:instagram\.com\/p\/[\w-]+|fb\.me\/[\w-]+|facebook\.com\/[\w./?=-]+|auto\.mercadolibre\.com\.ar\/MLA-\d+)/i
// Frase del resumen de Darwin que describe el anuncio u oferta
function fraseAnuncio(txt) {
  const m = txt.match(/[^.\n]*\b(anuncio|publicaci[oó]n|promoci[oó]n|oferta)\b[^.\n]*/i)
  return m ? m[0].replace(/^\s*(Resumen:)?[\s\-:]*/i, '').slice(0, 200) : null
}
const todos = (re, txt) => [...txt.matchAll(re)].map(m => m[1] ?? m[0])

const limpiarLista = arr => [...new Set(arr.filter(Boolean))]
const ultimos8 = tels => limpiarLista(tels.filter(t => t.length >= 8).map(t => t.slice(-8)))
const ultimos7 = tels => limpiarLista(tels.filter(t => t.length >= 7).map(t => t.slice(-7)))
const clave = tokens => (tokens.length >= 2 ? tokens.join(' ') : null)
const txt = v => (v == null || String(v).trim() === '' || String(v).trim() === '0' ? null : String(v).trim())

// ── Reporte "Leads por Facilitadores" (Celer) ───────────────
export function leadDesdeCeler(r) {
  const id = txt(r['ID'])
  if (!id) return null
  const consulta = txt(r['Consulta']) || ''
  const num = soloDigitos(r['TELNUMERO']), area = soloDigitos(r['TELCODAREA'])
  const telBase = num.length >= 10 || !area ? num : area + num
  const tels = limpiarLista([normTel(telBase), ...todos(RE_TEL, consulta).map(normTel)])
  const nombre = txt(r['Nombre']) || txt(r['Apellido'])
  const tokens = tokensNombre(nombre)
  const camp = consulta.match(RE_CAMP)
  const mailsC = limpiarLista([normEmail(r['Email']), ...todos(RE_EMAIL, consulta).map(normEmail)])
  const subCeler = txt(r['clave_atencion']) || txt(r['Origen']) || txt(r['websiteName'])
  return {
    fuente: 'celer',
    id_externo: id,
    tramite: txt(r['JOB_SEQ']),
    fecha: normFecha(r['Fecha de consulta']),
    nombre,
    nombre_tokens: tokens,
    nombre_clave: clave(tokens),
    dnis: limpiarLista([normDni(r['DNI']), ...todos(RE_DNI, consulta).map(normDni)]),
    tels,
    tels8: ultimos8(tels),
    tels7: ultimos7(tels),
    emails: mailsC,
    emails_base: limpiarLista(mailsC.map(emailBase)),
    origen_crudo: 'Internet',
    sub_origen_crudo: subCeler,
    origen_fuente: 'celer',
    origen_valor: subCeler,
    campana: camp ? camp[1].toLowerCase() : null,
    sistema: txt(r['websiteName']),
    vendedor: null,                              // en Celer no viene el vendedor
    facilitador: txt(r['USUARIO_DERIVO']),       // quien derivó el lead
    setter: txt(r['titulo']) || txt(r['websiteName']),
    unidad: null,
    pagina_url: txt(r['url']),
    anuncio_link: (consulta.match(RE_LINK_ANUNCIO) || [null])[0],
    anuncio_texto: fraseAnuncio(consulta),
    consulta: consulta.slice(0, 1500) || null,
  }
}

// ── Reporte "Derivado" (Autodealer / CRM) ───────────────────
export function leadDesdeDerivado(r) {
  const id = txt(r['Nro Tramite'])
  if (!id) return null
  const nombre = txt(r['Cliente'])
  if (nombre && /NO USAR/i.test(nombre)) return null
  const tels = limpiarLista([normTel(r['Telefono']), normTel(r['Celular'])])
  const tokens = tokensNombre(nombre)
  const camp = String(r['Campaña'] || '').match(RE_CAMP)
  return {
    fuente: 'derivado',
    id_externo: id,
    tramite: id,
    fecha: normFecha(r['Fecha de Consulta']),
    nombre,
    nombre_tokens: tokens,
    nombre_clave: clave(tokens),
    dnis: limpiarLista([normDni(r['DNI'])]),
    tels,
    tels8: ultimos8(tels),
    tels7: ultimos7(tels),
    emails: limpiarLista([normEmail(r['Email'])]),
    emails_base: limpiarLista([emailBase(normEmail(r['Email']))]),
    origen_crudo: txt(r['Origen']),
    sub_origen_crudo: txt(r['Sub Origen']),
    origen_fuente: 'derivado',
    origen_valor: txt(r['Sub Origen']),
    campana: camp ? camp[1].toLowerCase() : txt(r['Campaña']),
    sistema: txt(r['Sistema']),
    vendedor: txt(r['Vendedor']),
    facilitador: txt(r['Facilitador']),
    setter: null,
    unidad: txt(r['Unidad']),
    pagina_url: null,
    anuncio_link: null,
    anuncio_texto: null,
    consulta: null,
  }
}

// ── Reporte "PV Vinculadas" (preventas) ─────────────────────
const RE_EMPRESA = /[\s,.]S\.?A\.?$|\bS\.A\.|\bSA\b|\bS\.?R\.?L\.?\b|\bSAS\b|SOCIEDAD|ANONIMA|\bS\.?C\.?S\b|RENT A CAR|MUNICIPALIDAD|\bBANCO\b/i
export function preventaDesdePV(r) {
  const pv = txt(r['PV/SOLICITUD'] ?? r['PV'] ?? r['PV SOLICITUD'])
  if (!pv) return null
  const nombre = txt(r['NOMBRE'] ?? r['CLIENTE'])
  if ((nombre && /NO USAR/i.test(nombre)) || /NO USAR/i.test(pv)) return null
  const cuit = txt(r['CUIL CUIT'] ?? r['CUIL'])
  const dniDirecto = normDni(r['DNI'])
  const dniCuit = normDni(cuit)
  const tels = limpiarLista(['CELULAR PERSONAL', 'TELEFONO PERSONAL', 'CELULAR LABORAL', 'TELEFONO LABORAL', 'TEL', 'CELULAR'].map(c => normTel(r[c])))
  const tokens = tokensNombre(nombre)
  const conyuge = txt(r['NombreConyuge'] ?? r['NOMBRECONYUGE'] ?? r['NOMBRE CONYUGE'])
  const email = normEmail(r['EMAIL'])
  return {
    pv,
    fecha: soloDia(normFecha(r['FECHA'])),
    tipo: txt(r['TIPO']),
    marca: txt(r['EMPRESA'] ?? r['MARCA']) || '',
    nombre,
    nombre_tokens: tokens,
    nombre_clave: clave(tokens),
    apellido_tokens: tokensApellido(nombre),
    conyuge,
    conyuge_clave: clave(tokensNombre(conyuge)),
    dni: dniDirecto || dniCuit,
    dni_desde_cuit: !dniDirecto && !!dniCuit,
    cuit,
    tels,
    tels8: ultimos8(tels),
    tels7: ultimos7(tels),
    email,
    email_base: emailBase(email),
    vendedor: txt(r['VENDEDOR'] ?? r['ASESOR']),
    unidad: txt(r['UNIDAD'] ?? r['TEAM']),
    // Si algún día el reporte trae el Nº de trámite, se toma solo
    tramite_declarado: txt(r['NRO TRAMITE'] ?? r['Nro Tramite'] ?? r['TRAMITE'] ?? r['Tramite']),
    es_empresa: esCuitEmpresa(cuit) || RE_EMPRESA.test(nombre || ''),
    // Flota interna del grupo: no cuenta para el % de vinculación
    es_interna: soloDigitos(cuit) === '30714219134' || /MOVILIS/i.test(nombre || '') && /RENT/i.test(nombre || ''),
  }
}

// Qué reporte es, mirando sus columnas
export function detectarReporte(fila) {
  const cols = Object.keys(fila || {})
  if (cols.includes('PV/SOLICITUD') || cols.includes('TOTALPREVENTA')) return 'preventas'
  if (cols.includes('Nro Tramite') && cols.includes('Sub Origen')) return 'derivado'
  if (cols.includes('JOB_SEQ') || cols.includes('TELNUMERO')) return 'celer'
  return null
}

// ── Derivado exportado como texto ("sep=;" con extensión .xls) ──
// Los comentarios a veces traen ";" sueltos que corren las columnas.
// Se corrige buscando dónde quedó la columna Origen (valores conocidos).
const ORIGENES_DERIVADO = new Set(['Internet', 'De Paso', 'Llamados entrantes', 'Cita Vendedor', 'Entrante', 'Saliente', 'Compra'])
export function leerDerivadoTexto(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/)
  if (/^sep=/i.test(lineas[0])) lineas.shift()
  const cab = lineas.shift().split(';').map(s => s.trim())
  const iCom = cab.indexOf('Comentario Derivado'), iOri = cab.indexOf('Origen')
  const filas = []
  for (const l of lineas) {
    if (!l.trim()) continue
    let c = l.split(';')
    // Si "Origen" no está donde debería, el comentario tenía ";" adentro: unir partes
    if (!ORIGENES_DERIVADO.has((c[iOri] || '').trim())) {
      for (let k = 1; k <= 8; k++) {
        if (ORIGENES_DERIVADO.has((c[iOri + k] || '').trim())) {
          c = [...c.slice(0, iCom), c.slice(iCom, iCom + k + 1).join(';'), ...c.slice(iCom + k + 1)]
          break
        }
      }
    }
    const fila = {}
    cab.forEach((h, i) => { if (h) fila[h] = c[i] === undefined || c[i] === '' ? null : c[i] })
    filas.push(fila)
  }
  return filas
}
