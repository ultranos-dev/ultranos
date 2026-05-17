module.exports = {
  fetch: jest.fn().mockResolvedValue({
    status: 200,
    headers: {},
    bodyString: '{}',
  }),
}
