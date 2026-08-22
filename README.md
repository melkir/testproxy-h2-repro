# testProxy breaks get-it passthrough requests

Minimal reproduction for https://github.com/vercel/next.js/issues/96521.

`experimental.testProxy: true` in `next.config.ts` breaks outbound requests
made with [`get-it`](https://github.com/sanity-io/get-it) (the HTTP client
`@sanity/client` and other libraries use), independent of Sanity — this repro
has no Sanity dependency at all.

`app/page.tsx` builds a `get-it` requester with the exact middleware stack
`@sanity/client` configures internally (`retry`, `jsonRequest`,
`jsonResponse`, `httpErrors`, `promise`) and makes one GET request to
`https://api.github.com/zen` (a plain public HTTP/2 endpoint, no credentials
needed).

## Reproduce

```bash
npm install
npm test
```

**With `testProxy: true`:** the request fails after retrying:

```json
{ "error": "TypeError: fetch failed", "cause": "SocketError: other side closed", "attemptNumber": 5 }
```

(The exact `cause` varies between runs — sometimes
`HTTPParserError: Response does not match the HTTP/1.1 protocol`, with a raw
HTTP/2 SETTINGS frame in the response bytes. Both look like symptoms of the
same underlying passthrough failure, not two different bugs.)

**With `testProxy` removed from `next.config.ts`** (same build, same
request): the request succeeds normally (`"statusCode":200`).

## Bisection notes

- **No active test harness required.** This reproduces via plain `curl`
  against `next start` — no Playwright, no
  `next/experimental/testmode/playwright` fixture attached. Just having
  `experimental.testProxy: true` set in config is enough.
- **Not Sanity-specific.** This version has zero `@sanity/client` or
  `next-sanity` code — just `get-it` with the same middleware stack
  `@sanity/client` uses internally, hitting a plain HTTP/2 host. An earlier
  version of this repro used `next-sanity`'s `sanityFetch` (via `defineLive`)
  and assumed the trigger was Sanity-specific; it isn't. (A naive
  `getIt([])` call with no middleware doesn't reproduce it — that hangs
  regardless of `testProxy`, which is an unrelated `get-it` usage issue, not
  this bug. The middleware stack above is required to complete a request at
  all.)
- **A single request is enough** — no concurrency, no retries needed to
  trigger the underlying failure (retries just determine how the failure
  eventually surfaces: `SocketError`/`HTTPParserError` after `attemptNumber:
  5`, vs. hanging indefinitely with zero retries).
- **Not reproducible with a plain `fetch()` call.** The same host, called
  directly with `fetch()` instead of through `get-it`, succeeds under the
  same `testProxy: true` setup.
- **`fetch === globalThis.fetch`** is `true` at both the failing (`get-it`)
  and passing (plain `fetch()`) call sites — same function object, confirmed
  by logging the reference and its source at both locations.
- **`typeof XMLHttpRequest`** is `undefined`, so `get-it` resolves to the
  same fetch-based adapter as a plain `fetch()` call, not a different
  transport.
- **Transport library version doesn't matter.** Reproduces identically on
  `get-it@8.8.3` and `get-it@9.5.1`.

Current state: the trigger is `get-it`'s specific request/response handling
architecture — an XHR-emulation class wrapping `fetch()`, driven through an
event-emitter/pub-sub middleware pipeline (`channels.request.subscribe()`,
`readyState` callbacks) rather than a linear `await fetch()` call. The
mechanism producing the difference between that and a plain `fetch()` call
is not identified.

### Interception architecture (from reading `next/dist/experimental/testmode/{fetch,httpget,context}.js`)

- `interceptFetch` monkeypatches `global.fetch`. Its passthrough branch
  (`handleFetch` → no `testInfo`) sets a `next-test-internal: '1'` header on
  the outgoing `Request` and calls the pre-patch `originalFetch(request)`.
- `interceptHttpGet` separately installs `@mswjs/interceptors`'
  `ClientRequestInterceptor`, which is meant to see that header and skip
  re-handling, so the passthrough request reaches the real network exactly
  once.
- `ClientRequestInterceptor` is documented as intercepting Node's legacy
  `http.ClientRequest`. Modern Node's `fetch()` (undici-backed) doesn't go
  through `http.ClientRequest`. Whether/how the marker-checking actually
  applies to undici's internal connections is inside the vendored
  `@mswjs/interceptors` package and hasn't been traced further.
- `@mswjs/interceptors`' compiled `ClientRequest` module bundles its own
  `llhttp` (HTTP/1.1 parser, WASM) and has ALPN-aware mock-socket code
  (`getALPNNegotiatedProtocol`), suggesting it's aware of HTTP/2 negotiation
  at the socket level, which is consistent with the `HTTPParserError`
  variant of the failure.
