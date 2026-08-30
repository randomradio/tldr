import { build, context } from 'esbuild';
import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  target: ['chrome114'],
  platform: 'browser',
  logLevel: 'info'
};

const appBuild = {
  ...shared,
  entryPoints: [
    'src/background/index.ts',
    'src/ui/options.ts',
    'src/content/extract.ts'
  ],
  outdir: 'dist',
  outbase: 'src',
  format: 'esm'
};

const extraBuilds = [
  {
    ...shared,
    entryPoints: ['src/content/readability-global.ts'],
    outfile: 'dist/readability.js',
    format: 'iife'
  },
  {
    ...shared,
    entryPoints: ['src/content/toast.ts'],
    outfile: 'dist/content/toast.js',
    format: 'iife'
  }
];

async function syncManifestVersion() {
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

async function copyStatic() {
  await cp('static', 'dist', { recursive: true });
  await syncManifestVersion();
}

async function main() {
  if (existsSync('dist')) await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });
  await copyStatic();

  if (watch) {
    for (const opts of [appBuild, ...extraBuilds]) {
      const ctx = await context(opts);
      await ctx.watch();
    }
    console.log('Watching for changes…');
    return;
  }

  await build(appBuild);
  for (const opts of extraBuilds) await build(opts);
}

main().catch((e) => { console.error(e); process.exit(1); });
