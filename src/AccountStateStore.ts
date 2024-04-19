import { IncomingPriceEvent } from './lib/types/events.js';
import {
  EnginePositionSide,
  EngineSimplePosition,
} from './lib/types/position.js';
import { getUnrealisedPNL } from './util/math.js';

/**
 * This abstraction layer is a state cache for account state (so we know what changed when an event comes in).
 *
 * Since it's mostly a cache of information also available on the exchange (via a REST API call), none of it needs to be persisted.
 *
 * EXCEPT the following, which cannot be derived from the exchange:
 * - accountPositionMetadata - an object representing information about a position, per symbol
 *
 * This "accountPositionMetadata" can be any additional info to store about this symbol's position(s). A good place to store custom info.
 */
export class AccountStateStore<
  TEnginePositionMetadata extends object = Record<string, unknown>,
> {
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
    TEnginePositionMetadata | undefined
  > = {};

  private accountOtherState = {
    balance: 0,
    previousBalance: 0,
    hedgedPositions: 0,
  };

  dumpLogState(): void {
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

  /**
   * Pass a price update event to recalculate price-sensitive position state (such as UPNL)
   */
  public processPriceEvent(event: IncomingPriceEvent): void {
    const { symbol, price } = event;
    const longPos = this.getActivePosition(symbol, 'LONG');
    if (longPos) {
      longPos.valueUpnl = getUnrealisedPNL(
        price,
        longPos.assetQty,
        longPos.positionPrice,
      );
    }

    const shortPos = this.getActivePosition(symbol, 'SHORT');
    if (shortPos) {
      shortPos.valueUpnl = getUnrealisedPNL(
        price,
        shortPos.assetQty,
        shortPos.positionPrice,
      );
    }
  }

  /**
   * Return some loggable summary state. Takes the last seen price event into account, when looking at position upnl.
   *
   * Don't rely on this too much, it's a rushed implementation
   */
  public getSessionSummary(startingBalance: number) {
    const balanceNow = this.getWalletBalance();

    const positions = this.getAllPositions().map((pos) => ({
      ...pos,
      leverage: this.getSymbolLeverage(pos.symbol),
    }));

    let activePositionUpnlSum = 0;
    let quoteMarginLockedSum = 0;
    for (const position of positions) {
      activePositionUpnlSum += position.valueUpnl;
      quoteMarginLockedSum += position.marginValue;
    }

    const realisedPnl = balanceNow - startingBalance;

    const summary = {
      activePositions: positions,
      activePositionUpnlSum,
      account: {
        quoteBalanceState: {
          startedWith: startingBalance,
          now: balanceNow,
          quoteMarginLockedSum: quoteMarginLockedSum,
          nowInclLocked: startingBalance - quoteMarginLockedSum,
          nowIfEverythingClosedAtMarket:
            startingBalance + activePositionUpnlSum,
        },
        pnlState: {
          realisedPnl,
          unrealisedPnl: activePositionUpnlSum,
        },
      },
    };

    return summary;
  }

  /**
   * Utility method to check if metadata was recently changed (and hasn't been persisted yet)
   */
  isPendingPersist() {
    return this.isPendingPersistPositionMetadata;
  }

  /**
   * Internally mark that metadata recently changed (and should be persisted)
   *
   * After you've persisted it somewhere, you should set this back to "false".
   */
  setIsPendingPersist(value: boolean): void {
    this.isPendingPersistPositionMetadata = value;
  }

  setWalletBalance(bal: number): void {
    this.accountOtherState.balance = bal;
  }

  getWalletBalance(): number {
    return this.accountOtherState.balance;
  }

  /**
   * Overwrites "previous balance" with current balance. Can be used to track balance changes before/after events
   */
  storePreviousBalance(): void {
    this.accountOtherState.previousBalance = this.getWalletBalance();
  }

  getPreviousBalance(): number {
    return this.accountOtherState.previousBalance;
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

  deleteActivePosition(symbol: string, side: EnginePositionSide): void {
    this.assertInitialStateActivePosition(symbol);
    delete this.accountPositionState[symbol][side];
  }

  /** Overwrite the full metadata store. This should be keyed by symbol! */
  setAllSymbolMetadata(data: typeof this.accountPositionMetadata): void {
    this.accountPositionMetadata = data;
  }

  /** Return position metadata for all symbols */
  getAllSymbolMetadata(): typeof this.accountPositionMetadata {
    return this.accountPositionMetadata;
  }

  /** Return a list of symbols with any metadata stored */
  getSymbolsWithMetadata(): string[] {
    return Object.keys(this.accountPositionMetadata);
  }

  /** Return metadata for one symbol */
  getSymbolMetadata(symbol: string): TEnginePositionMetadata | undefined {
    return this.accountPositionMetadata[symbol];
  }

  /** Overwrite the full state for a symbol's metadata */
  setSymbolMetadata(
    symbol: string,
    data: TEnginePositionMetadata,
  ): TEnginePositionMetadata {
    this.accountPositionMetadata[symbol] = data;
    this.isPendingPersistPositionMetadata = true;
    return data;
  }

  deletePositionMetadata(symbol: string): void {
    delete this.accountPositionMetadata[symbol];
    this.isPendingPersistPositionMetadata = true;
  }

  /**
   * Set one value in this symbol's metadata state.
   *
   * Warning: make sure to set initial metadata (via setSymbolMetadata()) before trying to use this, or it will throw an error!
   */
  setSymbolMetadataValue<TMetadataKey extends keyof TEnginePositionMetadata>(
    symbol: string,
    key: TMetadataKey,
    newValue: TEnginePositionMetadata[TMetadataKey],
  ): TEnginePositionMetadata {
    const symbolMetadata = this.getSymbolMetadata(symbol);

    if (!symbolMetadata) {
      throw new Error(
        `Symbol metadata not initilised. Prepare full metadata state via setSymbolMetadata() before using the setSymbolMetadataValue() method!`,
      );
    }

    symbolMetadata[key] = newValue;
    this.isPendingPersistPositionMetadata = true;

    return symbolMetadata;
  }
}
