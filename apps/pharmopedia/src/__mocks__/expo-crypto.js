let counter = 1
module.exports = {
  getRandomBytes: (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (counter + i) % 256; counter++; return a },
  getRandomBytesAsync: async (n) => module.exports.getRandomBytes(n),
}
