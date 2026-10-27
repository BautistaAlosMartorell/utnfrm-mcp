import fs from 'node:fs';
import { chromium } from 'playwright';

/** ¿Está instalado el Chromium que corresponde a esta versión del MCP? */
export function browserInstalled(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}
