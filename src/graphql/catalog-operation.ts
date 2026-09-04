import { parse } from "graphql";

import { AION_AGENT_CATALOG_QUERY_SOURCE } from "./catalog-source";

export { AION_AGENT_CATALOG_QUERY_SOURCE } from "./catalog-source";

/** Current authenticated Aion agent-catalog query. */
export const AION_AGENT_CATALOG_QUERY = parse(
  AION_AGENT_CATALOG_QUERY_SOURCE,
);
