
// Add new type for orders
export interface EngineOrder {
    orderId: string;
    clientOrderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderType: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_MARKET' | 'TAKE_PROFIT' | 'TAKE_PROFIT_MARKET' | 'TRAILING_STOP_MARKET';
    status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'EXPIRED' | 'REJECTED' | 'PENDING_CANCEL';
    price: number;
    originalQuantity: number;
    executedQuantity: number;
    averagePrice: number;
    timestampMs: number;
    updateTimeMs: number;
    reduceOnly?: boolean;
  }