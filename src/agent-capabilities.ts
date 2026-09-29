/** One protocol extension advertised by the selected Agent Card. */
export interface AionAgentExtension {
  readonly uri: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** Capabilities discovered for the exact route used by a chat transport. */
export interface AionAgentCapabilities {
  readonly streaming?: boolean;
  readonly extensions?: readonly AionAgentExtension[];
}

/** @internal Validates capabilities without guessing support from presentation. */
export function parseAgentCapabilities(value: unknown): AionAgentCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The Agent Card capabilities are invalid.");
  }
  const candidate = value as Record<string, unknown>;
  const streaming = candidate.streaming;
  if (streaming != null && typeof streaming !== "boolean") {
    throw new Error("The Agent Card streaming capability is invalid.");
  }
  const extensions = candidate.extensions;
  if (extensions != null && !Array.isArray(extensions)) {
    throw new Error("The Agent Card extensions are invalid.");
  }
  return {
    streaming: typeof streaming === "boolean" ? streaming : undefined,
    extensions: (extensions as unknown[] | undefined | null)?.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("The Agent Card extension is invalid.");
      }
      const extension = value as Record<string, unknown>;
      if (typeof extension.uri !== "string" || !extension.uri.trim()) {
        throw new Error("The Agent Card extension URI is invalid.");
      }
      return {
        uri: extension.uri.trim(),
        description: typeof extension.description === "string"
          ? extension.description : undefined,
        required: typeof extension.required === "boolean"
          ? extension.required : undefined,
        params: extension.params && typeof extension.params === "object"
          && !Array.isArray(extension.params)
          ? extension.params as Readonly<Record<string, unknown>> : undefined,
      };
    }),
  };
}
