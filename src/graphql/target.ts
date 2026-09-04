import type { AionChatGraphQLTarget } from "./types";

/** @internal Ensures an A2A GraphQL call has one unambiguous target. */
export function assertAionChatGraphQLTarget(
  target: AionChatGraphQLTarget,
): void {
  const selectors = Object.values(target).filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (selectors.length !== 1) {
    throw new Error("An Aion GraphQL target requires exactly one selector.");
  }
}
