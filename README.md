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
| `base_url` | `http://192.168.0.24:4000` | L'adresse de guestFlow. En LAN de préférence : inutile de sortir sur Internet pour parler à la machine d'à côté. |
| `api_key` | (secret) | `GATE_API_KEY`, auto-généré dans `server/.env.local` de guestFlow au démarrage. Distinct de `PUBLIC_API_KEY` : la clé du site ne doit pas pouvoir vider la file du portail. |
| `wait_seconds` | `25` | Durée du long-poll. Plafonnée à 55 s : au-delà, un proxy inverse coupe la connexion en vol. |

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
