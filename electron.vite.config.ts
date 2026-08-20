import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Include shared TS files in the main bundle
        external: [],
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        // Allow relative path imports from main into shared
        '../../shared': resolve('src/shared'),
        '../../../shared': resolve('src/shared'),
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '../../shared': resolve('src/shared'),
        '../../../shared': resolve('src/shared'),
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '../../../../shared': resolve('src/shared'),
        '../../../shared': resolve('src/shared'),
      }
    }
  }
})
