import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

/**
 * The vendor console builds separately from the consumer app on purpose.
 *
 * scripts/assert-app-store-purity.mjs fails the App Store build if the word
 * "vendor", "provider" or "onboarding" appears anywhere in dist/, so the two
 * cannot share an output directory. Separate origins also keep the retired
 * consumer kill-switch in public/sw.js away from the vendor service worker,
 * and keep vendor cookies off bytspot.app.
 */
export default defineConfig(({ mode }) => ({
  root: 'vendor',
  plugins: [react()],
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      /**
       * The sign-in bypass is substituted at resolution time, not folded away
       * by the optimiser. Tree-shaking left the seeded businesses in the
       * production bundle even with the flag false, so the only build that can
       * contain a bypass is the one that explicitly asks for it.
       */
      '@vendor-demo': path.resolve(
        __dirname,
        mode === 'vendor-demo' ? './src/vendor/demoTransport.ts' : './src/vendor/demoTransport.stub.ts',
      ),
    },
  },
  server: {
    port: 5175,
    // The entry lives in src/vendor, one level above the vendor/ root.
    fs: { allow: [path.resolve(__dirname)] },
  },
  build: {
    target: 'esnext',
    outDir: path.resolve(__dirname, 'dist-vendor'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'framework-react';
        },
      },
    },
  },
}));
