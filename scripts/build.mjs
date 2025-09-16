import { build, context } from 'esbuild';
import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');

async function main() {
  if (existsSync('dist')) await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });

  const opts = {
    entryPoints: [
      'src/background/index.ts',
      'src/ui/options.ts',
      'src/content/extract.ts'
    ],
    outdir: 'dist',
    outbase: 'src',
    bundle: true,
    sourcemap: true,
    format: 'esm',
    target: ['chrome114'],
    platform: 'browser',
    logLevel: 'info'
  };

  if (watch) {
    const ctx = await context(opts);
    await ctx.watch();
    console.log('Watching for changes…');
  } else {
    await build(opts);
  }

  // Copy static files
  await cp('static', 'dist', { recursive: true });

  // Sync manifest version with package.json
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const manifestPath = 'dist/manifest.json';
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    manifest.version = pkg.version;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.warn('Could not sync manifest version:', e);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
