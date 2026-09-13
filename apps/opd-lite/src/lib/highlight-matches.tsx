// Thin re-export proxy — the shared implementation lives in ui-kit so every app
// highlights search matches identically. See packages/ui-kit/src/lib/highlight.tsx.
export { highlightMatches, getMatchIndices, highlightQuery } from '@ultranos/ui-kit/lib/highlight'
