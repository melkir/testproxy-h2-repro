import { getIt } from "get-it";
import { httpErrors, jsonRequest, jsonResponse, promise, retry } from "get-it/middleware";

export const dynamic = "force-dynamic";

// The exact middleware stack @sanity/client configures internally.
const request: any = getIt([
  retry(),
  jsonRequest(),
  jsonResponse(),
  httpErrors(),
  promise({ implementation: Promise })
]);

export default async function Home() {
  const result = await request({
    url: "https://api.github.com/zen",
    method: "GET",
    timeout: { connect: 5000, socket: 5000 }
  }).catch(
    (e: any) => ({
      error: String(e),
      cause: e?.cause ? String(e.cause) : undefined,
      attemptNumber: e?.request?.attemptNumber
    })
  );
  return <p>{JSON.stringify(result)}</p>;
}
