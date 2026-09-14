# Sowel Plugin — Accès invités

Fait remonter dans Sowel les demandes d'ouverture du portail émises par les clients du gîte et de
la lodge depuis **guestFlow**. Ce plugin ne touche jamais au portail : il expose un device, et
c'est la recette [`sowel-recipe-guest-gate`](https://github.com/adn-dev-adrien/sowel-recipe-guest-gate)
qui décide et actionne.

## Pourquoi c'est la maison qui va chercher

guestFlow est la machine exposée sur Internet. Elle détient les séjours, les codes et les fenêtres
de validité — et **aucun identifiant sur cette maison**. Elle n'ouvre aucune connexion vers elle.

C'est donc ce plugin qui va demander : une requête HTTP sortante tenue ouverte ~25 s, à laquelle
guestFlow répond à l'instant où un client appuie sur son bouton. Une compromission de l'application
de réservation ne peut donc commander **rien** ici.

Un jeton d'API Sowel n'aurait pas permis ça : il hérite du rôle de son créateur, et un rôle
`standard` actionne *tous* les équipements de la maison. Il n'existe aucune portée par équipement.

## Ce que le device expose

| Donnée | Type | Rôle |
| --- | --- | --- |
| `requests` | nombre | **Compteur** des demandes reçues. C'est le déclencheur de la recette : un booléen ou un horodatage la ferait deviner, parce que `equipment.data.changed` se répète avec une valeur inchangée. Un compteur ne repasse jamais par la même valeur. |
| `last_request_at` | texte | Horodatage de la dernière demande |
| `last_stay` | texte | « Le Gîte · 202609042 » — de quoi lire le journal |
| `link` | booléen | Liaison avec guestFlow |

| Ordre | Valeurs | Rôle |
| --- | --- | --- |
| `result` | `opened`, `already_open`, `refused`, `error` | L'issue, que la recette renvoie quand elle a agi |
| `gate_state` | `open`, `closed`, `unknown` | Le contact du portail, **poussé par la recette** — un plugin ne peut pas lire le device d'une autre intégration, et guestFlow s'en sert pour intituler le bouton du client |

## Réglages

| Clé | Exemple | Note |
| --- | --- | --- |
| `base_url` | `https://guestflow.adn-dev.fr` | L'adresse de guestFlow, **en HTTPS obligatoirement** : le plugin refuse de démarrer sur du HTTP clair vers une autre machine (seul `localhost` est toléré, pour du développement). Voir ci-dessous. |
| `api_key` | (secret) | `GATE_API_KEY`, auto-généré dans `server/.env.local` de guestFlow au démarrage. Distinct de `PUBLIC_API_KEY` : la clé du site ne doit pas pouvoir vider la file du portail. |
| `wait_seconds` | `25` | Durée du long-poll. Plafonnée à 55 s : au-delà, un proxy inverse coupe la connexion en vol. |

## Pourquoi le nom public, et pourquoi en HTTPS

**Le nom public**, `guestflow.adn-dev.fr`, et non un nom interne : c'est la décision d'Adrien du
2026-08-27, et le Caddyfile interne du parc la porte déjà noir sur blanc. guestFlow lie ses
abonnements aux notifications push à l'ORIGINE — servir la même application sous un second nom les
casserait. Le NAT retourné de la Freebox a été vérifié ce jour-là : la VM domotique joint edge par
le nom public sans sortir réellement du réseau.

Conséquence agréable : **aucune règle de pare-feu à ajouter.** Le trafic entre par edge
(`192.168.0.22`), que `104.fw` autorise déjà ; la VM domotique n'a pas besoin de joindre guestFlow
directement.

**En HTTPS**, parce que la signature et le chiffrement ne font pas le même travail. La signature
empêche de *forger* — le secret ne circule jamais, lire mille appels ne permet pas d'en fabriquer un
de plus. Elle n'empêche pas de *lire* : sans TLS, le code du séjour, le logement et le prénom du
client traverseraient le LAN en clair, sur un réseau qui porte aussi deux coordinateurs Zigbee, une
imprimante 3D et ce qu'un client apporte. Le certificat validé ferme en plus la route de l'usurpation
que la signature se contentait de neutraliser.

Le plugin **refuse donc de démarrer** sur une adresse en HTTP clair vers une autre machine, et le dit
dans son journal. Un réglage qui protège moins qu'annoncé est pire qu'un réglage absent.

## Deux garde-fous à connaître

- **L'issue n'est attribuée qu'à la demande en vol.** guestFlow sert une demande à la fois ; une
  issue rapportée alors que rien n'est en attente est **ignorée avec un avertissement**, jamais
  devinée. Résoudre la mauvaise demande dirait à un client que son portail s'est ouvert alors que
  non.
- **Un plancher d'une seconde entre deux interrogations.** En marche normale la boucle est cadencée
  par le serveur, qui tient la connexion. Le plancher existe pour le cas où quelque chose répond
  instantanément — un proxy qui ne tient pas la connexion — où la boucle martèlerait guestFlow
  aussi vite que le réseau le permet.

## Installation

Source personnelle (spec 136) : **Plugins → Store → Sources personnelles** →
`adn-dev-adrien/sowel-plugin-guest-access` → Installer → confirmer l'empreinte.

## Licence

AGPL-3.0
