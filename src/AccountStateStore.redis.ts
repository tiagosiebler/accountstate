import {
  EnginePositionMetadata,
  AccountStateStore,
} from './AccountStateStore.js';
import { getTimeDiffInDates } from './lib/misc/dates.js';
import { sanitiseError } from './lib/misc/error.js';

const PERSIST_ACCOUNT_POSITION_METADATA_EVERY_MS = 250;

interface BaseRedisAPI<TRes> {
  fetchJSONForAccountKey: (
    key: string,
    accountId: string,
  ) => Promise<{ updatedAt: number; data: TRes }>;
  writeJSONForAccountKey: (
    key: string,
    accountId: string,
    data: unknown,
  ) => unknown;
}

/**
 * This abstraction layer is a state cache for account state (so we know what changed when an event comes in).
 *
 * Since it's mostly a cache of information also available on the exchange (via a REST API call), none of it needs to be persisted.
 *
 * EXCEPT the following, which cannot be derived from the exchange:
 * - accountPositionMetadata
 */
export class PersistedAccountStateStore<
  TRedisAPI extends BaseRedisAPI<Record<string, EnginePositionMetadata>>,
> extends AccountStateStore {
  private redisAPI: TRedisAPI;
  // private storeType = 'redis';

  private didRestorePositionMetadata = false;

  private accountId: string;

  constructor(accountId: string, redisAPI: TRedisAPI) {
    super();

    this.redisAPI = redisAPI;
    this.accountId = accountId;

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
      const ageDiff = getTimeDiffInDates(
        new Date(),
        new Date(storedDataResult?.updatedAt || -1),
      );
      const ageInMinutes = ageDiff.minutes;

      console.log(
        `Fetched persisted "${
          this.accountId
        }" state - state last updated ${ageInMinutes} minutes ago: "${JSON.stringify(
          ageDiff,
        )}": ${JSON.stringify(storedDataResult.data, null, 2)}`,
      );

      this.setFullPositionMetadata(storedDataResult.data);
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
          this.getFullPositionMetadata(),
        );
        // Logger.log(`Saved position metadata to redis: ${JSON.stringify(this.accountPositionMetadata)}`);
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
