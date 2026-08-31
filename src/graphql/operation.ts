import { parse } from "graphql";

/** Current Aion GraphQL subscription for streamed A2A JSON-RPC responses. */
export const AION_CHAT_A2A_RPC_SUBSCRIPTION = parse(`
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
`);
