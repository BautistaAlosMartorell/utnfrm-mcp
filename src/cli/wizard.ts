import type { Course } from '../types/index.js';
import { CLIENTS, registerClient, type ClientId, type ClientSpec, type RegisterResult } from './clients.js';
import { runDoctor, type DoctorCheck, type DoctorOptions } from './doctor.js';
import { readActiveCourseIds, writeActiveCourseIds } from '../session/profile.js';
import { ROOT_DIR } from '../config.js';

export interface WizardIO {
  say(message?: string): void;
  /** Pregunta de sí/no; `defaultYes` es lo que se toma con solo pulsar Enter. */
  confirm(question: string, defaultYes: boolean): Promise<boolean>;
  /** Elegir varios de una lista numerada; devuelve las posiciones elegidas, o undefined si la persona acepta «todas». */
  pick(question: string, items: string[]): Promise<number[] | undefined>;
}

export interface WizardDeps {
  diagnose(options?: DoctorOptions): Promise<DoctorCheck[]>;
  installBrowser(): number;
  login(): Promise<boolean>;
  register(id: ClientId): RegisterResult;
  listCourses(): Promise<Course[]>;
  /** ¿Ya hay materias del cuatrimestre guardadas? */
  /** ¿Se está ejecutando desde una copia temporal (npx)? Registrar esa ruta dejaría el MCP roto. */
  isEphemeralInstall(): boolean;
  hasActiveProfile(): boolean;
  saveActiveCourses(ids: string[]): void;
  clients: ClientSpec[];
}

export type WizardOptions = {
  /** Acepta las opciones por defecto sin preguntar (instala, conecta clientes). No renueva una sesión válida. */
  yes?: boolean;
  skipLogin?: boolean;
  skipRegister?: boolean;
};

export type WizardResult = { ok: boolean; completed: string[]; pending: string[] };

const STEPS = 5;
const step = (n: number, title: string) => `\nPaso ${n} de ${STEPS} · ${title}`;

function find(checks: DoctorCheck[], id: string): DoctorCheck | undefined {
  return checks.find(check => check.id === id);
}

/**
 * Asistente de instalación guiada: revisa el equipo, repara lo que puede, inicia sesión, conecta los
 * clientes de IA detectados y termina con una prueba real. Si algo requiere permisos de administrador,
 * muestra el comando exacto en vez de fallar.
 */
export async function runWizard(options: WizardOptions, io: WizardIO, deps: WizardDeps): Promise<WizardResult> {
  const completed: string[] = [];
  const pending: string[] = [];
  const ask = (question: string, defaultYes: boolean) => options.yes ? Promise.resolve(defaultYes) : io.confirm(question, defaultYes);
  const stop = (reason: string): WizardResult => {
    io.say(`\nNo se pudo continuar: ${reason}`);
    io.say('Cuando lo resuelvas, volvé a ejecutar: utn-mcp-mendoza setup-wizard');
    return { ok: false, completed, pending };
  };

  io.say('Asistente de instalación de UTN MCP Mendoza');
  io.say('Te va a guiar en 5 pasos. Nunca pide tu contraseña: la escribís solo en la página del Campus.');

  // ── Paso 1: equipo ────────────────────────────────────────────────────────────────────────────
  io.say(step(1, 'Revisar tu equipo'));
  let checks = await deps.diagnose({ machineOnly: true });
  const node = find(checks, 'node');
  if (node?.status === 'fail') return stop(`${node.detail}. ${node.fix ?? ''}`.trim());

  const storage = find(checks, 'storage');
  if (storage?.status === 'fail') return stop(`${storage.title}: ${storage.detail}. ${storage.fix ?? ''}`.trim());

  const browser = find(checks, 'browser');
  if (browser?.status === 'fail') {
    io.say('Falta el navegador que usa el MCP para iniciar sesión (ocupa unos 150 MB).');
    if (await ask('¿Lo instalo ahora?', true)) {
      io.say('Instalando el navegador… puede tardar un par de minutos.');
      const status = deps.installBrowser();
      checks = await deps.diagnose({ machineOnly: true });
      if (status !== 0 || find(checks, 'browser')?.status === 'fail') {
        return stop('no se pudo instalar el navegador. En Linux probá: utn-mcp-mendoza install-browser --with-deps (pide sudo).');
      }
      io.say('✔ Navegador instalado.');
    } else {
      return stop('sin el navegador no se puede iniciar sesión.');
    }
  } else {
    io.say('✔ Todo en orden en tu equipo.');
  }
  const display = find(checks, 'display');
  if (display?.status === 'warn' && !options.skipLogin) io.say(`⚠ ${display.detail}. ${display.fix ?? ''}`.trim());
  completed.push('equipo');

  // ── Paso 2: sesión ────────────────────────────────────────────────────────────────────────────
  io.say(step(2, 'Iniciar sesión en el Campus'));
  if (options.skipLogin) {
    io.say('Omitido por pedido tuyo.');
    pending.push('login');
  } else {
    const session = find(await deps.diagnose({}), 'session');
    let needLogin = session?.status !== 'ok';
    if (!needLogin) {
      io.say('✔ Ya tenés una sesión activa.');
      needLogin = !options.yes && await io.confirm('¿Querés renovarla igualmente?', false);
    }
    if (needLogin) {
      io.say('Se va a abrir una ventana del navegador en el Campus. Ingresá tu usuario y contraseña ahí.');
      io.say('No hace falta volver a esta terminal: cuando entrás, la ventana se cierra sola y el asistente sigue.');
      if (!(await deps.login())) return stop('no se completó el inicio de sesión.');
      io.say('✔ Sesión guardada de forma segura en tu equipo.');
    }
    completed.push('sesión');
  }

  // ── Paso 3: clientes ──────────────────────────────────────────────────────────────────────────
  io.say(step(3, 'Conectar con tu cliente de IA'));
  if (options.skipRegister) {
    io.say('Omitido por pedido tuyo.');
    pending.push('clientes');
  } else {
    const all = await deps.diagnose({ offline: true });
    if (deps.isEphemeralInstall()) {
      io.say('Estás ejecutando el asistente desde una copia temporal (npx): si conectara tu cliente ahora, quedaría apuntando a una carpeta que se borra.');
      io.say('Primero instalá el MCP (npm install --global ./utn-mcp-mendoza-<versión>.tgz) y volvé a ejecutar `utn-mcp-mendoza setup-wizard`.');
      pending.push('clientes');
    }
    const detected = deps.clients.filter(client => {
      const entry = find(all, `client-${client.id}`);
      return entry && entry.status !== 'skip';
    });
    if (deps.isEphemeralInstall()) {
      // ya se explicó arriba
    } else if (detected.length === 0) {
      io.say('No encontré Claude Code, Codex ni OpenCode en este equipo.');
      io.say('Si usás Claude Desktop, Cursor o VS Code, ejecutá `utn-mcp-mendoza setup` y pegá la configuración que muestra.');
      pending.push('clientes');
    } else {
      for (const client of detected) {
        const entry = find(all, `client-${client.id}`);
        if (entry?.status === 'ok') {
          io.say(`✔ ${client.label} ya está conectado.`);
          continue;
        }
        if (await ask(`¿Conecto ${client.label} con el MCP?`, true)) {
          const result = deps.register(client.id);
          if (result.ok) io.say(`✔ ${client.label} conectado. Reinicialo para que cargue las herramientas.`);
          else {
            io.say(`⚠ ${result.message ?? 'No se pudo conectar.'}`);
            pending.push(client.label);
          }
        } else {
          io.say(`Podés hacerlo después con: ${client.setupCommand}`);
          pending.push(client.label);
        }
      }
      completed.push('clientes');
    }
  }

  // ── Paso 4: prueba real ───────────────────────────────────────────────────────────────────────
  io.say(step(4, 'Probar que funciona'));
  if (options.skipLogin) {
    io.say('Omitido (no se inició sesión).');
  } else {
    try {
      const courses = await deps.listCourses();
      const sample = courses.slice(0, 3).map(course => course.name).join(', ');
      io.say(courses.length > 0
        ? `✔ Funciona: encontré ${courses.length} materias${sample ? ` (por ejemplo: ${sample})` : ''}.`
        : '✔ La conexión funciona, pero el Campus no muestra materias para tu cuenta.');
      completed.push('prueba');

      // Materias del cuatrimestre: así las consultas diarias revisan solo esas y responden mucho más rápido.
      if (!options.yes && courses.length > 1 && !deps.hasActiveProfile()) {
        io.say('\nPara que las consultas sean más rápidas, elegí las materias que cursás este cuatrimestre.');
        const chosen = await io.pick('¿Cuáles cursás?', courses.map(course => course.name));
        if (chosen && chosen.length > 0) {
          const picked = chosen.filter(index => index >= 0 && index < courses.length).map(index => courses[index]);
          if (picked.length > 0) {
            deps.saveActiveCourses(picked.map(course => course.id));
            io.say(`✔ Guardé ${picked.length} ${picked.length === 1 ? 'materia' : 'materias'}. Podés cambiarlas pidiéndole a tu cliente que use set_active_courses.`);
            completed.push('materias');
          }
        } else {
          io.say('Quedan todas tus materias. Podés elegir más adelante con set_active_courses.');
        }
      }
    } catch {
      io.say('⚠ La prueba no pudo leer tus materias. Ejecutá `utn-mcp-mendoza doctor` para ver qué falta.');
      pending.push('prueba');
    }
  }

  // ── Paso 5: listo ─────────────────────────────────────────────────────────────────────────────
  io.say(step(5, 'Listo'));
  if (pending.length === 0) io.say('✔ Instalación completa.');
  else io.say(`Quedó pendiente: ${pending.join(', ')}. Ejecutá \`utn-mcp-mendoza doctor\` para ver cómo resolverlo.`);
  io.say('\nReiniciá tu cliente de IA y probá preguntarle:');
  io.say('  • «¿Qué tengo para entregar esta semana?»');
  io.say('  • «Lista mis materias y mostrame los avisos nuevos.»');
  io.say('  • «Resumime la unidad 3 de <materia>.»');
  io.say('\nSi algo no anda: utn-mcp-mendoza doctor');
  return { ok: !pending.includes('login') && !pending.includes('prueba'), completed, pending };
}

export function defaultWizardDeps(overrides: Partial<WizardDeps> & Pick<WizardDeps, 'installBrowser' | 'login' | 'listCourses'>): WizardDeps {
  return {
    isEphemeralInstall: () => /[\\/]_npx[\\/]/.test(ROOT_DIR),
    hasActiveProfile: () => readActiveCourseIds().length > 0,
    saveActiveCourses: ids => writeActiveCourseIds(ids),
    diagnose: options => runDoctor(options),
    register: id => registerClient(id),
    clients: CLIENTS,
    ...overrides
  };
}
