export interface ErrorLike {
  message: string;
}

export function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === "object" && value != null && "message" in value;
}

export function toErrorString(error: ErrorLike): string {
  return Error.prototype.toString.call(error);
}
