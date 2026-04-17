import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron, { startup } from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: { build: { outDir: 'dist-electron', sourcemap: true } },
        onstart() {
          startup();
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: { build: { outDir: 'dist-electron', sourcemap: true } },
      },
    ]),
    renderer(),
  ],
});
