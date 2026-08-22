import { createClient } from "next-sanity";

/**
 * projectId doesn't need to be real: apicdn.sanity.io / api.sanity.io answer
 * any subdomain over HTTP/2, which is enough to exercise the request cycle.
 */
export const client = createClient({
  projectId: "abcd1234",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: false,
});
