import { defineConfig } from 'vitest/config';

// ビルドごとの番号。dist/version.json にも書き出し、開いたままの古い画面が新しい版に気づけるようにする
const BUILD_ID = String(Date.now());

export default defineConfig({
  // 相対パスでビルドする（Firebase Hosting / GitHub Pages の両方で動かすため）
  base: './',
  // ビルドした日を版として埋め込む（アンケートで、どの版で遊んだかを記録する）
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [{
    name: 'version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  }],
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
