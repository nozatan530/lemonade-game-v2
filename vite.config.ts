import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスでビルドする（Firebase Hosting / GitHub Pages の両方で動かすため）
  base: './',
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
