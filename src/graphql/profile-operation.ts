import { parse } from "graphql";

import { AION_AGENT_PROFILE_QUERY_SOURCE } from "./profile-source";

export { AION_AGENT_PROFILE_QUERY_SOURCE } from "./profile-source";

/** Current lazy Aion identity detail query. */
export const AION_AGENT_PROFILE_QUERY = parse(
  AION_AGENT_PROFILE_QUERY_SOURCE,
);
