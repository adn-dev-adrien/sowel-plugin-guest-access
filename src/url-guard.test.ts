import { describe, expect, it } from "vitest";
import { isAcceptableUrl } from "./index.js";

// Le second facteur rend un canal écouté survivable — le secret ne circule jamais — mais il ne
// chiffre RIEN : le code du séjour, le logement et le prénom du client traverseraient le LAN en
// clair. guestFlow est servi en TLS sous son nom public, donc il n'y a plus de raison d'accepter
// autre chose.

describe("l'adresse de guestFlow", () => {
  it("accepte le HTTPS", () => {
    expect(isAcceptableUrl("https://guestflow.adn-dev.fr")).toBe(true);
    expect(isAcceptableUrl("https://guestflow.adn-dev.fr/")).toBe(true);
    expect(isAcceptableUrl("https://192.168.0.24:4000")).toBe(true);
  });

  it("refuse le HTTP clair vers une autre machine — LAN compris", () => {
    // C'est précisément le réglage qui traînait : http://192.168.0.24:4000.
    expect(isAcceptableUrl("http://192.168.0.24:4000")).toBe(false);
    expect(isAcceptableUrl("http://guestflow.adn-dev.fr")).toBe(false);
    expect(isAcceptableUrl("http://guestflow.maison.adn-dev.fr")).toBe(false);
  });

  it("laisse passer localhost : là, il n'y a pas de fil à écouter", () => {
    expect(isAcceptableUrl("http://localhost:4000")).toBe(true);
    expect(isAcceptableUrl("http://127.0.0.1:4000")).toBe(true);
    expect(isAcceptableUrl("http://[::1]:4000")).toBe(true);
  });

  it("refuse ce qui n'est pas une adresse, et les protocoles exotiques", () => {
    expect(isAcceptableUrl("")).toBe(false);
    expect(isAcceptableUrl("guestflow.adn-dev.fr")).toBe(false);
    expect(isAcceptableUrl("ftp://guestflow.adn-dev.fr")).toBe(false);
    expect(isAcceptableUrl("file:///etc/passwd")).toBe(false);
    expect(isAcceptableUrl("javascript:alert(1)")).toBe(false);
  });

  it("n'est pas trompée par un hôte qui CONTIENT localhost", () => {
    expect(isAcceptableUrl("http://localhost.attaquant.fr")).toBe(false);
    expect(isAcceptableUrl("http://notlocalhost")).toBe(false);
  });
});
