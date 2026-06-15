const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Monorepo: Metro must read files across the workspace (pnpm symlinks into .pnpm/).
config.watchFolders = [workspaceRoot]

// Module resolution order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// --- Custom resolver ---
// Problem: pnpm hoists SDK 52 packages (expo-modules-core@2.2.3, expo-asset@11.0.5,
// react-native@0.76.9) into .pnpm/node_modules/. When Metro bundles files from .pnpm/
// and they do hierarchical directory-walking, they find these wrong versions.
//
// Fix: For ALL bare module imports originating from within .pnpm/, force resolution
// to start from the app's own node_modules (which has correct SDK 54 symlinks).
// Fall through to default resolution only if the package isn't in app's node_modules.
const appNodeModules = path.resolve(projectRoot, 'node_modules')
const uiKitDir = path.resolve(workspaceRoot, 'packages/ui-kit')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const uiKitExports = require(path.join(uiKitDir, 'package.json')).exports ?? {}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1. @ultranos/ui-kit subpath exports (Metro can't read package.json "exports")
  if (moduleName.startsWith('@ultranos/ui-kit/')) {
    const subpath = './' + moduleName.slice('@ultranos/ui-kit/'.length)
    const target = uiKitExports[subpath]
    if (typeof target === 'string') {
      return { filePath: path.resolve(uiKitDir, target), type: 'sourceFile' }
    }
  }

  // 2. For bare module imports from within .pnpm/, redirect resolution to app's node_modules
  if (
    !moduleName.startsWith('.') &&
    !moduleName.startsWith('/') &&
    !path.isAbsolute(moduleName) &&
    context.originModulePath &&
    context.originModulePath.includes('.pnpm')
  ) {
    // Check if this package exists in the app's node_modules
    const pkgName = moduleName.startsWith('@')
      ? moduleName.split('/').slice(0, 2).join('/')
      : moduleName.split('/')[0]
    const appPkgPath = path.join(appNodeModules, pkgName)

    if (fs.existsSync(appPkgPath)) {
      // Resolve from app's node_modules by changing the origin path
      const redirectedContext = Object.create(context, {
        originModulePath: {
          value: path.join(appNodeModules, '_virtual_resolve.js'),
        },
      })
      try {
        return context.resolveRequest(redirectedContext, moduleName, platform)
      } catch {
        // Fall through to default if this fails
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform)
}

// expo-sqlite web: allow .mjs and .wasm assets to be resolved and served
config.resolver.sourceExts.push('mjs')
config.resolver.assetExts.push('wasm')

module.exports = config
