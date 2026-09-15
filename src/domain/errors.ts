/** A rule the caller broke. Never thrown for anything a user can do by accident. */
export class RuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RuleError'
  }
}

export function rule(condition: boolean, code: string, message: string): asserts condition {
  if (!condition) throw new RuleError(code, message)
}
