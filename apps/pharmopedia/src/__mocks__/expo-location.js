module.exports = {
  requestForegroundPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  getForegroundPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 34.5, longitude: 69.2 } }),
  Accuracy: { Balanced: 3, High: 4 },
}
