# Typescript Account State Store for Trading Applications

[![Build & Test](https://github.com/tiagosiebler/accountstate/actions/workflows/test.yml/badge.svg)](https://github.com/tiagosiebler/accountstate/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/accountstate)][1]
[![npm size](https://img.shields.io/bundlephobia/min/accountstate/latest)][1]
[![npm downloads](https://img.shields.io/npm/dt/accountstate)][1]
[![last commit](https://img.shields.io/github/last-commit/tiagosiebler/accountstate)][1]
[![Telegram](https://img.shields.io/badge/chat-on%20telegram-blue.svg)](https://t.me/nodetraders)

[1]: https://www.npmjs.com/package/accountstate

A TypeScript utility class for managing cryptocurrency exchange account state in-memory. Designed for trading bots, portfolio trackers, and any application that needs to maintain real-time account state across positions, orders, and balances.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Best Practices](#best-practices)
- [Quick Start](#quick-start)
- [Core API](#core-api)
  - [Balance Management](#balance-management)
  - [Position Management](#position-management)
  - [Order Management](#order-management)
  - [Leverage Management](#leverage-management)
  - [Price Updates & P&L](#price-updates--pl)
- [Custom Metadata](#custom-metadata)
- [Persistence](#persistence)
- [Running Examples](#running-examples)
- [Contributing](#contributing)



<!-- template_related_projects -->

## Related projects

Check out my related JavaScript/TypeScript/Node.js projects:

- Try my REST API & WebSocket SDKs:
  - [Bybit-api Node.js SDK](https://www.npmjs.com/package/bybit-api)
  - [Okx-api Node.js SDK](https://www.npmjs.com/package/okx-api)
  - [Binance Node.js SDK](https://www.npmjs.com/package/binance)
  - [Gateio-api Node.js SDK](https://www.npmjs.com/package/gateio-api)
  - [Bitget-api Node.js SDK](https://www.npmjs.com/package/bitget-api)
  - [Kucoin-api Node.js SDK](https://www.npmjs.com/package/kucoin-api)
  - [Coinbase-api Node.js SDK](https://www.npmjs.com/package/coinbase-api)
  - [Bitmart-api Node.js SDK](https://www.npmjs.com/package/bitmart-api)
- Try my misc utilities:
  - [OrderBooks Node.js](https://www.npmjs.com/package/orderbooks)
  - [Crypto Exchange Account State Cache](https://www.npmjs.com/package/accountstate)
- Check out my examples:
  - [awesome-crypto-examples Node.js](https://github.com/tiagosiebler/awesome-crypto-examples)
  <!-- template_related_projects_end -->

## Features

- **Account Balance Tracking** - Monitor wallet balance changes
- **Position Management** - Track long/short positions with real-time P&L
- **Order State Management** - Monitor active, filled, and cancelled orders
- **Symbol-based Organization** - Organize data by trading pairs
- **Custom Metadata Storage** - Store custom data per symbol/position
- **Exchange Agnostic** - Works with any exchange (Binance, Bybit, etc.)
- **Persistence Ready** - Built-in persistence hooks for custom storage
- **TypeScript Support** - Full type safety with generics

## Installation

```bash
npm install accountstate
# or
yarn add accountstate
```

## Best Practices

1. **Initial Sync**: Always sync from REST API before starting WebSocket streams
2. **Reconnection Handling**: Re-sync state after WebSocket reconnections
3. **Error Handling**: Implement proper error handling for API calls
4. **Persistence**: Use persistence for custom metadata that can't be restored
5. **Performance**: Use the built-in filtering and sorting methods for efficiency
6. **Type Safety**: Define custom metadata interfaces for better type safety

## Quick Start

```typescript
import { AccountStateStore } from 'accountstate';

// Create a new account state store
const accountState = new AccountStateStore();

// Set wallet balance
accountState.setWalletBalance(10000);

// Track a position
accountState.setActivePosition('BTCUSDT', 'LONG', {
  symbol: 'BTCUSDT',
  timestampMs: Date.now(),
  positionSide: 'LONG',
  orderPositionSide: 'LONG',
  positionPrice: 45000,
  assetQty: 0.1,
  value: 4500,
  valueUpnl: 0,
  liquidationPrice: 40000,
  marginValue: 4500,
});

// Track an order
accountState.upsertActiveOrder({
  exchangeOrderId: '12345',
  customOrderId: 'my-order-1',
  symbol: 'BTCUSDT',
  orderSide: 'BUY',
  orderType: 'LIMIT',
  positionSide: 'LONG',
  status: 'NEW',
  price: 44000,
  originalQuantity: 0.05,
  executedQuantity: 0,
  averagePrice: 0,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  isreduceOnly: false,
});

// Get account summary
const summary = accountState.getSessionSummary(10000);
console.log('Account Summary:', summary);
```

Or, check examples in the [./examples](./examples) folder.

## Core API

### Balance Management

```typescript
// Set and get wallet balance
accountState.setWalletBalance(10000);
const balance = accountState.getWalletBalance(); // 10000

// Track balance changes
accountState.storePreviousBalance();
accountState.setWalletBalance(10500);
const previousBalance = accountState.getPreviousBalance(); // 10000
```

### Position Management

```typescript
// Check if symbol has any position
const hasPosition = accountState.isSymbolInAnyPosition('BTCUSDT');

// Check specific side position
const hasLongPosition = accountState.isSymbolSideInPosition('BTCUSDT', 'LONG');

// Get specific position
const longPosition = accountState.getActivePosition('BTCUSDT', 'LONG');

// Get all positions
const allPositions = accountState.getAllPositions();

// Get position counts
const { total, totalHedged } = accountState.getTotalActivePositions();

// Delete a position
accountState.deleteActivePosition('BTCUSDT', 'LONG');
```

### Order Management

```typescript
// Get all orders
const allOrders = accountState.getOrders();

// Get active orders only
const activeOrders = accountState.getActiveOrders();

// Get orders for specific symbol
const btcOrders = accountState.getOrdersForSymbol('BTCUSDT');

// Get orders for symbol and side
const btcBuyOrders = accountState.getOrdersForSymbolSide('BTCUSDT', 'BUY');

// Get specific order
const order = accountState.getOrder('12345');

// Get orders by status
const newOrders = accountState.getOrdersByStatus('NEW');

// Get orders sorted by price
const ordersByPrice = accountState.getOrdersSortedByPrice(true); // ascending

// Clear all orders
accountState.clearAllOrders();
```

### Leverage Management

```typescript
// Set symbol leverage
accountState.setSymbolLeverage('BTCUSDT', 10);

// Get symbol leverage
const leverage = accountState.getSymbolLeverage('BTCUSDT'); // 10

// Get all leverage settings
const allLeverage = accountState.getSymbolLeverageCache();
```

### Price Updates & P&L

```typescript
// Process price update to recalculate unrealized P&L
accountState.processPriceEvent({
  symbol: 'BTCUSDT',
  price: 46000,
  timestamp: Date.now(),
});

// Get session summary with P&L calculations
const summary = accountState.getSessionSummary(startingBalance);
console.log('Realized P&L:', summary.account.pnlState.realisedPnl);
console.log('Unrealized P&L:', summary.account.pnlState.unrealisedPnl);
```

## Custom Metadata

### Custom data

This storage class also supports per-symbol "metadata". This is a key:value object you can use to store any information related to that symbol's position.

This is typically custom data that an exchange might not have any knowledge of.

Some examples:

- How many entries have happened on the short side of a symbol's position.
- When did this position first open.
- What state is the trailing SL mechanism in.
- What price did the last position for this symbol close.

```typescript
// Define your metadata type
interface MyPositionMetadata {
  leaderId: string;
  entryCount: number;
  lastEntryPrice: number;
  strategy: string;
}

// Create store with custom metadata type
const accountState = new AccountStateStore<MyPositionMetadata>();

// Set metadata for a symbol
accountState.setSymbolMetadata('BTCUSDT', {
  leaderId: 'trader-123',
  entryCount: 3,
  lastEntryPrice: 45000,
  strategy: 'DCA',
});

// Get metadata
const metadata = accountState.getSymbolMetadata('BTCUSDT');

// Update specific metadata value
accountState.setSymbolMetadataValue('BTCUSDT', 'entryCount', 4);

// Get all symbols with metadata
const symbolsWithMetadata = accountState.getSymbolsWithMetadata();

// Delete metadata
accountState.deletePositionMetadata('BTCUSDT');
```

## Persistence

The store includes built-in persistence hooks for custom metadata:

```typescript
// Check if metadata needs persistence
if (accountState.isPendingPersist()) {
  // Save metadata to your storage (Redis, Database, etc.)
  const metadata = accountState.getAllSymbolMetadata();
  await saveToStorage(metadata);

  // Mark as persisted
  accountState.setIsPendingPersist(false);
}
```

## Running Examples

The repository includes complete working examples for popular exchanges. You can find them in the [./examples](./examples) folder.

### Binance Futures

1. Create `.env` file:

   ```
   BINANCE_API_KEY=your_api_key
   BINANCE_API_SECRET=your_api_secret
   ```

2. Run example:
   ```bash
   tsx examples/binance-futures-usdm.ts
   ```

### Bybit Futures

1. Create `.env` file:

   ```
   BYBIT_API_KEY=your_api_key
   BYBIT_API_SECRET=your_api_secret
   ```

2. Run example:
   ```bash
   tsx examples/bybit-futures.ts
   ```

All examples demonstrate:

- Initial state synchronization from REST APIs
- Real-time updates via WebSocket
- Automatic reconnection handling
- State consistency maintenance
- Account summary reporting

<!-- template_contributions -->

### Contributions & Thanks

Have my projects helped you? Share the love, there are many ways you can show your thanks:

- Star & share my projects.
- Are my projects useful? Sponsor me on Github and support my effort to maintain & improve them: https://github.com/sponsors/tiagosiebler
- Have an interesting project? Get in touch & invite me to it.
- Or buy me all the coffee:
  - ETH(ERC20): `0xA3Bda8BecaB4DCdA539Dc16F9C54a592553Be06C` <!-- metamask -->

<!-- template_contributions_end -->

### Contributions & Pull Requests

Contributions are encouraged, I will review any incoming pull requests. See the issues tab for todo items.

<!-- template_star_history -->

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tiagosiebler/bybit-api,tiagosiebler/okx-api,tiagosiebler/binance,tiagosiebler/bitget-api,tiagosiebler/bitmart-api,tiagosiebler/gateio-api,tiagosiebler/kucoin-api,tiagosiebler/coinbase-api,tiagosiebler/orderbooks,tiagosiebler/accountstate,tiagosiebler/awesome-crypto-examples&type=Date)](https://star-history.com/#tiagosiebler/bybit-api&tiagosiebler/okx-api&tiagosiebler/binance&tiagosiebler/bitget-api&tiagosiebler/bitmart-api&tiagosiebler/gateio-api&tiagosiebler/kucoin-api&tiagosiebler/coinbase-api&tiagosiebler/orderbooks&tiagosiebler/accountstate&tiagosiebler/awesome-crypto-examples&Date)

<!-- template_star_history_end -->

## License

MIT License - see LICENSE file for details.


