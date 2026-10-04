import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The real `obsidian` module only exists inside the app
    alias: { obsidian: fileURLToPath(new URL('./tests/stubs/obsidian.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Logic tests run in plain Node; rendering tests opt into happy-dom per file
    environment: 'node',
  },
});
