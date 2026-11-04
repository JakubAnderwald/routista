import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 declares `Matchers<R, T>`, the base of both `Assertion<R, T>` (`expect(x)`) and
// `AsymmetricMatchersContaining`. Augmenting it once covers both. The pre-5 augmentation of a
// one-parameter `Assertion<T>` is an invalid merge under Vitest 5 (TS2428) that compiles
// only because `skipLibCheck` skips `.d.ts` files.
declare module 'vitest' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends TestingLibraryMatchers<any, R> {}
}
