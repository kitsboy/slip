import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Same build identity the production bundle gets, so tests exercise real strings.
  define: {
    __SLIP_VERSION__: JSON.stringify(pkg.version),
    __SLIP_COMMIT__: JSON.stringify('test'),
    __SLIP_BUILT__: JSON.stringify('test'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: { include: ['src/core/**', 'src/adapters/**'] },
  },
});
