import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  target: 'node20',
  clean: true,
  dts: false,
  minify: false,
  sourcemap: false,
  splitting: false,
  noExternal: [
    '@actions/core',
    '@actions/github',
    'js-yaml',
    '@octokit/rest'
  ],
  onSuccess: 'cp src/configure-environment.sh dist/'
});
