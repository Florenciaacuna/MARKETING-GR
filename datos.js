import { supabase } from './supabase'

// PostgREST devuelve máximo 1000 filas por consulta: se pide de a páginas
export async function traerTodo(armar, tope = 20000) {
  const filas = []
  for (let desde = 0; desde < tope; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}

export const valoresUnicos = (filas, campo) =>
  [...new Set(filas.map(f => f[campo]).filter(v => v != null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'es'))

export const limpiarBusqueda = q => q.replace(/[,()%*]/g, ' ').trim()
export { supabase }
