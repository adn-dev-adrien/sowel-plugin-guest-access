/**
 * The address of Portier's house channel: `wss://` only.
 *
 * The frame signature makes a sniffed channel survivable — the house key never travels — but it
 * encrypts nothing: the access label and the gate contact would cross the network in clear, on a
 * network that also carries whatever a guest brings. TLS also closes the route of impersonation
 * that the signature only neutralises. So plain `ws://` is refused, except towards this machine,
 * where a developer runs both halves and there is no wire to listen to.
 *
 * An address carrying a fragment is refused too: the WebSocket constructor would throw on it at
 * every attempt, and a setting that can never connect must fail at start, not in a retry loop.
 */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function isAcceptableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.href.includes("#")) return false;
  if (url.protocol === "wss:") return true;
  return url.protocol === "ws:" && LOOPBACK_HOSTS.includes(url.hostname);
}
