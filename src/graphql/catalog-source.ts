/** Authenticated Aion identity catalog limited to chat presentation fields. */
export const AION_AGENT_CATALOG_QUERY_SOURCE = `
  query AionChatAgentCatalog(
    $organizationId: ID!
    $networkType: EndpointTypeGQL!
  ) {
    agentIdentityDetails(
      organizationId: $organizationId
      types: [Principal, Personal]
      networkTypes: [$networkType]
      includePersonalSelf: false
    ) {
      identity {
        id
        agentType
        organizationId
        name
        a2aUrl
        atName
        biography
        avatarImageUrl
      }
      distributionUsages {
        distributionId
        networkType
      }
    }
  }
`;
