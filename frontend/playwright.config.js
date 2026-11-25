// Browser suite. Run from frontend/:   npm run test:e2e
//
// It builds the app, boots Laravel on a throwaway SQLite database (e2e/backend.sh),
// serves the build with `vite preview` (which proxies /api like `npm run dev`),
// registers one hunter, and drives real Chromium.
//
// First time on a new machine:  npx playwright install chromium
// To use a Chromium that is already installed instead, set PW_CHROMIUM_PATH.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // one backend, one database: run in order
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: 'http://localhost:4173',
    storageState: './e2e/.auth/hunter.json',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      // Headless Chromium has no GPU; SwiftShader gives it a software WebGL.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'sh e2e/backend.sh',
      url: 'http://127.0.0.1:8000/up',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
})
