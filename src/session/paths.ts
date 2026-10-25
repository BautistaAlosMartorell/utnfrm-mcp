import fs from 'node:fs';
import path from 'node:path';

type SessionDirectoryOptions = {
  platform: NodeJS.Platform;
  override?: string;
  projectSessionDir: string;
  userStateDir: string;
  legacyMacUserStateDir: string;
};

export function resolveSessionDir(options: SessionDirectoryOptions): string {
  if (options.override) return path.resolve(options.override);
  if (fs.existsSync(path.join(options.projectSessionDir, 'storageState.json'))) return options.projectSessionDir;
  if (options.platform === 'darwin' && fs.existsSync(path.join(options.legacyMacUserStateDir, 'storageState.json'))) {
    return options.legacyMacUserStateDir;
  }
  return options.userStateDir;
}
