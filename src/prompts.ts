import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const RULES = [
  'Reglas: basate solo en lo que devuelvan las herramientas del Campus; no inventes contenido, fechas ni notas.',
  'Si un archivo no se pudo leer (extractionStatus distinto de "complete", páginas sin texto o enlaces externos no leídos), decilo explícitamente en lugar de rellenar.',
  'Si una herramienta indica que la sesión venció, usá session_status y guiá a la persona con start_login.'
].join(' ');

function user(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

const SOURCES_AND_COVERAGE = [
  'Antes de escribir, leé el campo "outline" de study_pack (los temas de cada archivo, con su página).',
  'Al terminar, verificá la cobertura: listá qué temas del outline quedaron cubiertos y cuáles no, y completá los que falten.',
  'Citá de dónde sale cada punto importante con el formato (archivo, p. N).',
  'Si una fuente quedó truncada o sin texto, avisalo y decí qué parte falta.'
].join(' ');

/** Atajos que el cliente muestra como acciones listas para usar (función `prompts` de MCP). */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt('conectar_con_el_campus', {
    title: 'Conectar con el Campus',
    description: 'Guía paso a paso para instalar el navegador necesario e iniciar sesión, sin usar la terminal.'
  }, () => user(
    'Ayudame a conectarme con el Campus. Consultá session_status y seguí el "nextStep": si falta el navegador usá install_browser, ' +
    'si hay que iniciar o renovar la sesión usá start_login (yo escribo mi usuario y contraseña solo en la ventana del navegador; vos nunca los ves). ' +
    'Después de cada paso volvé a consultar session_status hasta que diga que la sesión está activa, explicándome en palabras simples qué estoy esperando. ' +
    'Cuando esté lista, ejecutá set_active_courses sin argumentos y preguntame cuáles materias curso este cuatrimestre para guardarlas.'
  ));

  server.registerPrompt('resumen_de_mi_semana', {
    title: 'Resumen de mi semana',
    description: 'Qué vence en los próximos 7 días y qué avisos nuevos hay, ordenado por día.'
  }, () => user(
    'Armame el resumen de mi semana. Usá get_deadlines con days_ahead 7 y get_announcements con since de hace 7 días. ' +
    'Presentalo ordenado por día (de hoy en adelante), agrupando por materia, destacando lo vencido sin entregar y lo que vence en menos de 48 horas, ' +
    'y cerrá con 3 prioridades concretas para esta semana. Si hay avisos que cambien fechas o condiciones, marcalos aparte. ' + RULES
  ));

  server.registerPrompt('que_entrego', {
    title: 'Qué tengo que entregar',
    description: 'Entregas y cierres de cuestionarios pendientes hasta una fecha o cantidad de días.',
    argsSchema: { hasta: z.string().optional().describe('Hasta cuándo: "viernes", "15 días", una fecha… (por defecto 14 días)') }
  }, ({ hasta }) => user(
    `Decime qué tengo que entregar${hasta ? ` hasta ${hasta}` : ' en los próximos 14 días'}. Usá get_deadlines (convertí lo que pedí a days_ahead) ` +
    'y mostrame una lista corta ordenada por fecha con materia, nombre, fecha límite, días restantes y estado de entrega. ' + RULES
  ));

  server.registerPrompt('resumir_unidad', {
    title: 'Resumir una unidad',
    description: 'Resumen completo y visual de una unidad, basado en los archivos que sube la cátedra.',
    argsSchema: {
      materia: z.string().describe('Nombre o ID de la materia, por ejemplo "inteligencia artificial"'),
      unidad: z.string().describe('Número o nombre de la unidad, por ejemplo "4"'),
      formato: z.string().optional().describe('Cómo lo querés: "corto", "completo", "con ejemplos", "en PDF"…')
    }
  }, ({ materia, unidad, formato }) => user(
    `Resumime la unidad ${unidad} de ${materia}${formato ? ` (formato: ${formato})` : ' de forma completa, clara y fácil de estudiar'}. ` +
    `Usá study_pack con la materia y la unidad para traer todos los archivos de la cátedra. ${SOURCES_AND_COVERAGE} ` +
    'Estructurá con títulos, tablas y listas; explicá los conceptos en palabras simples antes de las fórmulas; incluí los ejemplos y casos numéricos del material. ' + RULES
  ));

  server.registerPrompt('preparar_parcial', {
    title: 'Preparar un parcial',
    description: 'Material de estudio y plan hasta la fecha del parcial.',
    argsSchema: {
      materia: z.string().describe('Materia del parcial'),
      unidades: z.string().describe('Unidades que entran, por ejemplo "3 y 4"'),
      fecha: z.string().optional().describe('Fecha del parcial, si la sabés')
    }
  }, ({ materia, unidades, fecha }) => user(
    `Ayudame a preparar el parcial de ${materia} (unidades ${unidades})${fecha ? ` del ${fecha}` : ''}. ` +
    'Si no te di la fecha, buscala en get_announcements y get_course_contents (página de calendario) y confirmámela. ' +
    `Para cada unidad usá study_pack. ${SOURCES_AND_COVERAGE} ` +
    'Entregame: (1) los temas que seguro entran, (2) una chuleta de fórmulas y definiciones, (3) 10 preguntas de práctica con respuesta, (4) un plan de estudio día por día hasta el parcial teniendo en cuenta mis otras entregas (get_deadlines). ' + RULES
  ));

  server.registerPrompt('practica_de_unidad', {
    title: 'Preguntas de práctica',
    description: 'Preguntas y ejercicios con respuestas, hechos a partir del material de la unidad.',
    argsSchema: {
      materia: z.string().describe('Materia'),
      unidad: z.string().describe('Unidad'),
      cantidad: z.string().optional().describe('Cuántas preguntas (por defecto 10)')
    }
  }, ({ materia, unidad, cantidad }) => user(
    `Armame ${cantidad ?? '10'} preguntas de práctica de la unidad ${unidad} de ${materia}, mezclando conceptuales y numéricas, con la respuesta resuelta paso a paso. ` +
    `Usá study_pack y aprovechá los ejercicios y resultados de control que traiga el material. ${SOURCES_AND_COVERAGE} ` +
    'Primero mostrame solo las preguntas numeradas y, debajo, las respuestas separadas para que pueda taparlas. ' + RULES
  ));

  server.registerPrompt('tarjetas_de_repaso', {
    title: 'Tarjetas de repaso',
    description: 'Tarjetas pregunta/respuesta para memorizar los conceptos de una unidad.',
    argsSchema: { materia: z.string().describe('Materia'), unidad: z.string().describe('Unidad') }
  }, ({ materia, unidad }) => user(
    `Hacé tarjetas de repaso (pregunta → respuesta corta) de la unidad ${unidad} de ${materia}: definiciones, fórmulas, comparaciones y errores típicos. ` +
    `Usá study_pack. ${SOURCES_AND_COVERAGE} Presentalas en una tabla de dos columnas, agrupadas por tema. ` + RULES
  ));

  server.registerPrompt('plan_de_estudio', {
    title: 'Plan de estudio',
    description: 'Reparte el estudio de las unidades entre hoy y la fecha del parcial.',
    argsSchema: {
      materia: z.string().describe('Materia'),
      fecha: z.string().describe('Fecha del parcial o de la entrega'),
      horas_por_dia: z.string().optional().describe('Horas que podés estudiar por día')
    }
  }, ({ materia, fecha, horas_por_dia }) => user(
    `Armame un plan de estudio de ${materia} hasta el ${fecha}${horas_por_dia ? `, con ${horas_por_dia} horas por día` : ''}. ` +
    'Usá get_course_contents para ver las unidades y sus materiales, get_deadlines para no pisar otras entregas, y get_quiz_info para ver qué autoevaluaciones me faltan. ' +
    'Repartí por día: qué leer, qué ejercicios hacer y cuándo repasar, dejando el último día para repaso general. ' + RULES
  ));
}
