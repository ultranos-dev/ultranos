module.exports = {
  default: {
    isJailBroken: jest.fn().mockReturnValue(false),
    canMockLocation: jest.fn().mockReturnValue(false),
    isDebuggedMode: jest.fn().mockReturnValue(false),
    isOnExternalStorage: jest.fn().mockReturnValue(false),
  },
}
