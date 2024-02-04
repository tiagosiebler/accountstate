/** The "position side" this specific order should target (use BOTH for one-way trading) */
export const ENGINE_ORDER_POSITION_SIDE = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  BOTH: 'BOTH',
} as const;

/** The side this position is for (use NONE if position isn't active) */
export const ENGINE_POSITION_SIDE = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  NONE: 'NONE',
} as const;

export type EngineOrderPositionSide = keyof typeof ENGINE_ORDER_POSITION_SIDE;
export type EnginePositionSide = keyof typeof ENGINE_POSITION_SIDE;

export interface EngineSimplePosition {
  symbol: string;
  timestampMs: number;
  positionSide: Omit<EnginePositionSide, 'NONE'>;
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
