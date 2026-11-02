import { z } from 'zod';
import { AiToolDefinition } from '../providers/provider.types.js';

// Herramientas "de pantalla": el modelo no consulta datos con ellas, le
// pide al panel que dibuje una gráfica o una tabla con datos que ya trajo.

const formatSchema = z.enum(['moneda', 'numero', 'porcentaje', 'texto']);

export const chartSchema = z.object({
  titulo: z.string().min(1).max(120),
  tipo: z.enum(['barras', 'lineas', 'area', 'pastel']),
  etiquetas: z.array(z.string().max(60)).min(1).max(60),
  series: z
    .array(z.object({ nombre: z.string().min(1).max(60), valores: z.array(z.number()) }))
    .min(1)
    .max(6),
  formato: formatSchema.exclude(['texto']).optional(),
  nota: z.string().max(240).optional(),
});

export const tableSchema = z.object({
  titulo: z.string().min(1).max(120),
  columnas: z.array(z.object({ titulo: z.string().min(1).max(60), formato: formatSchema.optional() })).min(1).max(10),
  filas: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).min(1).max(200),
  nota: z.string().max(240).optional(),
});

export type AiChart = z.infer<typeof chartSchema>;
export type AiTable = z.infer<typeof tableSchema>;

export const RENDER_TOOL_NAMES = { chart: 'mostrar_grafica', table: 'mostrar_tabla' } as const;

export const RENDER_TOOLS: AiToolDefinition[] = [
  {
    name: RENDER_TOOL_NAMES.chart,
    description:
      'Muestra una gráfica en el chat con datos que YA consultaste. Úsala cuando una tendencia o comparación se entienda mejor viéndola (ventas por mes, por tienda, top productos). "etiquetas" es el eje X (o las rebanadas del pastel) y cada serie trae un valor por etiqueta, en el mismo orden. Pastel: una sola serie.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título corto, ej. "Venta mensual de Centrika".' },
        tipo: { type: 'string', enum: ['barras', 'lineas', 'area', 'pastel'] },
        etiquetas: { type: 'array', items: { type: 'string' }, description: 'Ej. ["May","Jun","Jul"].' },
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: { nombre: { type: 'string' }, valores: { type: 'array', items: { type: 'number' } } },
            required: ['nombre', 'valores'],
          },
        },
        formato: { type: 'string', enum: ['moneda', 'numero', 'porcentaje'], description: 'Cómo mostrar los valores. porcentaje: en puntos (21.5 = 21.5%).' },
        nota: { type: 'string', description: 'Fuente o aclaración corta, ej. "Venta Mensual del panel".' },
      },
      required: ['titulo', 'tipo', 'etiquetas', 'series'],
    },
  },
  {
    name: RENDER_TOOL_NAMES.table,
    description:
      'Muestra una tabla en el chat con datos que YA consultaste (comparaciones, rankings, detalle por tienda o producto). Cada fila trae un valor por columna, en el mismo orden. Máximo 200 filas.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        columnas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              formato: { type: 'string', enum: ['moneda', 'numero', 'porcentaje', 'texto'], description: 'porcentaje: en puntos (21.5 = 21.5%).' },
            },
            required: ['titulo'],
          },
        },
        filas: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'null'] } } },
        nota: { type: 'string' },
      },
      required: ['titulo', 'columnas', 'filas'],
    },
  },
];

/** Valida y deja coherente una gráfica (cada serie con tantos valores como etiquetas). */
export function parseChart(input: unknown): { chart: AiChart } | { error: string } {
  const parsed = chartSchema.safeParse(input);
  if (!parsed.success) return { error: `Gráfica inválida: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}` };
  const chart = parsed.data;
  const bad = chart.series.find((serie) => serie.valores.length !== chart.etiquetas.length);
  if (bad) return { error: `La serie "${bad.nombre}" tiene ${bad.valores.length} valores y hay ${chart.etiquetas.length} etiquetas: deben ser iguales.` };
  if (chart.tipo === 'pastel' && chart.series.length > 1) return { error: 'Una gráfica de pastel lleva una sola serie.' };
  return { chart };
}

export function parseTable(input: unknown): { table: AiTable } | { error: string } {
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) return { error: `Tabla inválida: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}` };
  const table = parsed.data;
  const width = table.columnas.length;
  return { table: { ...table, filas: table.filas.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? null)) } };
}
