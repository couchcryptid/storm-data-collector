// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default defineConfig(
  eslint.configs.recommended,
  eslintPrettierRecommended
);
