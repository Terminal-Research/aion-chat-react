import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from "@apollo/client/core";
import {
  createApolloAionChatTransport,
} from "@terminal-research/aion-chat-react/graphql";

function a2aSuccess(id: string, result: Readonly<Record<string, unknown>>) {
  return {
    data: {
      a2aRpc: {
        __typename: "A2AJsonRpcSuccessResponseGQL" as const,
        id,
        jsonrpc: "2.0",
        result,
      },
    },
  };
}

const fixtureLink = new ApolloLink(
  (operation) =>
    new Observable((observer) => {
      const request = operation.variables.request as {
        readonly id: string;
      };
      const taskId = `task-${request.id}`;
      const contextId = `context-${request.id}`;
      const first = window.setTimeout(() => {
        observer.next(
          a2aSuccess(request.id, {
            kind: "artifact-update",
            taskId,
            contextId,
            append: false,
            lastChunk: false,
            artifact: {
              artifactId: "aion:stream-delta",
              parts: [{ kind: "text", text: "Apollo client injection " }],
            },
          }),
        );
      }, 250);
      const last = window.setTimeout(() => {
        observer.next(
          a2aSuccess(request.id, {
            kind: "artifact-update",
            taskId,
            contextId,
            append: true,
            lastChunk: true,
            artifact: {
              artifactId: "aion:stream-delta",
              parts: [{ kind: "text", text: "uses the optional adapter." }],
            },
          }),
        );
        observer.complete();
      }, 550);

      return () => {
        window.clearTimeout(first);
        window.clearTimeout(last);
      };
    }),
);

const fixtureApolloClient = new ApolloClient({
  cache: new InMemoryCache(),
  link: fixtureLink,
});

export const apolloTransport = createApolloAionChatTransport({
  client: fixtureApolloClient,
});
