/**
 * toFixed() for numbers
 */
export function toFixedNumber(
  stringNumber: string | number,
  decimalPlaces: number = 2,
): number {
  return Number(Number(stringNumber).toFixed(decimalPlaces));
}
