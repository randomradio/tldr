import { stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

async function main() {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  try { await stat('dist'); } catch { throw new Error('No dist directory. Run pnpm build first.'); }
  const name = `tldr-v${pkg.version}.zip`;
  execSync(`cd dist && zip -r ../${name} . -x '*.map'`, { stdio: 'inherit' });
  console.log('Created', name);
}

main().catch((e) => { console.error(e); process.exit(1); });

