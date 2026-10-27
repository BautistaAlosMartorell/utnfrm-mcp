import { sysacadClient } from '../sysacad/client.js';
import { CONSULTAS, type ConsultaName } from '../sysacad/consultas.js';
import { parseInscripcionEstado, parseSysacadTable, type InscripcionEstado, type SysacadTable } from '../parsers/sysacad.js';

export async function handleSysacadConsultar(input: { consulta: ConsultaName; legajo?: string }): Promise<SysacadTable & { consulta: ConsultaName; label: string }> {
  const html = await sysacadClient.consultar(input.consulta, input.legajo);
  return { consulta: input.consulta, label: CONSULTAS[input.consulta].label, ...parseSysacadTable(html) };
}

export async function handleSysacadInscripcionEstado(input: { legajo?: string }): Promise<InscripcionEstado> {
  const estado = parseInscripcionEstado(await sysacadClient.inscripcionHtml(input.legajo));
  if (!estado) throw new Error('No reconocí la pantalla de inscripción de Autogestión; es posible que el sitio haya cambiado.');
  return estado;
}
