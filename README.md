# Marketing Cruces — Grupo Randazzo

Vincula automáticamente los leads (Celer + Derivado, con Darwin dentro de Celer) con las preventas, para saber de qué origen y sub-origen vino cada venta.

## Pantallas
- **Cargar**: se arrastran los reportes (Celer, Derivado, PV Vinculadas); detecta cuál es cada uno, los guarda y corre el cruce.
- **Vínculos**: todas las preventas con su lead, estado, origen y sub-origen. Pestañas, filtros, columnas a elección, exportar a Excel; al hacer clic en una fila se ven todos sus leads y se puede confirmar, rechazar, vincular a mano o declarar el Nº de trámite.
- **Confirmar**: los vínculos "posibles" para decidir con un clic.
- **Seguimiento**: % de ventas con origen digital por sucursal, vendedor o mes, y ventas por sub-origen.
- **Configuración**: catálogo editable de orígenes/sub-orígenes, páginas, unidades→sucursal y vendedores.

## Puesta en marcha
1. Base de datos: Supabase (proyecto `marketing-cruces`), ya con los pasos 1 a 6. Correr además `supabase/7_tiempo_maximo.sql` (SQL Editor → pegar → Run).
2. Crear un usuario: Supabase → Authentication → Users → Add user (email + contraseña, tildar *Auto Confirm*).
3. Variables de entorno (Vercel → Settings → Environment Variables):
   - `VITE_SUPABASE_URL` = Project URL (Supabase → Project Settings → API)
   - `VITE_SUPABASE_ANON_KEY` = clave *anon / publishable*
4. Probar en la computadora (opcional): copiar `.env.example` a `.env`, completar, y `npm install` + `npm run dev`.

## Dónde se cambian las cosas
- Columnas, pestañas, filtros y agrupaciones de las pantallas: `src/lib/config.js`
- Reglas de lectura de reportes (teléfonos, DNI, mails, nombres): `src/lib/normalizar.js`
- Reglas del cruce: función `ejecutar_cruce()` en la base (`supabase/6_cruce_final_y_seguimiento.sql`)
- Catálogos: pantalla Configuración (sin tocar código)
