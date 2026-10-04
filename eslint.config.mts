/// <reference types="node" />
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.mts',
						'vitest.config.ts',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// moment is what Obsidian ships and its API exposes (obsidian.d.ts); the test
		// stand-in for the obsidian module uses the real one
		files: ['package.json'],
		rules: { 'depend/ban-dependencies': ['error', { allowed: ['moment'] }] },
	},
	{
		// Tests and their config run in Node, not inside Obsidian, so the rules that
		// protect plugin runtime code (mobile, popout windows, bundled moment) don't apply
		files: ['tests/**/*.ts', 'vitest.config.ts'],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			'obsidianmd/prefer-window-timers': 'off',
			'obsidianmd/prefer-create-el': 'off',
			'@typescript-eslint/no-restricted-imports': 'off',
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"scripts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
