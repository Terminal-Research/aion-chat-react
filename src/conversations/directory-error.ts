/** Stable failure categories shared by remote directory adapters. */
export type AionConversationDirectoryErrorCode =
  | "access_denied"
  | "authentication_required"
  | "directory_failed"
  | "invalid_response"
  | "unsupported";

/** Redaction-safe failure from a remote conversation directory. */
export class AionConversationDirectoryError extends Error {
  readonly name = "AionConversationDirectoryError";

  constructor(
    readonly code: AionConversationDirectoryErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
