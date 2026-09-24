export {
  UnknownKeyVersionError,
  deriveSessionKey,
  deriveKeyForVersion,
  generateSessionKey,
  encryptPayload,
  decryptPayload,
  exportKey,
  importKey,
  // Story 61.2 — KDF vNext (dual-wrapped DEK)
  KEY_SCHEME_VERSION,
  deriveWrappingKeyFromServerSecret,
  deriveWrappingKeyFromPin,
  generateDek,
  wrapDek,
  unwrapDek,
  dualWrapDek,
  unwrapDekWithServerSecret,
  unwrapDekWithPin,
  DekUnwrapError,
  type WrappedDekBundle,
} from './browser-crypto.js'

export {
  verifyWithKrl,
  type KrlChecker,
  type KrlCheckResult,
  type VerifyWithKrlOptions,
  type VerifyWithKrlResult,
} from './verify-with-krl.js'

export {
  generateEcdsaKeyPair,
  signWithEcdsa,
  verifyEcdsaSignature,
  verifyIdentityQrPayload,
  canonicalJsonStringify,
  type EcdsaKeyPair,
  type VerifyIdentityQrOptions,
} from './ecdsa.js'
