export function isObject(res: unknown): res is Record<string, unknown> {
  return !!res && typeof res === 'object';
}

/** Check typeof number and check against isNaN */
export function isNumber(param: unknown): param is number {
  return typeof param === 'number' && !isNaN(param);
}
