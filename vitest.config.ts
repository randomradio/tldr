import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@common': `${srcPath}/common`,
      '@background': `${srcPath}/background`,
      '@ui': `${srcPath}/ui`
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
