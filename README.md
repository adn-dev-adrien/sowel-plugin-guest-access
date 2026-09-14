# Sowel Plugin — Accès invités

Tient un canal ouvert vers **Portier** et fait remonter dans Sowel chaque commande du portail envoyée
par un client du gîte ou de la lodge. Ce plugin ne touche jamais au portail : il expose un device, et
c'est la recette [`sowel-recipe-guest-gate`](https://github.com/adn-dev-adrien/sowel-recipe-guest-gate)
qui décide et actionne.

La version 1.0.0 remplace le long-poll vers guestFlow de la 0.3.0.

## Pourquoi c'est la maison qui ouvre le canal

Portier détient les accès, leurs clés et le journal : c'est lui qui décide qui peut ouvrir. Il
n'ouvre **aucune connexion vers la maison** et ne détient aucun identifiant sur elle.

C'est donc le plugin qui ouvre une WebSocket vers Portier au démarrage et la garde ouverte. Portier y
pousse la commande à l'instant où un client fait glisser son bouton ; la maison y renvoie l'issue et
l'état du contact du portail. Rien ne demande « du nouveau ? » sur une horloge, et le réseau de la
maison n'accepte toujours rien qui vienne de l'extérieur.

Le plugin prouve qui il est en répondant à un **défi** : Portier envoie un nonce, la maison renvoie
sa signature HMAC calculée avec la clé de la maison. La clé ne circule jamais.

## Ce que le device expose

Le device s'appelle **« Accès invités »**.

| Donnée | Type | Rôle |
| --- | --- | --- |
| `requests` | nombre | **Compteur** des commandes remises à la recette. C'est son déclencheur : un booléen ou un horodatage la ferait deviner, parce que `equipment.data.changed` se répète avec une valeur inchangée. Un compteur ne repasse jamais par la même valeur. |
| `last_request_at` | texte | Horodatage de la dernière commande |
| `last_stay` | texte | L'accès qui l'a envoyée, par exemple « Gîte · 202609042 » |
| `link` | booléen | Vrai seulement entre l'authentification du canal et sa fermeture |

| Ordre | Valeurs | Rôle |
| --- | --- | --- |
| `result` | `opened`, `refused`, `error` | L'issue, que la recette renvoie quand elle a agi ; elle remonte à Portier pour la commande en vol |
| `gate_state` | `open`, `closed`, `unknown` | Le contact du portail, **poussé par la recette** — un plugin ne peut pas lire le device d'une autre intégration. Portier l'affiche dans la liste des accès ; il n'arrive jamais sur le téléphone d'un client. |

`already_open`, inutilisé depuis le 10 septembre 2026, a disparu.

## Réglages

| Clé | Exemple | Note |
| --- | --- | --- |
| `portier_url` | `wss://portier.<zone interne>/house/v1` | Obligatoire. **`wss://` uniquement** : le plugin refuse de démarrer sur du `ws://` vers une autre machine et le dit dans son journal. Seul `localhost` est toléré, pour du développement. |
| `house_key` | (secret) | Obligatoire. Le texte base64url de 32 octets (43 caractères), le même que celui de Portier. Une clé mal formée est refusée au démarrage, sans jamais être écrite dans le journal. |
| `ping_minutes` | `10` | De 1 à 30, 10 par défaut. Une autre valeur est remplacée par 10, avec un avertissement. |

Sans `portier_url` ou sans `house_key`, le plugin se déclare « non configuré » et n'ouvre rien.

## Par quel chemin

Le plugin joint Portier par un **nom interne**, résolu à l'intérieur du réseau de la maison, jamais par
un nom public. Deux raisons :

- **pas de NAT sur le chemin.** Le NAT retourné d'une box peut couper sans prévenir une connexion
  inactive avant le ping suivant, et le canal serait alors mort la plupart du temps ;
- **le point d'entrée de la maison n'est pas publié sur Internet**, du tout.

Le nom, le proxy et les règles de pare-feu vivent dans le dépôt privé `homelab`.

**En `wss://`**, parce que la signature et le chiffrement ne font pas le même travail. La signature
empêche de *forger* : la clé ne circule jamais, lire mille trames ne permet pas d'en fabriquer une de
plus. Elle n'empêche pas de *lire* : sans TLS, le nom de l'accès et l'état du portail traverseraient
le réseau en clair.

## Ce que coûte un ping toutes les 10 minutes

- **Un redémarrage propre** de Portier ou d'un proxy ferme la connexion proprement : le plugin se
  reconnecte en quelques secondes.
- **Une coupure silencieuse** (une machine qui s'arrête net, un câble) n'est découverte qu'au ping
  suivant : jusqu'à une dizaine de minutes pendant lesquelles un client lit « maison injoignable ».
- Le ping est une trame signée de l'application, pas une trame de contrôle WebSocket : le client
  WebSocket intégré à Node suffit, aucune dépendance n'est ajoutée.

## Reconnexion

- Après toute fermeture : 1, 2, 5, 10, 30, puis 60 s au plus. La séquence repart de 1 s dès qu'une
  connexion a tenu 60 s.
- **Clé refusée** (fermeture `4401`) : directement 60 s, et le journal dit « clé de la maison refusée
  par Portier ». L'intégration passe en erreur jusqu'à la prochaine connexion acceptée.
- Pas de `pong` 10 s après un ping : le plugin ferme et se reconnecte.
- Portier ne termine pas le défi en 15 s : le plugin ferme et se reconnecte.
- L'horloge de Portier est à plus de 2 minutes de celle de la maison : le défi est refusé et journalisé.

## Les garde-fous de la maison

- **Chaque trame est signée** et liée à sa connexion par le nonce du défi, avec un numéro de séquence
  dans chaque sens. Une mauvaise signature, un trou ou une répétition : fermeture en `4400`, rien
  n'arrive à la recette. Une trame enregistrée sur une connexion précédente ne vaut rien sur la
  suivante.
- **L'échéance** d'une commande est lue dans l'horloge de Portier, corrigée de l'écart mesuré au défi.
  Passée : `error expired`, et le compteur ne bouge pas.
- **Une seule commande en vol.** Une autre qui arrive entre-temps reçoit `error busy`. Une commande à
  laquelle la recette n'a jamais répondu cède sa place une fois son échéance passée.
- **Le plafond de la maison** : au-delà de 30 commandes sur une heure glissante, `refused ceiling`,
  sans toucher au compteur, quoi que dise Portier. Avec l'interrupteur de la recette, c'est le frein
  qui reste dans la maison si Portier était un jour compromis.
- **Rien en mémoire tampon.** Une commande qui n'a pas pu être remise est perdue ; le client a déjà lu
  « maison injoignable ». Le portail ne doit jamais bouger des minutes après que le client a renoncé.
- **L'issue n'est attribuée qu'à la commande en vol.** Une issue rapportée alors que rien n'attend
  est ignorée avec un avertissement, jamais devinée : résoudre la mauvaise commande dirait à un client
  que son portail s'est ouvert alors que non.
- **L'état du contact** est un état, pas une commande : le dernier connu est renvoyé après chaque
  reconnexion, pour que la liste des accès ne reste pas aveugle jusqu'au prochain mouvement du portail.

## Mise à jour depuis la 0.3.0

- **Réglages retirés** : `base_url`, `api_key`, `signing_secret`, `wait_seconds`. Ils ne sont plus lus.
- **Réglages à saisir** : `portier_url` et `house_key` ; `ping_minutes` est facultatif. Tant qu'ils
  manquent, l'intégration reste « non configurée ».
- **Le device garde son nom**, « Accès invités », ses données et ses ordres : un équipement déjà lié
  à ce device le reste, et la recette ne change pas. La 0.3.0 publiait ses données sous un autre
  identifiant que celui du device déclaré, si bien qu'elles n'y arrivaient pas ; la 1.0.0 publie sous
  « Accès invités ».
- **Le compteur `requests` est mémorisé** (réglage caché `requests_count`) : il continue de monter
  après un redémarrage. Reparti de 0, il passerait sous la dernière valeur vue par la recette, qui
  manquerait la première commande suivante.

## Installation

Source personnelle (spec 136) : **Plugins → Store → Sources personnelles** →
`adn-dev-adrien/sowel-plugin-guest-access` → Installer → confirmer l'empreinte.

## Développement

```bash
npx tsc
npx vitest run --pool=forks --poolOptions.forks.singleFork
```

Les tests n'ouvrent aucune connexion : une fausse WebSocket tient la place du réseau. Les vecteurs du
contrat de Portier (réponse au défi, trame Portier → maison, trame maison → Portier) sont recopiés
dans `specs/contract-vectors.house.json` et épinglés par `src/frame-signature.test.ts`.

## Licence

AGPL-3.0
