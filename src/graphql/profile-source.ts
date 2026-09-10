/** Lazy Aion identity detail query used by shared profile components. */
export const AION_AGENT_PROFILE_QUERY_SOURCE = `
  query AionChatAgentProfile($agentIdentityId: ID!) {
    agentIdentityDetail(agentIdentityId: $agentIdentityId) {
      identity {
        id
        agentType
        identityNetwork
        organizationId
        name
        atName
        biography
        avatarImageUrl
        backgroundImageUrl
        email
        website
      }
      distributionUsages {
        projectId
        projectName
        distributionId
        networkType
        agentEnvironmentId
        agentEnvironmentName
        serviceIdentity {
          id
          identityNetwork
          networkUserId
          userName
          name
          website
          avatarImageUrl
          biography
          systemIdentity
        }
      }
    }
  }
`;
