import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bundle tests run against .output. Fail loudly when it is missing or built from older sources,
 * instead of passing or failing for the wrong version.
 */
export function requireFreshBuild(): void {
  const manifestPath = '.output/chrome-mv3/manifest.json';
  if (!existsSync(manifestPath)) throw new Error('No build found. Run `npm run build` before the bundle tests.');
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const built = JSON.parse(readFileSync(manifestPath, 'utf8')).version;
  if (built !== version) throw new Error(`The build is version ${built} but the source is ${version}. Run \`npm run build\`.`);
  const builtAt = statSync(manifestPath).mtimeMs;
  const newest = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const path = join(dir, entry.name);
    return Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }, 0);
  const changed = Math.max(newest('src'), newest('entrypoints'));
  if (changed > builtAt) throw new Error('Source files changed after the last build. Run `npm run build`.');
}
