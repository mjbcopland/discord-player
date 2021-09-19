export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value != null;
}

export function assertNonNullable<T>(value: T, message = "Value was nullable"): asserts value is NonNullable<T> {
  if (!isNonNullable(value)) throw new Error(message);
}

export function asNonNullable<T>(value: T, message?: string): NonNullable<T> {
  return assertNonNullable(value, message), value;
}
