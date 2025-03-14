// @ts-check

import nextEslintPlugin from 'eslint-plugin-next';
import nextConfig from 'eslint-config-next';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    plugins: {
      next: nextEslintPlugin
    },
    extends: [nextConfig],
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '__tests__/**',
      'jest.setup.ts',
      'jest.config.ts',
      'app/components/VoiceAssistant.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'warn'
    }
  }
]; 