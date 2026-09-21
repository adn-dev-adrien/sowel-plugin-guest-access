/**
 * « Accès partagés » — the owner's page, inside Sowel (core spec 180).
 *
 * Plain DOM: this module is imported by Sowel's SPA and handed a container and
 * a context. It styles itself with Sowel's own design tokens, so it follows the
 * light and dark themes without knowing which one is on, and it draws Sowel's
 * own icons (Lucide), inlined, since a plugin page imports nothing from the app.
 *
 * It holds NO rule. Every state, every group and every refusal arrives shaped
 * from the plugin (`admin-api.ts`); what happens here is drawing, and the dates
 * are formatted with the viewer's own locale. The one thing it does enforce is
 * the ORDER of two dates while they are being picked — and the server refuses
 * the same mistake on its own (`end_before_start`), so the screen prevents the
 * error without replacing the refusal.
 */

const S = {
  fr: {
    title: "Accès partagés",
    subtitle: "Qui peut ouvrir, et jusqu'à quand.",
    allGates: "Tous",
    addGate: "portail",
    addGateTitle: "Nouveau portail",
    addGateHelp: "Les portails de la maison, tels que la recette les voit. Choisissez celui que ces accès ouvriront.",
    gateEquipment: "Équipement qui s'ouvre",
    pickEquipment: "Choisir…",
    alreadyListed: "{g} — déjà dans la liste",
    add: "Ajouter",
    noCatalog: "Aucune recette « Accès partagés — ouverture » n'a encore répondu, donc aucun portail à proposer. Créez-en une — une seule pour toute la maison — reliée à l'équipement du device « Accès invités ».",
    catalogEmpty: "La maison n'a aucun équipement de type portail.",
    allTaken: "Tous les portails de la maison sont déjà dans la liste.",
    unbound: "« {g} » ne s'ouvre sur aucun équipement de la maison : choisissez lequel.",
    bind: "Relier",
    unnamedGate: "Portail",
    noGateYet: "Aucun portail pour l'instant : ajoutez-en un avec « + portail ».",
    removeGate: "Retirer ce portail",
    confirmRemoveGate: "Retirer « {g} » ? Son device passe hors ligne ; les accès qui ouvraient aussi un autre portail le gardent.",
    gate_open: "ouvert",
    gate_closed: "fermé",
    gate_unknown: "état inconnu",
    recipeMissing: "Aucune recette « Accès partagés — ouverture » n'a encore répondu — créez-en une (une seule pour toute la maison), reliée à l'équipement du device « Accès invités ».",
    doorShut: "Page d'ouverture fermée",
    doorShutHelp: "Ouvrez « Accès public » dans Plugins → Accès partagés, sinon les liens répondent 404.",
    noGuestUrl: "Adresse publique de Sowel non renseignée : les liens d'accès ne peuvent pas être fabriqués (Réglages du plugin).",
    aliasNote: "Les liens pointent vers {link} — ce nom doit réécrire tout son arbre vers {tree}, pas seulement sa racine, sinon la page s'affiche sans style et les boutons ne répondent pas.",
    guestflowOk: "guestFlow · {d}",
    guestflowKo: "guestFlow injoignable",
    pending: "{n} invitation(s) en attente d'envoi",
    sync: "Synchroniser",
    newAccess: "Nouvel accès",
    filterAll: "Tous",
    filterGuestflow: "guestFlow",
    filterMine: "Créés par moi",
    group_active: "Actifs",
    group_scheduled: "À venir",
    group_suspended: "Suspendus",
    group_revoked: "Révoqués",
    group_ended: "Terminés",
    empty: "Personne ne peut encore ouvrir.",
    emptyGate: "Personne ne peut encore ouvrir « {g} ».",
    tagGuestflow: "guestFlow",
    tagSuspended: "suspendu",
    always: "En permanence",
    from: "À partir du {d}",
    until: "Jusqu'au {d}",
    between: "{a} → {b}",
    hours: "{w}",
    anyHour: "À toute heure",
    neverUsed: "jamais utilisé",
    lastUse: "vu {d}",
    phones: "{n} téléphone(s) configuré(s)",
    copyLink: "Copier le lien",
    copied: "Lien copié",
    edit: "Modifier",
    suspend: "Suspendre",
    resume: "Reprendre",
    more: "Plus d'actions",
    changeCode: "Changer le code…",
    changeCodeTitle: "Changer le code de « {n} »",
    changeCodeHelp: "Le code et le lien changent. L'ancien n'ouvre plus rien.",
    cutPhones: "Couper aussi les {n} téléphone(s) déjà configuré(s) — chacun devra être reconfiguré avec le nouveau lien.",
    change: "Changer",
    codeChanged: "Nouveau code",
    revoke: "Révoquer",
    remove: "Supprimer",
    journal: "Journal",
    journalOf: "Journal de cet accès",
    close: "Fermer",
    save: "Enregistrer",
    cancel: "Annuler",
    label: "Pour qui",
    gates: "Portails",
    validity: "Valable",
    permanent: "En permanence",
    ranged: "Sur une période",
    validFrom: "À partir du",
    validUntil: "Jusqu'au",
    shifted: "Fin décalée pour garder la même durée.",
    pick: "Choisir…",
    clear: "Effacer",
    prevMonth: "Mois précédent",
    nextMonth: "Mois suivant",
    addHours: "Ajouter une plage horaire",
    removeHours: "Retirer cette plage",
    stayWindow: "Séjour",
    earlyOpen: "Ouvrir dès",
    extend: "Prolonger jusqu'au",
    stayReadOnly: "Le séjour vient de guestFlow — utilisez les deux champs ci-dessous pour élargir l'accès.",
    confirmRevoke: "L'accès cesse immédiatement et les téléphones sont coupés.",
    confirmRemove: "L'accès disparaît de la liste. Le journal, lui, est conservé.",
    required: "Un nom est nécessaire.",
    too_long: "Ce nom est trop long (40 caractères au plus).",
    taken: "Cet équipement est déjà dans la liste.",
    no_gate: "Cochez au moins un portail — un accès qui n'ouvre rien ne sert à rien.",
    unknown_gate: "Ce portail n'existe plus. Rechargez la page.",
    unknown_equipment: "La recette ne propose pas cet équipement (ce n'est pas un portail, ou il n'existe plus).",
    gate_in_use: "Des accès encore valables n'ouvrent que ce portail : modifiez-les ou révoquez-les d'abord.",
    last_gate: "Il faut au moins un portail.",
    still_live: "Révoquez l'accès avant de le supprimer.",
    bad_date: "Date incompréhensible.",
    end_before_start: "La fin doit venir après le début.",
    overlap: "Deux plages se chevauchent.",
    bad_time: "Heure incompréhensible (HH:MM).",
    not_a_list: "Liste invalide.",
    not_earlier: "« Ouvrir dès » doit précéder le début du séjour.",
    not_later: "« Prolonger » doit dépasser la fin du séjour — sinon, suspendez.",
    failed: "Ça n'a pas fonctionné.",
    journalEmpty: "Rien pour l'instant.",
    kind_created: "créé",
    kind_edited: "modifié",
    kind_suspended: "suspendu",
    kind_resumed: "repris",
    kind_revoked: "révoqué",
    kind_deleted: "supprimé",
    kind_invitation: "nouveau code",
    kind_regenerated: "nouveau code, téléphones coupés",
    kind_enrolled: "téléphone configuré",
    kind_opened: "ouverture envoyée",
    kind_refused: "refusé",
    kind_failed: "échec",
    kind_bad_code: "code erroné",
    kind_guessing: "essais de codes en série",
    kind_stay_updated: "séjour mis à jour",
    kind_stay_cancelled: "séjour annulé",
    weekdays: "L,M,M,J,V,S,D",
  },
  en: {
    title: "Shared access",
    subtitle: "Who can open, and until when.",
    allGates: "All",
    addGate: "gate",
    addGateTitle: "New gate",
    addGateHelp: "The house's gates, as the recipe sees them. Pick the one these accesses will open.",
    gateEquipment: "Equipment that opens",
    pickEquipment: "Pick…",
    alreadyListed: "{g} — already listed",
    add: "Add",
    noCatalog: "No « Shared access — opening » recipe has answered yet, so there is no gate to offer. Create one — a single one for the whole house — bound to the equipment of the « Accès invités » device.",
    catalogEmpty: "The house has no equipment of type gate.",
    allTaken: "Every gate of the house is already listed.",
    unbound: "« {g} » opens no equipment of the house: pick which.",
    bind: "Link",
    unnamedGate: "Gate",
    noGateYet: "No gate yet: add one with « + gate ».",
    removeGate: "Remove this gate",
    confirmRemoveGate: "Remove « {g} »? Its device goes offline; accesses that also open another gate keep that one.",
    gate_open: "open",
    gate_closed: "closed",
    gate_unknown: "state unknown",
    recipeMissing: "No « Shared access — opening » recipe has answered yet — create one (a single one for the whole house), bound to the equipment of the « Accès invités » device.",
    doorShut: "Opening page shut",
    doorShutHelp: "Turn on « Public access » in Plugins → Shared access, or the links answer 404.",
    noGuestUrl: "Sowel's public address is not set: access links cannot be built (plugin settings).",
    aliasNote: "Links point at {link} — that name must rewrite its whole tree to {tree}, not just its root, or the page loads unstyled and its buttons do nothing.",
    guestflowOk: "guestFlow · {d}",
    guestflowKo: "guestFlow unreachable",
    pending: "{n} invitation(s) waiting to be sent",
    sync: "Synchronise",
    newAccess: "New access",
    filterAll: "All",
    filterGuestflow: "guestFlow",
    filterMine: "Made by me",
    group_active: "Active",
    group_scheduled: "Upcoming",
    group_suspended: "On hold",
    group_revoked: "Revoked",
    group_ended: "Ended",
    empty: "Nobody can open yet.",
    emptyGate: "Nobody can open « {g} » yet.",
    tagGuestflow: "guestFlow",
    tagSuspended: "on hold",
    always: "Always",
    from: "From {d}",
    until: "Until {d}",
    between: "{a} → {b}",
    hours: "{w}",
    anyHour: "Any time",
    neverUsed: "never used",
    lastUse: "seen {d}",
    phones: "{n} phone(s) set up",
    copyLink: "Copy the link",
    copied: "Link copied",
    edit: "Edit",
    suspend: "Hold",
    resume: "Resume",
    more: "More actions",
    changeCode: "Change the code…",
    changeCodeTitle: "Change the code of « {n} »",
    changeCodeHelp: "The code and the link change. The old one opens nothing any more.",
    cutPhones: "Also cut off the {n} phone(s) already set up — each will have to be set up again from the new link.",
    change: "Change",
    codeChanged: "New code",
    revoke: "Revoke",
    remove: "Delete",
    journal: "Journal",
    journalOf: "This access's journal",
    close: "Close",
    save: "Save",
    cancel: "Cancel",
    label: "For whom",
    gates: "Gates",
    validity: "Valid",
    permanent: "Always",
    ranged: "For a period",
    validFrom: "From",
    validUntil: "Until",
    shifted: "End moved to keep the same length.",
    pick: "Pick…",
    clear: "Clear",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    addHours: "Add a time window",
    removeHours: "Remove this window",
    stayWindow: "Stay",
    earlyOpen: "Open from",
    extend: "Extend until",
    stayReadOnly: "The stay comes from guestFlow — use the two fields below to widen the access.",
    confirmRevoke: "The access stops at once and the phones are cut off.",
    confirmRemove: "The access leaves the list. The journal is kept.",
    required: "A name is needed.",
    too_long: "That name is too long (40 characters at most).",
    taken: "That equipment is already listed.",
    no_gate: "Tick at least one gate — an access that opens nothing is no use.",
    unknown_gate: "That gate no longer exists. Reload the page.",
    unknown_equipment: "The recipe does not offer that equipment (not a gate, or gone).",
    gate_in_use: "Accesses still valid open only this gate: edit or revoke them first.",
    last_gate: "At least one gate is needed.",
    still_live: "Revoke the access before deleting it.",
    bad_date: "That date cannot be read.",
    end_before_start: "The end must come after the start.",
    overlap: "Two windows overlap.",
    bad_time: "That time cannot be read (HH:MM).",
    not_a_list: "Invalid list.",
    not_earlier: "« Open from » must precede the start of the stay.",
    not_later: "« Extend » must go past the end of the stay — otherwise, hold it.",
    failed: "That did not work.",
    journalEmpty: "Nothing yet.",
    kind_created: "created",
    kind_edited: "edited",
    kind_suspended: "held",
    kind_resumed: "resumed",
    kind_revoked: "revoked",
    kind_deleted: "deleted",
    kind_invitation: "new code",
    kind_regenerated: "new code, phones cut off",
    kind_enrolled: "phone set up",
    kind_opened: "opening sent",
    kind_refused: "refused",
    kind_failed: "failed",
    kind_bad_code: "wrong code",
    kind_guessing: "codes tried in a row",
    kind_stay_updated: "stay updated",
    kind_stay_cancelled: "stay cancelled",
    weekdays: "M,T,W,T,F,S,S",
  },
};

// Lucide, the icon set Sowel draws everywhere — inlined, same strokes.
const ICONS = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
};

function icon(name, size = 18) {
  const span = document.createElement("span");
  span.className = "ico";
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

const CSS = `
.ga { display: grid; gap: 14px; font-size: 14px; color: var(--color-text, #16202a); position: relative; }
.ga [hidden] { display: none !important; }
.ga h2 { font-size: 18px; font-weight: 600; margin: 0; }
.ga .muted { color: var(--color-text-secondary, #5c6b79); }
.ga .tiny { font-size: 12px; }
.ga .ico { display: inline-flex; }
.ga .ico svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.ga .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--color-border-light, #e5e9ed); overflow-x: auto; }
.ga .tab { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 13px; color: var(--color-text-secondary, #5c6b79); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
.ga .tab[aria-selected="true"] { color: var(--color-primary, #1A4F6E); border-color: var(--color-primary, #1A4F6E); font-weight: 600; }
.ga .tab:focus-visible { outline: 2px solid var(--color-primary, #1A4F6E); }
.ga .tab .n { font-size: 11px; background: var(--color-border-light, #eef1f4); border-radius: 999px; padding: 0 7px; font-weight: 500; color: var(--color-text-secondary, #5c6b79); }
.ga .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ga .grow { flex: 1; }
.ga .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--color-border-light, #e5e9ed); border-radius: 999px; padding: 3px 10px; font-size: 12px; min-height: 28px; background: var(--color-surface, #fff); color: var(--color-text-secondary, #5c6b79); }
.ga .chip.filter { cursor: pointer; font: inherit; font-size: 12px; }
.ga .chip.filter[aria-pressed="true"] { background: var(--color-primary, #1A4F6E); border-color: var(--color-primary, #1A4F6E); color: #fff; }
.ga .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-tertiary, #9aa8b4); flex: none; }
.ga .dot.ok { background: var(--color-success, #1FA260); }
.ga .dot.ko { background: var(--color-error, #b3261e); }
.ga .ib { all: unset; box-sizing: border-box; width: 34px; height: 34px; border-radius: var(--radius-md, 8px); display: inline-flex; align-items: center; justify-content: center; color: var(--color-text-secondary, #5c6b79); cursor: pointer; flex: none; }
.ga .ib:hover { background: var(--color-border-light, #eef1f4); color: var(--color-text, #16202a); }
.ga .ib:focus-visible { outline: 2px solid var(--color-primary, #1A4F6E); }
.ga .ib.small { width: 24px; height: 24px; }
.ga .primary { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: var(--radius-md, 8px); background: var(--color-primary, #1A4F6E); color: #fff; font-size: 13px; cursor: pointer; }
.ga .primary:focus-visible { outline: 2px solid var(--color-primary, #1A4F6E); outline-offset: 2px; }
.ga .notes p { margin: 0 0 4px; }
.ga .group { display: grid; gap: 6px; }
.ga .group h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-tertiary, #9aa8b4); margin: 6px 0 0; font-weight: 600; }
.ga .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; background: var(--color-surface, #fff); border: 1px solid var(--color-border-light, #e5e9ed); border-radius: var(--radius-lg, 12px); padding: 10px 8px 10px 14px; }
.ga .row.dim .who, .ga .row.dim .facts { opacity: .6; }
.ga .who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.ga .name { font-weight: 600; }
.ga .code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 13.5px; letter-spacing: 1px; color: var(--color-text-secondary, #5c6b79); }
.ga .tag { font-size: 11px; border-radius: 999px; padding: 1px 8px; background: var(--color-border-light, #eef1f4); color: var(--color-text-secondary, #5c6b79); }
.ga .facts { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 2px; font-size: 12px; color: var(--color-text-secondary, #5c6b79); }
.ga .facts > span { display: inline-flex; align-items: center; gap: 4px; }
.ga .acts { display: flex; align-items: center; }
.ga .menu-anchor { position: relative; }
.ga .menu { position: absolute; right: 0; top: calc(100% + 4px); background: var(--color-surface, #fff); border: 1px solid var(--color-border, #dfe4e9); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.14); padding: 4px; min-width: 220px; z-index: 20; }
.ga .menu button { all: unset; box-sizing: border-box; display: flex; gap: 10px; align-items: center; width: 100%; padding: 8px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; color: var(--color-text, #16202a); }
.ga .menu button:hover, .ga .menu button:focus-visible { background: var(--color-border-light, #eef1f4); }
.ga .menu button.danger { color: var(--color-error, #b3261e); }
.ga .menu hr { border: 0; border-top: 1px solid var(--color-border-light, #e5e9ed); margin: 4px; }
/* margin: auto is what centres a modal dialog, and Sowel's reset sets every
   margin to 0 — without this line each dialog opens in the top-left corner. */
.ga dialog { border: 0; border-radius: var(--radius-lg, 12px); padding: 0; margin: auto; background: var(--color-surface, #fff); color: inherit; max-width: 520px; width: calc(100vw - 32px); max-height: calc(100dvh - 32px); overflow: auto; }
.ga dialog::backdrop { background: rgba(0,0,0,.4); }
.ga .sheet { padding: 18px; display: grid; gap: 14px; }
.ga .field { display: grid; gap: 6px; }
.ga .field > .lbl { font-size: 12px; color: var(--color-text-secondary, #5c6b79); }
.ga input, .ga select { font: inherit; padding: 8px 10px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border, #dfe4e9); background: transparent; color: inherit; min-height: 40px; }
.ga .checks { display: flex; flex-wrap: wrap; gap: 8px; }
.ga .checks label { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--color-border, #dfe4e9); border-radius: var(--radius-md, 8px); padding: 6px 10px; font-size: 13px; cursor: pointer; }
.ga .checks input { min-height: 0; }
.ga .cut { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.ga .cut input { min-height: 0; margin-top: 3px; }
.ga .windows { display: grid; gap: 8px; }
.ga .window { display: flex; gap: 8px; align-items: center; }
.ga .refusal { color: var(--color-error, #b3261e); font-size: 12px; margin: 0; }
.ga .foot { display: flex; gap: 8px; justify-content: flex-end; }
.ga .btn { font: inherit; font-size: 13px; min-height: 36px; padding: 0 14px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border, #dfe4e9); background: transparent; color: inherit; cursor: pointer; }
.ga .btn.main { background: var(--color-primary, #1A4F6E); border-color: var(--color-primary, #1A4F6E); color: #fff; }
.ga .btn.danger { color: var(--color-error, #b3261e); border-color: var(--color-error, #b3261e); }
.ga .btn.link { border: 0; padding: 0 4px; color: var(--color-primary, #1A4F6E); }
/* The date picker: days and half-hours before the lower bound are struck and
   unclickable, so « until » can never be picked before « from ». */
.ga .dt { display: grid; gap: 6px; }
.ga .dt-row { display: flex; gap: 6px; align-items: center; }
.ga .dt-trigger { all: unset; box-sizing: border-box; flex: 1; display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-border, #dfe4e9); border-radius: var(--radius-md, 8px); padding: 0 10px; min-height: 40px; cursor: pointer; }
.ga .dt-trigger:focus-visible { outline: 2px solid var(--color-primary, #1A4F6E); }
.ga .dt-trigger .ph { color: var(--color-text-tertiary, #9aa8b4); }
.ga .dt-row select { min-width: 64px; padding: 8px 6px; }
.ga .dt-row select option:disabled { color: var(--color-text-tertiary, #9aa8b4); }
.ga .dt-pop { border: 1px solid var(--color-border, #dfe4e9); border-radius: 10px; padding: 10px; }
.ga .dt-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 13px; text-transform: capitalize; }
.ga .dt-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; font-size: 12px; margin-top: 4px; }
.ga .dt-cal b { font-weight: 600; color: var(--color-text-tertiary, #9aa8b4); padding: 4px 0; }
.ga .dt-cal button { all: unset; box-sizing: border-box; padding: 6px 0; border-radius: 6px; cursor: pointer; font-variant-numeric: tabular-nums; text-align: center; }
.ga .dt-cal button:hover:not(:disabled) { background: var(--color-border-light, #eef1f4); }
.ga .dt-cal button:focus-visible { outline: 2px solid var(--color-primary, #1A4F6E); }
.ga .dt-cal button:disabled { color: var(--color-text-tertiary, #9aa8b4); opacity: .55; text-decoration: line-through; cursor: not-allowed; }
.ga .dt-cal button.sel { background: var(--color-primary, #1A4F6E); color: #fff; opacity: 1; }
.ga .dt-cal button.bound { outline: 1px dashed var(--color-primary, #1A4F6E); }
.ga .hint { font-size: 12px; color: var(--color-text-secondary, #5c6b79); }
.ga .journal { display: grid; gap: 6px; max-height: 360px; overflow: auto; }
.ga .journal .line { display: flex; gap: 10px; font-size: 12px; }
.ga .journal .when { color: var(--color-text-tertiary, #9aa8b4); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ga .toast { position: fixed; inset-inline: 0; bottom: 20px; margin: auto; width: max-content; max-width: calc(100vw - 32px); background: var(--color-text, #16202a); color: var(--color-surface, #fff); padding: 8px 14px; border-radius: 999px; font-size: 13px; z-index: 50; }
@media (max-width: 640px) {
  .ga .row { grid-template-columns: 1fr; }
  .ga .acts { justify-content: flex-end; margin-top: -4px; }
}
`;

const TAB_KEY = "guest-access.tab";
const GROUPS = ["active", "scheduled", "suspended", "revoked", "ended"];
/** Where a new period starts: now, rounded up to the next half hour. */
const STEP_MIN = 30;
/** The minutes offered in the time selector — Adrien's call, 2026-09-21. */
const MINUTE_STEP = 5;

// ── Wall-clock values ──────────────────────────────────────
//
// Every date on this page is a Paris wall-clock string, `YYYY-MM-DDTHH:MM` —
// what the server parses and what it hands back (`toLocal`). Kept as strings on
// purpose: two of them compare correctly as text, and no Date ever silently
// moves one by the viewer's own time zone.

function toLocal(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(" ", "T");
}

const pad = (n) => String(n).padStart(2, "0");
function parts(wall) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall || "");
  return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
}
const wallOf = (y, mo, d, h, mi) => `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
const dayOf = (wall) => wall.slice(0, 10);
/** Arithmetic on a wall clock, through UTC so no zone ever gets a say. */
function addMinutes(wall, minutes) {
  const p = parts(wall);
  const t = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + minutes * 60000);
  return wallOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes());
}
function minutesBetween(a, b) {
  const pa = parts(a), pb = parts(b);
  return (Date.UTC(pb.y, pb.mo - 1, pb.d, pb.h, pb.mi) - Date.UTC(pa.y, pa.mo - 1, pa.d, pa.h, pa.mi)) / 60000;
}
/** Now, on the Paris clock, rounded up to the next half hour. */
function nextSlot() {
  const now = parts(toLocal(new Date().toISOString()));
  const rounded = Math.ceil((now.h * 60 + now.mi + 1) / STEP_MIN) * STEP_MIN;
  return addMinutes(wallOf(now.y, now.mo, now.d, 0, 0), rounded);
}

let cleanup = [];

export async function mount(container, ctx) {
  const lang = (ctx.locale || "fr").startsWith("en") ? "en" : "fr";
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const t = (key, vars) => {
    let text = S[lang][key] ?? S.fr[key] ?? key;
    for (const [k, v] of Object.entries(vars || {})) text = text.replace(`{${k}}`, v);
    return text;
  };
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
  const fmt = (iso) => (iso ? dateFmt.format(new Date(iso)) : "");
  const wallFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  const fmtWall = (wall) => {
    const p = parts(wall);
    return p ? wallFmt.format(new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi))) : "";
  };
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const fmtDay = (wall) => {
    const p = parts(wall);
    return p ? dayFmt.format(new Date(Date.UTC(p.y, p.mo - 1, p.d))) : "";
  };

  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "ga";
  container.replaceChildren(style, root);

  let savedTab = "all";
  try { savedTab = localStorage.getItem(TAB_KEY) || "all"; } catch { /* private window */ }
  const state = { data: null, tab: savedTab, kind: "all", error: null, menu: null };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const iconButton = (name, label, onClick, className = "ib") => {
    const b = el("button", className);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(name, className.includes("small") ? 14 : 18));
    b.onclick = onClick;
    return b;
  };

  const toast = (message) => {
    const node = el("div", "toast", message);
    root.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  };
  // The server's refusal code, turned into the sentence the owner needs.
  const refusalText = (err) => {
    const code = ((err && err.message) || "").match(/[a-z_]+$/);
    return t((code && S[lang][code[0]] && code[0]) || "failed");
  };

  async function load() {
    try {
      state.data = await ctx.api("/state");
      state.error = null;
    } catch (err) {
      state.error = (err && err.message) || String(err);
    }
    render();
  }

  async function act(path, options, done) {
    try {
      await ctx.api(path, options);
      if (done) toast(done);
      await load();
      return true;
    } catch (err) {
      toast(refusalText(err));
      return false;
    }
  }

  // ── Gates ────────────────────────────────────────────────

  const gates = () => state.data.gates;
  const gateLabel = (id) => {
    const gate = gates().find((g) => g.id === id);
    return gate ? gate.name || t("unnamedGate") : "?";
  };
  /** The tab actually shown — a remembered gate may have been removed since. */
  function currentTab() {
    if (!gates().length) return "none";
    const many = gates().length > 1;
    if (state.tab === "all" && many) return "all";
    if (gates().some((g) => g.id === state.tab)) return state.tab;
    return many ? "all" : gates()[0].id;
  }
  function selectTab(tab) {
    state.tab = tab;
    state.menu = null;
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* private window */ }
    render();
  }

  // ── Wording ──────────────────────────────────────────────

  function validityOf(row) {
    if (!row.validFrom && !row.validUntil) return t("always");
    if (row.validFrom && row.validUntil) return t("between", { a: fmt(row.validFrom), b: fmt(row.validUntil) });
    if (row.validFrom) return t("from", { d: fmt(row.validFrom) });
    return t("until", { d: fmt(row.validUntil) });
  }
  function hoursOf(row) {
    if (!row.timeWindows || !row.timeWindows.length) return t("anyHour");
    return t("hours", { w: row.timeWindows.map((w) => `${w.from}–${w.to}`).join(", ") });
  }

  // ── Rendering ────────────────────────────────────────────

  function tabs(tab) {
    const bar = el("div", "tabs");
    bar.setAttribute("role", "tablist");
    const add = (id, label, count, withIcon) => {
      const b = el("button", "tab");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tab === id));
      if (withIcon) b.appendChild(icon("door", 15));
      b.append(label);
      b.appendChild(el("span", "n", String(count)));
      b.onclick = () => selectTab(id);
      bar.appendChild(b);
    };
    if (gates().length > 1) add("all", t("allGates"), state.data.accesses.length, false);
    for (const gate of gates()) add(gate.id, gateLabel(gate.id), gate.accesses, true);
    const plus = el("button", "tab");
    plus.type = "button";
    plus.appendChild(icon("plus", 15));
    plus.append(t("addGate"));
    plus.onclick = () => openAddGate();
    bar.appendChild(plus);
    return bar;
  }

  function toolbar(tab) {
    const data = state.data;
    const bar = el("div", "toolbar");
    const shown = tab === "all" ? gates() : gates().filter((g) => g.id === tab);
    for (const gate of shown) {
      const chip = el("span", "chip");
      chip.appendChild(el("span", `dot ${gate.bound && gate.gateState !== "unknown" ? "ok" : gate.bound ? "" : "ko"}`));
      chip.append(`${gateLabel(gate.id)} · ${t(`gate_${gate.gateState}`)}`);
      bar.appendChild(chip);
    }
    // Said only when it is wrong: an open door is the normal state.
    if (!data.publicTree.open) {
      const chip = el("span", "chip");
      chip.appendChild(el("span", "dot ko"));
      chip.append(t("doorShut"));
      bar.appendChild(chip);
    }
    if (data.guestflow.configured) {
      const chip = el("span", "chip");
      chip.appendChild(el("span", `dot ${data.guestflow.linked ? "ok" : "ko"}`));
      chip.append(data.guestflow.linked ? t("guestflowOk", { d: fmt(data.guestflow.lastSyncAt) }) : t("guestflowKo"));
      chip.appendChild(iconButton("refresh", t("sync"), () => act("/sync", { method: "POST", body: {} }), "ib small"));
      bar.appendChild(chip);
    }
    bar.appendChild(el("span", "grow"));
    if (tab !== "all" && tab !== "none") {
      bar.appendChild(iconButton("trash", t("removeGate"), () => {
        if (confirm(t("confirmRemoveGate", { g: gateLabel(tab) }))) {
          act(`/gates/${tab}`, { method: "DELETE" }).then((ok) => ok && selectTab("all"));
        }
      }));
    }
    bar.appendChild(iconButton("history", t("journal"), () => openJournal(null)));
    if (tab === "none") return bar;
    const create = el("button", "primary");
    create.type = "button";
    create.appendChild(icon("plus", 16));
    create.append(t("newAccess"));
    create.onclick = () => openEditor(null, tab);
    bar.appendChild(create);
    return bar;
  }

  function notes(tab) {
    const data = state.data;
    const wrap = el("div", "notes tiny muted");
    const lines = [];
    if (!data.publicTree.open) lines.push(t("doorShutHelp"));
    if (!data.publicTree.guestBaseUrl) lines.push(t("noGuestUrl"));
    if (data.publicTree.guestBaseUrl && data.publicTree.guestPath !== data.publicTree.path) {
      lines.push(t("aliasNote", { link: `${data.publicTree.guestBaseUrl}${data.publicTree.guestPath}`, tree: data.publicTree.path }));
    }
    if (!data.recipe.answering) lines.push(t("recipeMissing"));
    if (data.guestflow.pendingPushes) lines.push(t("pending", { n: data.guestflow.pendingPushes }));
    for (const line of lines) wrap.appendChild(el("p", "", line));
    return lines.length ? wrap : null;
  }

  function filters() {
    const wrap = el("div", "toolbar");
    for (const [value, key] of [["all", "filterAll"], ["stay", "filterGuestflow"], ["manual", "filterMine"]]) {
      const chip = el("button", "chip filter", t(key));
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(state.kind === value));
      chip.onclick = () => { state.kind = value; render(); };
      wrap.appendChild(chip);
    }
    return wrap;
  }

  function rowOf(row, tab) {
    const live = row.state !== "ended" && row.state !== "revoked";
    const card = el("div", `row${row.state === "suspended" || !live ? " dim" : ""}`);

    const left = el("div");
    const who = el("div", "who");
    who.appendChild(el("span", "name", row.label));
    if (row.code) who.appendChild(el("span", "code", row.code));
    if (row.kind === "stay") who.appendChild(el("span", "tag", t("tagGuestflow")));
    // On « all », which gates this person opens is the one thing the row must add.
    if (tab === "all") who.appendChild(el("span", "tag", row.gates.map(gateLabel).join(" · ")));
    if (row.state === "suspended") who.appendChild(el("span", "tag", t("tagSuspended")));
    left.appendChild(who);

    const facts = el("div", "facts");
    const fact = (name, text, title) => {
      const span = el("span");
      if (name) span.appendChild(icon(name, 13));
      span.append(text);
      if (title) span.title = title;
      facts.appendChild(span);
    };
    if (row.source && row.source.property) fact(null, [row.source.property, row.source.reservationNumber].filter(Boolean).join(" · "));
    fact("calendar", validityOf(row));
    fact("clock", hoursOf(row));
    fact("phone", String(row.devices), t("phones", { n: row.devices }));
    fact(null, row.lastUsedAt ? t("lastUse", { d: fmt(row.lastUsedAt) }) : t("neverUsed"));
    left.appendChild(facts);
    card.appendChild(left);

    const acts = el("div", "acts");
    if (live) {
      if (row.invitationUrl) {
        acts.appendChild(iconButton("link", t("copyLink"), async () => {
          try { await navigator.clipboard.writeText(row.invitationUrl); toast(t("copied")); }
          catch { toast(row.invitationUrl); }
        }));
      }
      acts.appendChild(iconButton("pencil", t("edit"), () => openEditor(row, tab)));
      const held = row.state === "suspended";
      acts.appendChild(iconButton(held ? "play" : "pause", held ? t("resume") : t("suspend"), () =>
        act(`/accesses/${row.id}/${held ? "resume" : "suspend"}`, { method: "POST", body: {} })));
    }

    const anchor = el("span", "menu-anchor");
    const more = iconButton("more", t("more"), (event) => {
      event.stopPropagation();
      state.menu = state.menu === row.id ? null : row.id;
      render();
    });
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", String(state.menu === row.id));
    anchor.appendChild(more);
    if (state.menu === row.id) {
      const menu = el("div", "menu");
      menu.setAttribute("role", "menu");
      const item = (name, label, onClick, danger) => {
        const b = el("button", danger ? "danger" : "");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.appendChild(icon(name, 16));
        b.append(label);
        b.onclick = () => { state.menu = null; render(); onClick(); };
        menu.appendChild(b);
      };
      if (live) item("key", t("changeCode"), () => openChangeCode(row));
      item("history", t("journalOf"), () => openJournal(row));
      menu.appendChild(el("hr"));
      // A live access is revoked; only one that can no longer open is deleted.
      if (live) {
        item("ban", t("revoke"), () => {
          if (confirm(t("confirmRevoke"))) act(`/accesses/${row.id}/revoke`, { method: "POST", body: {} });
        }, true);
      } else {
        item("trash", t("remove"), () => {
          if (confirm(t("confirmRemove"))) act(`/accesses/${row.id}`, { method: "DELETE" });
        }, true);
      }
      anchor.appendChild(menu);
      queueMicrotask(() => menu.querySelector("button")?.focus());
    }
    acts.appendChild(anchor);
    card.appendChild(acts);
    return card;
  }

  function render() {
    root.querySelectorAll(":scope > :not(dialog):not(.toast)").forEach((n) => n.remove());
    if (state.error) {
      root.prepend(el("p", "muted", state.error));
      return;
    }
    if (!state.data) return;
    const tab = currentTab();
    const blocks = [];

    const title = el("div");
    title.appendChild(el("h2", "", t("title")));
    const sub = el("p", "muted tiny", t("subtitle"));
    sub.style.margin = "2px 0 0";
    title.appendChild(sub);
    blocks.push(title, tabs(tab), toolbar(tab));
    const n = notes(tab);
    if (n) blocks.push(n);
    for (const gate of gates()) {
      if (!gate.bound && (tab === "all" || tab === gate.id)) blocks.push(unboundBlock(gate));
    }
    if (tab === "none") {
      blocks.push(el("p", "muted", t("noGateYet")));
      root.prepend(...blocks);
      return;
    }
    // Without guestFlow, all three filters would show the same list.
    if (state.data.guestflow.configured) blocks.push(filters());

    const rows = state.data.accesses.filter(
      (r) => (tab === "all" || r.gates.includes(tab)) && (state.kind === "all" || r.kind === state.kind),
    );
    if (!rows.length) {
      blocks.push(el("p", "muted", tab === "all" ? t("empty") : t("emptyGate", { g: gateLabel(tab) })));
    }
    for (const group of GROUPS) {
      const inGroup = rows.filter((r) => r.state === group);
      if (!inGroup.length) continue;
      const section = el("section", "group");
      section.appendChild(el("h3", "", t(`group_${group}`)));
      for (const row of inGroup) section.appendChild(rowOf(row, tab));
      blocks.push(section);
    }
    root.prepend(...blocks);
  }

  // A menu closes on a click anywhere else, and on Escape.
  const closeMenu = (event) => {
    if (state.menu === null) return;
    if (event.type === "keydown" && event.key !== "Escape") return;
    if (event.type === "click" && event.target.closest && event.target.closest(".menu")) return;
    state.menu = null;
    render();
  };
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", closeMenu);
  cleanup.push(() => {
    document.removeEventListener("click", closeMenu);
    document.removeEventListener("keydown", closeMenu);
  });

  // ── Dialogs ──────────────────────────────────────────────

  function openDialog(build) {
    const dialog = document.createElement("dialog");
    const sheet = el("form", "sheet");
    sheet.method = "dialog";
    sheet.addEventListener("submit", (e) => e.preventDefault());
    dialog.appendChild(sheet);
    root.appendChild(dialog);
    build(sheet, () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
    return dialog;
  }
  const field = (label, control) => {
    const wrap = el("div", "field");
    const lbl = el("span", "lbl", label);
    wrap.append(lbl, control);
    return wrap;
  };
  const footer = (close, saveLabel, onSave, className = "btn main") => {
    const foot = el("div", "foot");
    const cancel = el("button", "btn", t("cancel"));
    cancel.type = "button";
    cancel.onclick = close;
    const save = el("button", className, saveLabel);
    save.type = "button";
    save.onclick = onSave;
    foot.append(cancel, save);
    return foot;
  };

  /**
   * « + portail » — pick the equipment. The list is the recipe's catalogue:
   * the house's gates by their Sowel names, the ones already listed shown but
   * not choosable. Nothing to type, nothing else to create.
   */
  function openAddGate(preselect) {
    openDialog((sheet, close) => {
      sheet.appendChild(el("h2", "", t("addGateTitle")));
      const catalog = state.data.catalog;
      if (!state.data.recipe.answering || !catalog.length) {
        sheet.appendChild(el("p", "hint", state.data.recipe.answering ? t("catalogEmpty") : t("noCatalog")));
        const foot = el("div", "foot");
        const b = el("button", "btn", t("close"));
        b.type = "button";
        b.onclick = close;
        foot.appendChild(b);
        sheet.appendChild(foot);
        return;
      }
      sheet.appendChild(el("p", "hint", t("addGateHelp")));
      const select = el("select");
      const first = el("option", "", t("pickEquipment"));
      first.value = "";
      select.appendChild(first);
      for (const entry of catalog) {
        const option = el("option", "", entry.taken ? t("alreadyListed", { g: entry.name }) : entry.name);
        option.value = entry.id;
        option.disabled = entry.taken;
        select.appendChild(option);
      }
      if (preselect) select.value = preselect;
      sheet.appendChild(field(t("gateEquipment"), select));
      if (catalog.every((e) => e.taken)) sheet.appendChild(el("p", "hint", t("allTaken")));
      const refusal = el("p", "refusal");
      refusal.hidden = true;
      sheet.appendChild(refusal);
      sheet.appendChild(footer(close, t("add"), async () => {
        try {
          const { gate } = await ctx.api("/gates", { method: "POST", body: { equipmentId: select.value } });
          close();
          remember(gate.id);
          await load();
        } catch (err) {
          refusal.textContent = refusalText(err);
          refusal.hidden = false;
        }
      }));
      queueMicrotask(() => select.focus());
    });
  }

  /** A gate that points at nothing the house has — pick its equipment again, inline. */
  function unboundBlock(gate) {
    const wrap = el("div", "toolbar notes");
    wrap.appendChild(el("span", "refusal", t("unbound", { g: gateLabel(gate.id) })));
    const select = el("select");
    const first = el("option", "", t("pickEquipment"));
    first.value = "";
    select.appendChild(first);
    for (const entry of state.data.catalog.filter((e) => !e.taken)) {
      const option = el("option", "", entry.name);
      option.value = entry.id;
      select.appendChild(option);
    }
    const go = el("button", "btn", t("bind"));
    go.type = "button";
    go.onclick = () => act(`/gates/${gate.id}`, { method: "PATCH", body: { equipmentId: select.value } });
    wrap.append(select, go);
    return wrap;
  }

  function remember(tab) {
    state.tab = tab;
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* private window */ }
  }

  function openChangeCode(row) {
    openDialog((sheet, close) => {
      sheet.appendChild(el("h2", "", t("changeCodeTitle", { n: row.label })));
      sheet.appendChild(el("p", "hint", t("changeCodeHelp")));
      const label = el("label", "cut");
      const box = el("input");
      box.type = "checkbox";
      label.append(box, t("cutPhones", { n: row.devices }));
      // Nothing to cut when no phone was ever set up — the choice would be noise.
      if (row.devices) sheet.appendChild(label);
      sheet.appendChild(footer(close, t("change"), async () => {
        close();
        await act(`/accesses/${row.id}/code`, { method: "POST", body: { cutPhones: box.checked } }, t("codeChanged"));
      }));
    });
  }

  /**
   * A day from a calendar, then the time from two standard lists — hours, and
   * minutes in steps of five.
   *
   * `lower` and `upper` are bounds read whenever it redraws, so moving « from »
   * re-greys « until ». Both are strict: « until » cannot equal « from ». What
   * falls outside is struck in the calendar and disabled in the two lists.
   */
  function dateTimePicker({ value, lower, upper, optional, onChange }) {
    let current = value || "";
    let view = null;
    const wrap = el("div", "dt");
    const rowEl = el("div", "dt-row");
    const trigger = el("button", "dt-trigger");
    trigger.type = "button";
    const hourSel = el("select", "dt-h");
    const minuteSel = el("select", "dt-m");
    hourSel.setAttribute("aria-label", lang === "en" ? "Hour" : "Heure");
    minuteSel.setAttribute("aria-label", "Minutes");
    const clear = iconButton("x", t("clear"), () => { current = ""; pop.hidden = true; paint(); onChange && onChange(current); });
    rowEl.append(trigger, hourSel, el("span", "muted", ":"), minuteSel);
    if (optional) rowEl.append(clear);
    const pop = el("div", "dt-pop");
    pop.hidden = true;
    wrap.append(rowEl, pop);

    const lo = () => (lower ? lower() : "");
    const hi = () => (upper ? upper() : "");
    const allowed = (wall) => (!lo() || wall > lo()) && (!hi() || wall < hi());
    const minutesOf = (hh) => {
      const list = [];
      for (let m = 0; m < 60; m += MINUTE_STEP) list.push(m);
      // A value typed elsewhere (a stay from guestFlow) stays choosable.
      const p = parts(current);
      if (p && p.h === hh && !list.includes(p.mi)) list.push(p.mi);
      return list.sort((x, y) => x - y);
    };
    const firstAllowed = (day) => {
      for (let h = 0; h < 24; h++) for (const m of minutesOf(h)) {
        const wall = `${day}T${pad(h)}:${pad(m)}`;
        if (allowed(wall)) return wall;
      }
      return null;
    };
    const lastAllowed = (day) => {
      for (let h = 23; h >= 0; h--) for (const m of minutesOf(h).reverse()) {
        const wall = `${day}T${pad(h)}:${pad(m)}`;
        if (allowed(wall)) return wall;
      }
      return null;
    };
    const dayAllowed = (day) => firstAllowed(day) !== null;

    function paintTime() {
      const p = parts(current);
      const day = current ? dayOf(current) : null;
      hourSel.replaceChildren();
      minuteSel.replaceChildren();
      hourSel.disabled = minuteSel.disabled = !day;
      for (let h = 0; h < 24; h++) {
        const option = el("option", "", pad(h));
        option.value = String(h);
        option.disabled = !!day && !minutesOf(h).some((m) => allowed(`${day}T${pad(h)}:${pad(m)}`));
        hourSel.appendChild(option);
      }
      const hh = p ? p.h : 0;
      for (const m of minutesOf(hh)) {
        const option = el("option", "", pad(m));
        option.value = String(m);
        option.disabled = !!day && !allowed(`${day}T${pad(hh)}:${pad(m)}`);
        minuteSel.appendChild(option);
      }
      if (p) {
        hourSel.value = String(p.h);
        minuteSel.value = String(p.mi);
      }
    }

    function paint() {
      trigger.replaceChildren(icon("calendar", 16));
      if (current) trigger.append(fmtDay(current));
      else trigger.appendChild(el("span", "ph", t("pick")));
      clear.hidden = !current;
      paintTime();
    }

    function set(wall) {
      current = wall;
      paint();
      drawPop();
      onChange && onChange(current);
    }

    hourSel.onchange = () => {
      const day = dayOf(current);
      const h = Number(hourSel.value);
      const p = parts(current);
      let wall = `${day}T${pad(h)}:${pad(p ? p.mi : 0)}`;
      // The minute kept if it still fits that hour, the first one that does if not.
      if (!allowed(wall)) {
        const m = minutesOf(h).find((mm) => allowed(`${day}T${pad(h)}:${pad(mm)}`));
        wall = `${day}T${pad(h)}:${pad(m ?? 0)}`;
      }
      set(wall);
    };
    minuteSel.onchange = () => set(`${dayOf(current)}T${pad(Number(hourSel.value))}:${pad(Number(minuteSel.value))}`);

    function drawPop() {
      if (pop.hidden) return;
      const base = parts(current || lo() || nextSlot());
      if (!view) view = { y: base.y, mo: base.mo };
      pop.replaceChildren();

      const head = el("div", "dt-head");
      const prev = iconButton("left", t("prevMonth"), () => { view = view.mo === 1 ? { y: view.y - 1, mo: 12 } : { y: view.y, mo: view.mo - 1 }; drawPop(); });
      const next = iconButton("right", t("nextMonth"), () => { view = view.mo === 12 ? { y: view.y + 1, mo: 1 } : { y: view.y, mo: view.mo + 1 }; drawPop(); });
      head.append(prev, el("span", "", monthFmt.format(new Date(Date.UTC(view.y, view.mo - 1, 1)))), next);
      pop.appendChild(head);

      const cal = el("div", "dt-cal");
      for (const d of t("weekdays").split(",")) cal.appendChild(el("b", "", d));
      const lead = (new Date(Date.UTC(view.y, view.mo - 1, 1)).getUTCDay() + 6) % 7;
      for (let i = 0; i < lead; i++) cal.appendChild(el("span"));
      const days = new Date(Date.UTC(view.y, view.mo, 0)).getUTCDate();
      for (let d = 1; d <= days; d++) {
        const day = `${view.y}-${pad(view.mo)}-${pad(d)}`;
        const b = el("button", "", String(d));
        b.type = "button";
        b.disabled = !dayAllowed(day);
        if (current && dayOf(current) === day) b.classList.add("sel");
        if (lo() && dayOf(lo()) === day) b.classList.add("bound");
        b.onclick = () => {
          const time = current ? current.slice(11) : "08:00";
          let wall = `${day}T${time}`;
          // The same day as the bound, at a time outside it: the nearest time
          // that fits rather than a value the next click would have to fix.
          if (!allowed(wall)) wall = (lo() && wall <= lo() ? firstAllowed(day) : lastAllowed(day)) ?? wall;
          pop.hidden = true;
          set(wall);
        };
        cal.appendChild(b);
      }
      pop.appendChild(cal);
    }

    trigger.onclick = () => {
      // One open at a time, so the sheet never grows two calendars.
      for (const other of wrap.closest("form").querySelectorAll(".dt-pop")) if (other !== pop) other.hidden = true;
      pop.hidden = !pop.hidden;
      view = null;
      drawPop();
    };
    paint();
    return {
      el: wrap,
      get: () => current,
      set: (wall) => { current = wall; paint(); drawPop(); },
      /** Redraw against bounds that moved. */
      refresh: () => { paintTime(); drawPop(); },
    };
  }

  function openEditor(row, tab) {
    openDialog((form, close) => {
      form.appendChild(el("h2", "", row ? row.label : t("newAccess")));

      const labelInput = el("input");
      labelInput.value = row ? row.label : "";
      labelInput.required = true;
      form.appendChild(field(t("label"), labelInput));

      // With one gate there is nothing to choose, and the access opens it.
      let gateBoxes = [];
      if (gates().length > 1) {
        const checks = el("div", "checks");
        const ticked = row ? row.gates : [tab === "all" ? gates()[0].id : tab];
        gateBoxes = gates().map((gate) => {
          const label = el("label");
          const box = el("input");
          box.type = "checkbox";
          box.value = gate.id;
          box.checked = ticked.includes(gate.id);
          label.append(box, gateLabel(gate.id));
          checks.appendChild(label);
          return box;
        });
        form.appendChild(field(t("gates"), checks));
      }

      const isStay = row && row.kind === "stay";
      let collect;

      if (isStay) {
        const stayFrom = toLocal(row.stayWindow && row.stayWindow.from);
        const stayTo = toLocal(row.stayWindow && row.stayWindow.to);
        form.appendChild(el("p", "hint", `${t("stayWindow")} : ${fmtWall(stayFrom)} → ${fmtWall(stayTo)}. ${t("stayReadOnly")}`));
        // « Open from » only ever earlier than the arrival, « extend » only
        // ever later than the departure — the two widen, never shorten.
        const early = dateTimePicker({ value: toLocal(row.earlyOpenedAt), upper: () => stayFrom, optional: true });
        const extend = dateTimePicker({ value: toLocal(row.extendedUntil), lower: () => stayTo, optional: true });
        form.appendChild(field(t("earlyOpen"), early.el));
        form.appendChild(field(t("extend"), extend.el));
        collect = () => ({ earlyOpenedAt: early.get() || null, extendedUntil: extend.get() || null });
      } else {
        const mode = el("select");
        for (const [value, key] of [["permanent", "permanent"], ["ranged", "ranged"]]) {
          const option = el("option", "", t(key));
          option.value = value;
          mode.appendChild(option);
        }
        mode.value = row && (row.validFrom || row.validUntil) ? "ranged" : "permanent";
        form.appendChild(field(t("validity"), mode));

        const shiftNote = el("p", "hint", t("shifted"));
        shiftNote.hidden = true;
        let fromValue = toLocal(row && row.validFrom);
        let toValue = toLocal(row && row.validUntil);
        const toPicker = dateTimePicker({
          value: toValue,
          // The start as last set — a plain value, not the other picker, which
          // does not exist yet while this one draws itself the first time.
          lower: () => fromValue,
          onChange: (v) => { toValue = v; shiftNote.hidden = true; },
        });
        const fromPicker = dateTimePicker({
          value: fromValue,
          onChange: (v) => {
            // Moving the start past the end carries the end along, keeping the
            // length — never leaving the two the wrong way round.
            if (fromValue && toValue && v >= toValue) {
              toValue = addMinutes(v, Math.max(MINUTE_STEP, minutesBetween(fromValue, toValue)));
              toPicker.set(toValue);
              shiftNote.hidden = false;
            } else if (!fromValue && toValue && v >= toValue) {
              toValue = addMinutes(v, 24 * 60);
              toPicker.set(toValue);
              shiftNote.hidden = false;
            }
            fromValue = v;
            toPicker.refresh();
          },
        });
        const fromField = field(t("validFrom"), fromPicker.el);
        const toField = field(t("validUntil"), toPicker.el);
        toField.appendChild(shiftNote);
        form.append(fromField, toField);

        const sync = () => {
          const ranged = mode.value === "ranged";
          fromField.hidden = !ranged;
          toField.hidden = !ranged;
          // A period starts somewhere: now, and for a day, until said otherwise.
          if (ranged && !fromPicker.get()) {
            fromValue = nextSlot();
            fromPicker.set(fromValue);
          }
          if (ranged && !toPicker.get()) {
            toValue = addMinutes(fromPicker.get(), 24 * 60);
            toPicker.set(toValue);
          }
        };
        mode.onchange = sync;
        sync();
        collect = () => {
          const ranged = mode.value === "ranged";
          return { validFrom: ranged ? fromPicker.get() || null : null, validUntil: ranged ? toPicker.get() || null : null };
        };
      }

      const windows = el("div", "windows");
      const addWindow = (window) => {
        const line = el("div", "window");
        const from = el("input");
        from.type = "time";
        from.value = (window && window.from) || "08:00";
        const to = el("input");
        to.type = "time";
        to.value = (window && window.to) || "20:00";
        line.append(from, document.createTextNode("→"), to, iconButton("x", t("removeHours"), () => line.remove()));
        windows.appendChild(line);
      };
      for (const window of (row && row.timeWindows) || []) addWindow(window);
      const addButton = el("button", "btn link");
      addButton.type = "button";
      addButton.appendChild(icon("plus", 14));
      addButton.append(` ${t("addHours")}`);
      addButton.onclick = () => addWindow(null);
      form.append(windows, addButton);

      const refusal = el("p", "refusal");
      refusal.hidden = true;
      form.appendChild(refusal);

      form.appendChild(footer(close, t("save"), async () => {
        const payload = {
          label: labelInput.value,
          timeWindows: [...windows.querySelectorAll(".window")].map((line) => {
            const [from, to] = line.querySelectorAll("input");
            return { from: from.value, to: to.value };
          }),
          ...collect(),
        };
        if (gateBoxes.length) payload.gates = gateBoxes.filter((b) => b.checked).map((b) => b.value);
        try {
          if (row) await ctx.api(`/accesses/${row.id}`, { method: "PATCH", body: payload });
          else await ctx.api("/accesses", { method: "POST", body: payload });
          close();
          await load();
        } catch (err) {
          refusal.textContent = refusalText(err);
          refusal.hidden = false;
        }
      }));
    });
  }

  // ── The journal ──────────────────────────────────────────

  async function openJournal(row) {
    let list;
    openDialog((sheet, close) => {
      sheet.appendChild(el("h2", "", row ? `${t("journal")} · ${row.label}` : t("journal")));
      list = el("div", "journal");
      sheet.appendChild(list);
      const foot = el("div", "foot");
      const b = el("button", "btn", t("close"));
      b.type = "button";
      b.onclick = close;
      foot.appendChild(b);
      sheet.appendChild(foot);
    });
    try {
      const query = row ? `?accessId=${encodeURIComponent(row.id)}` : "";
      const { entries } = await ctx.api(`/journal${query}`);
      if (!entries.length) { list.textContent = t("journalEmpty"); return; }
      const many = gates().length > 1;
      for (const entry of entries) {
        const line = el("div", "line");
        line.appendChild(el("span", "when", fmt(entry.at)));
        line.appendChild(el("span", "", [
          entry.label,
          t(`kind_${entry.kind}`),
          many && entry.gate ? gateLabel(entry.gate) : "",
          entry.reason,
          entry.actor ? `(${entry.actor})` : "",
        ].filter(Boolean).join(" · ")));
        list.appendChild(line);
      }
    } catch (err) {
      list.textContent = (err && err.message) || t("failed");
    }
  }

  // The page reads when it is shown and when it comes back to the foreground.
  // No timer: a list of door codes does not need to be re-fetched every ten
  // seconds, and a tab left open all day should cost nothing.
  const onVisible = () => {
    if (!document.hidden) void load();
  };
  document.addEventListener("visibilitychange", onVisible);
  cleanup.push(() => document.removeEventListener("visibilitychange", onVisible));

  await load();

  // Arriving from an equipment's own page (core spec 180 R1.6.ter): show that
  // gate, or — when it has no list yet — offer to add it, already picked.
  const wanted = ctx.params && ctx.params.equipment;
  if (wanted && state.data) {
    const gate = gates().find((g) => g.equipmentId === wanted);
    if (gate) selectTab(gate.id);
    else openAddGate(wanted);
  }
}

export function unmount(container) {
  for (const undo of cleanup.splice(0)) undo();
  container.replaceChildren();
}
