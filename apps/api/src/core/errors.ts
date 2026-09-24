// A client-facing refusal: the gateway returns its message to the sender.
export class ActionError extends Error {}

// A declaration (not an arrow) so `if (!row) fail(...)` narrows `row` afterwards.
export function fail(msg: string): never {
  throw new ActionError(msg);
}
