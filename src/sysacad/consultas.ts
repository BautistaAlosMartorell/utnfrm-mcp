/**
 * Catalogo cerrado de consultas de Autogestion que el MCP puede pedir. Todas son de solo lectura; los
 * parametros (t, p, vsTipo) son los que usa el menu del sitio. No hay forma de pedir una URL arbitraria.
 * Quedan fuera a proposito los formularios que escriben datos: datos personales, titulos, becas, encuestas.
 */
type VerConsulta = { kind: 'ver'; label: string; t: string; p: string };
type ManpetConsulta = { kind: 'manpet'; label: string; t: string; query?: string };
export type Consulta = VerConsulta | ManpetConsulta;

const VER = '79845688';

export const CONSULTAS = {
  aprobados: { kind: 'ver', label: 'Exámenes aprobados', t: VER, p: '41562159' },
  aplazos: { kind: 'ver', label: 'Exámenes aplazados', t: VER, p: '41562150' },
  historico_examenes: { kind: 'ver', label: 'Histórico de exámenes', t: VER, p: '56897564' },
  materias_plan: { kind: 'ver', label: 'Materias del plan', t: VER, p: '58978565' },
  cursado_actual: { kind: 'ver', label: 'Cursado en este año', t: VER, p: '95126514' },
  horarios_cursado: { kind: 'ver', label: 'Horarios de cursado', t: VER, p: '95126518' },
  mis_horarios: { kind: 'ver', label: 'Mis horarios', t: VER, p: '56456787' },
  historico_cursado: { kind: 'ver', label: 'Histórico de cursado', t: VER, p: '22132158' },
  historico_regulares: { kind: 'ver', label: 'Histórico de regulares', t: VER, p: '95126515' },
  historico_libres: { kind: 'ver', label: 'Histórico de libres', t: VER, p: '95126516' },
  inhabilitaciones: { kind: 'ver', label: 'Inhabilitaciones', t: VER, p: '89787845' },
  matriculas: { kind: 'ver', label: 'Mis matrículas', t: VER, p: '3978701' },
  estado_academico: { kind: 'manpet', label: 'Estado académico', t: '402' },
  correlatividades_cursar: { kind: 'manpet', label: 'Correlatividades para cursar', t: '104', query: '&vsTipo=01' },
  correlatividades_rendir: { kind: 'manpet', label: 'Correlatividades para rendir', t: '104', query: '&vsTipo=02' },
  equivalencias: { kind: 'manpet', label: 'Equivalencias', t: '104', query: '&vsTipo=03' }
} as const satisfies Record<string, Consulta>;

export type ConsultaName = keyof typeof CONSULTAS;
export const CONSULTA_NAMES = Object.keys(CONSULTAS) as [ConsultaName, ...ConsultaName[]];
