# testProxy breaks passthrough requests to HTTP/2 hosts

Minimal reproduction for https://github.com/vercel/next.js/issues/96521.

`experimental.testProxy: true` in `next.config.ts` breaks any outbound
`fetch()` call to a server that negotiates HTTP/2 via ALPN — which is
virtually every modern HTTPS server. No third-party library involved:
`app/page.tsx` is a single plain `fetch()` call.

## Reproduce

```bash
npm install
npm test
```

**With `testProxy: true`:** the request fails:

```json
{ "error": "TypeError: fetch failed", "cause": "SocketError: other side closed" }
```

(Sometimes instead: `HTTPParserError: Response does not match the HTTP/1.1
protocol`, with a raw HTTP/2 SETTINGS frame in the response bytes. Both are
symptoms of the same mismatch below, not two different bugs.)

**With `testProxy` removed from `next.config.ts`** (same build, same
request): the request succeeds normally (`"status":200`).

**A plain HTTP (no TLS) request succeeds even with `testProxy: true`** —
change the URL in `app/page.tsx` to `http://neverssl.com/` to see this.
Only TLS connections that negotiate `h2` are affected.

## Root cause

Traced by reading `@mswjs/interceptors`' compiled `ClientRequest` module
(`node/dist/compiled/@mswjs/interceptors/ClientRequest/index.js`, vendored
by Next for `testProxy`):

- A global `socket-interceptor` patches `net.Socket.prototype.connect` for
  every outbound socket in the process — not just `http.ClientRequest`
  traffic, so `fetch()`/undici is included regardless of which library
  calls it.
- For a request with no active test context, it reconstructs the
  connection as a "passthrough": it opens its own real socket
  (`createConnection()`) using TLS options copied from the original
  connection attempt (including its ALPN protocol list), then replays the
  request onto it and reads the response back.
- That passthrough machinery is built assuming HTTP/1.1 framing
  end-to-end. When the passthrough socket's TLS handshake negotiates `h2`
  (because the ALPN list it copied includes it, and the remote server
  supports it), the interceptor still writes the request as plain HTTP/1.1
  text and tries to parse the response with its own vendored HTTP/1.1
  parser (`llhttp`, bundled as WASM). The remote server, on receiving
  non-HTTP/2-framed bytes over an HTTP/2 connection, closes it
  (`SocketError: other side closed`) — or in other timings, the client
  receives real HTTP/2 frames back and its HTTP/1.1 parser can't read them
  (`HTTPParserError`).

Confirmed directly by instrumenting the compiled interceptor to log the
negotiated ALPN protocol and the raw bytes being written to the socket:
negotiated protocol was `h2`, bytes written were `GET /zen HTTP/1.1\r\n...`.

This is not specific to any particular HTTP client or library — a bare
`fetch()` call reproduces it exactly like every other case tested
(`get-it`, `@sanity/client`, `next-sanity`). Whatever library is used, the
determining factor is simply whether the target host negotiates `h2`.
