// =====================================================================
//  CONFIGURACIÓN DE PANTALLAS — todo lo que se puede ajustar sin tocar la lógica
//  Para agregar/quitar una columna, pestaña o filtro: editar esta lista.
// =====================================================================

// Estados de una preventa (los valores internos vienen de la base de datos)
export const ESTADOS = {
  digital:       { label: 'Digital',               badge: 'badge-green'  },
  presencial:    { label: 'Presencial',            badge: 'badge-blue'   },
  no_registrado: { label: 'De Paso cercano a la venta', badge: 'badge-yellow' },
  posible:       { label: 'Posible (confirmar)',   badge: 'badge-yellow' },
  sin_vinculo:   { label: 'Sin vínculo',           badge: 'badge-red'    },
  interna:       { label: 'Interna (excluida)',    badge: 'badge-gray'   },
}

// Pestañas de la pantalla Vínculos (filtro rápido por estado). null = todas
export const PESTANAS_VINCULOS = [
  { id: 'todas',         label: 'Todas',          estados: null },
  { id: 'digital',       label: 'Digital',        estados: ['digital'] },
  { id: 'presencial',    label: 'Presencial',     estados: ['presencial'] },
  { id: 'no_registrado', label: 'De Paso ±3 días', estados: ['no_registrado'] },
  { id: 'posible',       label: 'Posibles',       estados: ['posible'] },
  { id: 'sin_vinculo',   label: 'Sin vínculo',    estados: ['sin_vinculo'] },
  { id: 'interna',       label: 'Internas',       estados: ['interna'] },
]

// Columnas de la tabla de Vínculos. `visible` = se muestra por defecto.
// campo = columna de la vista preventas_estado
export const COLUMNAS_VINCULOS = [
  { campo: 'pv',          titulo: 'PV',           visible: true },
  { campo: 'fecha',       titulo: 'Fecha PV',     visible: true,  tipo: 'fecha' },
  { campo: 'marca',       titulo: 'Empresa',      visible: false },
  { campo: 'nombre',      titulo: 'Cliente',      visible: true },
  { campo: 'vendedor',    titulo: 'Vendedor',     visible: true },
  { campo: 'sucursal',    titulo: 'Sucursal',     visible: true },
  { campo: 'estado',      titulo: 'Estado',       visible: true,  tipo: 'estado' },
  { campo: 'origen',      titulo: 'Origen',       visible: true },
  { campo: 'sub_origen',  titulo: 'Sub-origen',   visible: true },
  { campo: 'pagina',      titulo: 'Página',       visible: false },
  { campo: 'anuncio_texto', titulo: 'Anuncio',    visible: false },
  { campo: 'setter',      titulo: 'Setter',       visible: false },
  { campo: 'facilitador', titulo: 'Facilitador',  visible: false },
  { campo: 'regla',       titulo: 'Regla',        visible: true },
  { campo: 'nivel',       titulo: 'Nivel',        visible: false },
  { campo: 'dias_lead_a_venta', titulo: 'Días lead→venta', visible: false },
  { campo: 'lead_tramite', titulo: 'Trámite',     visible: false },
  { campo: 'dni',         titulo: 'DNI',          visible: false },
  { campo: 'tipo',        titulo: 'Tipo',         visible: false },
]

// Filtros desplegables de Vínculos: campo de la vista + etiqueta
export const FILTROS_VINCULOS = [
  { campo: 'mes',        titulo: 'Mes' },
  { campo: 'sucursal',   titulo: 'Sucursal' },
  { campo: 'vendedor',   titulo: 'Vendedor' },
  { campo: 'origen',     titulo: 'Origen' },
  { campo: 'sub_origen', titulo: 'Sub-origen' },
  { campo: 'marca',      titulo: 'Empresa' },
]

// Agrupaciones de la pantalla Seguimiento
export const AGRUPACIONES_SEGUIMIENTO = [
  { id: 'sucursal', titulo: 'Sucursal' },
  { id: 'vendedor', titulo: 'Vendedor' },
  { id: 'mes',      titulo: 'Mes' },
]

// Tablas del catálogo editables en Configuración
export const CATALOGOS = [
  { id: 'origenes', titulo: 'Orígenes y sub-orígenes', tabla: 'origenes', orden: 'valor_crudo',
    ayuda: 'Cada valor que viene de los reportes (Sub Origen del Derivado, clave_atencion de Celer) se asigna a un Origen, Grupo y Sub-origen. Los cambios se reflejan al instante.',
    columnas: [
      { campo: 'fuente',      titulo: 'Fuente',      opciones: ['celer', 'derivado', 'darwin', 'meta', 'mercadolibre', 'otro'] },
      { campo: 'valor_crudo', titulo: 'Valor del reporte' },
      { campo: 'origen',      titulo: 'Origen',      opciones: ['Internet', 'Evento', 'Presencial', 'Teléfono', 'Cartera'] },
      { campo: 'grupo',       titulo: 'Grupo' },
      { campo: 'sub_origen',  titulo: 'Sub-origen' },
      { campo: 'es_digital',  titulo: 'Digital',     tipo: 'bool' },
      { campo: 'notas',       titulo: 'Notas' },
    ], clave: ['id'], nuevo: { fuente: 'derivado', origen: 'Internet', es_digital: true } },
  { id: 'paginas', titulo: 'Páginas', tabla: 'paginas', orden: 'pagina',
    ayuda: 'Dirección (url) de la página de Facebook o web que informa Celer → nombre que se muestra.',
    columnas: [ { campo: 'url', titulo: 'URL' }, { campo: 'pagina', titulo: 'Página' } ], clave: ['url'], nuevo: {} },
  { id: 'unidades', titulo: 'Unidades → Sucursal', tabla: 'unidades', orden: 'unidad',
    ayuda: 'A qué sucursal pertenece cada unidad / team que figura en el reporte.',
    columnas: [ { campo: 'unidad', titulo: 'Unidad' }, { campo: 'sucursal', titulo: 'Sucursal' } ], clave: ['unidad'], nuevo: {} },
  { id: 'vendedores', titulo: 'Vendedores', tabla: 'vendedores', orden: 'nombre',
    ayuda: 'Usuario del CRM (como figura en los leads) ↔ nombre en la preventa. Se completa solo al cruzar; acá se corrige.',
    columnas: [ { campo: 'usuario', titulo: 'Usuario CRM' }, { campo: 'nombre', titulo: 'Nombre en la preventa' }, { campo: 'origen', titulo: 'Origen del dato', opciones: ['auto', 'manual'] } ],
    clave: ['usuario'], nuevo: { origen: 'manual' } },
]

export const POR_PAGINA = 50
