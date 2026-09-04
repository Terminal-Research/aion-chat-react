/** Text form used by clients that do not depend on GraphQL document nodes. */
export const AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE = `
  subscription AionChatA2ARpc(
    $request: A2AJsonRpcRequestGQLInput!
    $target: CapabilitySubjectGQLInput!
    $serviceParameters: A2AServiceParametersGQLInput
  ) {
    a2aRpc(
      request: $request
      target: $target
      serviceParameters: $serviceParameters
    ) {
      __typename
      ... on A2AJsonRpcSuccessResponseGQL {
        id
        jsonrpc
        result
      }
      ... on A2AJsonRpcErrorResponseGQL {
        id
        jsonrpc
        error {
          code
          message
          data
        }
      }
    }
  }
`;
