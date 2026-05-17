// Manual mock for @react-native-community/netinfo
module.exports = {
  addEventListener: jest.fn().mockReturnValue(jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  __esModule: true,
  default: {
    addEventListener: jest.fn().mockReturnValue(jest.fn()),
    fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}
