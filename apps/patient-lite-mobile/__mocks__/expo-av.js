/**
 * Manual mock for expo-av — used by ListenButton tests.
 * Story 24.2: TTS audio playback in Patient Lite Mobile.
 */
const mockSound = {
  unloadAsync: jest.fn().mockResolvedValue(undefined),
  pauseAsync: jest.fn().mockResolvedValue(undefined),
  playAsync: jest.fn().mockResolvedValue(undefined),
}

module.exports = {
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({ sound: mockSound }),
    },
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
}
