# testProxy + next-sanity live fetch hang

Minimal reproduction for https://github.com/vercel/next.js/issues/96521.

`experimental.testProxy: true` combined with `next/experimental/testmode/playwright`
hangs the `webServer` on `next@16.4.0-canary.1` when the page renders with
`next-sanity`'s `sanityFetch` (from `defineLive`), even though the same
`testProxy` setup passes with a plain `fetch()` or a bare `@sanity/client.fetch()`
call against the same HTTP/2 host.

`app/page.tsx` calls `sanityFetch` against a fake Sanity project (`abcd1234` /
`production`). No real Sanity project is required: `apicdn.sanity.io` answers
any subdomain over HTTP/2, which is enough to trigger the bug.

## Reproduce

```bash
npm install
npm test
```

The Playwright `webServer` (`next build && next start`) never becomes ready.
`next start` repeatedly logs:

```
⨯ TypeError: fetch failed
  isNetworkError: true,
  request: { ..., attemptNumber: 5 },
  [cause]: Error [HTTPParserError]: Response does not match the HTTP/1.1 protocol (Expected HTTP/, RTSP/ or ICE/)
    data: '\x00\x00\x12\x04...'  // an HTTP/2 SETTINGS frame
```

and Playwright eventually times out waiting on `config.webServer`.

## What doesn't reproduce it

Swapping `sanityFetch` (from `next-sanity/live`'s `defineLive`) for a plain
`fetch()` call or a bare `@sanity/client.fetch()` call against the same host
renders fine under the same `testProxy` setup. Something about
`next-sanity`'s Live Content API request/retry shape (it retries up to 5
times, matching `attemptNumber: 5`, and adds `tag`/`perspective` query
params tied into Next's Data Cache instrumentation) is what triggers the
interceptor recursion that a single plain request doesn't.
