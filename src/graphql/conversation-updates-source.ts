/** Principal-wide metadata operation; reset replaces activity, not transcript state. */
export const AION_CONVERSATION_UPDATES_SOURCE = `
  subscription AionConversationUpdates($organizationId: ID, $principal: String) {
    conversationUpdates(organizationId: $organizationId, principal: $principal) {
      reset
      updates {
        kind organizationId agentEnvironmentId distributionId contextId updatedAt
        createdAt
        taskId taskState title summary summarizedThroughTurn
      }
    }
  }
`;
