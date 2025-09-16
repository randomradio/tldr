import { build, context } from 'esbuild';
import { mkdir, cp, rm } from 'node:fs/promises';
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
}

main().catch((e) => { console.error(e); process.exit(1); });
