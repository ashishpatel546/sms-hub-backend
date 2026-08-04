// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      // The `no-unsafe-*` family fires on the standard Nest `@Request() req: any`
      // and on decoded JWT payloads, which are `any` by construction. Kept as a
      // warning where it can still catch something, off where it only ever
      // reports that pattern. Mirrors sms-backend so the two services lint alike.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Formatting itself is configured in .prettierrc, which this plugin
      // reads — including `endOfLine: "auto"`, without which every line in the
      // repo reports `Delete ␍` (the repos are cloned on Windows with
      // `core.autocrlf=true`, so files land CRLF while Prettier defaults to LF).
      // Keeping it there rather than here means `npm run format` agrees with
      // `npm run lint` instead of rewriting every line ending.
    },
  },
);
