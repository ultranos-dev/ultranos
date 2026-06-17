/**
 * Vitest global setup — runs before each test file in the Node worker.
 *
 * Problem: vi.mock factory functions that capture `require` at definition time
 * can call Node's CJS loader at render time (when mock components render inside
 * ReactTestRenderer.act()), bypassing vitest's resolve.alias mapping.
 * For packages that use Flow syntax (`import typeof …`), the real package
 * source cannot be parsed by Node, causing SyntaxError.
 *
 * Fix: pre-register the in-project mocks under the real resolved paths in
 * Node's require.cache so that the first native require() call returns the
 * mock instead of attempting to parse Flow-typed source.
 */

import path from 'path'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)

const MOCKS_DIR = path.resolve(__dirname, 'src/__mocks__')

const STUB_MAP: Record<string, string> = {
  'react-native': path.join(MOCKS_DIR, 'react-native.js'),
  'lucide-react-native': path.join(MOCKS_DIR, 'lucide-react-native.js'),
  'react-native-safe-area-context': path.join(MOCKS_DIR, 'react-native-safe-area-context.js'),
  'react-native-reanimated': path.join(MOCKS_DIR, 'react-native-reanimated.js'),
  'expo-haptics': path.join(MOCKS_DIR, 'expo-haptics.js'),
  'expo-image-picker': path.join(MOCKS_DIR, 'expo-image-picker.js'),
  'expo-router': path.join(MOCKS_DIR, 'expo-router.js'),
  'expo-secure-store': path.join(MOCKS_DIR, 'expo-secure-store.js'),
  'expo-crypto': path.join(MOCKS_DIR, 'expo-crypto.js'),
}

for (const [pkg, mockPath] of Object.entries(STUB_MAP)) {
  try {
    const realPath = req.resolve(pkg)
    if (!require.cache[realPath]) {
      // Load mock into Node's require cache under the real package path.
      // The descriptor below is intentionally minimal (parent:null, paths:[]) —
      // these stubs are never entry points, so the full Module shape isn't needed.
      const mockModule = req(mockPath)
      require.cache[realPath] = {
        id: realPath,
        filename: realPath,
        loaded: true,
        exports: mockModule,
        children: [],
        paths: [],
        parent: null,
        path: path.dirname(realPath),
        require: req,
      } as unknown as NodeJS.Module
    }
  } catch {
    // Package not installed or already cached — ignore
  }
}
