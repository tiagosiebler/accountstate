## Description

AccountState store

A simple utility class to store & manage simple account state in-memory.

The majority of account/position/trade/balance state is easily restorable and can be fetched via REST APIs after restarting a process.

This storage class is a way to cache this information in-memory, with utility functions to simplify accessing and manipulating that state.

## Installation

```bash
$ npm install accountstate

# or
$ yarn add accountstate
```

## Usage

TODO

### Custom data

This storage class also supports per-symbol "metadata". This is a key:value object you can use to store any information related to that symbol's position.

This is typically custom data that an exchange might not have any knowledge of.

Some examples:

- How many entries have happened on the short side of a symbol's position.
- When did this position first open.
- What state is the trailing SL mechanism in.
- What price did the last position for this symbol close.

You can store anything custom here. However, if you do rely on this metadata,

## Examples

The repository includes a complete example showing how to use the AccountStateStore with different exchanges. You can find it in the [./examples](./examples) folder.

- Connecting to Exchange WebSocket and REST APIs
- Tracking positions and orders in real-time
- Handling account updates and maintaining state
- Syncing after websocket reconnection and on startup
- Mapping exchange updates to account state types

To run the Binance example:

1. Create a `.env` file in the project root with your Binance API keys:
   ```
   BINANCE_API_KEY=your_api_key
   BINANCE_API_SECRET=your_api_secret
   ```

2. Run the example:
   ```bash
    tsx examples/binance-futures-usdm.ts>
   ```

3. The example will connect to Binance, sync your positions and orders, and maintain state in real-time. 
   
4. Press `Ctrl+C` to exit and see a summary of your account state.

Other files have same workflow, just check env vars and file name. 

### Persistence

The primary purpose of this module is to cache this state in-memory. Most of this can easily be fetched via the REST API, so persistence for the majority of this data is no concern.

However, the concept of per-symbol "metadata" is a custom one that cannot be easily restored once lost. If you use any of the metadata-related set/delete methods in the module, `isPendingPersist()` will automatically be set to return `true`.

This is a good way to check if there's a state change to persist somewhere, but it's up to you to implement the persistence mechanism based on your own needs. One way is to debounce an action to `getAllSymbolMetadata()`, persist it somewhere, and finally call `setIsPendingPersist(false)`.

There's no wrong way to do this. Here's a high level example that extends the account state store to automatically persist to Redis on a timer, if the stored metadata changed:

```typescript
const PERSIST_ACCOUNT_POSITION_METADATA_EVERY_MS = 250;

export interface EnginePositionMetadata {
  leaderId: string;
  leaderName: string;
  entryCountLong: number;
  entryCountShort: number;
}

/**
 * This abstraction layer extends the open source "account state store" class,
 * adding a persistence mechanism so nothing is lost after restart.
 *
 * Data is stored in Redis, keyed by the accountId.
 *
 * The RedisPersistanceAPI is a custom implementation around the ioredis client.
 */
export class PersistedAccountStateStore extends AccountStateStore<EnginePositionMetadata> {
  private redisAPI: RedisPersistanceAPI<'positionMetadata'>;

  private didRestorePositionMetadata = false;

  private accountId: string;

  constructor(accountId: string, redisAPI: RedisPersistanceAPI) {
    super();

    this.redisAPI = redisAPI;
    this.accountId = accountId;

    /** Start the persistence timer and also fetch any initial state, if any is found **/
    this.startPersistPositionMetadataTimer();
  }

  /** Call this during bootstrap to ensure we've rehydrated before resuming */
  async restorePersistedData(): Promise<void> {
    // Query persisted position metadata from redis
    const storedDataResult = await this.redisAPI.fetchJSONForAccountKey(
      'positionMetadata',
      this.accountId,
    );

    if (storedDataResult?.data && typeof storedDataResult.data === 'object') {
      this.setAllSymbolMetadata(storedDataResult.data);
    } else {
      console.log(
        `No state data in redis for "${this.accountId}" - nothing to restore`,
      );
    }

    // Overwrite local store with restored data
    this.didRestorePositionMetadata = true;
  }

  private startPersistPositionMetadataTimer(): void {
    setInterval(async () => {
      if (!this.didRestorePositionMetadata) {
        await this.restorePersistedData();
      }

      if (!this.isPendingPersist()) {
        return;
      }

      try {
        this.setIsPendingPersist(false);
        await this.redisAPI.writeJSONForAccountKey(
          'positionMetadata',
          this.accountId,
          this.getAllSymbolMetadata(),
        );

        console.log(`Saved position metadata to redis`);
      } catch (e) {
        console.error(
          `Exception writing position metadata to redis: ${sanitiseError(e)}`,
        );
        this.setIsPendingPersist(true);
      }
    }, PERSIST_ACCOUNT_POSITION_METADATA_EVERY_MS);
  }
}
```
