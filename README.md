# testProxy + next-sanity live fetch hang

Minimal reproduction for https://github.com/vercel/next.js/issues/96521.

`experimental.testProxy: true` in `next.config.ts` hangs `next start` on
`next@16.4.0-canary.1` when a page renders with `next-sanity`'s `sanityFetch`
(from `defineLive`).

`app/page.tsx` calls `sanityFetch` against a fake Sanity project (`abcd1234` /
`production`). No real Sanity project is required: `apicdn.sanity.io` answers
any subdomain over HTTP/2, which is enough to trigger the bug.

## Reproduce

```bash
npm install
npm test
```

`next start` never becomes ready and repeatedly logs:

```
⨯ TypeError: fetch failed
  isNetworkError: true,
  request: { ..., attemptNumber: 5 },
  [cause]: Error [HTTPParserError]: Response does not match the HTTP/1.1 protocol (Expected HTTP/, RTSP/ or ICE/)
    data: '\x00\x00\x12\x04...'  // an HTTP/2 SETTINGS frame
```

## Bisection notes

- **No active test harness required.** Building with `testProxy: true` and
  hitting the page with plain `curl` against `next start` reproduces the same
  hang — no Playwright, no `next/experimental/testmode/playwright` fixture
  attached. Removing `testProxy: true` from the same build/request returns a
  normal response.
- **A single `client.fetch()` call is enough.** Patched
  `node_modules/next-sanity/dist/live/conditions/react-server/index.js`
  directly: either of `sanityFetch`'s two internal `client.fetch()` calls
  (the sync-tags call and the data call) reproduces the hang on its own —
  not the two-call sequence or their interaction.
- **Not reproducible with a plain `fetch()` call, or with a bare
  `@sanity/client.fetch()` call** (no `next-sanity`), matching `sanityFetch`'s
  exact request options, `withConfig()` chain, and `cookies()`/`draftMode()`
  calls. Confirmed not flaky (3/3 runs passed) on the same pinned Next
  version.
- **`fetch === globalThis.fetch` is `true`** at both the failing
  (`next-sanity`) and passing (hand-written) call sites — same function
  object, confirmed by logging the reference and its source at both
  locations.
- **`typeof XMLHttpRequest` is `undefined`** at both call sites, so `get-it`
  (the HTTP transport `@sanity/client` uses) resolves to the same
  fetch-based adapter in both cases, not a different transport.
- **Transport library version doesn't matter.** Tested with
  `@sanity/client@8` / `get-it@9.5.1` in place of `@sanity/client@7.26.2` /
  `get-it@8.8.3`: identical failure, same signature.
- **Not about `node_modules` or the `"react-server"` conditional export
  alone.** A trivial dummy `node_modules` package making a plain `fetch()`
  call, including one resolved through the same `"react-server"` conditional
  export that `next-sanity/live`'s `package.json` uses, does not reproduce
  it.
- **Not reproducible by varying** `useCdn`, the `next: { tags }` fetch
  option, retry count, or calling `cookies()`/`draftMode()` before fetching.

Current state: the only known trigger is executing through `next-sanity`'s
actual compiled `sanityFetch` call chain (`sanityFetch` → `client.fetch` →
`get-it` requester → middleware → adapter → `fetch`). The mechanism
producing the difference between that call chain and a request-for-request
identical hand-written one is not identified.

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
