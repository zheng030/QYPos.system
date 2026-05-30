import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/QYPos.system/' : '/',
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  },
  resolve: {
    alias: [
      {
        find: /^@\/shared\/auth-gate\.impl$/,
        replacement: path.resolve(
          __dirname,
          command === 'build' ? 'src/shared/auth-gate.impl.prod.ts' : 'src/shared/auth-gate.impl.dev.ts'
        ),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, 'src'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
