module.exports = {
  initConnection: jest.fn().mockResolvedValue(true),
  endConnection: jest.fn().mockResolvedValue(undefined),
  getSubscriptions: jest.fn().mockResolvedValue([]),
  requestSubscription: jest.fn().mockResolvedValue({}),
  getAvailablePurchases: jest.fn().mockResolvedValue([]),
  finishTransaction: jest.fn().mockResolvedValue(undefined),
  purchaseUpdatedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  purchaseErrorListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  flushFailedPurchasesCachedAsPendingAndroid: jest.fn().mockResolvedValue(undefined),
}
