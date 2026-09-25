import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相対パスでビルドする（Firebase Hosting / GitHub Pages の両方で動かすため）
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    host: true, // 同じ Wi-Fi のスマホから開発サーバーを開けるようにする
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.emu.test.ts'],
        },
      },
      {
        // ローカルのエミュレーターが必要なテスト（npm run test:emu）
        extends: true,
        test: {
          name: 'emu',
          include: ['src/**/*.emu.test.ts'],
          testTimeout: 20000,
          fileParallelism: false,
        },
      },
    ],
  },
});
