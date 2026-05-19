const store = {}
module.exports = {
  getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
  setItem: jest.fn((key, value) => { store[key] = value; return Promise.resolve(undefined) }),
  removeItem: jest.fn((key) => { delete store[key]; return Promise.resolve(undefined) }),
  clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); return Promise.resolve(undefined) }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map(k => [k, store[k] ?? null]))),
  multiSet: jest.fn((pairs) => { pairs.forEach(([k, v]) => { store[k] = v }); return Promise.resolve(undefined) }),
}
