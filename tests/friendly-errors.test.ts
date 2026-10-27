import { afterEach, describe, expect, it } from 'vitest';
import { debugErrorDetails, describeCliError, withSessionHint } from '../src/client/friendly-errors.js';

describe('friendly CLI errors', () => {
  afterEach(() => { delete process.env.UTN_MCP_DEBUG; });

  it('explains a missing or mismatched Chromium build', () => {
    const message = describeCliError(new Error("browserType.launch: Executable doesn't exist at /home/u/.cache/ms-playwright/chromium-1248/chrome"));
    expect(message).toMatch(/install-browser/);
    expect(message).not.toMatch(/ms-playwright/);
  });

  it('explains missing secret storage and display', () => {
    expect(describeCliError(new Error('spawn secret-tool ENOENT'))).toMatch(/libsecret-tools/);
    expect(describeCliError(new Error('Missing X server or $DISPLAY'))).toMatch(/entorno gráfico/);
  });

  it('never leaks cookies, tokens or campus URLs', () => {
    const message = describeCliError(new Error('fallo en https://campusvirtual.frm.utn.edu.ar/x?sesskey=abc123 con MoodleSession=zzz'));
    expect(message).not.toMatch(/abc123|zzz|campusvirtual/);
  });

  it('points to session_status and start_login only for session problems', () => {
    expect(withSessionHint('La sesión del Campus Virtual expiró.')).toMatch(/session_status.*start_login/);
    expect(withSessionHint('Se detuvieron las solicitudes por una respuesta de autenticación')).toMatch(/start_login/);
    expect(withSessionHint('No se encontró una sesión activa para el Campus')).toMatch(/start_login/);
    expect(withSessionHint('El archivo supera el límite de 50 MiB.')).toBe('El archivo supera el límite de 50 MiB.');
    const already = 'La sesión venció. Usá session_status.';
    expect(withSessionHint(already)).toBe(already);
  });

  it('falls back to a generic message and only shows details in debug mode', () => {
    expect(describeCliError(undefined)).toMatch(/No se pudo completar/);
    expect(debugErrorDetails(new Error('boom'))).toBeUndefined();
    process.env.UTN_MCP_DEBUG = '1';
    expect(debugErrorDetails(new Error('boom en https://campusvirtual.frm.utn.edu.ar/secreto'))).not.toMatch(/secreto/);
  });
});
