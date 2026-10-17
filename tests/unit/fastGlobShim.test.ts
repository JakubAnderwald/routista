// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

// shims/fast-glob replaces fast-glob for @next/eslint-plugin-next to keep the
// unpatched `braces` advisory out of the tree. See docs/technical/DEV_SETUP.md.
const repoRoot = path.resolve(__dirname, '../..');
const pluginRequire = createRequire(
    require.resolve('@next/eslint-plugin-next/dist/utils/get-root-dirs.js')
);

type GlobSync = (pattern: string, options: { onlyDirectories: boolean }) => string[];
const { globSync } = pluginRequire('fast-glob') as { globSync: GlobSync };
const { getRootDirs } = pluginRequire('../../dist/utils/get-root-dirs.js') as {
    getRootDirs: (context: { cwd: string; settings: Record<string, unknown> }) => string[];
};

const inRepo = (pattern: string) => {
    const cwd = process.cwd();
    process.chdir(repoRoot);
    try {
        return globSync(pattern, { onlyDirectories: true });
    } finally {
        process.chdir(cwd);
    }
};

describe('fast-glob shim', () => {
    it('is what @next/eslint-plugin-next loads', () => {
        expect(pluginRequire.resolve('fast-glob')).toBe(
            path.join(repoRoot, 'shims/fast-glob/index.js')
        );
    });

    // tinyglobby's default would return every directory under src.
    it('matches a literal directory without expanding it, like fast-glob', () => {
        expect(inRepo('src')).toEqual(['src/']);
        expect(inRepo('.')).toEqual(['.']);
    });

    it('still expands wildcards', () => {
        expect(inRepo('src/*')).toEqual(expect.arrayContaining(['src/app/', 'src/lib/']));
    });

    it('keeps the plugin default of the cwd when rootDir is unset', () => {
        expect(getRootDirs({ cwd: repoRoot, settings: {} })).toEqual([repoRoot]);
    });
});
