import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  target: 'node20',
  clean: true,
  dts: true,
  minify: false,
  sourcemap: false,
  splitting: false,
  bundle: true,
  noExternal: [
    '@actions/core',
    '@actions/github',
    'js-yaml',
    '@octokit/rest'
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.platform = 'node';
  },
  outExtension() {
    return {
      js: '.js'
    }
  },
  onSuccess: 'cp src/configure-environment.sh dist/'
});
