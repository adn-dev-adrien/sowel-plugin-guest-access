/**
 * Plain HTTP is refused towards anything but this machine.
 *
 * The signature makes a sniffed channel survivable — the secret never travels —
 * but it encrypts nothing: the stay code, the lodging and the guest's name
 * would cross the LAN in clear, on a network that also carries whatever a guest
 * brings. guestFlow is served over TLS under its public name, so there is no
 * reason left to accept anything else.
 *
 * `localhost` stays allowed: that is a developer running both halves on one
 * machine, where there is no wire to listen to.
 */
export function isAcceptableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
