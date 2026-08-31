# Marketing Dashboard — Grupo Randazzo

## Deploy en 30 minutos

### PASO 1 — Supabase (5 min)
1. Ir a https://supabase.com → tu proyecto → SQL Editor
2. Copiar y ejecutar todo el contenido de `schema.sql`
3. Verificar que se crearon las tablas: mkt_campanas, mkt_leads, mkt_ventas, mkt_gastos, mkt_upload_log
4. Copiar el Project URL y la anon key desde Settings → API

### PASO 2 — Variables de entorno (2 min)
1. Copiar `.env.example` a `.env.local`
2. Completar con los valores de Supabase:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJxxx...
   ```

### PASO 3 — Instalar y probar local (5 min)
```bash
npm install
npm run dev
```
Abrir http://localhost:5173

### PASO 4 — Deploy a Vercel (5 min)
1. Subir el código a un repositorio GitHub (puede ser privado)
2. Ir a vercel.com → New Project → importar el repo
3. En Environment Variables, agregar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

---

## Uso diario

### Carga de archivos
Ir a la pestaña **Carga** y subir los reportes descargados del día:
- Celer: Reporte Leads por Facilitadores
- Celer: Reporte Derivado
- Autodealer: Reporte Derivado
- Autodealer: PV Vinculadas
- K1: Ventas

Hacer clic en **Procesar**. El sistema cruza automáticamente por DNI y teléfono.

### Campañas
- **Nueva campaña**: completar el formulario con el código que aparece en los leads (ej: `fl2`)
- **Editar**: hacer clic en cualquier celda para editarla inline
- **Gastos**: hacer clic en el botón 💸 para agregar o importar gastos desde Excel
- **Códigos sin mapear**: si aparece la sección amarilla, vincular los códigos a campañas

### Dashboard
Muestra el resumen automático de leads, ventas, ROI y top asesores.

---

## Estructura de archivos
```
src/
├── lib/
│   ├── supabase.js   — Conexión a Supabase
│   ├── parsers.js    — Parseo de archivos Excel/CSV/HTML
│   └── matching.js   — Algoritmo de cruce DNI/teléfono
├── pages/
│   ├── Dashboard.jsx — Resumen general
│   ├── Campanas.jsx  — Gestión de campañas y gastos
│   ├── Leads.jsx     — Vista de leads con filtros
│   └── Carga.jsx     — Subida y procesamiento de archivos
└── App.jsx           — Navegación principal
```
