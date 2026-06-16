module.exports = {
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}
