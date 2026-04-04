import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'dist-dev/**', 'node_modules/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        observer: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off',
      'no-debugger': 'warn',
      'prefer-template': 'warn',
      'object-shorthand': 'warn',
      'quote-props': ['warn', 'as-needed'],
      'max-len': ['warn', { code: 120, ignoreUrls: true }],
      'max-lines': ['error', { max: 600 }],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      'no-duplicate-imports': 'error',
      'no-unused-imports': 'warn',
      'consistent-return': 'warn',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'default-case': 'warn',
      'default-case-last': 'error',
      'dot-notation': 'warn',
      'eqeqeq': ['error', 'always'],
      'no-else-return': 'warn',
      'no-eval': 'error',
      'no-implicit-coercion': 'warn',
      'no-lonely-if': 'warn',
      'no-multi-assign': 'warn',
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'warn',
      'one-var': ['error', 'never'],
      'operator-assignment': 'warn',
      'prefer-destructuring': 'warn',
      'prefer-spread': 'warn',
      'yoda': 'warn'
    }
  },
  eslintConfigPrettier
];
