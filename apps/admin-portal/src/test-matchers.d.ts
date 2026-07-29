// Augments Vitest's Assertion interface with the jest-axe `toHaveNoViolations`
// matcher (registered at runtime via `expect.extend(toHaveNoViolations)`).
// jest-axe ships type augmentations for Jest's matchers, not Vitest's.
import 'vitest'

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R
}

declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
}
