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
