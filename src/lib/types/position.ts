/** Returns a union type from Object.values(T) */
export type ValueOf<T> = T[keyof T];

/**
 * The side this position is for (use NONE if position isn't active, though typically you would simply not store a "position" if it isn't active anymore)
 */
export const ENGINE_POSITION_SIDE = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  NONE: 'NONE',
} as const;

export type EnginePositionSide = ValueOf<typeof ENGINE_POSITION_SIDE>;

/** The "position side" this specific order should target (use BOTH for one-way trading) */
export const ENGINE_ORDER_POSITION_SIDE = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  BOTH: 'BOTH',
} as const;

export type EngineOrderPositionSide = ValueOf<
  typeof ENGINE_ORDER_POSITION_SIDE
>;

export interface EngineSimplePosition {
  symbol: string;
  timestampMs: number;
  positionSide: EnginePositionSide;
  /** More of an internal reference to how this position is stored */
  orderPositionSide: EngineOrderPositionSide;
  positionPrice: number;
  assetQty: number;
  value: number;
  /** Unrealised profit or loss in quote value */
  valueUpnl: number;
  /** Margin value allocated to positon, considering leverage */
  marginValue: number;
  liquidationPrice: number;
  stopLossPrice: number | undefined;
  takeProfitPrice: number | undefined;
}
