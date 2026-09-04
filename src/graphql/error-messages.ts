/** Collects nested transport and GraphQL messages for safe classification. */
export function collectGraphQLErrorMessages(
  value: unknown,
): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value instanceof Error) {
    const candidate = value as Error & { readonly code?: unknown };
    return [
      value.message,
      ...collectGraphQLErrorMessages(candidate.code),
      ...collectGraphQLErrorMessages(value.cause),
    ];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectGraphQLErrorMessages);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const candidate = value as Record<string, unknown>;
  return [
    ...collectGraphQLErrorMessages(candidate.code),
    ...collectGraphQLErrorMessages(candidate.message),
    ...collectGraphQLErrorMessages(candidate.cause),
    ...collectGraphQLErrorMessages(candidate.error),
    ...(Array.isArray(candidate.graphQLErrors)
      ? candidate.graphQLErrors.flatMap(collectGraphQLErrorMessages)
      : []),
    ...(Array.isArray(candidate.errors)
      ? candidate.errors.flatMap(collectGraphQLErrorMessages)
      : []),
  ];
}
