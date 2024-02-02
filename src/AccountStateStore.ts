import { IncomingPriceEvent } from './lib/types/events.js';
import {
  EnginePositionSide,
  EngineSimplePosition,
} from './lib/types/position.js';

export interface EnginePositionMetadata {
  leaderId: string;
  leaderName: string;
}

/**
 * This abstraction layer is a state cache for account state (so we know what changed when an event comes in).
 *
 * Since it's mostly a cache of information also available on the exchange (via a REST API call), none of it needs to be persisted.
 *
 * EXCEPT the following, which cannot be derived from the exchange:
 * - accountPositionMetadata
 */
export class AccountStateStore {
  private isPendingPersistPositionMetadata = false;

  // symbol:leverageValue
  private accountLeverageState: Record<string, number> = {};

  // per symbol, per side, cache a copy of the position state
  private accountPositionState: Record<
    string,
    Record<EnginePositionSide, EngineSimplePosition | undefined>
  > = {};

  // per symbol, store some state related to this position (e.g. which leader caused this pos to open)
  // if a leader opens any position on any side on a symbol,
  // only that leader can do anything on that symbol until the position is closed again
  private accountPositionMetadata: Record<
    string,
    EnginePositionMetadata | undefined
  > = {};

  private accountOtherState = {
    balance: 0,
    hedgedPositions: 0,
  };

  isPendingPersist() {
    return this.isPendingPersistPositionMetadata;
  }

  setIsPendingPersist(value: boolean): void {
    this.isPendingPersistPositionMetadata = value;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  processPriceEvent(_event: IncomingPriceEvent): void {
    // TODO: use this to recalculate upnl for any positions on that symbol!
  }

  setWalletBalance(bal: number): void {
    this.accountOtherState.balance = bal;
  }

  getWalletBalance(): number {
    return this.accountOtherState.balance;
  }

  getAllPositions(): EngineSimplePosition[] {
    const positions: EngineSimplePosition[] = [];

    for (const symbol in this.accountPositionState) {
      for (const posSide in this.accountPositionState[symbol]) {
        const position =
          this.accountPositionState[symbol][posSide as EnginePositionSide];

        if (position?.assetQty) {
          positions.push(position);
        }
      }
    }

    return positions;
  }

  /**
   * Recalculate and return counters for the total number of positions opened (hedged positions count as 2)
   * @returns
   */
  getTotalActivePositions(): { total: number; totalHedged: number } {
    let total = 0;
    let totalHedged = 0;

    for (const symbol in this.accountPositionState) {
      let positionsForSymbol = 0;
      for (const posSide in this.accountPositionState[symbol]) {
        const position =
          this.accountPositionState[symbol][posSide as EnginePositionSide];
        if (position?.assetQty) {
          total++;
          positionsForSymbol++;
        }

        if (positionsForSymbol === 2) {
          console.log(`${symbol} has a long and short position!`);
          totalHedged++;
        }
      }
    }

    this.accountOtherState.hedgedPositions = totalHedged;
    return {
      total,
      totalHedged,
    };
  }

  /**
   * Call
   * @returns a cached count on the total number of positions that have both a long and a short open
   */
  getTotalHedgedPositions(): number {
    return this.accountOtherState.hedgedPositions;
  }

  isSymbolSideInPosition(
    symbol: string,
    positionSide: EnginePositionSide,
  ): boolean {
    const symbolStore = this.getActivePosition(symbol, positionSide);
    return !!symbolStore?.assetQty && symbolStore?.assetQty !== 0;
  }

  /** Returns true if any side has a position for this symbol */
  isSymbolInAnyPosition(symbol: string): boolean {
    return (
      this.isSymbolSideInPosition(symbol, 'LONG') ||
      this.isSymbolSideInPosition(symbol, 'SHORT')
    );
  }

  isDualPositionMode() {
    return true;
  }

  dumpLog(): void {
    console.log(
      `Position dump: `,
      JSON.stringify(
        {
          accountLeverageState: this.accountLeverageState,
          acconutPositionState: this.accountPositionState,
          accountOtherState: this.accountOtherState,
        },
        null,
        2,
      ),
    );
  }

  setSymbolLeverage(symbol: string, leverage: number): void {
    this.accountLeverageState[symbol] = leverage;
  }

  getSymbolLeverage(symbol: string): number | undefined {
    return this.accountLeverageState[symbol];
  }

  getSymbolLeverageCache() {
    return this.accountLeverageState;
  }

  private assertInitialStateActivePosition(symbol: string): void {
    if (!this.accountPositionState[symbol]) {
      this.accountPositionState[symbol] = {
        LONG: undefined,
        SHORT: undefined,
        NONE: undefined,
      };
    }
  }
  getActivePosition(
    symbol: string,
    side: EnginePositionSide,
  ): EngineSimplePosition | undefined {
    this.assertInitialStateActivePosition(symbol);
    return this.accountPositionState[symbol][side];
  }

  setActivePosition(
    symbol: string,
    side: EnginePositionSide,
    newState: EngineSimplePosition,
  ): void {
    this.assertInitialStateActivePosition(symbol);
    this.accountPositionState[symbol][side] = newState;
  }

  removeActivePosition(symbol: string, side: EnginePositionSide): void {
    this.assertInitialStateActivePosition(symbol);
    delete this.accountPositionState[symbol][side];
  }

  getPositionsInMetadata(): string[] {
    return Object.keys(this.accountPositionMetadata);
  }

  getPositionsForLeader(leaderId: string): EngineSimplePosition[] {
    const positions: EngineSimplePosition[] = [];

    for (const symbol in this.accountPositionMetadata) {
      const metadata = this.getPositionMetadata(symbol);
      if (metadata?.leaderId === leaderId) {
        const longPos = this.getActivePosition(symbol, 'LONG');
        if (longPos) {
          positions.push(longPos);
        }

        const shortPos = this.getActivePosition(symbol, 'SHORT');
        if (shortPos) {
          positions.push(shortPos);
        }
      }
    }

    return positions;
  }

  getPositionMetadata(symbol: string): EnginePositionMetadata | undefined {
    return this.accountPositionMetadata[symbol];
  }

  setPositionMetadata(symbol: string, data: EnginePositionMetadata): void {
    this.accountPositionMetadata[symbol] = data;
    this.isPendingPersistPositionMetadata = true;
  }

  removePositionMetadata(symbol: string): void {
    delete this.accountPositionMetadata[symbol];
    this.isPendingPersistPositionMetadata = true;
  }

  /** Overwrite position metadata */
  setFullPositionMetadata(data: typeof this.accountPositionMetadata): void {
    this.accountPositionMetadata = structuredClone(data);
  }

  getFullPositionMetadata(): typeof this.accountPositionMetadata {
    return structuredClone(this.accountPositionMetadata);
  }
}
