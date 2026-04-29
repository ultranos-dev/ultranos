/**
 * Custom Jest resolver to handle TypeScript's NodeNext convention
 * where imports use `.js` extensions but the actual files are `.ts`/`.tsx`.
 */
module.exports = (request, options) => {
  // Try default resolution first
  try {
    return options.defaultResolver(request, options)
  } catch {
    // If .js resolution fails, try .ts/.tsx
    if (request.endsWith('.js')) {
      const tsRequest = request.replace(/\.js$/, '.ts')
      try {
        return options.defaultResolver(tsRequest, options)
      } catch {
        const tsxRequest = request.replace(/\.js$/, '.tsx')
        return options.defaultResolver(tsxRequest, options)
      }
    }
    throw new Error(`Cannot resolve module: ${request}`)
  }
}
