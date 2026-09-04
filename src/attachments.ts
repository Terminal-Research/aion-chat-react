/** Metadata returned after an attachment upload completes. */
export interface AionUploadedAttachment {
  readonly url: string;
  readonly name?: string;
  readonly mediaType?: string;
  readonly size?: number;
  readonly expiresAt?: string;
}

/** Options supplied to a transport-independent attachment upload. */
export interface AionAttachmentUploadOptions {
  readonly signal: AbortSignal;
}

/** Upload boundary used by the chat controller. */
export interface AionAttachmentUploader {
  upload(
    file: File,
    options: AionAttachmentUploadOptions,
  ): Promise<AionUploadedAttachment>;
}
