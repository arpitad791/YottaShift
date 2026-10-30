import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'data/**', 'client/dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Generated data must be reproducible from the fixed seed.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG in src/lib/rng.js so output stays reproducible.',
        },
      ],
    },
  },
];
