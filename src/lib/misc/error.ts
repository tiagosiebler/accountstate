function hasProp<K extends PropertyKey>(
  obj: unknown,
  key: K | null | undefined,
): obj is Record<K, unknown> {
  return key != null && obj != null && typeof obj === 'object' && key in obj;
}

/** Try to resolve response{body{msg: string}}, or just string, or whatever */
export function sanitiseError(e: unknown): Error | unknown {
  if (e instanceof Error) {
    return e;
  }

  if (typeof e === 'string') {
    return new Error(e);
  }

  if (typeof e === 'object' && e) {
    if (hasProp(e, 'msg') && typeof e.msg === 'string') {
      return sanitiseError(e.msg);
    }
    if (hasProp(e, 'message') && typeof e.message === 'string') {
      return sanitiseError(e.message);
    }
    // if body, look for msg or string. Fallback to return full thing untouched
    if (hasProp(e, 'body')) {
      return sanitiseError(e.body);
    }
  }

  if (typeof e === 'object') {
    console.warn(
      `Unhandled sanitise OBJECT type, returning JSON string: ${{
        e,
        type: typeof e,
      }}`,
    );
    return sanitiseError(JSON.stringify(e));
  }

  console.error(`Unhandled sanitise type: ${{ e, type: typeof e }}`);
  return e;
}
