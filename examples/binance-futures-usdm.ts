import {
    DefaultLogger,
    isWsFormattedFuturesUserDataAccountUpdate,
    isWsFormattedFuturesUserDataEvent,
    isWsFormattedFuturesUserDataTradeUpdateEvent,
    USDMClient,
    WebsocketClient,
    WsMessageFuturesUserDataAccountUpdateFormatted,
    WsMessageFuturesUserDataTradeUpdateEventFormatted
} from 'binance';
import 'dotenv/config';
import {
    AccountStateStore,
} from '../src/AccountStateStore.js';
import { EngineOrder } from '../src/lib/types/order.js';
import {
    EngineSimplePosition,
} from '../src/lib/types/position.js';
const key = process.env.BINANCE_API_KEY || 'wGI6w4SGP0N8MGY71Lw7a5HTYmFc2LKjTbjf7cnfoW19vsuWJZfYogcOWxGfDpDN';
const secret = process.env.BINANCE_API_SECRET || 'XFmgwlw7iI6BNoENdGinpoaa4TFYk2Wn2gyX9mKfzxVgM4tAeV4lSxnRADDsKsyb';

if (!key || !secret) {
  console.error('API key and secret are required. Set BINANCE_API_KEY and BINANCE_API_SECRET environment variables.');
  process.exit(1);
}

// Create REST client
const restClient = new USDMClient({
  api_key: key,
  api_secret: secret,
  beautifyResponses: true,
});

// Create account state store
const state = new AccountStateStore();

// Configure logger
const logger = {
  ...DefaultLogger,
  silly: (msg:any, context: any) => {
    // Uncomment to see more detailed logs
    // console.log(JSON.stringify({ msg, context }));
  },
};

// Create WebSocket client
const wsClient = new WebsocketClient(
  {
    api_key: key,
    api_secret: secret,
    beautify: true,
  },
  logger
);

/**
 * Syncs the account state by fetching positions and orders from REST API
 */
async function syncPositionsFromREST() {
  try {
    console.log(new Date(), 'Syncing positions and orders from REST API...');
    
    // Clear existing positions and orders from state
    state.getAllPositions().forEach(pos => {
      state.deleteActivePosition(pos.symbol, pos.positionSide);
    });
    state.clearOrders();
    
    // Fetch account information to get balance
    const accountInfo = await restClient.getAccountInformationV3();
    
    if (accountInfo && accountInfo.totalWalletBalance) {
      state.setWalletBalance(Number(accountInfo.totalWalletBalance));
      console.log(new Date(), `Updated wallet balance: ${accountInfo.totalWalletBalance} USDT`);
    }
    
    // Fetch all positions
    const positions = await restClient.getPositionsV3();
    
    // Filter active positions (non-zero position amount)
    const activePositions = positions.filter(pos => Number(pos.positionAmt) !== 0);
    
    // Update state with active positions
    activePositions.forEach(pos => {
      // Handle BOTH position side (convert to LONG or SHORT based on amount)
      const positionSide = pos.positionSide === 'BOTH' 
        ? (Number(pos.positionAmt) > 0 ? 'LONG' : 'SHORT')
        : pos.positionSide;
      
      const enginePos: EngineSimplePosition = {
        symbol: pos.symbol,
        timestampMs: Date.now(),
        positionSide: positionSide,
        orderPositionSide: positionSide,
        positionPrice: Number(pos.entryPrice),
        assetQty: Number(pos.positionAmt),
        value: Number(pos.positionAmt) * Number(pos.entryPrice),
        valueUpnl: Number(pos.unRealizedProfit),
        liquidationPrice: Number(pos.liquidationPrice || 0),
        stopLossPrice: undefined,
        takeProfitPrice: undefined,
        marginValue: (Number(pos.positionAmt) * Number(pos.entryPrice)),
      };
      
      state.setActivePosition(pos.symbol, positionSide, enginePos);
      console.log(new Date(), `Position updated for ${pos.symbol} ${positionSide}: ${pos.positionAmt} @ ${pos.entryPrice} (UPNL: ${pos.unRealizedProfit})`);
    });

    // Fetch all open orders
    const openOrders = await restClient.getAllOpenOrders();
    
    // Update state with open orders
    openOrders.forEach(order => {
      const engineOrder: EngineOrder = {
        orderId: order.orderId.toString(),
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        orderType: order.type,
        status: order.status,
        price: Number(order.price),
        originalQuantity: Number(order.origQty),
        executedQuantity: Number(order.executedQty),
        averagePrice: Number(order.avgPrice),
        timestampMs: Number(order.time),
        updateTimeMs: Number(order.updateTime),
        reduceOnly: order.reduceOnly,
      };
      
      state.setOrder(engineOrder);
      console.log(new Date(), `Order synced: ${order.symbol} ${order.side} ${order.type} ${order.status}`);
    });
    
    // Summary of active positions and orders
    const activePositionCount = state.getTotalActivePositions();
    const activeOrders = state.getActiveOrders();
    console.log(new Date(), `Sync complete. Positions: ${activePositionCount.total}, Active Orders: ${activeOrders.length}`);
    
    return true;
  } catch (error) {
    console.error(new Date(), 'Error syncing from REST API:', error);
    return false;
  }
}

/**
 * Extract trading fee tier information (optional example of additional data fetching)
 */
async function fetchAndStoreFeeTiers() {
  try {
    const feeTiers = await restClient.getIncomeHistory({
      incomeType: 'COMMISSION',
      limit: 100,
    });
    
    // Process fee data or store in custom metadata if needed
    console.log(new Date(), `Fetched ${feeTiers.length} commission records`);
    
    return feeTiers;
  } catch (error) {
    console.error(new Date(), 'Error fetching fee tiers:', error);
    return [];
  }
}

/**
 * Main function to start the application
 */
async function main() {
  console.log(new Date(), 'Starting Binance USDM Futures position tracking...');
  
  // Initial sync from REST API
  await syncPositionsFromREST();
  
  // Setup WebSocket event handlers
  wsClient.on('open', (data) => {
    console.log(new Date(), `WebSocket connection opened: ${data.wsKey}`);
  });
  
  wsClient.on('formattedMessage', (data) => {
    if (isWsFormattedFuturesUserDataEvent(data)) {
      // Handle different types of user data events
      if (isWsFormattedFuturesUserDataAccountUpdate(data)) {
        handleAccountUpdate(data);
      } else if (isWsFormattedFuturesUserDataTradeUpdateEvent(data)) {
        handleOrderUpdate(data);
      } else {
        console.log(new Date(), 'Other user data event:', data.eventType);
      }
    }
  });
  
  wsClient.on('reconnecting', (data) => {
    console.log(new Date(), `WebSocket reconnecting: ${data?.wsKey}`);
  });
  
  wsClient.on('reconnected', async (data) => {
    console.log(new Date(), `WebSocket reconnected: ${data?.wsKey}`);
    
    // After reconnection, re-sync state from REST API to ensure it's up to date
    if (data?.wsKey && data?.wsKey.includes('userData')) {
      console.log(new Date(), 'Re-syncing position state after reconnection...');
      await syncPositionsFromREST();
    }
  });
  
  wsClient.on('error', (error) => {
    console.error(new Date(), 'WebSocket error:', error);
  });
  
  // Subscribe to user data stream
  console.log(new Date(), 'Subscribing to USDM user data stream...');
  wsClient.subscribeUsdFuturesUserDataStream();
  
  // Setup periodic sync (as a backup to ensure state consistency)
  const syncIntervalMinutes = 10;
  console.log(new Date(), `Setting up periodic sync every ${syncIntervalMinutes} minutes`);
  setInterval(syncPositionsFromREST, syncIntervalMinutes * 60 * 1000);
}

/**
 * Handle account update events from WebSocket
 */
function handleAccountUpdate(data: WsMessageFuturesUserDataAccountUpdateFormatted ) {
  const { updateData } = data;
  
  // Update balance if available
  if (updateData.updatedBalances && updateData.updatedBalances.length > 0) {
    const usdtBalance = updateData.updatedBalances.find(b => b.asset === 'USDT');
    if (usdtBalance) {
      state.setWalletBalance(Number(usdtBalance.walletBalance));
      console.log(new Date(), `Updated wallet balance from WS: ${usdtBalance.walletBalance} USDT`);
    }
  }
  
  // Update positions
  if (updateData.updatedPositions && updateData.updatedPositions.length > 0) {
    updateData.updatedPositions.forEach(pos => {
      // Handle position close
      if (pos.positionAmount === 0) {
        // Normalize position side (BOTH to LONG/SHORT)
        const positionSide = pos.positionSide === 'BOTH'
          ? (pos.positionAmount > 0 ? 'LONG' : 'SHORT')
          : pos.positionSide;
          
        state.deleteActivePosition(pos.symbol, positionSide);
        console.log(new Date(), `Position closed for ${pos.symbol} ${positionSide}`);
        return;
      }
      
      // Handle position update
      const positionSide = pos.positionSide === 'BOTH'
        ? (pos.positionAmount > 0 ? 'LONG' : 'SHORT')
        : pos.positionSide;
      
      const enginePos: EngineSimplePosition = {
        symbol: pos.symbol,
        timestampMs: data.transactionTime,
        positionSide: positionSide,
        orderPositionSide: positionSide,
        positionPrice: pos.entryPrice,
        assetQty: pos.positionAmount,
        value: pos.positionAmount * pos.entryPrice,
        valueUpnl: pos.unrealisedPnl,
        liquidationPrice: 0, // Not provided in WS events
        stopLossPrice: undefined,
        takeProfitPrice: undefined,
        marginValue: (pos.positionAmount * pos.entryPrice) / 20, // Assuming 20x leverage as default
      };
      
      state.setActivePosition(pos.symbol, positionSide, enginePos);
      console.log(new Date(), `Position updated from WS for ${pos.symbol} ${positionSide}: ${pos.positionAmount} @ ${pos.entryPrice} (UPNL: ${pos.unrealisedPnl})`);
    });
  }
}

/**
 * Handle order update events from WebSocket
 */
function handleOrderUpdate(data: WsMessageFuturesUserDataTradeUpdateEventFormatted) {
  const { order } = data;
  
  console.log(
    new Date(),
    `Order update: ${order.symbol} ${order.orderSide} ${order.orderType} ${order.orderStatus} - Qty: ${order.originalQuantity}, Price: ${order.averagePrice}`
  );
  
  // Update order in state
  const engineOrder: EngineOrder = {
    orderId: order.orderId.toString(),
    clientOrderId: order.clientOrderId,
    symbol: order.symbol,
    side: order.orderSide,
    orderType: order.orderType,
    status: order.orderStatus,
    price: Number(order.originalPrice),
    originalQuantity: Number(order.originalQuantity),
    executedQuantity: Number(order.lastFilledQuantity),
    averagePrice: Number(order.averagePrice),
    timestampMs: Number(order.orderTradeTime),
    updateTimeMs: Date.now(),
    reduceOnly: order.isReduceOnly,
  };
  
  state.setOrder(engineOrder);
  
  // If order is filled or canceled, we could trigger additional logic here
  if (order.orderStatus === 'FILLED') {
    console.log(new Date(), `Order ${order.orderId} fully filled: ${order.symbol} ${order.orderSide} QTY: ${order.originalQuantity} PRICE: ${order.averagePrice}`);
  } else if (order.orderStatus === 'CANCELED') {
    console.log(new Date(), `Order ${order.orderId} canceled: ${order.symbol} ${order.orderSide}`);
    state.deleteOrder(order.orderId.toString());
  }
}

/**
 * Print account state summary
 */
function printAccountSummary() {
  const summary = state.getSessionSummary(0);
  const activeOrders = state.getOrdersSortedByPrice();
  
  console.log('\n=== Account Summary ===');
  console.log(`Wallet Balance: ${state.getWalletBalance()} USDT`);
  console.log(`Total Positions: ${state.getTotalActivePositions().total}`);
  console.log(`Unrealized PNL: ${summary.activePositionUpnlSum.toFixed(2)} USDT`);
  console.log(`Active Orders: ${activeOrders.length}`);
  
  if (summary.activePositions.length > 0) {
    console.log('\nActive Positions:');
    summary.activePositions.forEach(pos => {
      console.log(`${pos.symbol} ${pos.positionSide}: ${pos.assetQty} @ ${pos.positionPrice} (UPNL: ${pos.valueUpnl.toFixed(2)})`);
    });
  }
  
  if (activeOrders.length > 0) {
    console.log('\nActive Orders:');
    activeOrders.forEach(order => {
      console.log(`${order.symbol} ${order.side} ${order.orderType} ${order.status} - Qty: ${order.originalQuantity-order.executedQuantity}, Price: ${order.price}`);
    });
  }
  
  console.log('======================\n');
}

// Command to print summary when requested
process.on('SIGINT', () => {
  printAccountSummary();
  process.exit();
});

// Start the application
main().catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});
