module.exports = {
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  requestCameraPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///mock/photo.jpg' }] }),
  launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///mock/photo.jpg' }] }),
}
