/** Nullable public metadata query. Older servers naturally leave links intact. */
export const AION_LINK_PREVIEW_QUERY_SOURCE = `
  query AionChatLinkPreview($url: String!) {
    linkPreview(url: $url) {
      url
      title
      description
      siteName
      imageUrl
      embed { kind value }
    }
  }
`;

/** Batch metadata query; null entries represent individual unavailable URLs. */
export const AION_LINK_PREVIEWS_QUERY_SOURCE = `
  query AionChatLinkPreviews($urls: [String!]!) {
    linkPreviews(urls: $urls) {
      url
      title
      description
      siteName
      imageUrl
      embed { kind value }
    }
  }
`;
