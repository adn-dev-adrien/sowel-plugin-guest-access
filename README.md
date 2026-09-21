# Sowel Plugin — Accès partagés

**Donner à quelqu'un le droit d'ouvrir, pour un temps donné** — et le lui reprendre. Votre enfant
qui rentre du collège, l'artisan qui vient mardi, la voisine qui arrose pendant les vacances, les
clients d'un gîte : chacun reçoit un code ou un lien, l'ouvre sur son téléphone et glisse pour
ouvrir. Vous voyez qui a ouvert et quand, vous suspendez ou retirez un accès en un clic.

Tout est **tenu par la maison** : les accès, leurs codes, leurs horaires et leur journal vivent ici ;
la page de gestion est une page de Sowel, la page d'ouverture est servie par Sowel. Rien ne dépend
d'un service extérieur. Un logiciel de réservation comme guestFlow peut *alimenter* les accès
automatiquement, mais c'est facultatif.

La recette [`sowel-recipe-guest-gate`](https://github.com/adn-dev-adrien/sowel-recipe-guest-gate)
reste ce qui décide et actionne : ce plugin ne touche jamais lui-même au portail ou à la porte. La
page d'ouverture porte le nom de l'équipement que la recette pilote — « Portail », « Porte du
garage »… — et le suit si vous le renommez.

> L'identifiant technique reste `guest-access`, et le device du premier portail « Accès invités » :
> les changer orphelinerait les réglages, les données et les équipements d'une installation existante.

## Plusieurs portails, une liste chacun

Un portail et une porte de garage n'ont pas les mêmes personnes autorisées. La page de gestion a un
onglet par portail, et un accès coche les portails qu'il ouvre. Une personne qui ouvre les deux
garde **un seul code et un seul lien** : son téléphone affiche une glissière par portail.

**Un seul device et une seule recette pour toute la maison.** La recette tend au plugin la liste des
équipements de type portail, avec leur nom ; pour ajouter un portail : onglet **« + portail »** →
choisir l'équipement. C'est tout. Chaque demande désigne son équipement, et la recette n'actionne
qu'un portail — jamais autre chose dans la maison.

Sur la fiche de chaque portail (Maison), une carte **Accès partagés** dit combien de personnes peuvent
l'ouvrir et mène à son onglet. Un séjour guestFlow ouvre le premier portail ; ajoutez-en d'autres à
la main, une révision du séjour ne les reprend jamais.

## Ce qui a changé, et pourquoi

Jusqu'à la v0.3, guestFlow détenait les accès et cette maison allait chercher les demandes en
long-poll. C'était la bonne réponse à une vraie question — guestFlow est la machine exposée sur
Internet, et un jeton d'API Sowel actionne *tous* les équipements de la maison, sans portée possible
— mais elle mettait le cerveau du côté du logiciel de réservation.

La v1 retourne la question plutôt que de la contourner : **c'est la maison qui décide, et personne ne
détient de jeton.** Le téléphone du visiteur parle à l'arbre public de Sowel (spec 180 du cœur), ce
plugin applique les règles, la recette tient la gâchette. guestFlow, lui, n'ouvre aucune connexion
vers ici et n'a plus rien à décider.

Conséquence recherchée : **tout continue de fonctionner sans guestFlow.** Arrêtez-le, changez de
logiciel de réservation, ou n'en ayez jamais eu : les accès se créent à la main, les visiteurs entrent,
le journal se remplit.

## Les trois surfaces

| Surface | Adresse | Qui |
| --- | --- | --- |
| La page de gestion | Sowel → **Accès partagés** (menu principal) | L'administrateur, derrière la session Sowel |
| La page des clients | `https://<sowel>/p/guest-access/` | N'importe qui muni d'un code |
| L'équipement | Device « Accès invités », un seul pour toute la maison | La recette, par ses ordres |

### La page de gestion

Un onglet par portail (et « Tous » dès qu'il y en a deux) : la liste des accès — ceux que guestFlow
configure pour un séjour et ceux que vous créez à la main —, groupés par état (actifs, à venir,
suspendus, révoqués, terminés), avec pour chacun le code, la validité, les heures, le nombre de
téléphones et le dernier usage.

Chaque ligne porte des icônes plutôt qu'un mur de boutons : **copier le lien**, **modifier**,
**suspendre / reprendre**, et **⋯** pour le reste — **changer le code** (en choisissant de couper ou non
les téléphones déjà configurés : l'email perdu ou le téléphone perdu), le journal de l'accès, et
**révoquer**. Un accès ne se **supprime** qu'une fois révoqué ou terminé.

La période se choisit dans l'ordre : « Jusqu'au » grise les jours et les heures qui précèdent
« À partir du ».

### La page des clients

Quelques kilo-octets de HTML : pas d'application à installer, pas de compte, pas de mot de passe. Le
lien de l'invitation porte le code **dans le fragment** (`/#i=…`), que ni serveur, ni proxy, ni journal
d'accès ne voit jamais. Le téléphone garde ensuite un jeton qui lui est propre.

La commande est un **glissement**, pas un appui : un téléphone dans une poche, un enfant qui joue avec
l'écran, un doigt qui touche l'écran pendant le chargement — un portail qui s'ouvre pour personne est
l'accident que ce geste évite. Le clavier confirme aussi (Entrée, Espace, →, Fin), parce qu'un geste
que personne ne peut faire est un portail que personne ne peut ouvrir.

**Rien n'est dit quand ça marche.** Le client a glissé et roule déjà. La page ne parle que lorsque le
portail ne bougera pas.

## Réglages

| Clé | Exemple | Rôle |
| --- | --- | --- |
| `guest_base_url` | `https://sowel.adn-dev.fr` | L'adresse publique de Sowel, **en HTTPS**, telle que le téléphone d'un client la joint. Sans elle, les liens d'invitation ne peuvent pas être fabriqués — le code reste tapable. |
| `guest_path` | `/` | Facultatif. Là où la page des clients répond **sous cette adresse**. Par défaut `/p/guest-access/`, le chemin que le cœur de Sowel impose. Mettez `/` si l'adresse ci-dessus est un alias dédié (voir plus bas). |
| `guestflow_base_url` | `https://guestflow.adn-dev.fr` | Facultatif. Sans les trois champs guestFlow, le connecteur ne démarre pas et tout le reste fonctionne. |
| `guestflow_api_key` | (secret) | `GATE_API_KEY`, auto-généré dans le `server/.env.local` de guestFlow. |
| `guestflow_signing_secret` | (secret) | `GATE_SIGNING_SECRET`. Il ne circule jamais : il signe. |
| `guestflow_poll_seconds` | `60` | À quelle cadence relire le fil des séjours. |

**Et une chose qui n'est pas un réglage du plugin :** la page des clients répond `404` tant qu'un
administrateur n'a pas ouvert l'**accès public** du plugin (Sowel → Plugins → Accès invités). Une
porte anonyme qui s'ouvre parce qu'on a installé quelque chose est une porte que personne ne remarque ;
celle-ci demande un clic délibéré. La page de gestion le dit en toutes lettres tant que c'est fermé.

### Donner aux clients une adresse à vous

Le cœur de Sowel sert la page des clients sous un chemin qu'il choisit lui-même, `/p/guest-access/`.
Ce n'est pas une adresse qu'on a envie de lire dans un e-mail. Un sous-domaine dédié, posé devant
Sowel, règle ça sans redirection : le client reste sur votre nom, du QR jusqu'à l'ouverture.

```caddy
acces.domainesolio.com {
    rewrite * /p/guest-access{uri}
    reverse_proxy sowel:3000
}
```

Puis, dans les réglages du plugin : `guest_base_url = https://acces.domainesolio.com` et
`guest_path = /`. Les clients reçoivent `https://acces.domainesolio.com/#i=4K7M9QT2`.

**La réécriture doit couvrir tout l'arbre, pas seulement la racine.** La page appelle `app.js`,
`style.css`, `icon.svg` et `enrol` relativement à elle-même : une règle qui ne mappe que `/` sert une
page HTML dont tous les fichiers répondent 404 — elle s'affiche nue et le slide ne fait rien. C'est
exactement ce que teste la vérification manuelle « ouvrir le lien sur l'alias, depuis un téléphone ».

**Une redirection 301 ferait autre chose.** Le client verrait `sowel.adn-dev.fr` dans sa barre
d'adresse dès l'ouverture, et le code ne survivrait au saut que parce que les navigateurs conservent
le fragment — un comportement conforme, mais qu'on n'a aucune raison de mettre sur le chemin critique.
L'alias, lui, ne redirige rien : c'est la même page, servie sous votre nom.

**Le code reste dans le fragment dans tous les cas.** Un fragment n'est jamais envoyé au serveur :
ni Sowel, ni l'alias, ni quoi que ce soit entre les deux n'en voit passer un seul dans ses journaux.

## Le connecteur guestFlow, dans les deux sens

Toujours sortant : **la maison appelle, la maison n'est jamais appelée.**

- **Elle lit** `GET /public/v1/gate/stays?since=<curseur>` — les séjours, par révisions. Une création,
  un changement de dates et une annulation arrivent de la même façon, si bien qu'un redémarrage
  reprend où il s'était arrêté et qu'une page rejouée ne change rien.
- **Elle écrit** `POST /public/v1/gate/invitations` — le code, le lien et l'état de chaque accès de
  séjour. guestFlow en garde une copie et la lit pour composer l'email J-7, afficher le QR du SAS ou
  dessiner la carte de la fiche. **Il n'a donc jamais besoin de joindre la maison pour savoir quoi
  imprimer** — c'est ce qui fait que les emails n'attendent plus rien.

Chaque appel porte la clé d'API *et* une signature HMAC sur la méthode, le chemin, l'horodatage et le
corps. La signature n'est pas de la ceinture-et-bretelles : une clé au porteur est rejouée en entier à
chaque appel, alors qu'un secret qui ne circule pas ne se déduit pas de mille appels lus.

Le plugin **refuse de joindre guestFlow en HTTP clair** vers une autre machine (`localhost` excepté,
où il n'y a pas de fil à écouter) : la signature empêche de forger, pas de lire, et le code du séjour
traverserait le réseau en clair.

## L'équipement

| Donnée | Rôle |
| --- | --- |
| `requests` | **Le compteur** des demandes. C'est le déclencheur de la recette : un booléen ou un horodatage la ferait deviner, parce que `equipment.data.changed` se répète avec une valeur inchangée. Un compteur ne repasse jamais par la même valeur. |
| `last_request_gate` | L'équipement que vise la demande en cours — écrit juste avant le compteur. La recette refuse tout ce qui n'est pas un portail. |
| `last_request_at`, `last_stay` | De quoi lire le journal de la recette |
| `link` | Liaison avec guestFlow — `false` quand il n'y en a pas, ce qui est honnête |
| `active_accesses` | Combien d'accès peuvent ouvrir en ce moment |
| `last_result` | Ce que la maison a répondu la dernière fois |

| Ordre | Valeurs | Rôle |
| --- | --- | --- |
| `result` | `opened`, `already_open`, `refused`, `error` | L'issue, que la recette renvoie quand elle a agi. C'est elle qui débloque la réponse au téléphone du client. |
| `gate_catalog` | JSON | Les portails de la maison — id, nom, contact —, poussés par la recette à son démarrage et à chaque changement. C'est la liste que propose « + portail ». Le contact ne va **pas** au client (un bouton qui dit « Fermer » est un afficheur d'état déguisé en verbe, et la page est interrogeable par qui détient un code) ; il est pour vous, sur la page de gestion. |

Sowel ne relie pas tout seul une donnée ou un ordre ajouté à un équipement existant : un équipement
créé avant la v1.4 doit être recréé depuis le device (la recette le refuse avec un message qui le
dit).

## Garde-fous

- **La décision précède toujours le portail.** Un accès suspendu ne fait pas bouger le compteur : la
  recette n'est pas sollicitée pour être ensuite désavouée.
- **Un doigt qui ripe n'est pas deux intentions** — deux glissements du même accès en moins de deux
  secondes sont la même commande. Deux secondes, et pas dix : un client a le droit de refermer le
  portail derrière lui, et c'est un second geste délibéré.
- **Personne ne répond ?** Le client est prévenu, au lieu d'attendre devant un portail immobile. La
  cause habituelle est une recette qui n'est pas liée à cet équipement, et la page de gestion le dit.
- **Les plafonds sont comptés aux deux niveaux** : 12 ouvertures par heure et par accès, 30 par
  heure **et par portail** — un accès compromis ne peut pas affamer les autres.
- **Un code juste n'est jamais refusé.** Les essais ratés sont comptés pour toute la maison (derrière
  un proxy, l'adresse du visiteur n'est pas visible) : au-delà de dix en dix minutes, la réponse
  d'échec est retenue 1 s, 2, 4… jusqu'à 10 s ; au-delà de vingt-cinq, vous êtes prévenu. Un code
  essayé dix fois est verrouillé une heure.
- **Un code n'ouvre que ses portails** : une glissière qui viserait un autre portail est refusée
  avant même que la règle horaire soit lue.
- **Rien n'est jeté sans raison** : le code d'un séjour reste lisible une semaine après la fin (pour
  le client qui rappelle le lendemain), le journal est gardé un an, et il **survit à la suppression de
  l'accès** — « qui est entré cette nuit-là » doit rester une question à laquelle on peut répondre.

## Où vivent les données

Dans `data/plugins/guest-access/` (spec 180 du cœur) : `accesses.json` et `journal.json`. Deux fichiers
que vous pouvez lire avec `cat` après une coupure de courant, écrits atomiquement, et que la sauvegarde
de Sowel emporte avec le reste. Un fichier illisible est mis de côté plutôt qu'écrasé : la seule copie
de qui peut ouvrir le portail ne se remplace pas par un fichier vide.

## Installation

Source personnelle (spec 136) : **Plugins → Store → Sources personnelles** →
`adn-dev-adrien/sowel-plugin-guest-access` → Installer → confirmer l'empreinte.

Puis, dans l'ordre :

1. **Plugins → Accès partagés → Accès public** : ouvrir la porte des clients.
2. **Réglages du plugin** : renseigner l'adresse publique de Sowel (et guestFlow, si vous l'utilisez).
3. **Équipement** : en créer un depuis le device « Accès invités » (il porte le compteur et les ordres).
4. **Recette** « Accès partagés — ouverture » : **une seule instance**, liée à cet équipement.
5. **Accès partagés → « + portail »** : choisir le ou les portails, puis créer les accès.

Il faut Sowel **1.72.0 ou plus récent** : les pages de plugin et l'arbre public sont des capacités du
cœur (spec 180).

## Licence

AGPL-3.0
