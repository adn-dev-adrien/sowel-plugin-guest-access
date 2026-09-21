/**
 * « Accès partagés » — the owner's page, inside Sowel (core spec 180).
 *
 * Plain DOM: this module is imported by Sowel's SPA and handed a container and
 * a context. It styles itself with Sowel's own design tokens, so it follows the
 * light and dark themes without knowing which one is on.
 *
 * It holds NO rule. Every state, every group and every refusal arrives shaped
 * from the plugin (`admin-api.ts`); what happens here is drawing, and the dates
 * are formatted with the viewer's own locale.
 */

const S = {
  fr: {
    title: "Accès partagés",
    subtitle: "Qui peut ouvrir, et jusqu'à quand.",
    houseGate: "Ouverture",
    gate_open: "ouvert",
    gate_closed: "fermé",
    gate_unknown: "état inconnu",
    recipeMissing: "Aucune recette n'a encore répondu — vérifiez que la recette « Accès partagés » est liée à cet équipement.",
    doorOpen: "Page d'ouverture en ligne",
    doorShut: "Page d'ouverture fermée",
    doorShutHelp: "Ouvrez « Accès public » dans Plugins → Accès partagés, sinon les liens répondent 404.",
    noGuestUrl: "Adresse publique de Sowel non renseignée : les liens d'accès ne peuvent pas être fabriqués (Réglages du plugin).",
    aliasNote: "Les liens pointent vers {link} — ce nom doit réécrire tout son arbre vers {tree}, pas seulement sa racine, sinon la page s'affiche sans style et les boutons ne répondent pas.",
    guestflowOff: "Aucun guestFlow configuré — les accès sont créés à la main.",
    guestflowOk: "guestFlow synchronisé",
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
    empty: "Aucun accès.",
    tagGuestflow: "guestFlow",
    tagMine: "créé par moi",
    always: "En permanence",
    from: "À partir du {d}",
    until: "Jusqu'au {d}",
    between: "Du {a} au {b}",
    hours: "Tous les jours {w}",
    anyHour: "À toute heure",
    devices: "{n} téléphone(s)",
    neverUsed: "Jamais utilisé",
    lastUse: "Dernier usage {d}",
    code: "Code",
    copyLink: "Copier le lien",
    copied: "Lien copié",
    edit: "Modifier",
    suspend: "Suspendre",
    resume: "Reprendre",
    invitation: "Nouvelle invitation",
    regenerate: "Régénérer l'accès",
    revoke: "Révoquer",
    remove: "Supprimer",
    journal: "Journal",
    close: "Fermer",
    save: "Enregistrer",
    cancel: "Annuler",
    label: "Pour qui",
    validFrom: "Valable à partir du",
    validUntil: "Jusqu'au",
    permanent: "En permanence",
    ranged: "Sur une période",
    addHours: "Ajouter une plage horaire",
    stayWindow: "Séjour",
    earlyOpen: "Ouvrir dès",
    extend: "Prolonger jusqu'au",
    stayReadOnly: "Le séjour vient de guestFlow — utilisez les deux champs ci-dessous pour élargir l'accès.",
    confirmInvitation: "Le code et le lien changent. Les téléphones déjà configurés continuent de fonctionner.",
    confirmRegenerate: "Le code change ET tous les téléphones sont coupés : chacun devra être reconfiguré.",
    confirmRevoke: "L'accès cesse immédiatement et les téléphones sont coupés.",
    confirmRemove: "L'accès disparaît de la liste. Le journal, lui, est conservé.",
    required: "Un nom est nécessaire.",
    bad_date: "Date incompréhensible.",
    end_before_start: "La fin doit venir après le début.",
    overlap: "Deux plages se chevauchent.",
    bad_time: "Heure incompréhensible (HH:MM).",
    not_a_list: "Plages horaires invalides.",
    not_earlier: "« Ouvrir dès » doit précéder le début du séjour.",
    not_later: "« Prolonger » doit dépasser la fin du séjour — sinon, suspendez.",
    failed: "L'opération a échoué.",
    journalEmpty: "Rien encore.",
    kind_created: "créé",
    kind_edited: "modifié",
    kind_suspended: "suspendu",
    kind_resumed: "repris",
    kind_revoked: "révoqué",
    kind_deleted: "supprimé",
    kind_invitation: "nouvelle invitation",
    kind_regenerated: "régénéré",
    kind_enrolled: "téléphone configuré",
    kind_opened: "ouverture commandée",
    kind_refused: "refusé",
    kind_failed: "échec",
    kind_bad_code: "code incorrect",
    kind_stay_updated: "séjour mis à jour",
    kind_stay_cancelled: "séjour annulé",
  },
  en: {
    title: "Shared access",
    subtitle: "Who may open, and until when.",
    houseGate: "Opening",
    gate_open: "open",
    gate_closed: "closed",
    gate_unknown: "state unknown",
    recipeMissing: "No recipe has answered yet — check that the « Shared access » recipe is bound to this equipment.",
    doorOpen: "Opening page is online",
    doorShut: "Opening page is shut",
    doorShutHelp: "Open « Public access » in Plugins → Shared access, or the links answer 404.",
    noGuestUrl: "Sowel's public address is not set: access links cannot be built (plugin settings).",
    aliasNote: "Links point to {link} — that name must rewrite its whole tree onto {tree}, not just its root, or the page loads without its style and its buttons do nothing.",
    guestflowOff: "No guestFlow configured — accesses are made by hand.",
    guestflowOk: "guestFlow in step",
    guestflowKo: "guestFlow unreachable",
    pending: "{n} invitation(s) waiting to be sent",
    sync: "Sync now",
    newAccess: "New access",
    filterAll: "All",
    filterGuestflow: "guestFlow",
    filterMine: "Made by me",
    group_active: "Active",
    group_scheduled: "Upcoming",
    group_suspended: "On hold",
    group_revoked: "Revoked",
    group_ended: "Finished",
    empty: "No access yet.",
    tagGuestflow: "guestFlow",
    tagMine: "made by me",
    always: "Always",
    from: "From {d}",
    until: "Until {d}",
    between: "From {a} to {b}",
    hours: "Every day {w}",
    anyHour: "Any hour",
    devices: "{n} phone(s)",
    neverUsed: "Never used",
    lastUse: "Last used {d}",
    code: "Code",
    copyLink: "Copy the link",
    copied: "Link copied",
    edit: "Edit",
    suspend: "Hold",
    resume: "Resume",
    invitation: "New invitation",
    regenerate: "Regenerate access",
    revoke: "Revoke",
    remove: "Delete",
    journal: "Journal",
    close: "Close",
    save: "Save",
    cancel: "Cancel",
    label: "Who it is for",
    validFrom: "Valid from",
    validUntil: "Until",
    permanent: "Always",
    ranged: "Over a period",
    addHours: "Add a time window",
    stayWindow: "Stay",
    earlyOpen: "Open from",
    extend: "Extend until",
    stayReadOnly: "The stay comes from guestFlow — use the two fields below to widen the access.",
    confirmInvitation: "The code and the link change. Phones already set up keep working.",
    confirmRegenerate: "The code changes AND every phone is cut off: each must be set up again.",
    confirmRevoke: "The access stops at once and the phones are cut off.",
    confirmRemove: "The access leaves the list. The journal is kept.",
    required: "A name is needed.",
    bad_date: "That date cannot be read.",
    end_before_start: "The end must come after the start.",
    overlap: "Two windows overlap.",
    bad_time: "That time cannot be read (HH:MM).",
    not_a_list: "Invalid time windows.",
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
    kind_invitation: "new invitation",
    kind_regenerated: "regenerated",
    kind_enrolled: "phone set up",
    kind_opened: "opening sent",
    kind_refused: "refused",
    kind_failed: "failed",
    kind_bad_code: "wrong code",
    kind_stay_updated: "stay updated",
    kind_stay_cancelled: "stay cancelled",
  },
};

const CSS = `
.ga { display: grid; gap: 16px; font-size: 14px; color: var(--color-text, #16202a); }
.ga h2 { font-size: 18px; font-weight: 600; margin: 0; }
.ga .muted { color: var(--color-text-secondary, #5c6b79); }
.ga .tiny { font-size: 12px; }
.ga .card { background: var(--color-surface, #fff); border: 1px solid var(--color-border-light, #e5e9ed); border-radius: var(--radius-lg, 12px); padding: 14px 16px; }
.ga .bar { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; justify-content: space-between; }
.ga .chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ga .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--color-border-light, #e5e9ed); border-radius: 999px; padding: 4px 12px; font-size: 12px; background: transparent; color: inherit; cursor: pointer; min-height: 32px; }
.ga .chip[aria-pressed="true"] { background: var(--color-primary, #1A4F6E); border-color: var(--color-primary, #1A4F6E); color: #fff; }
.ga .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-text-tertiary, #9aa8b4); }
.ga .dot.ok { background: var(--color-success, #2e7d32); }
.ga .dot.warn { background: var(--color-warning, #F2C035); }
.ga .dot.ko { background: var(--color-error, #b3261e); }
.ga button.action { min-height: 36px; padding: 0 14px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border, #dfe4e9); background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: 13px; }
.ga button.action:hover { background: var(--color-border-light, #eef1f4); }
.ga button.primary { background: var(--color-primary, #1A4F6E); border-color: var(--color-primary, #1A4F6E); color: #fff; }
.ga button.danger { color: var(--color-error, #b3261e); border-color: var(--color-error, #b3261e); }
.ga .group { display: grid; gap: 8px; }
.ga .group h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-tertiary, #9aa8b4); margin: 8px 0 0; font-weight: 600; }
.ga .row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: start; }
.ga .row .who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.ga .row .name { font-weight: 600; }
.ga .tag { font-size: 11px; border-radius: 999px; padding: 2px 8px; background: var(--color-border-light, #eef1f4); color: var(--color-text-secondary, #5c6b79); }
.ga .code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 15px; letter-spacing: 1px; }
.ga .row .acts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.ga .facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; }
.ga dialog { border: 0; border-radius: var(--radius-lg, 12px); padding: 0; background: var(--color-surface, #fff); color: inherit; max-width: 520px; width: calc(100vw - 32px); }
.ga dialog::backdrop { background: rgba(0,0,0,.4); }
.ga .sheet { padding: 18px; display: grid; gap: 14px; }
.ga .field { display: grid; gap: 6px; }
.ga .field label { font-size: 12px; color: var(--color-text-secondary, #5c6b79); }
.ga input, .ga select { font: inherit; padding: 9px 10px; border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border, #dfe4e9); background: transparent; color: inherit; min-height: 40px; }
.ga .windows { display: grid; gap: 8px; }
.ga .window { display: flex; gap: 8px; align-items: center; }
.ga .refusal { color: var(--color-error, #b3261e); font-size: 12px; }
.ga .journal { display: grid; gap: 6px; max-height: 320px; overflow: auto; }
.ga .journal .line { display: flex; gap: 10px; font-size: 12px; }
.ga .journal .when { color: var(--color-text-tertiary, #9aa8b4); font-variant-numeric: tabular-nums; }
.ga .toast { position: fixed; inset-inline: 0; bottom: 20px; margin: auto; width: max-content; background: var(--color-text, #16202a); color: var(--color-surface, #fff); padding: 8px 14px; border-radius: 999px; font-size: 13px; z-index: 50; }
@media (max-width: 640px) {
  .ga .row { grid-template-columns: 1fr; }
  .ga .row .acts { justify-content: flex-start; }
}
`;

let cleanup = [];

export async function mount(container, ctx) {
  const lang = (ctx.locale || "fr").startsWith("en") ? "en" : "fr";
  const t = (key, vars) => {
    let text = S[lang][key] ?? S.fr[key] ?? key;
    for (const [k, v] of Object.entries(vars || {})) text = text.replace(`{${k}}`, v);
    return text;
  };
  const dateFmt = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const fmt = (iso) => (iso ? dateFmt.format(new Date(iso)) : "");

  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "ga";
  container.replaceChildren(style, root);

  const state = { data: null, kind: "all", error: null };

  const toast = (message) => {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  };

  async function load() {
    try {
      state.data = await ctx.api("/state");
      state.error = null;
    } catch (err) {
      state.error = err && err.message ? err.message : String(err);
    }
    render();
  }

  async function act(path, options) {
    try {
      await ctx.api(path, options);
      await load();
      return true;
    } catch (err) {
      toast((err && err.message) || t("failed"));
      return false;
    }
  }

  // ── Wording ──────────────────────────────────────────────

  function validityOf(row) {
    if (!row.validFrom && !row.validUntil) return t("always");
    if (row.validFrom && row.validUntil)
      return t("between", { a: fmt(row.validFrom), b: fmt(row.validUntil) });
    if (row.validFrom) return t("from", { d: fmt(row.validFrom) });
    return t("until", { d: fmt(row.validUntil) });
  }

  function hoursOf(row) {
    if (!row.timeWindows || !row.timeWindows.length) return t("anyHour");
    return t("hours", { w: row.timeWindows.map((w) => `${w.from}–${w.to}`).join(", ") });
  }

  // ── Rendering ────────────────────────────────────────────

  function header() {
    const data = state.data;
    const card = document.createElement("div");
    card.className = "card bar";

    const left = document.createElement("div");
    left.style.display = "grid";
    left.style.gap = "6px";

    const houseLine = document.createElement("div");
    houseLine.className = "chips";
    const gate = document.createElement("span");
    gate.className = "chip";
    gate.setAttribute("aria-pressed", "false");
    gate.innerHTML = `<span class="dot ${data.house.gateState === "unknown" ? "" : "ok"}"></span>`;
    gate.append(`${data.house.openingLabel || t("houseGate")} · ${t(`gate_${data.house.gateState}`)}`);
    houseLine.appendChild(gate);

    const door = document.createElement("span");
    door.className = "chip";
    door.setAttribute("aria-pressed", "false");
    door.innerHTML = `<span class="dot ${data.publicTree.open ? "ok" : "ko"}"></span>`;
    door.append(data.publicTree.open ? t("doorOpen") : t("doorShut"));
    houseLine.appendChild(door);

    const gf = document.createElement("span");
    gf.className = "chip";
    gf.setAttribute("aria-pressed", "false");
    const gfState = !data.guestflow.configured ? "" : data.guestflow.linked ? "ok" : "ko";
    gf.innerHTML = `<span class="dot ${gfState}"></span>`;
    gf.append(
      !data.guestflow.configured
        ? t("guestflowOff")
        : data.guestflow.linked
          ? `${t("guestflowOk")} · ${fmt(data.guestflow.lastSyncAt)}`
          : t("guestflowKo"),
    );
    houseLine.appendChild(gf);
    left.appendChild(houseLine);

    const notes = [];
    if (!data.publicTree.open) notes.push(t("doorShutHelp"));
    if (!data.publicTree.guestBaseUrl) notes.push(t("noGuestUrl"));
    if (data.publicTree.guestBaseUrl && data.publicTree.guestPath !== data.publicTree.path)
      notes.push(
        t("aliasNote", {
          link: `${data.publicTree.guestBaseUrl}${data.publicTree.guestPath}`,
          tree: data.publicTree.path,
        }),
      );
    if (!data.house.recipeAnswering) notes.push(t("recipeMissing"));
    if (data.guestflow.pendingPushes)
      notes.push(t("pending", { n: data.guestflow.pendingPushes }));
    for (const note of notes) {
      const p = document.createElement("p");
      p.className = "tiny muted";
      p.style.margin = "0";
      p.textContent = note;
      left.appendChild(p);
    }
    card.appendChild(left);

    const acts = document.createElement("div");
    acts.className = "acts";
    acts.style.display = "flex";
    acts.style.gap = "8px";
    if (data.guestflow.configured) {
      const sync = document.createElement("button");
      sync.className = "action";
      sync.textContent = t("sync");
      sync.onclick = () => act("/sync", { method: "POST", body: {} });
      acts.appendChild(sync);
    }
    const create = document.createElement("button");
    create.className = "action primary";
    create.textContent = t("newAccess");
    create.onclick = () => openEditor(null);
    acts.appendChild(create);
    card.appendChild(acts);
    return card;
  }

  function filters() {
    const wrap = document.createElement("div");
    wrap.className = "chips";
    for (const [value, key] of [
      ["all", "filterAll"],
      ["stay", "filterGuestflow"],
      ["manual", "filterMine"],
    ]) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.textContent = t(key);
      chip.setAttribute("aria-pressed", String(state.kind === value));
      chip.onclick = () => {
        state.kind = value;
        render();
      };
      wrap.appendChild(chip);
    }
    const journal = document.createElement("button");
    journal.className = "chip";
    journal.type = "button";
    journal.textContent = t("journal");
    journal.setAttribute("aria-pressed", "false");
    journal.onclick = () => openJournal(null);
    wrap.appendChild(journal);
    return wrap;
  }

  function rowOf(row) {
    const card = document.createElement("div");
    card.className = "card row";

    const left = document.createElement("div");
    const who = document.createElement("div");
    who.className = "who";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.label;
    who.appendChild(name);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = row.kind === "stay" ? t("tagGuestflow") : t("tagMine");
    who.appendChild(tag);

    if (row.code) {
      const code = document.createElement("span");
      code.className = "code";
      code.textContent = row.code;
      who.appendChild(code);
    }
    left.appendChild(who);

    const facts = document.createElement("div");
    facts.className = "facts tiny muted";
    const bits = [
      validityOf(row),
      hoursOf(row),
      t("devices", { n: row.devices }),
      row.lastUsedAt ? t("lastUse", { d: fmt(row.lastUsedAt) }) : t("neverUsed"),
    ];
    if (row.source && row.source.property) {
      bits.unshift([row.source.property, row.source.reservationNumber].filter(Boolean).join(" · "));
    }
    for (const bit of bits) {
      const span = document.createElement("span");
      span.textContent = bit;
      facts.appendChild(span);
    }
    left.appendChild(facts);
    card.appendChild(left);

    const acts = document.createElement("div");
    acts.className = "acts";
    const button = (label, handler, className) => {
      const b = document.createElement("button");
      b.className = `action ${className || ""}`;
      b.type = "button";
      b.textContent = label;
      b.onclick = handler;
      acts.appendChild(b);
      return b;
    };

    if (row.invitationUrl) {
      button(t("copyLink"), async () => {
        try {
          await navigator.clipboard.writeText(row.invitationUrl);
          toast(t("copied"));
        } catch {
          toast(row.invitationUrl);
        }
      });
    }
    // A finished access shows no action: there is nothing left to decide.
    if (row.state !== "ended" && row.state !== "revoked") {
      button(t("edit"), () => openEditor(row));
      button(
        row.state === "suspended" ? t("resume") : t("suspend"),
        () => act(`/accesses/${row.id}/${row.state === "suspended" ? "resume" : "suspend"}`, { method: "POST", body: {} }),
      );
      button(t("invitation"), () => {
        if (confirm(t("confirmInvitation")))
          act(`/accesses/${row.id}/invitation`, { method: "POST", body: {} });
      });
      button(t("regenerate"), () => {
        if (confirm(t("confirmRegenerate")))
          act(`/accesses/${row.id}/regenerate`, { method: "POST", body: {} });
      });
      button(
        t("revoke"),
        () => {
          if (confirm(t("confirmRevoke")))
            act(`/accesses/${row.id}/revoke`, { method: "POST", body: {} });
        },
        "danger",
      );
    }
    button(t("journal"), () => openJournal(row));
    button(
      t("remove"),
      () => {
        if (confirm(t("confirmRemove"))) act(`/accesses/${row.id}`, { method: "DELETE" });
      },
      "danger",
    );
    card.appendChild(acts);
    return card;
  }

  function render() {
    root.replaceChildren();
    if (state.error) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = state.error;
      root.appendChild(p);
      return;
    }
    if (!state.data) return;

    const title = document.createElement("div");
    title.innerHTML = `<h2>${t("title")}</h2><p class="muted tiny" style="margin:2px 0 0">${t("subtitle")}</p>`;
    root.appendChild(title);
    root.appendChild(header());
    root.appendChild(filters());

    const rows = state.data.accesses.filter((r) => state.kind === "all" || r.kind === state.kind);
    if (!rows.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = t("empty");
      root.appendChild(p);
      return;
    }

    for (const group of ["active", "scheduled", "suspended", "revoked", "ended"]) {
      const inGroup = rows.filter((r) => r.state === group);
      if (!inGroup.length) continue;
      const section = document.createElement("section");
      section.className = "group";
      const heading = document.createElement("h3");
      heading.textContent = t(`group_${group}`);
      section.appendChild(heading);
      for (const row of inGroup) section.appendChild(rowOf(row));
      root.appendChild(section);
    }
  }

  // ── The editor ───────────────────────────────────────────

  function openEditor(row) {
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    form.className = "sheet";
    form.method = "dialog";

    const heading = document.createElement("h2");
    heading.textContent = row ? row.label : t("newAccess");
    form.appendChild(heading);

    const refusal = document.createElement("p");
    refusal.className = "refusal";
    refusal.hidden = true;

    const field = (labelText, input) => {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      label.textContent = labelText;
      label.htmlFor = input.id;
      wrap.append(label, input);
      return wrap;
    };

    const labelInput = document.createElement("input");
    labelInput.id = "ga-label";
    labelInput.value = row ? row.label : "";
    labelInput.required = true;
    form.appendChild(field(t("label"), labelInput));

    const isStay = row && row.kind === "stay";
    let fromInput = null;
    let toInput = null;
    let earlyInput = null;
    let extendInput = null;

    const toLocal = (iso) => {
      if (!iso) return "";
      const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso));
      return parts.replace(" ", "T");
    };

    if (isStay) {
      const stay = document.createElement("p");
      stay.className = "tiny muted";
      stay.textContent = `${t("stayWindow")} : ${fmt(row.stayWindow && row.stayWindow.from)} → ${fmt(row.stayWindow && row.stayWindow.to)}. ${t("stayReadOnly")}`;
      form.appendChild(stay);

      earlyInput = document.createElement("input");
      earlyInput.type = "datetime-local";
      earlyInput.id = "ga-early";
      earlyInput.value = toLocal(row.earlyOpenedAt);
      form.appendChild(field(t("earlyOpen"), earlyInput));

      extendInput = document.createElement("input");
      extendInput.type = "datetime-local";
      extendInput.id = "ga-extend";
      extendInput.value = toLocal(row.extendedUntil);
      form.appendChild(field(t("extend"), extendInput));
    } else {
      const mode = document.createElement("select");
      mode.id = "ga-mode";
      for (const [value, key] of [
        ["permanent", "permanent"],
        ["ranged", "ranged"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = t(key);
        mode.appendChild(option);
      }
      mode.value = row && (row.validFrom || row.validUntil) ? "ranged" : "permanent";
      form.appendChild(field(t("validFrom"), mode));

      fromInput = document.createElement("input");
      fromInput.type = "datetime-local";
      fromInput.id = "ga-from";
      fromInput.value = toLocal(row && row.validFrom);
      const fromField = field(t("validFrom"), fromInput);

      toInput = document.createElement("input");
      toInput.type = "datetime-local";
      toInput.id = "ga-to";
      toInput.value = toLocal(row && row.validUntil);
      const toField = field(t("validUntil"), toInput);

      const sync = () => {
        const ranged = mode.value === "ranged";
        fromField.hidden = !ranged;
        toField.hidden = !ranged;
      };
      mode.onchange = sync;
      form.append(fromField, toField);
      sync();
    }

    const windows = document.createElement("div");
    windows.className = "windows";
    const addWindow = (window) => {
      const line = document.createElement("div");
      line.className = "window";
      const from = document.createElement("input");
      from.type = "time";
      from.value = (window && window.from) || "08:00";
      const to = document.createElement("input");
      to.type = "time";
      to.value = (window && window.to) || "20:00";
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "action";
      drop.textContent = "×";
      drop.onclick = () => line.remove();
      line.append(from, document.createTextNode("→"), to, drop);
      windows.appendChild(line);
    };
    for (const window of (row && row.timeWindows) || []) addWindow(window);
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "action";
    addButton.textContent = t("addHours");
    addButton.onclick = () => addWindow(null);
    form.append(windows, addButton, refusal);

    const buttons = document.createElement("div");
    buttons.style.display = "flex";
    buttons.style.gap = "8px";
    buttons.style.justifyContent = "flex-end";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "action";
    cancel.textContent = t("cancel");
    cancel.onclick = () => dialog.close();
    const save = document.createElement("button");
    save.type = "button";
    save.className = "action primary";
    save.textContent = t("save");
    buttons.append(cancel, save);
    form.appendChild(buttons);

    const collectWindows = () =>
      [...windows.querySelectorAll(".window")].map((line) => {
        const [from, to] = line.querySelectorAll("input");
        return { from: from.value, to: to.value };
      });

    save.onclick = async () => {
      const payload = { label: labelInput.value, timeWindows: collectWindows() };
      if (isStay) {
        payload.earlyOpenedAt = earlyInput.value || null;
        payload.extendedUntil = extendInput.value || null;
      } else {
        const ranged = form.querySelector("#ga-mode").value === "ranged";
        payload.validFrom = ranged ? fromInput.value || null : null;
        payload.validUntil = ranged ? toInput.value || null : null;
      }
      try {
        if (row) await ctx.api(`/accesses/${row.id}`, { method: "PATCH", body: payload });
        else await ctx.api("/accesses", { method: "POST", body: payload });
        dialog.close();
        await load();
      } catch (err) {
        // The server's refusal code, turned into the sentence the owner needs.
        const code = (err && err.message ? err.message : "").match(/[a-z_]+$/);
        refusal.textContent = t((code && S[lang][code[0]] && code[0]) || "failed");
        refusal.hidden = false;
      }
    };

    dialog.appendChild(form);
    root.appendChild(dialog);
    dialog.showModal();
    dialog.addEventListener("close", () => dialog.remove());
  }

  // ── The journal ──────────────────────────────────────────

  async function openJournal(row) {
    const dialog = document.createElement("dialog");
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const heading = document.createElement("h2");
    heading.textContent = row ? `${t("journal")} · ${row.label}` : t("journal");
    sheet.appendChild(heading);

    const list = document.createElement("div");
    list.className = "journal";
    sheet.appendChild(list);

    const close = document.createElement("button");
    close.className = "action";
    close.type = "button";
    close.textContent = t("close");
    close.onclick = () => dialog.close();
    sheet.appendChild(close);

    dialog.appendChild(sheet);
    root.appendChild(dialog);
    dialog.showModal();
    dialog.addEventListener("close", () => dialog.remove());

    try {
      const query = row ? `?accessId=${encodeURIComponent(row.id)}` : "";
      const { entries } = await ctx.api(`/journal${query}`);
      if (!entries.length) {
        list.textContent = t("journalEmpty");
        return;
      }
      for (const entry of entries) {
        const line = document.createElement("div");
        line.className = "line";
        const when = document.createElement("span");
        when.className = "when";
        when.textContent = fmt(entry.at);
        const what = document.createElement("span");
        const kind = t(`kind_${entry.kind}`);
        what.textContent = [entry.label, kind, entry.reason, entry.actor ? `(${entry.actor})` : ""]
          .filter(Boolean)
          .join(" · ");
        line.append(when, what);
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
}

export function unmount(container) {
  for (const undo of cleanup.splice(0)) undo();
  container.replaceChildren();
}
