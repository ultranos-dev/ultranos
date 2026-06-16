const store = new Map()
module.exports = {
  getItemAsync: async (key) => store.get(key) ?? null,
  setItemAsync: async (key, value) => { store.set(key, value) },
  deleteItemAsync: async (key) => { store.delete(key) },
  isAvailableAsync: async () => true,
}
