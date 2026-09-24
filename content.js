(() => {
  "use strict";
  console.info("[DDB QoL] content v0.3.32 carregado em", location.href);

  const EXT = "ddb-qol";
  const SRC_ROOT = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/";
  const BESTIARY_BASE = `${SRC_ROOT}data/bestiary/`;
  const SEARCH_BASE = `${SRC_ROOT}search/`;
  const IMAGE_BASE = "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/bestiary/";
  const HOMEBREW_ROOT = "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/";
  const HOMEBREW_IMG_ROOT = "https://raw.githubusercontent.com/TheGiddyLimit/homebrew-img/main/";
  const PRERELEASE_ROOT = "https://raw.githubusercontent.com/TheGiddyLimit/unearthed-arcana/master/";
  const HOMEBREW_CREATE_URL = "https://www.dndbeyond.com/homebrew/creations/create-monster/create";
  const PENDING_KEY = "ddbQolPendingMonsterImportV2";
  const PREFILL_KEY = "ddbQolMonsterPrefillV2";
  const CREATURE_CATEGORY_ID = 1;
  const PARSER_JS_URL = `${SRC_ROOT}js/parser.js`;
  const FIVE_TOOLS_BESTIARY_URL = "https://5e.tools/bestiary.html";
  const SETTINGS_KEY = "ddbQolSettingsV3";
  const DEFAULT_SETTINGS = { hbButtons: true, damageApplicator: true, extendedBestiary: true, mapSearch: true, customStickers: true };
  let SETTINGS = { ...DEFAULT_SETTINGS };

  const SIZE_MAP = {
    T: "Tiny",
    S: "Small",
    M: "Medium",
    L: "Large",
    H: "Huge",
    G: "Gargantuan"
  };

  const ALIGNMENT_MAP = {
    L: "Lawful Neutral",
    C: "Chaotic Neutral",
    N: "Neutral",
    G: "Neutral Good",
    E: "Neutral Evil",
    U: "Unaligned",
    A: "Any Alignment"
  };

  const SKILL_NAMES = {
    acrobatics: "Acrobatics",
    "animal handling": "Animal Handling",
    arcana: "Arcana",
    athletics: "Athletics",
    deception: "Deception",
    history: "History",
    insight: "Insight",
    intimidation: "Intimidation",
    investigation: "Investigation",
    medicine: "Medicine",
    nature: "Nature",
    perception: "Perception",
    performance: "Performance",
    persuasion: "Persuasion",
    religion: "Religion",
    "sleight of hand": "Sleight of Hand",
    stealth: "Stealth",
    survival: "Survival"
  };

  const ATTACK_TAGS = {
    mw: "Melee Weapon Attack:",
    rw: "Ranged Weapon Attack:",
    ms: "Melee Spell Attack:",
    rs: "Ranged Spell Attack:",
    m: "Melee Attack Roll:",
    r: "Ranged Attack Roll:"
  };

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function strip5eTags(value) {
    if (value == null) return "";
    return String(value)
      .replace(/\{@actTrigger(?: ([^}]+))?\}/g, (_m, text) => text ? `Trigger: ${text}` : "Trigger:")
      .replace(/\{@actResponse(?: ([^}]+))?\}/g, (_m, text) => text ? `Response${String(text).trim() === "d" ? "—" : ":"}` : "Response:")
      .replace(/\{@actSave ([^}]+)\}/g, (_m, ability) => `${String(ability).split("|")[0].trim().toUpperCase()} Saving Throw:`)
      .replace(/\{@actSaveFail(?: ([^}]+))?\}/g, (_m, text) => text ? `Failed Save: ${text}` : "Failed Save:")
      .replace(/\{@actSaveSuccess(?: ([^}]+))?\}/g, (_m, text) => text ? `Successful Save: ${text}` : "Successful Save:")
      .replace(/\{@actSaveSuccessOrFail(?: ([^}]+))?\}/g, (_m, text) => text ? String(text) : "")
      .replace(/\{@atk ([^}]+)\}/g, (_m, kind) => ATTACK_TAGS[kind.trim()] || "Attack:")
      .replace(/\{@atkr ([^}]+)\}/g, (_m, kind) => ATTACK_TAGS[kind.trim()] || "Attack Roll:")
      .replace(/\{@hitYourSpellAttack(?:\s+([^}]+))?\}/g, (_m, text) => text ? strip5eTags(String(text).split("|").pop()) : "your spell attack modifier")
      .replace(/\{@dcYourSpellSave(?:\s+([^}]+))?\}/g, (_m, text) => text ? strip5eTags(String(text).split("|").pop()) : "your spell save DC")
      .replace(/\{@hit ([^}]+)\}/g, (_m, n) => `${String(n).trim().startsWith("-") ? "" : "+"}${n}`)
      .replace(/\{@h\}/g, "Hit:")
      .replace(/\{@dc ([^}]+)\}/g, (_m, n) => `DC ${String(n).split("|")[0]}`)
      .replace(/\{@(?:damage|dice|scaledice|scaledamage) ([^}]+)\}/g, (_m, text) => String(text).split("|")[0])
      .replace(/\{@recharge(?: ([^}]+))?\}/g, (_m, n) => n ? `(Recharge ${n})` : "(Recharge 6)")
      .replace(/\{@chance ([^}|]+)(?:\|[^}]*)?\}/g, (_m, n) => `${n}%`)
      .replace(/\{@(?:condition|spell|creature|item|skill|sense|action|status|damageType|variantrule|quickref|filter|book|adventure) ([^}]+)\}/g, (_m, text) => {
        const parts = String(text).split("|");
        return parts.length >= 3 && parts[2] ? parts[2] : parts[0];
      })
      .replace(/\{@[^ ]+ ([^}]+)\}/g, (_m, text) => {
        const parts = String(text).split("|");
        return parts.length >= 3 && parts[2] ? parts[2] : parts[0];
      })
      .replace(/\{@actTrigger\s+/g, "Trigger: ")
      .replace(/\{@actResponse(?:\s+d)?\s+/g, "Response: ")
      .replace(/\{@actSaveSuccess\s+/g, "Successful Save: ")
      .replace(/\{@actSaveFail\s+/g, "Failed Save: ")
      .replace(/\{@actSave\s+([a-z]{3})\b/gi, (_m, ability) => `${ability.toUpperCase()} Saving Throw:`)
      .replace(/\{@[^}]+\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ddbRollable(display, payload) {
    const compact = {
      diceNotation: String(payload?.diceNotation || "").trim(),
      rollType: String(payload?.rollType || "roll").trim(),
      rollAction: String(payload?.rollAction || "Roll").trim()
    };
    if (payload?.rollDamageType) compact.rollDamageType = normalize(payload.rollDamageType);
    return `[rollable]${display};${JSON.stringify(compact)}[/rollable]`;
  }

  function inferAttackRollType(raw) {
    const text = String(raw || "");
    const tagged = [...text.matchAll(/\{@(?:atk|atkr)\s+([^}]+)\}/gi)]
      .map(match => String(match[1] || "").split("|")[0].trim().toLowerCase());
    if (tagged.some(kind => /(^|[^a-z])(?:ms|rs|spell)([^a-z]|$)/i.test(kind) || kind.includes("s"))) return "spell";
    if (/\b(?:melee|ranged) spell attack\b/i.test(strip5eTags(text))) return "spell";
    return "to hit";
  }

  function parseRollableBlocks(html) {
    const text = String(html || "");
    const blocks = [];
    const re = /\[rollable\]([\s\S]*?);(\{[\s\S]*?\})\[\/rollable\]/gi;
    let match;
    while ((match = re.exec(text))) {
      const display = match[1];
      const rawJson = match[2];
      let payload = null;
      let error = "";
      try { payload = JSON.parse(rawJson); } catch (e) { error = `JSON inválido: ${e.message}`; }
      if (!error && !String(payload?.diceNotation || "").trim()) error = "diceNotation ausente";
      if (!error && !String(payload?.rollType || "").trim()) error = "rollType ausente";
      if (!error && !String(payload?.rollAction || "").trim()) error = "rollAction ausente";
      blocks.push({ display, payload, error, raw: match[0] });
    }
    const opens = (text.match(/\[rollable\]/gi) || []).length;
    const closes = (text.match(/\[\/rollable\]/gi) || []).length;
    return { blocks, opens, closes, valid: opens === closes && opens === blocks.length && blocks.every(block => !block.error) };
  }

  function staticDiceNotation(value) {
    const notation = String(value || "").replace(/\s+/g, "");
    if (!notation || !/^[0-9dD+\-*/().]+$/.test(notation) || !/[dD]/.test(notation)) return "";
    return notation.toLowerCase();
  }

  function inferDamageTypeFromContext(raw, offset, tagLength) {
    const tail = String(raw || "").slice(offset + tagLength, offset + tagLength + 150);
    const explicit = tail.match(/\{@damageType\s+([^}|]+)(?:\|[^}]*)?\}/i)?.[1];
    if (explicit) return normalize(explicit);
    const known = ["acid","bludgeoning","cold","fire","force","lightning","necrotic","piercing","poison","psychic","radiant","slashing","thunder"];
    const plain = normalize(tail);
    let nearest = null;
    for (const type of known) {
      const index = plain.search(new RegExp(`\\b${type}\\b`));
      if (index >= 0 && (!nearest || index < nearest.index)) nearest = { type, index };
    }
    return nearest?.type || "";
  }

  function renderActionText(value, actionName = "Action") {
    // Manual DDB rollable blocks are deterministic and do not depend on the
    // currently-broken TinyMCE "Add Rollable Dice Blocks" helper.
    const raw = String(value ?? "");
    const placeholders = [];
    const stash = html => {
      const key = `\uE000${placeholders.length}\uE001`;
      placeholders.push(html);
      return key;
    };
    const attackRollType = inferAttackRollType(raw);
    let text = raw
      .replace(/\{@hit\s+([^}]+)\}/g, (_match, bonus) => {
        const clean = String(bonus).split("|")[0].trim();
        const shown = clean.startsWith("-") || clean.startsWith("+") ? clean : `+${clean}`;
        const notation = staticDiceNotation(`1d20${shown}`.replace("+-", "-"));
        if (!notation) return shown;
        return stash(ddbRollable(shown, { diceNotation: notation, rollType: attackRollType, rollAction: actionName }));
      })
      .replace(/\{@(?:damage|scaledamage)\s+([^}]+)\}/g, (match, body, offset) => {
        const rawNotation = String(body).split("|")[0].trim();
        const notation = staticDiceNotation(rawNotation);
        if (!notation) return strip5eTags(rawNotation);
        const damageType = inferDamageTypeFromContext(raw, offset, match.length);
        const payload = { diceNotation: notation, rollType: "damage", rollAction: actionName };
        if (damageType) payload.rollDamageType = normalize(damageType);
        const pretty = notation.replace(/([+\-])/g, " $1 ");
        const alreadyWrapped = raw[offset - 1] === "(" && raw[offset + match.length] === ")";
        return stash(ddbRollable(alreadyWrapped ? pretty : `(${pretty})`, payload));
      })
      .replace(/\{@(?:dice|scaledice)\s+([^}]+)\}/g, (_match, body) => {
        const rawNotation = String(body).split("|")[0].trim();
        const notation = staticDiceNotation(rawNotation);
        if (!notation) return strip5eTags(rawNotation);
        return stash(ddbRollable(notation, { diceNotation: notation, rollType: "roll", rollAction: actionName }));
      })
      .replace(/\{@recharge(?:\s+([^}]+))?\}/g, (_match, rawRecharge) => {
        const threshold = String(rawRecharge || "6").split("|")[0].trim() || "6";
        const shown = threshold === "6" ? "(Recharge 6)" : `(Recharge ${threshold}-6)`;
        return stash(ddbRollable(shown, { diceNotation: "1d6", rollType: "recharge", rollAction: actionName }));
      });
    text = escapeHtml(strip5eTags(text));
    placeholders.forEach((html, index) => { text = text.replace(`\uE000${index}\uE001`, html); });
    return text;
  }

  function entryToHtml(entry, context = {}) {
    if (entry == null) return "";
    if (typeof entry === "string" || typeof entry === "number") {
      return context.rollable ? renderActionText(entry, context.actionName || "Action") : escapeHtml(strip5eTags(entry));
    }
    if (Array.isArray(entry)) return entry.map(item => entryToHtml(item, context)).filter(Boolean).join(" ");

    if (entry.type === "list" && Array.isArray(entry.items)) {
      return `<ul>${entry.items.map(it => `<li>${entryToHtml(it, context)}</li>`).join("")}</ul>`;
    }

    if (entry.type === "item") {
      const name = entry.name ? `<strong>${escapeHtml(strip5eTags(entry.name))}</strong> ` : "";
      return `${name}${entryToHtml(entry.entry ?? entry.entries ?? "", context)}`;
    }

    if (entry.type === "table") {
      const rows = (entry.rows || []).map(row => `<p>${entryToHtml(row, context)}</p>`).join("");
      return rows;
    }

    const name = entry.name ? `<strong>${escapeHtml(strip5eTags(entry.name))}</strong> ` : "";
    if (entry.entries) return `${name}${entry.entries.map(item => entryToHtml(item, context)).join(" ")}`;
    if (entry.entry) return `${name}${entryToHtml(entry.entry, context)}`;
    if (entry.items) return `${name}${entryToHtml(entry.items, context)}`;
    return escapeHtml(strip5eTags(JSON.stringify(entry)));
  }

  function renderNamedEntries(items) {
    if (!Array.isArray(items) || !items.length) return "";
    return items.map(item => {
      const actionName = strip5eTags(item?.name || "Action");
      const title = item?.name ? `<strong><em>${escapeHtml(actionName)}.</em></strong> ` : "";
      const context = { rollable: true, actionName };
      const body = Array.isArray(item?.entries)
        ? item.entries.map(entry => entryToHtml(entry, context)).join(" ")
        : entryToHtml(item?.entries ?? item, context);
      return `<p>${title}${body}</p>`;
    }).join("\n");
  }

  function renderSpellcasting(spellcasting) {
    if (!Array.isArray(spellcasting) || !spellcasting.length) return "";
    const renderSpellList = raw => {
      const list = Array.isArray(raw) ? raw : [];
      return list.map(spell => escapeHtml(strip5eTags(typeof spell === "string" ? spell : spell?.entry || spell?.name || ""))).filter(Boolean).join(", ");
    };
    return spellcasting.map(sc => {
      const parts = [];
      const title = sc?.name ? `<strong><em>${escapeHtml(strip5eTags(sc.name))}.</em></strong> ` : "";
      if (Array.isArray(sc?.headerEntries)) parts.push(sc.headerEntries.map(entry => entryToHtml(entry, { rollable: true, actionName: strip5eTags(sc?.name || "Spellcasting") })).join(" "));
      if (Array.isArray(sc?.will) && sc.will.length) parts.push(`<strong>At will:</strong> ${renderSpellList(sc.will)}`);
      if (sc?.daily && typeof sc.daily === "object") {
        for (const [key, val] of Object.entries(sc.daily)) {
          const count = String(key).replace(/e$/i, " each");
          parts.push(`<strong>${escapeHtml(count)}/day:</strong> ${renderSpellList(val)}`);
        }
      }
      if (sc?.rest && typeof sc.rest === "object") {
        for (const [key, val] of Object.entries(sc.rest)) parts.push(`<strong>${escapeHtml(key)}/rest:</strong> ${renderSpellList(val)}`);
      }
      if (sc?.spells && typeof sc.spells === "object") {
        for (const [level, block] of Object.entries(sc.spells)) {
          const spells = renderSpellList(block?.spells || block);
          if (!spells) continue;
          const slots = block?.slots != null ? ` (${block.slots} slots)` : "";
          parts.push(`<strong>${level === "0" ? "Cantrips" : `Level ${escapeHtml(level)}`}${slots}:</strong> ${spells}`);
        }
      }
      if (Array.isArray(sc?.footerEntries)) parts.push(sc.footerEntries.map(entry => entryToHtml(entry, { rollable: true, actionName: strip5eTags(sc?.name || "Spellcasting") })).join(" "));
      return `<p>${title}${parts.join("<br>")}</p>`;
    }).join("\n");
  }

  function renderLoreEntries(entries) {
    if (!entries) return "";
    const list = Array.isArray(entries) ? entries : [entries];
    return list.map(entry => `<p>${entryToHtml(entry)}</p>`).join("\n");
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = value == null ? "" : String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.checked = Boolean(checked);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function selectByText(id, text) {
    const select = document.getElementById(id);
    if (!select || !text) return false;
    const wanted = normalize(text);
    const option = [...select.options].find(o => normalize(o.textContent) === wanted);
    if (!option) return false;
    select.value = option.value;
    option.selected = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function selectManyByText(id, texts) {
    const select = document.getElementById(id);
    if (!select) return [];
    const wanted = new Set((texts || []).map(normalize).filter(Boolean));
    const selected = [];
    [...select.options].forEach(option => {
      const yes = wanted.has(normalize(option.textContent));
      option.selected = yes;
      if (yes) selected.push(option.textContent.trim());
    });
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return selected;
  }

  function formatType(monster) {
    const type = typeof monster.type === "string" ? monster.type : monster.type?.type;
    return type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
  }

  function formatSubtypes(monster) {
    if (typeof monster.type !== "object" || !Array.isArray(monster.type.tags)) return [];
    return monster.type.tags.map(tag => typeof tag === "string" ? tag : tag?.tag).filter(Boolean);
  }

  function formatAlignment(alignment) {
    if (!alignment) return "";
    if (typeof alignment === "string") return ALIGNMENT_MAP[alignment] || alignment;
    if (!Array.isArray(alignment)) {
      if (alignment.special) return alignment.special;
      if (alignment.alignment) return formatAlignment(alignment.alignment);
      return "";
    }
    if (alignment.length === 1) return ALIGNMENT_MAP[alignment[0]] || String(alignment[0]);
    const key = alignment.join("");
    const map = {
      LG: "Lawful Good", NG: "Neutral Good", CG: "Chaotic Good",
      LN: "Lawful Neutral", N: "Neutral", CN: "Chaotic Neutral",
      LE: "Lawful Evil", NE: "Neutral Evil", CE: "Chaotic Evil"
    };
    return map[key] || "Any Alignment";
  }

  function getCr(monster) {
    if (monster?.cr == null) return "";
    return typeof monster.cr === "object" ? String(monster.cr.cr ?? "") : String(monster.cr);
  }

  function getProficiencyBonus(crValue) {
    const raw = String(crValue || "0");
    let cr;
    if (raw.includes("/")) {
      const [a, b] = raw.split("/").map(Number);
      cr = b ? a / b : 0;
    } else {
      cr = Number(raw);
    }
    if (!Number.isFinite(cr)) return 2;
    if (cr <= 4) return 2;
    if (cr <= 8) return 3;
    if (cr <= 12) return 4;
    if (cr <= 16) return 5;
    if (cr <= 20) return 6;
    if (cr <= 24) return 7;
    if (cr <= 28) return 8;
    return 9;
  }

  function getAbilityModifier(score) {
    const n = Number(score);
    return Number.isFinite(n) ? Math.floor((n - 10) / 2) : 0;
  }

  function getInitiativeBonus(monster) {
    const initiative = monster?.initiative;
    if (initiative == null) return "";
    if (typeof initiative === "number") return initiative;
    if (typeof initiative === "string") {
      const parsed = Number(initiative.replace(/^\+/, ""));
      return Number.isFinite(parsed) ? parsed : "";
    }
    if (typeof initiative === "object") {
      if (initiative.bonus != null) {
        const parsed = Number(String(initiative.bonus).replace(/^\+/, ""));
        if (Number.isFinite(parsed)) return parsed;
      }
      if (initiative.proficiency != null) {
        const mult = Number(initiative.proficiency);
        if (Number.isFinite(mult)) {
          return getAbilityModifier(monster.dex) + (getProficiencyBonus(getCr(monster)) * mult);
        }
      }
    }
    return "";
  }

  function getAc(monster) {
    const first = Array.isArray(monster.ac) ? monster.ac[0] : monster.ac;
    if (typeof first === "number") return { value: first, type: "" };
    if (first && typeof first === "object") {
      if (first.ac != null) {
        return {
          value: first.ac,
          type: Array.isArray(first.from) ? first.from.map(strip5eTags).join(", ") : strip5eTags(first.from || "")
        };
      }
      const special = String(first.special || "");
      const n = special.match(/\b(\d+)\b/);
      return { value: n ? n[1] : "", type: strip5eTags(special) };
    }
    return { value: "", type: "" };
  }

  function applyArmorClassType(rawType) {
    const el = document.getElementById("field-armor-class-type");
    if (!el || !rawType) return false;
    const raw = normalize(rawType);
    const preferred = raw.includes("natural armor") ? "Natural Armor"
      : raw.includes("unarmored") ? "Unarmored Defense"
      : raw.includes("mage armor") ? "Mage Armor"
      : raw.includes("shield") ? "Shield"
      : "";
    if (el.tagName === "SELECT") {
      const options = [...el.options];
      const option = options.find(o => preferred && normalize(o.textContent) === normalize(preferred))
        || options.find(o => raw.includes(normalize(o.textContent)) || normalize(o.textContent).includes(raw));
      if (option) {
        el.value = option.value;
        option.selected = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      return false;
    }
    return setValue("field-armor-class-type", preferred || strip5eTags(rawType));
  }

  function parseHpFormula(formula) {
    const match = String(formula || "").match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
    if (!match) return { count: "", die: "", modifier: "" };
    const mod = match[3] && match[4] ? `${match[3] === "-" ? "-" : ""}${match[4]}` : "";
    return { count: match[1], die: match[2], modifier: mod };
  }

  function titleCase(text) {
    return String(text || "").replace(/\b\w/g, c => c.toUpperCase());
  }

  function flattenDamageItems(items, mode) {
    const out = [];
    for (const item of items || []) {
      if (typeof item === "string") {
        out.push({ mode, types: [item], note: "" });
      } else if (item && typeof item === "object") {
        const nested = item[mode] || item.resist || item.immune || item.vulnerable;
        if (Array.isArray(nested)) {
          out.push({ mode, types: nested.filter(x => typeof x === "string"), note: strip5eTags(item.note || "") });
        }
      }
    }
    return out;
  }

  function selectDamageAdjustments(monster) {
    const select = document.getElementById("field-damage-adjustment");
    if (!select) return { selected: [], skipped: [] };
    [...select.options].forEach(o => o.selected = false);

    const entries = [
      ...flattenDamageItems(monster.resist, "resist"),
      ...flattenDamageItems(monster.immune, "immune"),
      ...flattenDamageItems(monster.vulnerable, "vulnerable")
    ];
    const labelMode = { resist: "Resistance", immune: "Immunity", vulnerable: "Vulnerability" };
    const selected = [];
    const skipped = [];

    for (const entry of entries) {
      const mode = labelMode[entry.mode];
      let option = null;
      if (entry.types.length === 1 && !entry.note) {
        const target = normalize(`${titleCase(entry.types[0])} - ${mode}`);
        option = [...select.options].find(o => normalize(o.textContent) === target);
      } else {
        const optionCandidates = [...select.options].filter(o => normalize(o.textContent).endsWith(normalize(`- ${mode}`)));
        option = optionCandidates.find(o => {
          const n = normalize(o.textContent);
          const hasTypes = entry.types.every(type => n.includes(normalize(type)));
          const noteWords = normalize(entry.note).split(" ").filter(w => w.length >= 4);
          const hasNote = !noteWords.length || noteWords.filter(w => n.includes(w)).length >= Math.min(2, noteWords.length);
          return hasTypes && hasNote;
        });
      }
      if (option) {
        option.selected = true;
        selected.push(option.textContent.trim());
      } else {
        skipped.push(`${entry.types.join(", ")} ${entry.note}`.trim());
      }
    }
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { selected, skipped };
  }

  function monsterEditionDefault(source) {
    return ["XMM", "XDMG", "XPHB"].includes(source) ? "1" : "0";
  }

  function findNativeRollableCheckbox() {
    const candidates = [...document.querySelectorAll('label,button,[role="button"],span,div')];
    for (const el of candidates) {
      const text = normalize(`${el.innerText || el.textContent || ""} ${el.getAttribute?.("aria-label") || ""} ${el.title || ""}`);
      if (!text.includes("add rollable dice blocks automatically") && !text.includes("rollable dice blocks automatically")) continue;
      const label = el.closest?.("label") || el;
      const checkbox = label.querySelector?.('input[type="checkbox"]')
        || (label.tagName === "LABEL" && label.htmlFor ? document.getElementById(label.htmlFor) : null);
      if (checkbox) return checkbox;
    }
    return null;
  }

  function disableNativeRollableGeneration() {
    // The DDB dieTranslator helper has been returning HTTP 400 in 2026.
    // We generate documented [rollable] blocks ourselves, so the automatic
    // translator must stay OFF to avoid double-processing or mangling them.
    const checkbox = findNativeRollableCheckbox();
    if (!checkbox || !checkbox.checked) return Boolean(checkbox);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("input", { bubbles: true }));
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function validateHomebrewRollables() {
    const fields = [
      "special-traits-description", "actions-description", "bonus-actions-description",
      "reactions-description", "legendary-actions-description", "mythic-actions-description"
    ];
    let count = 0;
    const issues = [];
    for (const base of fields) {
      const html = document.getElementById(`field-${base}-wysiwyg`)?.value
        || document.getElementById(`field-${base}`)?.value
        || "";
      if (!html) continue;
      const parsed = parseRollableBlocks(html);
      count += parsed.blocks.length;
      if (!parsed.valid) {
        if (parsed.opens !== parsed.closes) issues.push(`${base}: tags [rollable] desbalanceadas (${parsed.opens}/${parsed.closes})`);
        if (parsed.opens !== parsed.blocks.length) issues.push(`${base}: ${parsed.opens - parsed.blocks.length} bloco(s) não reconhecido(s)`);
        parsed.blocks.forEach((block, index) => { if (block.error) issues.push(`${base} #${index + 1}: ${block.error}`); });
      }
    }
    return { count, issues, valid: !issues.length };
  }

  function fillMainMonsterForm(monster, edition, extra = {}) {
    const form = [...document.forms].find(f => f.method.toLowerCase() === "post" && f.enctype === "multipart/form-data" && f.elements.length > 30);
    if (!form) throw new Error("Formulário principal do monstro não encontrado.");

    const warnings = [];
    const warnSelect = (id, label, value) => {
      if (value == null || value === "") return true;
      const ok = selectByText(id, value);
      if (!ok) warnings.push(`${label}: "${strip5eTags(value)}" não foi encontrado nas opções do D&D Beyond.`);
      return ok;
    };
    const warnMany = (id, label, values) => {
      const desired = (values || []).map(v => String(v || "").trim()).filter(Boolean);
      if (!desired.length) return [];
      const selected = selectManyByText(id, desired);
      const selectedNorm = new Set(selected.map(normalize));
      const missing = desired.filter(v => !selectedNorm.has(normalize(v)));
      if (missing.length) warnings.push(`${label}: ${missing.map(v => `"${strip5eTags(v)}"`).join(", ")} não foi mapeado.`);
      return selected;
    };
    const warnField = (id, label, value) => {
      const ok = setValue(id, value);
      if (!ok && value != null && value !== "") warnings.push(`${label}: campo do D&D Beyond não encontrado.`);
      return ok;
    };

    warnSelect("field-stat-block-type", "Edição / Stat Block Type", edition === "1" ? "5.5e" : "5e");
    warnField("field-Name", "Nome", monster.name || "Imported Monster");
    warnField("field-version", "Versão/Fonte", `5etools • ${extra.sourceFull || monster.source || ""}`.trim());
    warnSelect("field-monster-type", "Tipo do monstro", formatType(monster));
    warnMany("field-monster-sub-type", "Subtipo do monstro", formatSubtypes(monster));
    warnSelect("field-size", "Tamanho", SIZE_MAP[monster.size?.[0]] || monster.size?.[0] || "");
    if (monster?.type?.swarmSize) warnSelect("field-swarm-monster", "Tamanho do enxame", SIZE_MAP[monster.type.swarmSize] || monster.type.swarmSize);
    warnSelect("field-alignment", "Alinhamento", formatAlignment(monster.alignment));
    warnSelect("field-challenge-rating", "Challenge Rating", getCr(monster));

    const traits = [renderSpellcasting(monster.spellcasting), renderNamedEntries(monster.trait)].filter(Boolean).join("\n");
    const actions = renderNamedEntries(monster.action);
    const bonus = renderNamedEntries(monster.bonus);
    const reactions = renderNamedEntries(monster.reaction);
    const legendary = renderNamedEntries(monster.legendary);
    const mythic = renderNamedEntries(monster.mythic);

    const descriptions = {
      "special-traits-description": traits,
      "actions-description": actions,
      "bonus-actions-description": bonus,
      "reactions-description": reactions,
      "monster-characteristics-description": extra.loreHtml || "",
      "legendary-actions-description": legendary,
      "mythic-actions-description": mythic,
      "lair-description": extra.lairHtml || ""
    };

    const descriptionLabels = {
      "special-traits-description": "Special Traits",
      "actions-description": "Actions",
      "bonus-actions-description": "Bonus Actions",
      "reactions-description": "Reactions",
      "monster-characteristics-description": "Description / Characteristics",
      "legendary-actions-description": "Legendary Actions",
      "mythic-actions-description": "Mythic Actions",
      "lair-description": "Lair"
    };
    for (const [base, html] of Object.entries(descriptions)) {
      const wysiwygOk = setValue(`field-${base}-wysiwyg`, html);
      const plainOk = setValue(`field-${base}`, html);
      if (html && !wysiwygOk && !plainOk) warnings.push(`${descriptionLabels[base] || base}: campo do D&D Beyond não encontrado.`);
    }
    disableNativeRollableGeneration();

    setChecked("field-is-legendary", Boolean(monster.legendary?.length));
    setChecked("field-is-mythic", Boolean(monster.mythic?.length));
    setChecked("field-has-lair", Boolean(extra.lairHtml));
    if (extra.lairHtml) warnSelect("field-lair-challenge-rating", "Lair Challenge Rating", getCr(monster));

    const ac = getAc(monster);
    warnField("field-armor-class", "Armor Class", ac.value);
    if (ac.type && !applyArmorClassType(ac.type)) warnings.push(`Armor Class Type: "${strip5eTags(ac.type)}" não foi mapeado.`);
    warnField("field-initiative-bonus", "Initiative Bonus", getInitiativeBonus(monster));
    warnField("field-passive-perception", "Passive Perception", monster.passive ?? "");

    let hpAverage = monster.hp?.average ?? "";
    let hp = parseHpFormula(monster.hp?.formula);
    if (hpAverage === "" && monster.hp?.special != null) {
      const numeric = String(monster.hp.special).match(/\b(\d+)\b/);
      if (numeric) hpAverage = numeric[1];
    }
    if (hpAverage !== "" && !hp.count) {
      const sizeDie = { T: 4, S: 6, M: 8, L: 10, H: 12, G: 20 }[monster.size?.[0]] || 8;
      const avgDie = (sizeDie / 2) + 0.5;
      const modifier = Math.round(Number(hpAverage) - avgDie);
      hp = { count: "1", die: String(sizeDie), modifier: modifier ? String(modifier) : "" };
    }
    warnField("field-average-hit-points", "HP médio", hpAverage);
    warnField("field-hit-points-die-count", "HP Dice Count", hp.count);
    if (hp.die) warnSelect("field-hit-points-die-value", "HP Die", `d${hp.die}`);
    warnField("field-hit-points-modifier", "HP Modifier", hp.modifier);

    warnField("field-strength", "Strength", monster.str ?? "");
    warnField("field-dexterity", "Dexterity", monster.dex ?? "");
    warnField("field-constitution", "Constitution", monster.con ?? "");
    warnField("field-intelligence", "Intelligence", monster.int ?? "");
    warnField("field-wisdom", "Wisdom", monster.wis ?? "");
    warnField("field-charisma", "Charisma", monster.cha ?? "");

    const saveLabels = Object.keys(monster.save || {}).map(k => k.toUpperCase());
    warnMany("field-monster-saving-throw", "Saving Throws", saveLabels);

    const damage = selectDamageAdjustments(monster);
    if (damage.skipped.length) warnings.push(`Damage Adjustments: ${damage.skipped.join("; ")} não foi mapeado.`);
    warnMany("field-condition-immunity", "Condition Immunities", (monster.conditionImmune || []).map(titleCase));
    warnMany("field-monster-environments", "Environments", (monster.environment || []).map(titleCase));

    warnField("field-gear-description", "Gear", Array.isArray(monster.gear) ? monster.gear.map(strip5eTags).join(", ") : "");
    // Languages are imported as native DDB sub-records after the monster is created.
    // Keeping this override populated duplicates/overrides the structured language list.
    setValue("field-languages-note", "");

    return { form, warnings };
  }


  function sanitizeFileName(value) {
    return String(value || "monster")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "monster";
  }

  function fetch5eImage(urls) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "DDB_QOL_FETCH_5ETOOLS_IMAGE", urls }, response => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!response?.ok) return reject(new Error(response?.error || "Imagem do 5etools não encontrada."));
        resolve(response);
      });
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  async function resizeImageFile(blob, fileName, targetSize, { type = "image/jpeg", quality = 0.9, preserveAlpha = false } = {}) {
    const bitmap = await createImageBitmap(blob);
    const maxSide = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = Math.min(1, targetSize / maxSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!preserveAlpha) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const output = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("Falha ao converter imagem.")), type, quality);
    });
    return new File([output], fileName, { type, lastModified: Date.now() });
  }

  function blobToJpegFile(blob, fileName, targetSize) {
    return resizeImageFile(blob, fileName, targetSize, { type: "image/jpeg", quality: 0.9, preserveAlpha: false });
  }

  async function blobToPngFile(blob, fileName, targetSize) {
    // Preserve original PNG bytes when already small enough. This avoids any
    // chance of flattening an alpha channel in the browser resize path.
    if (/image\/png/i.test(String(blob?.type || ""))) {
      try {
        const bitmap = await createImageBitmap(blob);
        const maxSide = Math.max(bitmap.width, bitmap.height) || 1;
        bitmap.close?.();
        if (maxSide <= targetSize) return new File([blob], fileName, { type: "image/png", lastModified: Date.now() });
      } catch {}
    }
    return resizeImageFile(blob, fileName, targetSize, { type: "image/png", preserveAlpha: true });
  }

  function assignFileToInput(id, file) {
    const input = document.getElementById(id);
    if (!input || !file) return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function getFluffImagePath(entry) {
    const getPath = image => {
      const path = image?.href?.type === "internal" ? image.href.path : "";
      return typeof path === "string" && path.startsWith("bestiary/") ? path : "";
    };

    if (Array.isArray(entry?.images)) {
      const path = entry.images.map(getPath).find(Boolean);
      if (path) return path;
    }

    const modImages = entry?._copy?._mod?.images;
    const candidates = Array.isArray(modImages)
      ? modImages
      : Array.isArray(modImages?.items)
        ? modImages.items
        : [];
    return candidates.map(getPath).find(Boolean) || "";
  }

  async function resolveFluffImagePath(monster, seen = new Set()) {
    const source = String(monster?.source || "").trim();
    const name = String(monster?.name || "").trim();
    if (!source || !name) return "";

    const key = `${source.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) return "";
    seen.add(key);

    try {
      const data = await fetch5eJson(`fluff-bestiary-${source.toLowerCase()}.json`);
      const entries = Array.isArray(data?.monsterFluff) ? data.monsterFluff : [];
      const entry = entries.find(item =>
        normalize(item?.name) === normalize(name) &&
        normalize(item?.source || source) === normalize(source)
      );
      if (!entry) return "";

      const directPath = getFluffImagePath(entry);
      if (directPath) return directPath;

      if (entry?._copy?.name) {
        return resolveFluffImagePath({
          name: entry._copy.name,
          source: entry._copy.source || source
        }, seen);
      }
    } catch (error) {
      console.info("DDB QoL: fluff/imagem do 5etools não disponível.", error);
    }
    return "";
  }

  function internalImageUrl(path) {
    const relative = String(path || "").replace(/^bestiary\//, "");
    return `${IMAGE_BASE}${relative.split("/").map(encodeURIComponent).join("/")}`;
  }

  function getExternalMediaUrl(media) {
    if (!media) return "";
    if (typeof media === "string" && /^https?:\/\//i.test(media)) return media;
    const href = media.href || media;
    if (href?.type === "external" && href.url) return href.url;
    if (href?.type === "internal" && href.path) {
      const path = String(href.path);
      if (path.startsWith("bestiary/")) return internalImageUrl(path);
      if (path.startsWith("_img/")) return `${HOMEBREW_ROOT}${path}`;
      if (path.startsWith("img/")) return `${HOMEBREW_IMG_ROOT}${path}`;
    }
    return "";
  }

  async function loadMonsterArtwork(monster, rawData = null) {
    const sourceRaw = String(monster?.source || "").trim();
    const nameRaw = String(monster?.name || "").trim();
    if (!sourceRaw || !nameRaw) return { portraitBlob: null, tokenBlob: null };

    const source = encodeURIComponent(sourceRaw);
    const name = encodeURIComponent(nameRaw);
    const sourcePath = sourceRaw.split("/").map(encodeURIComponent).join("/");
    const namePath = nameRaw.split("/").map(encodeURIComponent).join("/");

    const tokenUrls = [];
    const directToken = getExternalMediaUrl(monster.tokenHref || monster.tokenUrl);
    if (directToken) tokenUrls.push(directToken);
    tokenUrls.push(`${HOMEBREW_ROOT}_img/${sourcePath}/token/${namePath}.png`);
    tokenUrls.push(`${HOMEBREW_IMG_ROOT}${sourcePath}/token/${namePath}.png`);
    tokenUrls.push(`${IMAGE_BASE}tokens/${source}/${name}.webp`);

    const artUrls = [];
    const inlineFluff = monster?.fluff?.images?.map(getExternalMediaUrl).filter(Boolean) || [];
    artUrls.push(...inlineFluff);
    const repoFluff = findMonsterFluff(rawData, monster);
    const repoFluffImages = (repoFluff?.images || []).map(getExternalMediaUrl).filter(Boolean);
    artUrls.push(...repoFluffImages);

    if (!inlineFluff.length && !repoFluffImages.length) {
      const fluffPath = await resolveFluffImagePath(monster).catch(() => "");
      if (fluffPath) artUrls.push(internalImageUrl(fluffPath));
    }
    artUrls.push(`${IMAGE_BASE}${source}/${name}.webp`);

    const fetchBlob = async urls => {
      try {
        const response = await fetch5eImage([...new Set(urls.filter(Boolean))]);
        return await dataUrlToBlob(response.dataUrl);
      } catch (_error) {
        return null;
      }
    };

    const [portraitBlob, tokenBlob] = await Promise.all([
      fetchBlob(artUrls),
      fetchBlob(tokenUrls)
    ]);
    return { portraitBlob, tokenBlob };
  }

  function openTokenMaker(monster, { portraitBlob = null, tokenBlob = null } = {}) {
    const sources = [];
    if (portraitBlob) sources.push({ key: "portrait", label: "Portrait 5etools", blob: portraitBlob });
    if (tokenBlob) sources.push({ key: "token", label: "Token original", blob: tokenBlob });
    if (!sources.length) return Promise.resolve({ skipped: true });

    return new Promise((resolve, reject) => {
      const previous = document.getElementById(`${EXT}-token-maker-backdrop`);
      previous?.remove();

      const backdrop = document.createElement("div");
      backdrop.id = `${EXT}-token-maker-backdrop`;
      backdrop.className = `${EXT}-token-maker-backdrop`;
      backdrop.innerHTML = `
        <section class="${EXT}-token-maker" role="dialog" aria-modal="true" aria-label="Criar token de ${escapeHtml(monster?.name || "monstro")}">
          <header class="${EXT}-token-maker-head">
            <div>
              <strong>Criar Token</strong>
              <small>${escapeHtml(monster?.name || "Monstro")} • arraste a arte dentro do círculo</small>
            </div>
            <button type="button" data-act="close" aria-label="Cancelar">×</button>
          </header>
          <div class="${EXT}-token-maker-body">
            <div class="${EXT}-token-maker-stage-wrap">
              <canvas class="${EXT}-token-maker-canvas" width="512" height="512"></canvas>
              <div class="${EXT}-token-maker-caption">O círculo mostra exatamente o enquadramento que aparecerá no Maps.</div>
            </div>
            <aside class="${EXT}-token-maker-controls">
              <div class="${EXT}-token-maker-source" ${sources.length < 2 ? 'hidden' : ''}>
                <span>Fonte da arte</span>
                <div>
                  ${sources.map((source, index) => `<button type="button" data-source="${source.key}" class="${index === 0 ? `${EXT}-active` : ""}">${escapeHtml(source.label)}</button>`).join("")}
                </div>
              </div>
              <label class="${EXT}-token-maker-zoom">
                <span>Zoom <output>100%</output></span>
                <input type="range" min="0.25" max="3" step="0.01" value="1">
              </label>
              <button type="button" class="${EXT}-token-maker-reset" data-act="reset">Centralizar e ajustar</button>
              <div class="${EXT}-token-maker-tip">
                <strong>Como usar</strong>
                <span>Arraste a imagem para posicionar a cabeça ou a parte mais importante da criatura dentro do círculo. Use o zoom para aproximar ou afastar.</span>
              </div>
              <div class="${EXT}-token-maker-note">O arquivo final é salvo como JPG opaco. Assim o fundo branco extra do renderer do D&D Beyond não aparece através da arte.</div>
            </aside>
          </div>
          <footer class="${EXT}-token-maker-footer">
            <button type="button" data-act="cancel">Cancelar</button>
            <button type="button" class="${EXT}-token-maker-confirm" data-act="confirm">Usar este token</button>
          </footer>
        </section>`;
      document.body.appendChild(backdrop);

      const canvas = backdrop.querySelector(`.${EXT}-token-maker-canvas`);
      const ctx = canvas.getContext("2d", { alpha: false });
      const zoomInput = backdrop.querySelector(`.${EXT}-token-maker-zoom input`);
      const zoomOutput = backdrop.querySelector(`.${EXT}-token-maker-zoom output`);
      const confirmButton = backdrop.querySelector('[data-act="confirm"]');
      const sourceButtons = [...backdrop.querySelectorAll('[data-source]')];
      const SIZE = canvas.width;
      let bitmap = null;
      let activeSource = sources[0];
      let zoom = 1;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let finished = false;

      const cleanup = value => {
        if (finished) return;
        finished = true;
        bitmap?.close?.();
        backdrop.remove();
        resolve(value);
      };

      const clampOffsets = () => {
        if (!bitmap) return;
        const base = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
        const scale = base * zoom;
        const drawW = bitmap.width * scale;
        const drawH = bitmap.height * scale;
        // When zoomed in, clamp to the crop area. When zoomed out, allow the
        // complete art to slide inside the square without cutting it off.
        const maxX = Math.abs(drawW - SIZE) / 2;
        const maxY = Math.abs(drawH - SIZE) / 2;
        offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
        offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
      };

      const fitWholeArtZoom = () => {
        if (!bitmap) return 1;
        const cover = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
        const targetDiameter = SIZE * 0.92;
        const contain = Math.min(targetDiameter / bitmap.width, targetDiameter / bitmap.height);
        return Math.max(0.25, Math.min(3, contain / cover));
      };

      const drawImageOnly = targetCtx => {
        targetCtx.save();
        targetCtx.fillStyle = "#17191c";
        targetCtx.fillRect(0, 0, SIZE, SIZE);
        if (bitmap) {
          const base = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
          const scale = base * zoom;
          const drawW = bitmap.width * scale;
          const drawH = bitmap.height * scale;
          const x = (SIZE - drawW) / 2 + offsetX;
          const y = (SIZE - drawH) / 2 + offsetY;
          targetCtx.imageSmoothingEnabled = true;
          targetCtx.imageSmoothingQuality = "high";
          targetCtx.drawImage(bitmap, x, y, drawW, drawH);
        }
        targetCtx.restore();
      };

      const render = () => {
        drawImageOnly(ctx);
        const radius = SIZE * 0.46;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,.60)";
        ctx.beginPath();
        ctx.rect(0, 0, SIZE, SIZE);
        ctx.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2, true);
        ctx.fill("evenodd");
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#d6ad55";
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };

      const setSource = async source => {
        confirmButton.disabled = true;
        try {
          const next = await createImageBitmap(source.blob);
          bitmap?.close?.();
          bitmap = next;
          activeSource = source;
          zoom = 1;
          offsetX = 0;
          offsetY = 0;
          zoomInput.value = "1";
          zoomOutput.value = "100%";
          sourceButtons.forEach(button => button.classList.toggle(`${EXT}-active`, button.dataset.source === source.key));
          clampOffsets();
          render();
        } finally {
          confirmButton.disabled = false;
        }
      };

      sourceButtons.forEach(button => button.addEventListener("click", () => {
        const source = sources.find(item => item.key === button.dataset.source);
        if (source && source !== activeSource) setSource(source).catch(error => console.error("[DDB QoL] Token Maker source", error));
      }));

      zoomInput.addEventListener("input", () => {
        zoom = Number(zoomInput.value || 1);
        zoomOutput.value = `${Math.round(zoom * 100)}%`;
        clampOffsets();
        render();
      });

      backdrop.querySelector('[data-act="reset"]').addEventListener("click", () => {
        zoom = fitWholeArtZoom();
        offsetX = 0;
        offsetY = 0;
        zoomInput.value = String(zoom);
        zoomOutput.value = `${Math.round(zoom * 100)}%`;
        clampOffsets();
        render();
      });

      const point = event => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left) * (SIZE / rect.width),
          y: (event.clientY - rect.top) * (SIZE / rect.height)
        };
      };

      canvas.addEventListener("pointerdown", event => {
        const p = point(event);
        dragging = true;
        lastX = p.x;
        lastY = p.y;
        canvas.setPointerCapture?.(event.pointerId);
        canvas.classList.add(`${EXT}-dragging`);
        event.preventDefault();
      });
      canvas.addEventListener("pointermove", event => {
        if (!dragging) return;
        const p = point(event);
        offsetX += p.x - lastX;
        offsetY += p.y - lastY;
        lastX = p.x;
        lastY = p.y;
        clampOffsets();
        render();
        event.preventDefault();
      });
      const stopDrag = event => {
        dragging = false;
        canvas.classList.remove(`${EXT}-dragging`);
        try { canvas.releasePointerCapture?.(event.pointerId); } catch (_error) {}
      };
      canvas.addEventListener("pointerup", stopDrag);
      canvas.addEventListener("pointercancel", stopDrag);

      canvas.addEventListener("wheel", event => {
        event.preventDefault();
        const next = Math.max(0.25, Math.min(3, zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
        zoom = next;
        zoomInput.value = String(next);
        zoomOutput.value = `${Math.round(next * 100)}%`;
        clampOffsets();
        render();
      }, { passive: false });

      const cancel = () => cleanup({ cancelled: true });
      backdrop.querySelector('[data-act="close"]').addEventListener("click", cancel);
      backdrop.querySelector('[data-act="cancel"]').addEventListener("click", cancel);
      backdrop.addEventListener("mousedown", event => { if (event.target === backdrop) cancel(); });

      confirmButton.addEventListener("click", async () => {
        if (!bitmap) return;
        confirmButton.disabled = true;
        confirmButton.textContent = "Gerando...";
        try {
          const output = document.createElement("canvas");
          output.width = SIZE;
          output.height = SIZE;
          const outputCtx = output.getContext("2d", { alpha: false });
          drawImageOnly(outputCtx);
          const blob = await new Promise((resolveBlob, rejectBlob) => {
            output.toBlob(result => result ? resolveBlob(result) : rejectBlob(new Error("Falha ao gerar token.")), "image/jpeg", 0.92);
          });
          const safe = sanitizeFileName(monster?.name || "monster");
          const file = new File([blob], `${safe}-token.jpg`, { type: "image/jpeg", lastModified: Date.now() });
          cleanup({ file, source: activeSource.key });
        } catch (error) {
          confirmButton.disabled = false;
          confirmButton.textContent = "Usar este token";
          reject(error);
        }
      });

      setSource(activeSource).catch(error => {
        backdrop.remove();
        reject(error);
      });
    });
  }

  async function attachMonsterImages(monster, rawData = null) {
    const sourceRaw = String(monster?.source || "").trim();
    const nameRaw = String(monster?.name || "").trim();
    if (!sourceRaw || !nameRaw) return { ok: false, warning: "Imagem: fonte/nome ausente" };

    const artwork = await loadMonsterArtwork(monster, rawData);
    if (!artwork.portraitBlob && !artwork.tokenBlob) {
      return { ok: false, warning: "Portrait/token do 5etools não encontrado" };
    }

    const tokenResult = await openTokenMaker(monster, artwork);
    if (tokenResult?.cancelled) return { ok: false, cancelled: true };
    if (tokenResult?.file) assignFileToInput("field-avatar", tokenResult.file);

    const largeBlob = artwork.portraitBlob || artwork.tokenBlob;
    if (largeBlob) {
      const safe = sanitizeFileName(monster.name);
      const largeFile = await blobToJpegFile(largeBlob, `${safe}-large.jpg`, 1000);
      assignFileToInput("field-large-avatar", largeFile);
    }

    return { ok: true, tokenSource: tokenResult?.source || "" };
  }

  function fetchJsonUrl(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "DDB_QOL_FETCH_JSON", url }, response => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!response?.ok) return reject(new Error(response?.error || "Falha ao consultar dados do 5etools."));
        resolve(response.data);
      });
    });
  }

  function fetchTextUrl(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "DDB_QOL_FETCH_TEXT", url }, response => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!response?.ok) return reject(new Error(response?.error || "Falha ao consultar texto do 5etools."));
        resolve(response.text);
      });
    });
  }

  async function fetch5eJson(file) {
    return fetchJsonUrl(`${BESTIARY_BASE}${file}`);
  }

  function decodeJsQuoted(value) {
    try { return JSON.parse(`"${String(value).replace(/"/g, '\\"')}"`); } catch (_e) { return String(value); }
  }

  function parseOfficialSourceNames(parserJs) {
    const constants = new Map();
    const fullNames = new Map();
    const constRe = /Parser\.SRC_([A-Za-z0-9_]+)\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
    const fullRe = /Parser\.SOURCE_JSON_TO_FULL\[Parser\.SRC_([A-Za-z0-9_]+)\]\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
    const directRe = /Parser\.SOURCE_JSON_TO_FULL\["((?:\\.|[^"\\])*)"\]\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
    let m;
    while ((m = constRe.exec(parserJs))) constants.set(m[1], decodeJsQuoted(m[2]));
    while ((m = fullRe.exec(parserJs))) {
      const source = constants.get(m[1]);
      if (source) fullNames.set(source, decodeJsQuoted(m[2]));
    }
    while ((m = directRe.exec(parserJs))) fullNames.set(decodeJsQuoted(m[1]), decodeJsQuoted(m[2]));
    return fullNames;
  }

  function get5eToolsMonsterUrl(hit) {
    const hash = String(hit?.hash || "").trim();
    if (hash) return `${FIVE_TOOLS_BESTIARY_URL}#${hash}`;
    const fallback = `${encodeURIComponent(String(hit?.name || "").toLowerCase())}_${encodeURIComponent(String(hit?.source || "").toLowerCase())}`;
    return `${FIVE_TOOLS_BESTIARY_URL}#${fallback}`;
  }

  async function getStorage(key) {
    const obj = await chrome.storage.local.get(key);
    return obj[key];
  }

  async function setStorage(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }

  async function removeStorage(key) {
    await chrome.storage.local.remove(key);
  }

  function decompressSearchIndex(group) {
    const index = Array.isArray(group?.x) ? group.x.map(it => ({ ...it })) : [];
    const metadata = group?.m || {};
    const lookup = {};
    for (const [prop, values] of Object.entries(metadata)) {
      lookup[prop] = {};
      for (const [text, id] of Object.entries(values || {})) lookup[prop][id] = text;
    }
    for (const item of index) {
      for (const prop of Object.keys(lookup)) {
        if (item[prop] != null && lookup[prop][item[prop]] != null) item[prop] = lookup[prop][item[prop]];
      }
    }
    return index;
  }

  function encodeRepoPath(path) {
    return String(path || "").split("/").map(part => encodeURIComponent(part)).join("/");
  }

  let catalogPromise = null;
  let catalogProgressListener = null;

  function emitCatalogProgress(message) {
    try { catalogProgressListener?.(message); } catch (_e) {}
  }

  function sourceMetaMap(data) {
    const map = new Map();
    for (const src of data?._meta?.sources || []) {
      if (!src?.json) continue;
      map.set(src.json, {
        full: src.full || src.abbreviation || src.json,
        abbreviation: src.abbreviation || src.json
      });
    }
    return map;
  }

  function fallbackMonsterHash(name, source) {
    return `${encodeURIComponent(String(name || "").toLowerCase())}_${encodeURIComponent(String(source || "").toLowerCase())}`;
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const ix = cursor++;
        if (ix >= items.length) return;
        try { out[ix] = await fn(items[ix], ix); }
        catch (error) { out[ix] = { __error: error, __item: items[ix] }; }
      }
    });
    await Promise.all(workers);
    return out;
  }

  async function loadRepoMonsterHits(root, origin, indexProps, onProgress) {
    const files = Object.keys(indexProps?.monster || {});
    if (!files.length) return [];
    let done = 0;
    const results = await mapLimit(files, 6, async file => {
      const data = await fetchJsonUrl(`${root}${encodeRepoPath(file)}`);
      done++;
      if (done === 1 || done % 10 === 0 || done === files.length) onProgress?.(done, files.length, origin);
      const meta = sourceMetaMap(data);
      return (Array.isArray(data?.monster) ? data.monster : []).map(monster => {
        const source = monster?.source || "";
        const src = meta.get(source) || {};
        return {
          name: monster?.name || "",
          source,
          sourceAbbrev: src.abbreviation || source,
          sourceFull: src.full || source,
          page: monster?.page ?? "",
          hash: fallbackMonsterHash(monster?.name, source),
          origin,
          filePath: file
        };
      });
    });
    return results.flatMap(result => Array.isArray(result) ? result : []);
  }

  async function loadMonsterCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
      emitCatalogProgress("Carregando fontes oficiais e partnered...");
      const requests = [
        fetchJsonUrl(`${SEARCH_BASE}index.json`),
        fetchJsonUrl(`${SEARCH_BASE}index-partnered.json`),
        fetch5eJson("index.json"),
        fetchJsonUrl(`${HOMEBREW_ROOT}_generated/index-sources.json`),
        fetchTextUrl(PARSER_JS_URL).catch(() => "")
      ];
      if (SETTINGS.extendedBestiary !== false) {
        requests.push(
          fetchJsonUrl(`${HOMEBREW_ROOT}_generated/index-props.json`).catch(() => ({})),
          fetchJsonUrl(`${PRERELEASE_ROOT}_generated/index-props.json`).catch(() => ({})),
          fetchJsonUrl(`${PRERELEASE_ROOT}_generated/index-sources.json`).catch(() => ({}))
        );
      }

      const base = await Promise.all(requests);
      const [officialSearchRaw, partneredSearchRaw, officialBestiaryIndex, homebrewSourceIndex, parserJs] = base;
      const homebrewProps = base[5] || {};
      const prereleaseProps = base[6] || {};
      const prereleaseSourceIndex = base[7] || {};

      const officialSourceNames = parseOfficialSourceNames(parserJs || "");
      const toHit = (item, origin) => ({
        name: item.n || "",
        source: item.s || "",
        sourceAbbrev: item.sA || item.s || "",
        sourceFull: item.sF || officialSourceNames.get(item.s) || item.s || "",
        page: item.p ?? "",
        hash: item.u || "",
        media: item.m || "",
        origin
      });

      const baseHits = [
        ...decompressSearchIndex(officialSearchRaw).filter(it => Number(it.c) === CREATURE_CATEGORY_ID).map(it => toHit(it, "official")),
        ...decompressSearchIndex(partneredSearchRaw).filter(it => Number(it.c) === CREATURE_CATEGORY_ID).map(it => toHit(it, "partnered"))
      ];

      const dedupe = hits => {
        const originRank = { official: 0, partnered: 1, prerelease: 2, homebrew: 3 };
        hits.sort((a, b) => (originRank[a.origin] ?? 9) - (originRank[b.origin] ?? 9));
        const seen = new Set();
        return hits.filter(hit => {
          if (!hit.name || !hit.source) return false;
          const key = `${normalize(hit.name)}|${normalize(hit.source)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const catalog = {
        hits: dedupe(baseHits),
        officialBestiaryIndex,
        homebrewSourceIndex,
        prereleaseSourceIndex,
        extendedLoading: false,
        extendedLoaded: SETTINGS.extendedBestiary === false,
        extendedPromise: null
      };

      if (SETTINGS.extendedBestiary !== false) {
        catalog.extendedLoading = true;
        catalog.extendedPromise = (async () => {
          emitCatalogProgress("Oficial + partnered prontos. Carregando homebrew/community e prerelease em segundo plano...");
          const [brewHits, prereleaseHits] = await Promise.all([
            loadRepoMonsterHits(HOMEBREW_ROOT, "homebrew", homebrewProps, (done, total) => emitCatalogProgress(`Homebrew/community: ${done}/${total} arquivos...`)),
            loadRepoMonsterHits(PRERELEASE_ROOT, "prerelease", prereleaseProps, (done, total) => emitCatalogProgress(`Prerelease: ${done}/${total} arquivos...`))
          ]);
          catalog.hits.splice(0, catalog.hits.length, ...dedupe([...catalog.hits, ...brewHits, ...prereleaseHits]));
          catalog.extendedLoading = false;
          catalog.extendedLoaded = true;
          emitCatalogProgress(`${catalog.hits.length} monstros indexados • catálogo estendido pronto.`);
          return catalog;
        })().catch(error => {
          catalog.extendedLoading = false;
          console.warn("[DDB QoL] Catálogo estendido falhou", error);
          emitCatalogProgress(`Oficial + partnered prontos. Catálogo estendido falhou: ${error.message}`);
          return catalog;
        });
      }

      emitCatalogProgress(`${catalog.hits.length} monstros indexados • oficial + partnered prontos.`);
      return catalog;
    })();
    return catalogPromise;
  }

  function deepCopy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function walkStrings(value, fn) {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map(v => walkStrings(v, fn));
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = walkStrings(v, fn);
      return out;
    }
    return value;
  }

  function getPath(obj, path) {
    return String(path || "").split(".").filter(Boolean).reduce((cur, key) => cur?.[key], obj);
  }

  function setPath(obj, path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ||= {};
    cur[parts.at(-1)] = value;
  }

  function applyArrayMod(target, prop, mod) {
    const arr = Array.isArray(target[prop]) ? target[prop] : [];
    const items = mod.items == null ? [] : (Array.isArray(mod.items) ? deepCopy(mod.items) : [deepCopy(mod.items)]);
    const names = mod.names == null ? [] : (Array.isArray(mod.names) ? mod.names : [mod.names]);
    const byName = name => arr.findIndex(it => normalize(it?.name) === normalize(name));

    switch (mod.mode) {
      case "prependArr": target[prop] = [...items, ...arr]; return true;
      case "appendArr": target[prop] = [...arr, ...items]; return true;
      case "appendIfNotExistsArr": {
        const existing = new Set(arr.map(it => normalize(it?.name || JSON.stringify(it))));
        target[prop] = [...arr, ...items.filter(it => !existing.has(normalize(it?.name || JSON.stringify(it))))];
        return true;
      }
      case "insertArr": {
        const ix = Math.max(0, Number(mod.index ?? mod.ix ?? 0));
        target[prop] = [...arr.slice(0, ix), ...items, ...arr.slice(ix)];
        return true;
      }
      case "removeArr": target[prop] = arr.filter(it => !names.some(name => normalize(it?.name) === normalize(name))); return true;
      case "replaceArr":
      case "replaceOrAppendArr": {
        const needle = mod.replace ?? mod.name;
        const ix = byName(needle);
        if (~ix) target[prop] = [...arr.slice(0, ix), ...items, ...arr.slice(ix + 1)];
        else if (mod.mode === "replaceOrAppendArr") target[prop] = [...arr, ...items];
        return ~ix || mod.mode === "replaceOrAppendArr";
      }
      case "renameArr": {
        const renames = mod.renames || mod.rename || {};
        for (const it of arr) if (it?.name && renames[it.name]) it.name = renames[it.name];
        target[prop] = arr;
        return true;
      }
    }
    return false;
  }

  function applyCopyMods(target, base, mods, warnings) {
    if (!mods || typeof mods !== "object") return;
    const entryProps = ["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting", "variant"];

    const applyOne = (prop, mod) => {
      if (typeof mod === "string") {
        if (mod === "remove") { delete target[prop]; return; }
        warnings.push(`_copy não suportado: ${prop}/${mod}`); return;
      }
      if (!mod?.mode) return;

      if (["prependArr", "appendArr", "appendIfNotExistsArr", "insertArr", "removeArr", "replaceArr", "replaceOrAppendArr", "renameArr"].includes(mod.mode)) {
        if (!applyArrayMod(target, prop, mod)) warnings.push(`_copy parcial: ${prop}/${mod.mode}`);
        return;
      }

      if (mod.mode === "replaceTxt") {
        let re;
        try { re = new RegExp(mod.replace, mod.flags || "g"); } catch (_e) { re = null; }
        if (re) target[prop] = walkStrings(target[prop], str => str.replace(re, mod.with ?? ""));
        return;
      }
      if (mod.mode === "replaceName") {
        const from = String(base?.name || "");
        const to = String(target?.name || "");
        if (from) target[prop] = walkStrings(target[prop], str => str.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to));
        return;
      }
      if (mod.mode === "appendStr") {
        const path = mod.prop ? `${prop}.${mod.prop}` : prop;
        const cur = getPath(target, path);
        if (typeof cur === "string") setPath(target, path, `${cur}${mod.joiner ?? ""}${mod.str ?? mod.value ?? ""}`);
        return;
      }
      if (mod.mode === "setProp") {
        const path = mod.prop ? `${prop}.${mod.prop}` : prop;
        setPath(target, path, deepCopy(mod.value)); return;
      }
      if (mod.mode === "prefixSuffixStringProp") {
        const path = mod.prop ? `${prop}.${mod.prop}` : prop;
        const cur = getPath(target, path);
        if (typeof cur === "string") setPath(target, path, `${mod.prefix || ""}${cur}${mod.suffix || ""}`);
        return;
      }
      if (mod.mode === "scalarAddProp" || mod.mode === "scalarMultProp") {
        const path = mod.prop ? `${prop}.${mod.prop}` : prop;
        const cur = Number(getPath(target, path));
        if (Number.isFinite(cur)) setPath(target, path, mod.mode === "scalarAddProp" ? cur + Number(mod.scalar || 0) : cur * Number(mod.scalar || 1));
        return;
      }
      if (mod.mode === "scalarAddHit" || mod.mode === "scalarAddDc") {
        const n = Number(mod.scalar || 0);
        const re = mod.mode === "scalarAddHit" ? /\{@hit\s+([-+]?\d+)}/g : /\{@dc\s+(\d+)(?:\|[^}]+)?}/g;
        target[prop] = walkStrings(target[prop], str => str.replace(re, (_m, v) => mod.mode === "scalarAddHit" ? `{@hit ${Number(v) + n}}` : `{@dc ${Number(v) + n}}`));
        return;
      }
      if (mod.mode === "addSenses") { target.senses = [...(target.senses || []), ...(mod.senses || [])]; return; }
      if (mod.mode === "addSaves") { target.save = { ...(target.save || {}), ...(mod.saves || mod.save || {}) }; return; }
      if (mod.mode === "addSkills") { target.skill = { ...(target.skill || {}), ...(mod.skills || mod.skill || {}) }; return; }
      if (mod.mode === "maxSize" && mod.max) { target.size = [mod.max]; return; }

      warnings.push(`_copy parcial: ${prop}/${mod.mode}`);
    };

    for (const [prop, raw] of Object.entries(mods)) {
      const list = Array.isArray(raw) ? raw : [raw];
      const props = prop === "*" ? entryProps.filter(p => target[p] != null) : [prop];
      for (const p of props) for (const mod of list) applyOne(p, mod);
    }
  }

  async function getRawMonster(name, source, preferredOrigin = "", preferredFilePath = "") {
    const catalog = await loadMonsterCatalog();
    let origin = preferredOrigin;
    let url = "";

    if (preferredFilePath) {
      if (origin === "prerelease") url = `${PRERELEASE_ROOT}${encodeRepoPath(preferredFilePath)}`;
      else if (origin === "homebrew" || origin === "partnered") url = `${HOMEBREW_ROOT}${encodeRepoPath(preferredFilePath)}`;
    }

    if (!url && origin === "prerelease" && catalog.prereleaseSourceIndex?.[source]) {
      url = `${PRERELEASE_ROOT}${encodeRepoPath(catalog.prereleaseSourceIndex[source])}`;
    } else if (!url && ["homebrew", "partnered"].includes(origin) && catalog.homebrewSourceIndex?.[source]) {
      url = `${HOMEBREW_ROOT}${encodeRepoPath(catalog.homebrewSourceIndex[source])}`;
    } else if (!url && origin !== "partnered" && origin !== "homebrew" && origin !== "prerelease" && catalog.officialBestiaryIndex[source]) {
      origin = "official";
      url = `${BESTIARY_BASE}${catalog.officialBestiaryIndex[source]}`;
    } else if (!url && catalog.homebrewSourceIndex?.[source]) {
      origin = origin || "homebrew";
      url = `${HOMEBREW_ROOT}${encodeRepoPath(catalog.homebrewSourceIndex[source])}`;
    } else if (!url && catalog.prereleaseSourceIndex?.[source]) {
      origin = "prerelease";
      url = `${PRERELEASE_ROOT}${encodeRepoPath(catalog.prereleaseSourceIndex[source])}`;
    } else if (!url && catalog.officialBestiaryIndex[source]) {
      origin = "official";
      url = `${BESTIARY_BASE}${catalog.officialBestiaryIndex[source]}`;
    }

    if (!url) throw new Error(`Fonte ${source} não localizada.`);
    const data = await fetchJsonUrl(url);
    const monsters = Array.isArray(data?.monster) ? data.monster : [];
    const monster = monsters.find(m => normalize(m?.name) === normalize(name) && normalize(m?.source || source) === normalize(source))
      || monsters.find(m => normalize(m?.name) === normalize(name));
    if (!monster) throw new Error(`Monstro ${name} (${source}) não encontrado no arquivo da fonte.`);
    return { monster: deepCopy(monster), data, origin, url };
  }

  async function resolveMonsterCopy(monster, origin, seen = new Set()) {
    if (!monster?._copy?.name) return { monster: deepCopy(monster), warnings: [] };
    const copy = deepCopy(monster._copy);
    const baseSource = copy.source || monster.source;
    const key = `${normalize(copy.name)}|${normalize(baseSource)}`;
    if (seen.has(key)) throw new Error("Loop de _copy detectado no 5etools.");
    seen.add(key);

    const rawBase = await getRawMonster(copy.name, baseSource, origin);
    const resolvedBase = await resolveMonsterCopy(rawBase.monster, rawBase.origin, seen);
    const out = deepCopy(resolvedBase.monster);
    for (const [k, v] of Object.entries(monster)) {
      if (k === "_copy") continue;
      if (v === null) delete out[k];
      else out[k] = deepCopy(v);
    }
    const warnings = [...resolvedBase.warnings];
    applyCopyMods(out, resolvedBase.monster, copy._mod, warnings);
    delete out._copy;
    return { monster: out, warnings };
  }

  async function resolveCatalogHit(hit) {
    const raw = await getRawMonster(hit.name, hit.source, hit.origin, hit.filePath || "");
    const resolved = await resolveMonsterCopy(raw.monster, raw.origin);
    return { ...resolved, rawData: raw.data, origin: raw.origin };
  }


  function findMonsterFluff(data, monster) {
    const wantedName = normalize(monster?.name);
    const wantedSource = normalize(monster?.source);
    const candidates = [];
    const seen = new WeakSet();
    let budget = 12000;
    const add = value => {
      if (!value) return;
      if (Array.isArray(value)) value.forEach(add);
      else if (typeof value === "object") candidates.push(value);
    };
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 8 || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 500)) walk(child, depth + 1);
        return;
      }
      for (const key of ["monsterFluff", "monsterFluffs", "fluff", "fluffs"]) add(value?.[key]);
      for (const [key, child] of Object.entries(value)) {
        if (["monster", "spell", "item", "class", "subclass"].includes(key) && depth > 0) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    walk(data);
    const usable = candidates.filter(item => Array.isArray(item?.entries) || item?._copy?.name);
    return usable.find(item => normalize(item?.name) === wantedName && normalize(item?.source || monster?.source) === wantedSource)
      || usable.find(item => normalize(item?.name) === wantedName)
      || null;
  }

  async function resolveMonsterLore(monster, rawData, origin, seen = new Set()) {
    const directEntries = monster?.fluff?.entries || monster?.info?.entries || monster?.infoEntries;
    if (Array.isArray(directEntries) && directEntries.length) return renderLoreEntries(directEntries);
    let entry = findMonsterFluff(rawData, monster);

    if (!entry && origin === "official") {
      try {
        const fluffData = await fetch5eJson(`fluff-bestiary-${String(monster.source || "").toLowerCase()}.json`);
        entry = findMonsterFluff(fluffData, monster);
      } catch (_e) {}
    }

    if (!entry) return "";
    if (Array.isArray(entry.entries)) return renderLoreEntries(entry.entries);
    if (entry?._copy?.name) {
      const source = entry._copy.source || monster.source;
      const key = `${normalize(entry._copy.name)}|${normalize(source)}`;
      if (seen.has(key)) return "";
      seen.add(key);
      try {
        const raw = await getRawMonster(entry._copy.name, source, origin);
        return resolveMonsterLore({ name: entry._copy.name, source }, raw.data, raw.origin, seen);
      } catch (_e) {}
    }
    return "";
  }

  function resolveLairHtml(monster, rawData) {
    const ref = monster?.legendaryGroup;
    if (!ref) return "";
    const groups = Array.isArray(rawData?.legendaryGroup) ? rawData.legendaryGroup : [];
    const group = groups.find(g => normalize(g?.name) === normalize(ref?.name) && normalize(g?.source || ref?.source || monster?.source) === normalize(ref?.source || monster?.source))
      || groups.find(g => normalize(g?.name) === normalize(ref?.name));
    if (!group) return "";
    const parts = [];
    if (Array.isArray(group.lairActions) && group.lairActions.length) {
      parts.push(`<p><strong>Lair Actions</strong></p>${renderLoreEntries(group.lairActions)}`);
    }
    if (Array.isArray(group.regionalEffects) && group.regionalEffects.length) {
      parts.push(`<p><strong>Regional Effects</strong></p>${renderLoreEntries(group.regionalEffects)}`);
    }
    return parts.join("\n");
  }

  function inferEdition(monster, hit) {
    if (monster?.edition === "one") return "1";
    const sourceText = `${monster?.source || ""} ${hit?.sourceFull || ""}`;
    if (/\b2024\b|\b5\.5e\b/i.test(sourceText)) return "1";
    return monsterEditionDefault(monster?.source || hit?.source || "");
  }

  function cleanMapsMonsterName(name) {
    const value = String(name || "").trim();
    return value
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s*[•·]\s*(?:MCDM|2014|2024|Legacy)\s*$/i, "")
      .replace(/\s+\((?:MCDM|2014|2024|Legacy)\)\s*$/i, "")
      .trim();
  }

  function findTokenBrowserPanel() {
    const inputs = [...document.querySelectorAll('input[type="search"], input')];
    const input = inputs.find(el => {
      const hint = normalize(`${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`);
      return hint.includes("search monsters") || hint.includes("monster") || hint.includes("creature");
    });

    if (input) {
      let cur = input.parentElement;
      let best = null;
      for (let i = 0; cur && i < 10; i++, cur = cur.parentElement) {
        const text = normalize(cur.innerText || "");
        const rect = cur.getBoundingClientRect();
        if (text.includes("monsters") && rect.width > 180 && rect.width < 800) best = cur;
      }
      return best || input.closest('[role="dialog"]') || input.parentElement?.parentElement;
    }

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role="tab"],button,div,span')]
      .filter(el => normalize(el.textContent) === "monsters");
    for (const heading of headings) {
      const panel = heading.closest('[role="dialog"],aside,[class*="sidebar" i],[class*="browser" i]');
      if (panel) return panel;
    }
    return null;
  }

  function findMonsterRowFromElement(el, panel) {
    // Pick the widest row-sized ancestor, rather than the first one we hit.
    // DDB uses different inner wrappers for available vs unavailable monsters;
    // anchoring to those inner wrappers is what made +/+HB/5e drift sideways.
    const panelRect = panel?.getBoundingClientRect?.() || { width: 0 };
    const candidates = [];
    let cur = el;
    for (let i = 0; cur && cur !== panel && i < 9; i++, cur = cur.parentElement) {
      const rect = cur.getBoundingClientRect?.();
      if (!rect) continue;
      const lines = String(cur.innerText || "").split(/\n+/).map(v => v.trim()).filter(Boolean);
      if (rect.height < 42 || rect.height > 120 || rect.width < 190 || !lines.length || !cur.querySelector?.("img")) continue;
      if (panelRect.width && rect.width > panelRect.width + 4) continue;
      let score = rect.width;
      if (panelRect.width) score -= Math.abs((panelRect.width - 18) - rect.width) * 0.35;
      if (/monster|item|row|result/i.test(String(cur.className || ""))) score += 25;
      candidates.push({ el: cur, score, width: rect.width });
    }
    candidates.sort((a, b) => b.score - a.score || b.width - a.width);
    return candidates[0]?.el || null;
  }

  function extractMonsterNameFromRow(row) {
    const lines = String(row?.innerText || "")
      .split(/\n+/)
      .map(s => s.replace(/\+HB/g, "").replace(/5eTools?↗?/gi, "").trim())
      .filter(Boolean)
      .filter(s => !/^(tiny|small|medium|large|huge|gargantuan)\b/i.test(s));
    return lines[0] || "";
  }

  function rowLooksUnavailable(row) {
    if (!row) return false;
    if (row.matches?.(':disabled,[aria-disabled="true"],[data-disabled="true"]')) return true;
    if (row.querySelector?.(':disabled,[aria-disabled="true"],[data-disabled="true"]')) return true;
    if (/disabled|locked|unavailable/i.test(String(row.className || ""))) return true;
    const style = getComputedStyle(row);
    if (style.pointerEvents === "none" || Number(style.opacity || 1) <= 0.72) return true;
    const img = row.querySelector("img");
    if (img && Number(getComputedStyle(img).opacity || 1) <= 0.72) return true;
    return false;
  }

  function monsterButtonHost(row) {
    if (!row) return null;
    // Always anchor custom actions to the monster row itself. Using a disabled
    // row's parent shifted +HB/5e into a different horizontal rail.
    const host = row;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    return host;
  }

  function tokenBrowserActiveTab(panel) {
    if (!panel) return "";
    const tabs = [...panel.querySelectorAll('[role="tab"],button,a,div,span')].filter(el => {
      const text = normalize(el.innerText || el.textContent || "");
      return ["monsters", "players", "companions"].includes(text);
    });
    const explicit = tabs.find(el => el.getAttribute?.("aria-selected") === "true" || el.getAttribute?.("data-state") === "active" || /active|selected/i.test(String(el.className || "")));
    if (explicit) return normalize(explicit.innerText || explicit.textContent || "");
    const search = [...panel.querySelectorAll('input[type="search"],input')].find(el => isVisible(el));
    if (search && normalize(`${search.placeholder || ""} ${search.getAttribute("aria-label") || ""}`).includes("monster")) return "monsters";
    // If the Monsters search is not visible, be conservative: Players and
    // Companions must never receive the 5e shortcut.
    return "other";
  }

  function clearNonMonster5eButtons(panel) {
    for (const button of panel?.querySelectorAll?.(`.${EXT}-5e-button`) || []) button.remove();
    for (const stack of panel?.querySelectorAll?.(`.${EXT}-row-action-stack`) || []) if (!stack.children.length) stack.remove();
  }

  function suppressTokenBrowserHorizontalOverflow(panel) {
    if (!panel) return;
    panel.classList.add(`${EXT}-token-browser-panel`);
    // DDB keeps the vertical list in an inner scroller. Only suppress X on
    // elements that are demonstrably overflowing horizontally; Y remains
    // untouched so the monster list still scrolls normally.
    const candidates = [panel, ...panel.querySelectorAll("div,section,ul")];
    for (const el of candidates) {
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 160 || rect.height < 80) continue;
      if (el.scrollWidth > el.clientWidth + 2) el.style.setProperty("overflow-x", "hidden", "important");
    }
  }

  function nativeMonsterActionButton(row) {
    const candidates = [...(row?.querySelectorAll?.("button") || [])]
      .filter(button => !button.classList.contains(`${EXT}-hb-button`) && !button.classList.contains(`${EXT}-5e-button`) && isVisible(button))
      .map(button => {
        const text = normalize(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""} ${button.title || ""}`);
        const rect = button.getBoundingClientRect();
        let score = rect.left;
        if (text === "+" || /add|place|token|monster/.test(text)) score += 10000;
        return { button, score };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.button || null;
  }

  function monsterActionStack(host) {
    if (!host) return null;
    let stack = host.querySelector(`:scope > .${EXT}-row-action-stack`);
    if (!stack) {
      stack = document.createElement("div");
      stack.className = `${EXT}-row-action-stack`;
      host.appendChild(stack);
    }
    return stack;
  }

  function alignMonsterRowButtons(row) {
    const host = monsterButtonHost(row);
    if (!host) return;
    const hb = host.querySelector(`.${EXT}-hb-button`) || row.querySelector?.(`.${EXT}-hb-button`);
    const five = host.querySelector(`.${EXT}-5e-button`) || row.querySelector?.(`.${EXT}-5e-button`);
    if (!hb && !five) return;

    const native = nativeMonsterActionButton(row);
    const stack = monsterActionStack(host);
    if (!stack) return;

    // Move the real native + button into the same rail as our buttons instead
    // of trying to visually chase its changing React geometry.
    const useNative = native && native !== hb && native !== five && !rowLooksUnavailable(row);
    if (useNative) {
      native.classList.add(`${EXT}-native-monster-action`, `${EXT}-row-action-aligned`);
      if (native.parentElement !== stack) stack.appendChild(native);
    }
    if (hb) {
      hb.classList.add(`${EXT}-row-action-aligned`);
      if (hb.parentElement !== stack) stack.appendChild(hb);
    }
    if (five) {
      five.classList.add(`${EXT}-row-action-aligned`);
      five.classList.toggle(`${EXT}-5e-with-hb`, Boolean(hb));
      if (five.parentElement !== stack) stack.appendChild(five);
    }

    // Keep the ordering deterministic: native/+HB first, 5e second.
    const topAction = hb || (useNative ? native : null);
    if (topAction && stack.firstElementChild !== topAction) stack.insertBefore(topAction, stack.firstElementChild);
    if (five && topAction && topAction.nextElementSibling !== five) stack.insertBefore(five, topAction.nextElementSibling);

    host.classList.add(`${EXT}-monster-row-host`);
    host.style.setProperty("box-sizing", "border-box", "important");
    host.style.removeProperty("width");
    host.style.setProperty("max-width", "100%", "important");
    host.style.setProperty("min-width", "0", "important");
    host.style.setProperty("padding-right", "50px", "important");
  }


  function addHbButtonToRow(row, name) {
    if (!row || row.dataset.ddbQolHb === "1") return;
    row.dataset.ddbQolHb = "1";

    const host = monsterButtonHost(row);
    if (!host) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${EXT}-hb-button`;
    button.textContent = "+HB";
    button.title = `Importar ${name} do 5etools para Homebrew`;
    button.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); });
    button.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      const query = cleanMapsMonsterName(name);
      setStorage(PREFILL_KEY, { name, query, from: "maps", returnUrl: location.href, createdAt: Date.now() }).catch(() => {});
      window.open(`${HOMEBREW_CREATE_URL}?ddbQolSearch=${encodeURIComponent(query)}`, "_blank");
    });
    monsterActionStack(host)?.appendChild(button);
    requestAnimationFrame(() => alignMonsterRowButtons(row));
  }

  function maps5eToolsSearchUrl(name) {
    const query = cleanMapsMonsterName(name);
    return `${FIVE_TOOLS_BESTIARY_URL}?ddbQolSearch=${encodeURIComponent(query)}`;
  }

  function add5eToolsButtonToRow(row, name) {
    if (!row || row.dataset.ddbQol5e === "1") return;
    row.dataset.ddbQol5e = "1";

    const host = monsterButtonHost(row);
    if (!host) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `${EXT}-5e-button`;
    if (host.querySelector(`.${EXT}-hb-button`)) button.classList.add(`${EXT}-5e-with-hb`);
    button.textContent = "5e";
    button.title = `Abrir ${name} no 5etools`;
    button.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); });
    button.addEventListener("click", e => {
      e.stopPropagation();
      e.preventDefault();
      window.open(maps5eToolsSearchUrl(name), "_blank", "noopener");
    });
    const stack = host.querySelector(`:scope > .${EXT}-row-action-stack`);
    (stack || host).appendChild(button);
    requestAnimationFrame(() => alignMonsterRowButtons(row));
  }

  function injectMonster5eToolsButtons() {
    const panel = findTokenBrowserPanel();
    if (!panel) return;
    suppressTokenBrowserHorizontalOverflow(panel);
    const activeTab = tokenBrowserActiveTab(panel);
    if (activeTab && activeTab !== "monsters") {
      clearNonMonster5eButtons(panel);
      return;
    }
    const rows = new Set();
    for (const img of panel.querySelectorAll("img")) {
      const row = findMonsterRowFromElement(img, panel);
      if (row) rows.add(row);
    }
    for (const row of rows) {
      const name = extractMonsterNameFromRow(row);
      if (!name || normalize(name).includes("search monsters")) continue;
      add5eToolsButtonToRow(row, name);
      alignMonsterRowButtons(row);
    }
  }

  function injectMonsterHbButtons() {
    if (SETTINGS.hbButtons === false) return;
    const panel = findTokenBrowserPanel();
    if (!panel) return;
    const activeTab = tokenBrowserActiveTab(panel);
    if (activeTab && activeTab !== "monsters") return;

    const candidates = [...panel.querySelectorAll(':disabled,[aria-disabled="true"],[data-disabled="true"],[class*="disabled" i],[class*="locked" i]')];
    const rows = new Set();
    for (const el of candidates) {
      const row = findMonsterRowFromElement(el, panel);
      if (row) rows.add(row);
    }

    if (!rows.size) {
      for (const img of panel.querySelectorAll("img")) {
        const row = findMonsterRowFromElement(img, panel);
        if (row && rowLooksUnavailable(row)) rows.add(row);
      }
    }

    for (const row of rows) {
      if (!rowLooksUnavailable(row)) continue;
      const name = extractMonsterNameFromRow(row);
      if (!name || normalize(name).includes("search monsters")) continue;
      addHbButtonToRow(row, name);
      alignMonsterRowButtons(row);
    }
  }

  const resultTokenImageCache = new Map();

  function standard5eTokenUrl(hit) {
    const source = encodeURIComponent(String(hit?.source || "").trim());
    const name = encodeURIComponent(String(hit?.name || "").trim());
    return source && name ? `${IMAGE_BASE}tokens/${source}/${name}.webp` : "";
  }

  async function resolveResultTokenCandidates(hit) {
    const cacheKey = `${normalize(hit?.name)}|${normalize(hit?.source)}`;
    if (resultTokenImageCache.has(cacheKey)) return resultTokenImageCache.get(cacheKey);
    const urls = [];
    const add = url => { if (url && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url); };

    if (typeof hit?.media === "string") add(hit.media);
    else if (hit?.media?.href) add(getExternalMediaUrl(hit.media));
    if (hit?.origin === "official") add(standard5eTokenUrl(hit));

    try {
      const resolved = await resolveCatalogHit(hit);
      const monster = resolved?.monster || {};
      add(getExternalMediaUrl(monster.tokenHref || monster.tokenUrl));
      if (resolved?.origin === "official") add(standard5eTokenUrl(hit));
      for (const image of monster?.fluff?.images || []) add(getExternalMediaUrl(image));
      try {
        const fluffPath = await resolveFluffImagePath(monster);
        if (fluffPath) add(internalImageUrl(fluffPath));
      } catch (_e) {}
      const source = encodeURIComponent(String(monster?.source || hit?.source || "").trim());
      const name = encodeURIComponent(String(monster?.name || hit?.name || "").trim());
      if (source && name) add(`${IMAGE_BASE}${source}/${name}.webp`);
    } catch (_e) {}

    resultTokenImageCache.set(cacheKey, urls);
    return urls;
  }

  function loadResultTokenThumbnail(img, hit) {
    if (!img || img.dataset.ddbQolLoading === "1") return;
    img.dataset.ddbQolLoading = "1";
    const run = async () => {
      const urls = await resolveResultTokenCandidates(hit);
      if (!urls?.length || !img.isConnected) return;
      let index = 0;
      const tryNext = () => {
        if (!img.isConnected || index >= urls.length) { img.hidden = true; return; }
        img.src = urls[index++];
        img.hidden = false;
      };
      img.addEventListener("error", tryNext, { passive: true });
      img.addEventListener("load", () => { img.hidden = false; }, { passive: true });
      tryNext();
    };
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        run().catch(() => {});
      }, { rootMargin: "180px" });
      observer.observe(img);
    } else run().catch(() => {});
  }

  function makeImporterPanel() {
    if (document.getElementById(`${EXT}-importer`)) return;
    const form = [...document.forms].find(f => f.method.toLowerCase() === "post" && f.enctype === "multipart/form-data" && f.elements.length > 30);
    if (!form) return;

    const panel = document.createElement("section");
    panel.id = `${EXT}-importer`;
    panel.innerHTML = `
      <div class="${EXT}-head">
        <div><strong>5etools → D&D Beyond</strong><small>Bestiary 5etools • v0.3.23</small></div>
        <span class="${EXT}-badge">QOL</span>
      </div>
      <div class="${EXT}-controls">
        <label>Fonte<select id="${EXT}-source"><option value="">Todas as fontes</option></select></label>
        <label>Edição<select id="${EXT}-edition"><option value="0">5e</option><option value="1">5.5e</option></select></label>
      </div>
      <input id="${EXT}-monster-search" type="search" placeholder="🔎 Buscar em todo o Bestiary do 5etools..." disabled>
      <div id="${EXT}-status" class="${EXT}-status">Carregando Bestiary completo...</div>
      <div id="${EXT}-results" class="${EXT}-results"></div>
    `;

    form.insertBefore(panel, form.firstChild);

    const sourceEl = panel.querySelector(`#${EXT}-source`);
    const editionEl = panel.querySelector(`#${EXT}-edition`);
    const searchEl = panel.querySelector(`#${EXT}-monster-search`);
    const resultsEl = panel.querySelector(`#${EXT}-results`);
    const statusEl = panel.querySelector(`#${EXT}-status`);

    let catalog = null;
    let editionTouched = false;
    let importContext = null;

    const renderResults = () => {
      if (!catalog) return;
      const q = normalize(searchEl.value);
      resultsEl.innerHTML = "";
      if (q.length < 2) return;
      const sourceFilter = sourceEl.value;

      const matches = catalog.hits
        .filter(hit => (!sourceFilter || hit.source === sourceFilter))
        .filter(hit => normalize(hit.name).includes(q))
        .sort((a, b) => {
          const aExact = normalize(a.name) === q ? 0 : normalize(a.name).startsWith(q) ? 1 : 2;
          const bExact = normalize(b.name) === q ? 0 : normalize(b.name).startsWith(q) ? 1 : 2;
          return aExact - bExact || a.name.localeCompare(b.name) || a.source.localeCompare(b.source);
        })
        .slice(0, 50);

      if (!matches.length) {
        resultsEl.innerHTML = `<div class="${EXT}-empty">Nenhum monstro encontrado.</div>`;
        return;
      }

      for (const hit of matches) {
        const row = document.createElement("div");
        row.className = `${EXT}-result`;
        const sourceLabel = hit.sourceFull || hit.sourceAbbrev || hit.source;
        row.innerHTML = `
          <img class="${EXT}-result-token" alt="" hidden>
          <div class="${EXT}-result-info">
            <strong>${escapeHtml(hit.name)}</strong>
            <small>${escapeHtml(sourceLabel)}${hit.page ? ` • p. ${escapeHtml(hit.page)}` : ""}</small>
          </div>
          <div class="${EXT}-result-actions">
            <a href="${escapeHtml(get5eToolsMonsterUrl(hit))}" target="_blank" rel="noopener noreferrer" title="Abrir esta versão no 5etools">5eTools ↗</a>
            <button type="button">Importar</button>
          </div>
        `;
        loadResultTokenThumbnail(row.querySelector(`.${EXT}-result-token`), hit);
        const btn = row.querySelector("button");
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "Preparando...";
          try {
            statusEl.textContent = `Carregando ${hit.name} (${hit.source})...`;
            const resolvedResult = await resolveCatalogHit(hit);
            const resolved = resolvedResult.monster;
            const edition = editionTouched ? editionEl.value : inferEdition(resolved, hit);
            editionEl.value = edition;
            statusEl.textContent = `Buscando lore e Lair Actions de ${resolved.name}...`;
            const [loreHtml, lairHtml] = await Promise.all([
              resolveMonsterLore(resolved, resolvedResult.rawData, resolvedResult.origin).catch(() => ""),
              Promise.resolve(resolveLairHtml(resolved, resolvedResult.rawData))
            ]);
            const { form: mainForm, warnings } = fillMainMonsterForm(resolved, edition, { loreHtml, lairHtml, sourceFull: hit.sourceFull || hit.source });
            warnings.push(...resolvedResult.warnings);

            statusEl.textContent = `Validando rollables nativos do D&D Beyond...`;
            disableNativeRollableGeneration();
            const rollableCheck = validateHomebrewRollables();
            if (!rollableCheck.valid) {
              throw new Error(`Rollables inválidos: ${rollableCheck.issues.slice(0, 3).join(" • ")}`);
            }
            if (!rollableCheck.count && Array.isArray(resolved.action) && resolved.action.length) {
              warnings.push("Nenhum rollable detectado nas Actions; revisar se o monstro usa ataques/dados.");
            }
            console.info("[DDB QoL] Rollables preparados", { monster: resolved.name, count: rollableCheck.count });

            statusEl.textContent = `Buscando imagens de ${resolved.name}...`;
            try {
              const imageResult = await attachMonsterImages(resolved, resolvedResult.rawData);
              if (imageResult.cancelled) {
                const abortError = new Error("Importação cancelada no Token Maker.");
                abortError.ddbQolAbort = true;
                throw abortError;
              }
              if (!imageResult.ok && imageResult.warning) warnings.push(imageResult.warning);
            } catch (imageError) {
              if (imageError?.ddbQolAbort) throw imageError;
              console.warn("[DDB QoL] Imagem não importada", imageError);
              warnings.push("Imagem não importada");
            }

            await setStorage(PENDING_KEY, { monster: resolved, edition, warnings, rollableCount: rollableCheck.count, returnUrl: importContext?.returnUrl || "", createdAt: Date.now() });
            statusEl.textContent = `Criando ${resolved.name}...`;
            HTMLFormElement.prototype.submit.call(mainForm);
          } catch (error) {
            console.error("[DDB QoL] Import error", error);
            statusEl.textContent = `Erro: ${error.message}`;
            btn.disabled = false;
            btn.textContent = "Importar";
          }
        });
        resultsEl.appendChild(row);
      }
    };

    sourceEl.addEventListener("change", renderResults);
    editionEl.addEventListener("change", () => { editionTouched = true; });
    searchEl.addEventListener("input", renderResults);
    [sourceEl, editionEl, searchEl].forEach(el => {
      ["keydown", "keyup", "keypress"].forEach(type => el.addEventListener(type, e => e.stopPropagation()));
    });

    (async () => {
      try {
        catalogProgressListener = message => { statusEl.textContent = message; };
        catalog = await loadMonsterCatalog();
        const refreshSourceOptions = () => {
          const previous = sourceEl.value;
          const sourceMap = new Map();
          for (const hit of catalog.hits) if (!sourceMap.has(hit.source)) sourceMap.set(hit.source, hit.sourceFull || hit.sourceAbbrev || hit.source);
          const sortedSources = [...sourceMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
          sourceEl.innerHTML = `<option value="">Todas as fontes (${sourceMap.size})</option>` + sortedSources
            .map(([src, label]) => `<option value="${escapeHtml(src)}">${escapeHtml(label)}</option>`).join("");
          if (previous && [...sourceEl.options].some(option => option.value === previous)) sourceEl.value = previous;
        };
        refreshSourceOptions();

        searchEl.disabled = false;
        statusEl.textContent = catalog.extendedLoading
          ? `${catalog.hits.length} monstros prontos • oficial + partnered. Catálogo estendido carregando em segundo plano...`
          : `${catalog.hits.length} monstros indexados.`;
        if (catalog.extendedPromise) {
          catalog.extendedPromise.then(() => {
            refreshSourceOptions();
            renderResults();
            statusEl.textContent = `${catalog.hits.length} monstros indexados • catálogo estendido pronto.`;
          }).finally(() => { catalogProgressListener = null; });
        } else {
          catalogProgressListener = null;
        }

        const params = new URL(location.href).searchParams;
        const urlQuery = params.get("ddbQolSearch");
        const urlSource = params.get("ddbQolSource");
        const pendingPrefill = await getStorage(PREFILL_KEY);
        const recentPrefill = pendingPrefill && (Date.now() - Number(pendingPrefill.createdAt || 0) < 10 * 60 * 1000) ? pendingPrefill : null;
        importContext = recentPrefill;
        const query = urlQuery || recentPrefill?.query || "";
        const requestedSource = urlSource || recentPrefill?.source || "";
        if (requestedSource && [...sourceEl.options].some(option => option.value === requestedSource)) sourceEl.value = requestedSource;
        if (query) {
          searchEl.value = query;
          renderResults();
          statusEl.textContent = recentPrefill?.from === "5etools"
            ? `Busca recebida do 5etools: ${query}`
            : `Busca recebida: ${query}`;
          await removeStorage(PREFILL_KEY);
        }
        searchEl.focus();
      } catch (error) {
        statusEl.textContent = `Erro ao carregar 5etools: ${error.message}`;
      }
    })();
  }

  function getCreateLink(sectionClass, label) {
    const section = document.querySelector(sectionClass);
    if (!section) return null;
    return [...section.querySelectorAll("a")].find(a => normalize(a.textContent).includes(normalize(label)))?.href || null;
  }

  function formToParams(form) {
    const params = new URLSearchParams();
    for (const el of [...form.elements]) {
      if (!el.name || el.disabled) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      if (el.tagName === "SELECT" && el.multiple) {
        [...el.selectedOptions].forEach(o => params.append(el.name, o.value));
      } else {
        params.append(el.name, el.value ?? "");
      }
    }
    return params;
  }

  function findOptionValue(select, desiredText) {
    if (!select || !desiredText) return null;
    const wanted = normalize(desiredText);
    const exact = [...select.options].find(o => normalize(o.textContent) === wanted);
    return exact?.value ?? null;
  }

  async function postSubEntity(createUrl, fields, optionFields = {}) {
    const page = await fetch(createUrl, { credentials: "include" });
    if (!page.ok) throw new Error(`Falha ao abrir subformulário (${page.status}).`);
    const html = await page.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const form = [...doc.forms].find(f => f.method.toLowerCase() === "post");
    if (!form) throw new Error("Subformulário POST não encontrado.");

    const params = formToParams(form);
    for (const [name, value] of Object.entries(fields)) {
      params.set(name, value == null ? "" : String(value));
    }
    for (const [name, desiredText] of Object.entries(optionFields)) {
      const select = form.querySelector(`[name="${CSS.escape(name)}"]`);
      const value = findOptionValue(select, desiredText);
      if (value == null) return { ok: false, skipped: `${name}: ${desiredText}` };
      params.set(name, value);
    }

    const response = await fetch(form.action, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString(),
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`Falha ao salvar subregistro (${response.status}).`);
    return { ok: true, url: response.url };
  }

  function getSpeedNumber(value) {
    if (typeof value === "number") return { speed: value, note: "" };
    if (value && typeof value === "object") return { speed: value.number ?? "", note: strip5eTags(value.condition || "") };
    return { speed: "", note: "" };
  }

  function parseSense(text) {
    const clean = strip5eTags(text);
    const match = clean.match(/^(Blindsight|Darkvision|Tremorsense|Truesight)\s*(.*)$/i);
    if (!match) return null;
    return { type: titleCase(match[1].toLowerCase()), note: match[2].trim() };
  }

  async function resumePendingImport() {
    const pending = await getStorage(PENDING_KEY);
    if (!pending?.monster) return;

    const match = location.pathname.match(/\/homebrew\/creations\/monsters\/(\d+)-[^/]+\/edit/i);
    if (!match) return;

    if (document.getElementById(`${EXT}-finisher`)) return;
    const toast = document.createElement("div");
    toast.id = `${EXT}-finisher`;
    toast.className = `${EXT}-finisher`;
    toast.textContent = `Finalizando ${pending.monster.name}...`;
    document.body.appendChild(toast);

    const monster = pending.monster;
    const skipped = [...(pending.warnings || [])];

    try {
      const movementUrl = getCreateLink(".ddb-homebrew-create-special-movement", "add a movement");
      if (movementUrl) {
        const movementMap = { walk: "Walk", burrow: "Burrow", climb: "Climb", fly: "Fly", swim: "Swim" };
        for (const [kind, label] of Object.entries(movementMap)) {
          if (monster.speed?.[kind] == null) continue;
          const { speed, note } = getSpeedNumber(monster.speed[kind]);
          const res = await postSubEntity(movementUrl, { speed, note }, { "movement-type": label });
          if (!res.ok) skipped.push(`Movement ${label}: ${res.skipped || "não foi salvo"}`);
        }
      }

      const sensesUrl = getCreateLink(".ddb-homebrew-create-special-senses", "add a sense");
      if (sensesUrl) {
        for (const raw of monster.senses || []) {
          const sense = parseSense(raw);
          if (!sense) { skipped.push(`Sense: "${strip5eTags(raw)}" não foi reconhecido.`); continue; }
          const res = await postSubEntity(sensesUrl, { "sense-note": sense.note }, { sense: sense.type });
          if (!res.ok) skipped.push(`Sense ${sense.type}: ${res.skipped || "não foi salvo"}`);
        }
      }

      const skillsUrl = getCreateLink(".ddb-homebrew-create-special-skills", "add a skill");
      if (skillsUrl) {
        for (const [key, rawBonus] of Object.entries(monster.skill || {})) {
          const label = SKILL_NAMES[normalize(key)] || titleCase(key);
          const value = String(rawBonus).replace(/^\+/, "");
          const res = await postSubEntity(skillsUrl, { value, "additional-bonus": "" }, { skill: label });
          if (!res.ok) skipped.push(`Skill ${label}: ${res.skipped || "não foi salvo"}`);
        }
      }

      const languagesUrl = getCreateLink(".ddb-homebrew-create-special-languages", "add a language");
      if (languagesUrl) {
        const candidates = (monster.languages || [])
          .flatMap(raw => strip5eTags(raw).split(/[;,]/))
          .map(s => s.trim())
          .filter(Boolean);

        for (const candidate of candidates) {
          const page = await fetch(languagesUrl, { credentials: "include" });
          const html = await page.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const form = [...doc.forms].find(f => f.method.toLowerCase() === "post");
          if (!form) continue;
          const select = form.querySelector('[name="language"]');
          const option = [...(select?.options || [])]
            .filter(o => o.value)
            .sort((a, b) => b.textContent.length - a.textContent.length)
            .find(o => {
              const lang = normalize(o.textContent);
              const text = normalize(candidate);
              return text === lang || text.startsWith(`${lang} `) || text.includes(` ${lang} `) || text.endsWith(` ${lang}`);
            });
          if (!option) { skipped.push(`Language: "${candidate}" não foi encontrado nas opções do D&D Beyond.`); continue; }
          const params = formToParams(form);
          params.set("language", option.value);
          const langText = option.textContent.trim();
          const remainder = candidate.replace(new RegExp(langText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").replace(/^[,;:\s-]+|[,;:\s-]+$/g, "").trim();
          params.set("note", remainder);
          const response = await fetch(form.action, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: params.toString(),
            redirect: "follow"
          });
          if (!response.ok) skipped.push(`Language: "${candidate}" não foi salvo.`);
        }
      }

      const persistedRollables = validateHomebrewRollables();
      if (Number.isFinite(Number(pending.rollableCount)) && Number(pending.rollableCount) > 0) {
        if (!persistedRollables.valid) {
          skipped.push(`Rollables salvos com erro: ${persistedRollables.issues.slice(0, 2).join(" • ")}`);
        } else if (persistedRollables.count < Number(pending.rollableCount)) {
          skipped.push(`Rollables: esperado ${pending.rollableCount}, persistiram ${persistedRollables.count}`);
        }
      }

      await removeStorage(PENDING_KEY);
      toast.classList.add(`${EXT}-success`);
      const reviewItems = [...new Set(skipped.map(item => String(item || "").trim()).filter(Boolean))];
      const finalText = reviewItems.length
        ? `${monster.name} importado. Revisar ${reviewItems.length} item(ns):`
        : `${monster.name} importado com sucesso.`;
      if (reviewItems.length) {
        toast.classList.add(`${EXT}-finisher-review`);
        toast.innerHTML = `
          <div class="${EXT}-finisher-title">${escapeHtml(finalText)}</div>
          <ul class="${EXT}-review-list">${reviewItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          <div class="${EXT}-finisher-actions">
            ${pending.returnUrl ? `<button type="button" class="${EXT}-return-maps">Voltar ao Maps</button>` : `<button type="button" class="${EXT}-review-close">OK</button>`}
          </div>`;
      } else if (pending.returnUrl) {
        toast.innerHTML = `<span>${escapeHtml(finalText)}</span> <button type="button" class="${EXT}-return-maps">Voltar ao Maps</button>`;
      } else {
        toast.textContent = finalText;
      }
      toast.querySelector(`.${EXT}-return-maps`)?.addEventListener("click", () => {
        try { window.opener?.focus?.(); window.close(); } catch (_e) {}
        if (!window.closed) location.href = pending.returnUrl;
      });
      toast.querySelector(`.${EXT}-review-close`)?.addEventListener("click", () => location.reload());
      if (!pending.returnUrl && !reviewItems.length) setTimeout(() => location.reload(), 1400);
      console.log("[DDB QoL] Import finalizado", { monster: monster.name, skipped: reviewItems });
    } catch (error) {
      console.error("[DDB QoL] Finalização falhou", error);
      toast.classList.add(`${EXT}-error`);
      toast.textContent = `Falha ao finalizar: ${error.message}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Damage Applicator (Maps/Game Log) — v0.3.0 beta
  // ---------------------------------------------------------------------------
  const ddbCharacterCache = new Map();
  const ddbMonsterCache = new Map();
  let ddbConfigCache = null;

  function fetchDdbApiJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "DDB_QOL_DDB_API_JSON",
        url,
        method: options.method || "GET",
        body: options.body
      }, response => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!response?.ok) return reject(new Error(response?.error || "Falha ao consultar API do D&D Beyond."));
        resolve(response.data);
      });
    });
  }

  async function getDdbConfig() {
    if (!ddbConfigCache) ddbConfigCache = await fetchDdbApiJson("https://www.dndbeyond.com/api/config/json");
    return ddbConfigCache;
  }

  async function getDdbCharacter(id) {
    const key = String(id || "");
    if (!key) throw new Error("Personagem da rolagem não identificado.");
    if (!ddbCharacterCache.has(key)) {
      ddbCharacterCache.set(key, fetchDdbApiJson(`https://character-service.dndbeyond.com/character/v5/character/${encodeURIComponent(key)}`)
        .then(response => response?.data || response));
    }
    return ddbCharacterCache.get(key);
  }

  function ddbCharacterHpInfo(character) {
    if (!character || typeof character !== "object") return null;
    const finite = value => {
      if (value == null || value === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const base = finite(character.baseHitPoints) ?? 0;
    const bonus = finite(character.bonusHitPoints) ?? 0;
    const override = finite(character.overrideHitPoints);
    const removed = Math.max(0, finite(character.removedHitPoints) ?? 0);
    const temp = Math.max(0, finite(character.temporaryHitPoints) ?? 0);
    const calculatedMax = Math.max(0, base + bonus);
    const max = Math.max(0, override != null ? override : calculatedMax);
    if (!max && base === 0 && bonus === 0 && override == null) return null;
    return {
      current: Math.max(0, Math.min(max, max - removed)),
      max,
      temp,
      maxOverride: override != null ? Math.max(0, override) : null
    };
  }

  function normalizeMonsterApiResponse(response, wantedId = "") {
    const data = response?.data ?? response;
    const arrays = [
      data,
      data?.monsters,
      data?.results,
      data?.items,
      data?.data,
      response?.monsters,
      response?.results
    ].filter(Array.isArray);
    for (const arr of arrays) {
      const exact = arr.find(item => String(item?.id ?? item?.monsterId ?? item?.definition?.id ?? "") === String(wantedId));
      if (exact) return exact;
      if (arr[0]) return arr[0];
    }
    if (data && typeof data === "object") return data;
    return null;
  }

  async function getDdbMonster(id) {
    const key = String(id || "");
    if (!key) return null;
    if (!ddbMonsterCache.has(key)) {
      ddbMonsterCache.set(key, fetchDdbApiJson(`https://monster-service.dndbeyond.com/v1/Monster?ids=${encodeURIComponent(key)}`)
        .then(response => normalizeMonsterApiResponse(response, key))
        .catch(() => null));
    }
    return ddbMonsterCache.get(key);
  }

  const DAMAGE_TYPES = [
    "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
    "piercing", "poison", "psychic", "radiant", "slashing", "thunder"
  ];

  function damageTypeFromString(value) {
    const n = normalize(value);
    return DAMAGE_TYPES.find(type => n === type || n === `${type} damage`) || "";
  }

  function collectNamedObjects(root, wantedName) {
    const wanted = normalize(wantedName);
    const found = [];
    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return;
      seen.add(value);
      const name = value.name ?? value.Name ?? value.definition?.name ?? value.definition?.Name;
      if (name && normalize(name) === wanted) found.push(value);
      for (const child of Object.values(value)) walk(child, depth + 1);
    };
    walk(root);
    return found;
  }

  function collectDamageTypesFromObject(root, config) {
    const types = new Set();
    const seen = new WeakSet();
    const configDamageTypes = config?.ruledata?.damageTypes || config?.data?.ruledata?.damageTypes || config?.damageTypes || config?.data?.damageTypes || [];
    const add = value => {
      const type = damageTypeFromString(value);
      if (type) types.add(type);
    };
    const walk = (value, depth = 0) => {
      if (value == null || depth > 8) return;
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        for (const type of DAMAGE_TYPES) if (new RegExp(`\\b${type}\\s+damage\\b`, "i").test(lower)) types.add(type);
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);

      if (normalize(value.type) === "damage") {
        add(value.subType);
        add(value.friendlySubtypeName);
        add(value.damageType);
        add(value.damageTypeName);
      }
      add(value.damageType);
      add(value.damageTypeName);
      if (value.damageType?.name) add(value.damageType.name);
      if (value.damageTypeId != null) {
        const def = configDamageTypes.find(item => Number(item.id) === Number(value.damageTypeId));
        add(def?.name);
      }

      for (const [key, child] of Object.entries(value)) {
        if (/description|snippet|text/i.test(key) && typeof child === "string") walk(child, depth + 1);
        else if (typeof child === "object" && child !== null) walk(child, depth + 1);
      }
    };
    walk(root);
    return [...types];
  }

  async function resolveGameLogDamageTypes(message) {
    const entityType = normalize(message?.data?.context?.entityType || message?.entityType);
    const entityId = message?.data?.context?.entityId || message?.entityId;
    const action = message?.data?.action || "";
    if (!action) return [];

    try {
      const config = await getDdbConfig();
      if (entityType === "character") {
        const character = await getDdbCharacter(entityId);
        const candidates = collectNamedObjects(character, action);
        const result = new Set();
        for (const candidate of candidates) collectDamageTypesFromObject(candidate, config).forEach(type => result.add(type));
        return [...result];
      }

      if (entityType === "monster" || entityType === "creature") {
        const monster = await getDdbMonster(entityId);
        const candidates = collectNamedObjects(monster, action);
        const result = new Set();
        for (const candidate of candidates) collectDamageTypesFromObject(candidate, config).forEach(type => result.add(type));
        return [...result];
      }
    } catch (error) {
      console.warn("[DDB QoL] Não foi possível resolver o tipo de dano", error);
    }
    return [];
  }

  function getReactProps(el) {
    if (!el) return [];
    return Object.keys(el)
      .filter(key => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"))
      .map(key => el[key])
      .filter(Boolean);
  }

  function findGameLogMessage(value, depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || depth > 7 || seen.has(value)) return null;
    seen.add(value);
    if (value?.data?.rolls && Array.isArray(value.data.rolls) && value.id) return value;
    if (value?.message?.data?.rolls && value.message.id) return value.message;
    for (const [key, child] of Object.entries(value)) {
      if (["return", "child", "sibling", "stateNode", "_owner"].includes(key)) continue;
      const found = findGameLogMessage(child, depth + 1, seen);
      if (found) return found;
    }
    return null;
  }

  function messageDamageTotal(message) {
    const totals = (message?.data?.rolls || [])
      .filter(roll => normalize(roll?.rollType) === "damage")
      .map(roll => Number(roll?.result?.total))
      .filter(Number.isFinite);
    if (!totals.length) return null;
    return totals.reduce((sum, value) => sum + value, 0);
  }

  function findMessageOnElement(el) {
    for (const props of getReactProps(el)) {
      const message = findGameLogMessage(props);
      if (message) return message;
    }
    return null;
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function nativeSetInputValue(input, value) {
    if (!input) return;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function parseHpText(text) {
    const clean = String(text || "").replace(/,/g, "");
    let m = clean.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    if (m) return { current: Number(m[1]), max: Number(m[2]) };
    m = clean.match(/\bHP\s*(\d+)\s*(?:\/|of)\s*(\d+)\b/i);
    if (m) return { current: Number(m[1]), max: Number(m[2]) };
    return null;
  }

  function findHpRow(button) {
    let cur = button;
    for (let i = 0; cur && i < 8; i++, cur = cur.parentElement) {
      const rect = cur.getBoundingClientRect();
      const text = String(cur.innerText || "");
      if (rect.height >= 34 && rect.height <= 220 && rect.width >= 120 && parseHpText(text)) return cur;
    }
    return button.parentElement;
  }

  function targetNameFromRow(row, hp) {
    const lines = String(row?.innerText || "")
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !parseHpText(line))
      .filter(line => !/^(damage|heal|temp hp|override max hp|hp|initiative|remove|open)/i.test(line))
      .filter(line => !/^[-+]?\d+$/.test(line));
    return lines[0] || `Token ${hp.current}/${hp.max}`;
  }

  function targetImageFromRow(row) {
    const candidates = [...(row?.querySelectorAll?.("img") || [])]
      .map(img => ({
        url: img.currentSrc || img.src || "",
        area: Math.max(1, Number(img.naturalWidth || img.width || 0) * Number(img.naturalHeight || img.height || 0)),
        visible: isVisible(img)
      }))
      .filter(item => item.url && !/data:image\/svg\+xml[^,]*,%3Csvg/i.test(item.url))
      .sort((a, b) => Number(b.visible) - Number(a.visible) || b.area - a.area);
    if (candidates[0]?.url) return candidates[0].url;
    for (const el of [row, ...(row?.querySelectorAll?.("[style]") || [])]) {
      const bg = String(el?.style?.backgroundImage || getComputedStyle(el || document.body).backgroundImage || "");
      const m = bg.match(/url\(["']?(.+?)["']?\)/i);
      if (m?.[1]) return m[1];
    }
    return "";
  }

  function dataNumericId(row, names) {
    for (let el = row, depth = 0; el && depth < 5; el = el.parentElement, depth++) {
      for (const name of names) {
        const raw = el.getAttribute?.(`data-${name}`) ?? el.dataset?.[name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())];
        if (raw != null && /^\d+$/.test(String(raw))) return String(raw);
        const child = el.querySelector?.(`[data-${name}]`);
        const childRaw = child?.getAttribute?.(`data-${name}`);
        if (childRaw != null && /^\d+$/.test(String(childRaw))) return String(childRaw);
      }
    }
    return "";
  }

  function entityIdsFromReact(row, targetName = "") {
    const wanted = normalize(targetName);
    const seen = new WeakSet();
    let best = { score: -1, monsterId: "", characterId: "" };
    const numeric = value => (value != null && /^\d+$/.test(String(value))) ? String(value) : "";
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 9 || seen.has(value)) return;
      seen.add(value);
      const name = normalize(value?.name || value?.displayName || value?.definition?.name || value?.monster?.name || value?.character?.name || "");
      const entityType = normalize(value?.entityType || value?.type || value?.entity?.type || value?.definition?.entityType || "");
      const monsterId = numeric(value?.monsterId) || numeric(value?.monsterDefinitionId) || numeric(value?.monsterEntityId)
        || numeric(value?.monster?.id) || numeric(value?.monster?.definitionId)
        || (entityType.includes("monster") || entityType.includes("creature") ? (numeric(value?.definitionId) || numeric(value?.entityId) || numeric(value?.id)) : "");
      const characterId = numeric(value?.characterId) || numeric(value?.characterEntityId) || numeric(value?.playerCharacterId)
        || numeric(value?.character?.id)
        || (entityType.includes("character") ? (numeric(value?.entityId) || numeric(value?.id)) : "");
      if (monsterId || characterId) {
        let score = 1;
        if (wanted && name === wanted) score += 8;
        else if (wanted && name && (name.includes(wanted) || wanted.includes(name))) score += 3;
        if (entityType.includes("monster") || entityType.includes("creature") || entityType.includes("character")) score += 4;
        if (value?.definition || value?.monster || value?.character) score += 2;
        if (score > best.score) best = { score, monsterId, characterId };
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "child", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    for (let el = row, i = 0; el && i < 5; el = el.parentElement, i++) {
      for (const props of getReactProps(el)) walk(props, 0);
    }
    return best.score >= 0 ? best : { monsterId: "", characterId: "" };
  }

  function searchNumericKey(root, patterns, maxDepth = 6) {
    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > maxDepth || seen.has(value)) return null;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (patterns.some(re => re.test(key)) && (typeof child === "number" || /^\d+$/.test(String(child)))) return String(child);
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "child", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") {
          const hit = walk(child, depth + 1);
          if (hit) return hit;
        }
      }
      return null;
    };
    return walk(root);
  }

  function monsterIdFromRow(row, targetName = "") {
    const href = [...row.querySelectorAll?.('a[href*="/monsters/"]') || []].map(a => a.href).find(Boolean);
    const m = String(href || "").match(/\/monsters\/(\d+)/i);
    if (m) return m[1];
    const dataId = dataNumericId(row, ["ddb-qol-monster-id", "monster-id", "monster-definition-id", "monster-entity-id"]);
    if (dataId) return dataId;
    const react = entityIdsFromReact(row, targetName);
    if (react.monsterId) return react.monsterId;
    const patterns = [/^monsterId$/i, /monsterDefinitionId/i, /monsterEntityId/i];
    for (let el = row, i = 0; el && i < 5; el = el.parentElement, i++) {
      for (const props of getReactProps(el)) {
        const id = searchNumericKey(props, patterns, 9);
        if (id) return id;
      }
    }
    return "";
  }

  function characterIdFromRow(row, targetName = "") {
    const href = [...row.querySelectorAll?.('a[href*="/characters/"]') || []].map(a => a.href).find(Boolean);
    const m = String(href || "").match(/\/characters\/(\d+)/i);
    if (m) return m[1];
    const dataId = dataNumericId(row, ["ddb-qol-character-id", "character-id", "character-entity-id", "player-character-id"]);
    if (dataId) return dataId;
    const react = entityIdsFromReact(row, targetName);
    if (react.characterId) return react.characterId;
    const patterns = [/^characterId$/i, /characterEntityId/i, /^playerCharacterId$/i];
    for (let el = row, i = 0; el && i < 5; el = el.parentElement, i++) {
      for (const props of getReactProps(el)) {
        const id = searchNumericKey(props, patterns, 9);
        if (id) return id;
      }
    }
    return "";
  }

  function inlineDamageAdjustmentsFromRow(row) {
    for (let el = row, depth = 0; el && depth < 5; el = el.parentElement, depth++) {
      const raw = el.getAttribute?.("data-ddb-qol-damage-adjustments");
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }

  function discoverHpTargets() {
    const out = [];
    const seenRows = new Set();
    for (const button of document.querySelectorAll("button")) {
      if (!isVisible(button)) continue;
      const hp = parseHpText(button.innerText || button.textContent || button.getAttribute("aria-label") || button.title);
      if (!hp) continue;
      const row = findHpRow(button);
      if (!row || seenRows.has(row)) continue;
      seenRows.add(row);
      const name = targetNameFromRow(row, hp);
      out.push({
        id: `target-${out.length}`,
        name,
        hp,
        hpButton: button,
        row,
        imageUrl: targetImageFromRow(row),
        monsterId: monsterIdFromRow(row, name),
        characterId: characterIdFromRow(row, name),
        inlineDamageAdjustments: inlineDamageAdjustmentsFromRow(row)
      });
    }
    return out;
  }

  function adjustmentDefinitions(config) {
    const root = config?.ruledata?.damageAdjustments
      || config?.data?.ruledata?.damageAdjustments
      || config?.damageAdjustments
      || config?.data?.damageAdjustments
      || [];
    if (Array.isArray(root)) return root;
    const out = [];
    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return;
      seen.add(value);
      if (!Array.isArray(value) && (value.id != null || value.damageAdjustmentId != null) && (value.name || value.type != null || value.damageType != null)) out.push(value);
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) for (const item of child) walk(item, depth + 1);
        else if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    walk(root);
    return out;
  }

  function monsterDamageAdjustments(monster, config) {
    const raw = monster?.damageAdjustments
      || monster?.definition?.damageAdjustments
      || monster?.stats?.damageAdjustments
      || monster?.monster?.damageAdjustments
      || [];
    const defs = adjustmentDefinitions(config);
    return (Array.isArray(raw) ? raw : [])
      .map(item => {
        if (item && typeof item === "object") {
          const id = item.id ?? item.damageAdjustmentId ?? item.definition?.id;
          const def = id != null ? defs.find(entry => Number(entry?.id) === Number(id)) : null;
          return { ...(def || {}), ...item };
        }
        return defs.find(entry => Number(entry?.id) === Number(item));
      })
      .filter(Boolean);
  }

  function adjustmentMode(def) {
    if (!def || typeof def !== "object") return "normal";
    const numericCandidates = [
      def.type, def.type?.id, def.typeId, def.adjustmentType, def.adjustmentType?.id, def.adjustmentTypeId,
      def.damageAdjustmentType, def.damageAdjustmentType?.id, def.damageAdjustmentTypeId,
      def.definition?.type, def.definition?.type?.id, def.definition?.typeId
    ];
    for (const raw of numericCandidates) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      if (n === 1) return "resist";
      if (n === 2) return "immune";
      if (n === 3) return "vulnerable";
    }
    const text = normalize([
      def.type, def.type?.name, def.type?.label,
      def.adjustmentType, def.adjustmentType?.name, def.adjustmentType?.label,
      def.damageAdjustmentType, def.damageAdjustmentType?.name, def.damageAdjustmentType?.label,
      def.typeName, def.adjustmentTypeName, def.damageAdjustmentTypeName,
      def.category, def.kind, def.definition?.type, def.definition?.type?.name, def.definition?.typeName, def.definition?.name
    ].filter(Boolean).join(" "));
    if (/resist/.test(text)) return "resist";
    if (/immun/.test(text)) return "immune";
    if (/vulnerab/.test(text)) return "vulnerable";
    try {
      const deepText = normalize(JSON.stringify(def));
      if (/resist/.test(deepText)) return "resist";
      if (/immun/.test(deepText)) return "immune";
      if (/vulnerab/.test(deepText)) return "vulnerable";
    } catch {}
    return "normal";
  }

  function defenseFromAdjustmentList(raw, config, damageType) {
    const candidates = monsterDamageAdjustments({ damageAdjustments: raw }, config);
    const type = normalize(damageType);
    const matches = candidates.filter(def => {
      const haystack = normalize([
        def?.name, def?.damageType, def?.damageTypeName, def?.subType,
        def?.friendlySubtypeName, def?.definition?.name
      ].filter(Boolean).join(" "));
      return haystack.includes(type);
    });
    if (!matches.length) return null;
    const exact = matches.find(def => {
      const values = [def?.name, def?.damageTypeName, def?.subType, def?.definition?.name].map(normalize);
      return values.includes(type) || values.includes(`${type} damage`);
    });
    const chosen = exact || matches[0];
    const mode = adjustmentMode(chosen);
    const chosenName = String(chosen?.name || chosen?.damageTypeName || chosen?.subType || chosen?.definition?.name || damageType);
    const restriction = String(chosen?.restriction || chosen?.note || chosen?.description || chosen?.condition || "").trim();
    const conditional = Boolean(restriction) || (!exact && /nonmagical|non-magical|while|unless|except|from attacks|from spells/i.test(chosenName));
    const labelBase = mode === "resist" ? "Resiste ½" : mode === "immune" ? "Imune 0" : mode === "vulnerable" ? "Vulnerável ×2" : "Normal";
    const conditionText = restriction || ((!exact && chosenName) ? chosenName : "");
    return {
      mode,
      label: conditional && conditionText ? `${labelBase} • ${conditionText}` : labelBase,
      detected: true,
      conditional
    };
  }

  function characterDamageAdjustments(character, damageType) {
    const type = normalize(damageType);
    const matches = [];
    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 9 || seen.has(value)) return;
      seen.add(value);
      if (["resistance", "immunity", "vulnerability"].includes(normalize(value.type)) && normalize(value.subType) === type) {
        matches.push(value);
      }
      for (const child of Object.values(value)) if (child && typeof child === "object") walk(child, depth + 1);
    };
    walk(character);
    return matches;
  }

  function extractDefenseSection(text, kind) {
    const source = String(text || "").replace(/\r/g, " ");
    const labels = kind === "resist"
      ? "(?:damage\\s+)?resistances?"
      : kind === "immune"
        ? "(?:damage\\s+)?immunit(?:y|ies)"
        : "(?:damage\\s+)?vulnerabilit(?:y|ies)";
    const stop = "(?=(?:damage\\s+)?(?:resistances?|immunit(?:y|ies)|vulnerabilit(?:y|ies)|condition\\s+immunit(?:y|ies)|senses|languages|challenge|proficiency)\\b|$)";
    const re = new RegExp(`${labels}\\s*:?\\s*([\\s\\S]*?)${stop}`, "i");
    return re.exec(source)?.[1]?.replace(/\s+/g, " ").trim() || "";
  }

  function visibleStatDefenseForTarget(target, damageType) {
    const type = normalize(damageType);
    if (!type || !target?.name) return null;
    const wanted = normalize(target.name);
    const candidates = [...document.querySelectorAll('aside,[role="dialog"],[class*="sidebar" i],[class*="panel" i],[class*="drawer" i]')]
      .filter(el => !el.closest?.(`.${EXT}-modal-backdrop`) && isVisible(el))
      .map(el => ({ el, text: String(el.innerText || el.textContent || "") }))
      .filter(item => normalize(item.text).includes(wanted) && /resist|immun|vulnerab/i.test(item.text))
      .sort((a, b) => a.text.length - b.text.length);
    const text = candidates[0]?.text || "";
    if (!text) return null;

    const vulnerable = extractDefenseSection(text, "vulnerable");
    const immune = extractDefenseSection(text, "immune");
    const resist = extractDefenseSection(text, "resist");
    const hasType = section => new RegExp(`\\b${type.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(normalize(section));
    if (hasType(vulnerable)) return { mode: "vulnerable", label: "Vulnerability ×2", detected: true, source: "visible-statblock" };
    if (hasType(immune)) return { mode: "immune", label: "Immunity 0", detected: true, source: "visible-statblock" };
    if (hasType(resist)) {
      const conditional = /nonmagical|non-magical|while|unless|except|from attacks|from spells/i.test(resist)
        && ["bludgeoning", "piercing", "slashing"].includes(type);
      if (conditional) return { mode: "resist", label: "Resistance ½ • condicional", detected: true, conditional: true, source: "visible-statblock" };
      return { mode: "resist", label: "Resistance ½", detected: true, source: "visible-statblock" };
    }
    return { mode: "normal", label: "Normal", detected: true, source: "visible-statblock" };
  }

  const fiveToolsDefenseCache = new Map();

  function targetMonsterNameCandidates(name) {
    const raw = String(name || "").trim();
    const out = [raw];
    // Maps commonly suffixes duplicate tokens with A/B/C or a number.
    const withoutLetter = raw.replace(/\s+[A-Z]$/u, "").trim();
    const withoutNumber = raw.replace(/\s+#?\d+$/u, "").trim();
    if (withoutLetter && withoutLetter !== raw) out.push(withoutLetter);
    if (withoutNumber && withoutNumber !== raw) out.push(withoutNumber);
    return [...new Set(out.filter(Boolean))];
  }

  function fiveToolsDefenseMatch(value, damageType, mode, inheritedNote = "", depth = 0) {
    if (value == null || depth > 8) return null;
    const type = normalize(damageType);
    if (typeof value === "string") {
      const text = normalize(value);
      if (!new RegExp(`\\b${type.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(text)) return null;
      const labelBase = mode === "resist" ? "Resistance ½" : mode === "immune" ? "Immunity 0" : "Vulnerability ×2";
      const conditional = /nonmagical|non-magical|magic|silver|adamantine|while|unless|except|from attacks|from spells/i.test(`${value} ${inheritedNote}`);
      const note = String(inheritedNote || "").trim();
      return { mode, label: note ? `${labelBase} • ${note}` : labelBase, detected: true, conditional, source: "5etools" };
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = fiveToolsDefenseMatch(item, damageType, mode, inheritedNote, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof value !== "object") return null;

    const localNote = [value.note, value.condition, value.preNote, value.special]
      .filter(part => typeof part === "string" && part.trim())
      .join(" ") || inheritedNote;
    const preferredKeys = mode === "resist" ? ["resist", "resistance"] : mode === "immune" ? ["immune", "immunity"] : ["vulnerable", "vulnerability"];
    for (const key of preferredKeys) {
      if (value[key] == null) continue;
      const found = fiveToolsDefenseMatch(value[key], damageType, mode, localNote, depth + 1);
      if (found) return found;
    }
    // Some 5etools entries wrap the list under generic nested objects.
    for (const [key, child] of Object.entries(value)) {
      if (["note", "condition", "preNote", "special"].includes(key)) continue;
      if (child && typeof child === "object") {
        const found = fiveToolsDefenseMatch(child, damageType, mode, localNote, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  async function fiveToolsMonsterForTarget(target) {
    const candidates = targetMonsterNameCandidates(target?.name);
    if (!candidates.length) return null;
    const cacheKey = normalize(candidates.at(-1) || candidates[0]);
    let monsterPromise = fiveToolsDefenseCache.get(cacheKey);
    if (!monsterPromise) {
      monsterPromise = (async () => {
        const catalog = await loadMonsterCatalog();
        let hit = null;
        for (const candidate of candidates) {
          const wanted = normalize(candidate);
          const matches = catalog.hits.filter(entry => normalize(entry?.name) === wanted);
          // Prefer partnered/homebrew when the DDB target itself looks custom;
          // otherwise official remains the safest first choice.
          const customish = Boolean(target?.monsterId && !/^\d{1,8}$/.test(String(target.monsterId))) || /homebrew|custom/i.test(String(target?.source || ""));
          hit = customish
            ? (matches.find(entry => entry.origin === "partnered") || matches.find(entry => entry.origin === "homebrew") || matches[0])
            : (matches.find(entry => entry.origin === "official") || matches.find(entry => entry.origin === "partnered") || matches[0]);
          if (hit) break;
        }
        if (!hit) return null;
        const resolved = await resolveCatalogHit(hit);
        return resolved?.monster || null;
      })().catch(() => null);
      fiveToolsDefenseCache.set(cacheKey, monsterPromise);
    }
    return monsterPromise;
  }

  async function fiveToolsDefenseForTarget(target, damageType) {
    const monster = await fiveToolsMonsterForTarget(target);
    if (!monster) return null;
    return fiveToolsDefenseMatch(monster.vulnerable, damageType, "vulnerable")
      || fiveToolsDefenseMatch(monster.immune, damageType, "immune")
      || fiveToolsDefenseMatch(monster.resist, damageType, "resist")
      || null;
  }

  async function defenseForTarget(target, damageType) {
    if (!damageType) return { mode: "normal", label: "—", detected: false };
    const visibleStat = visibleStatDefenseForTarget(target, damageType);
    const findings = [];
    const push = value => { if (value) findings.push(value); };

    try {
      const config = await getDdbConfig();
      if (Array.isArray(target?.inlineDamageAdjustments) && target.inlineDamageAdjustments.length) {
        push(defenseFromAdjustmentList(target.inlineDamageAdjustments, config, damageType));
      }

      if (target?.monsterId) {
        const monster = await getDdbMonster(target.monsterId);
        push(defenseFromAdjustmentList(
          monster?.damageAdjustments || monster?.definition?.damageAdjustments || monster?.stats?.damageAdjustments || monster?.monster?.damageAdjustments || [],
          config,
          damageType
        ));
      } else if (target?.characterId) {
        const character = await getDdbCharacter(target.characterId);
        const mods = characterDamageAdjustments(character, damageType);
        if (mods.length) {
          const chosen = mods.find(mod => !String(mod.restriction || "").trim()) || mods[0];
          const mode = normalize(chosen.type) === "resistance" ? "resist" : normalize(chosen.type) === "immunity" ? "immune" : normalize(chosen.type) === "vulnerability" ? "vulnerable" : "normal";
          const restriction = String(chosen.restriction || "").trim();
          push({
            mode,
            label: restriction
              ? `${mode === "resist" ? "Resistance ½" : mode === "immune" ? "Immunity 0" : mode === "vulnerable" ? "Vulnerability ×2" : titleCase(chosen.type)} • ${restriction}`
              : mode === "resist" ? "Resistance ½" : mode === "immune" ? "Immunity 0" : mode === "vulnerable" ? "Vulnerability ×2" : "Normal",
            detected: true,
            conditional: Boolean(restriction),
            source: "ddb-character"
          });
        }
      }
    } catch (_e) {}

    push(visibleStat);

    // If DDB did not expose a useful R/I/V result for this token, use the same
    // 5etools bestiary already bundled into the extension as a name-based fallback.
    if (!findings.some(item => item?.mode && item.mode !== "normal")) {
      try { push(await fiveToolsDefenseForTarget(target, damageType)); } catch (_e) {}
    }

    const nonNormal = findings.find(item => item?.mode && item.mode !== "normal");
    if (nonNormal) return nonNormal;
    return findings.find(item => item?.detected) || { mode: "normal", label: "Normal", detected: false };
  }

  const LAST_DAMAGE_KEY = "ddbQolLastDamageV1";
  let lastDamageMessage = null;
  let lastDamageProfile = null;
  let lastDamageStamp = 0;
  let lastHpTarget = null;
  const damageMessageSeenAt = new Map();
  let lastDamageWaiters = [];

  function requestLastDamage(timeout = 1400) {
    if (lastDamageMessage) return Promise.resolve(lastDamageMessage);
    window.postMessage({ source: "ddb-qol-content", type: "REQUEST_LAST_DAMAGE" }, location.origin);
    return new Promise(resolve => {
      const waiter = { resolve };
      lastDamageWaiters.push(waiter);
      setTimeout(() => {
        lastDamageWaiters = lastDamageWaiters.filter(item => item !== waiter);
        resolve(lastDamageMessage);
      }, timeout);
    });
  }

  function damageRollTotals(message) {
    return (message?.data?.rolls || [])
      .filter(roll => normalize(roll?.rollType) === "damage")
      .map(roll => Number(roll?.result?.total))
      .filter(Number.isFinite);
  }

  async function buildDamageProfile(message) {
    const totals = damageRollTotals(message);
    const total = totals.reduce((sum, value) => sum + value, 0);
    const types = await resolveGameLogDamageTypes(message).catch(() => []);
    const components = totals.length > 1 && types.length === totals.length
      ? totals.map((value, index) => ({ total: value, type: types[index] || "" }))
      : [{ total: Number.isFinite(messageDamageTotal(message)) ? messageDamageTotal(message) : total, type: types[0] || "" }];
    return { total: components.reduce((sum, part) => sum + Number(part.total || 0), 0), types, components, message };
  }

  function rememberLastDamage(message) {
    if (!message?.id) return;
    const raw = message?.dateTime;
    const parsed = typeof raw === "number" ? raw : (raw ? Date.parse(raw) : 0);
    if (!damageMessageSeenAt.has(message.id)) damageMessageSeenAt.set(message.id, Date.now());
    const stamp = Number.isFinite(parsed) && parsed > 0 ? parsed : damageMessageSeenAt.get(message.id);
    if (lastDamageMessage?.id === message.id || stamp < lastDamageStamp) return;
    lastDamageMessage = message;
    lastDamageStamp = stamp;
    if (lastDamageWaiters.length) {
      const waiters = lastDamageWaiters;
      lastDamageWaiters = [];
      for (const waiter of waiters) waiter.resolve(message);
    }
    setStorage(LAST_DAMAGE_KEY, { message, savedAt: Date.now() }).catch(() => {});
    buildDamageProfile(message).then(profile => {
      if (lastDamageMessage?.id === message.id) {
        lastDamageProfile = profile;
        // A damage roll can arrive while the HP flyout is already open. Update
        // the native amount field immediately instead of waiting for another
        // click on the token/HP control.
        for (const delay of [0, 90, 240]) {
          setTimeout(() => prefillNativeHpDamage(lastHpTarget).catch(() => {}), delay);
        }
        refreshQuickHpHudSuggestion(true).catch(() => {});
      }
    }).catch(() => {});
  }

  async function restoreLastDamage() {
    const cached = await getStorage(LAST_DAMAGE_KEY).catch(() => null);
    if (cached?.message && Date.now() - Number(cached.savedAt || 0) < 30 * 60 * 1000) rememberLastDamage(cached.message);
    window.postMessage({ source: "ddb-qol-content", type: "REQUEST_LAST_DAMAGE" }, location.origin);
  }

  let pendingNativeSaveRoll = null;

  function isSaveRollMessage(message) {
    return Boolean(
      message?.id &&
      Array.isArray(message?.data?.rolls) &&
      message.data.rolls.some(roll => normalize(roll?.rollType) === "save")
    );
  }

  function saveRollTotal(message) {
    const roll = (message?.data?.rolls || []).find(item => normalize(item?.rollType) === "save");
    const total = Number(roll?.result?.total ?? roll?.result?.values?.reduce?.((sum, n) => sum + Number(n || 0), 0));
    return Number.isFinite(total) ? total : null;
  }

  function waitForNextNativeSaveRoll(timeout = 7000) {
    if (pendingNativeSaveRoll?.reject) pendingNativeSaveRoll.reject(new Error("Nova rolagem de save iniciada."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingNativeSaveRoll?.resolve === resolve) pendingNativeSaveRoll = null;
        reject(new Error("O D&D Beyond não retornou a rolagem de save a tempo."));
      }, timeout);
      pendingNativeSaveRoll = {
        resolve: message => { clearTimeout(timer); pendingNativeSaveRoll = null; resolve(message); },
        reject: error => { clearTimeout(timer); pendingNativeSaveRoll = null; reject(error); }
      };
    });
  }

  window.addEventListener("message", event => {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || msg?.source !== "ddb-qol-page") return;
    if (msg.type === "GAME_LOG_DAMAGE" && msg.message) rememberLastDamage(msg.message);
    if (msg.type === "GAME_LOG_ROLL" && msg.message && pendingNativeSaveRoll && isSaveRollMessage(msg.message)) {
      pendingNativeSaveRoll.resolve(msg.message);
    }
  });
  restoreLastDamage().catch(() => {});

  async function adjustedDamageForTarget(target, profile) {
    if (!profile) return 0;
    let total = 0;
    for (const component of profile.components || []) {
      const value = Number(component?.total || 0);
      if (!component?.type) { total += value; continue; }
      const defense = await defenseForTarget(target, component.type);
      total += adjustedDamage(value, defense.mode);
    }
    return total;
  }

  async function damageBreakdownForTarget(target, profile) {
    const parts = [];
    let total = 0;
    let detected = true;
    for (const component of profile?.components || []) {
      const base = Number(component?.total || 0);
      const defense = component?.type ? await defenseForTarget(target, component.type) : { mode: "normal", label: "Normal", detected: false };
      if (!defense.detected) detected = false;
      const value = adjustedDamage(base, defense.mode);
      total += value;
      parts.push(`${base} ${component?.type ? titleCase(component.type) : ""} → ${value}${defense.mode !== "normal" ? ` (${defense.label})` : ""}`.trim());
    }
    return { total, label: parts.join(" + "), detected };
  }

  function adjustedDamage(total, mode) {
    if (mode === "immune") return 0;
    if (mode === "resist") return Math.floor(total / 2);
    if (mode === "vulnerable") return total * 2;
    return total;
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function visibleDamageHealButtons() {
    const buttons = [...document.querySelectorAll("button")].filter(button => isVisible(button) && !button.closest(`.${EXT}-modal-backdrop`));
    return {
      damage: buttons.find(button => /(^|\s)damage(\s|$)/i.test(String(button.innerText || button.textContent || ""))),
      heal: buttons.find(button => /(^|\s)heal(\s|$)/i.test(String(button.innerText || button.textContent || "")))
    };
  }

  async function waitForHpFlyout(timeout = 1800) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const buttons = visibleDamageHealButtons();
      if (buttons.damage || buttons.heal) return buttons;
      const fallbackInput = findVisibleHpAmountInput();
      if (fallbackInput) return { input: fallbackInput };
      await sleep(50);
    }
    return {};
  }

  function commonAncestor(a, b) {
    if (!a) return b?.parentElement || null;
    if (!b) return a?.parentElement || null;
    const seen = new Set();
    for (let cur = a; cur; cur = cur.parentElement) seen.add(cur);
    for (let cur = b; cur; cur = cur.parentElement) if (seen.has(cur)) return cur;
    return null;
  }

  function hpPanelRoot(buttons = visibleDamageHealButtons()) {
    const shared = commonAncestor(buttons.damage, buttons.heal);
    if (shared && shared !== document.body && shared.getBoundingClientRect().height < window.innerHeight * 0.9) return shared;
    const button = buttons.damage || buttons.heal;
    if (!button) return null;
    return button.closest('[role="dialog"],[role="menu"],[class*="popover" i],[class*="flyout" i],[class*="menu" i],[class*="health" i],[class*="hp" i]')
      || button.parentElement?.parentElement?.parentElement
      || button.parentElement;
  }

  function scoreHpInput(input, root = null) {
    if (!input || !isVisible(input) || input.closest(`.${EXT}-modal-backdrop`)) return -999;
    let context = normalize(input.getAttribute?.("aria-label") || input.placeholder || input.closest("label")?.innerText || "");
    for (let cur = input.parentElement, i = 0; cur && i < 4; cur = cur.parentElement, i++) {
      context += ` ${normalize(cur.innerText || "")}`;
      if (root && cur === root) break;
    }
    let score = 0;
    if (/damage/.test(context)) score += 7;
    if (/heal/.test(context)) score += 3;
    if (/\bhp\b|hit points|health/.test(context)) score += 4;
    if (/amount|adjust/.test(context)) score += 2;
    if (/temp|temporary|max hp|maximum|override/.test(context)) score -= 10;
    if (/search|filter|initiative/.test(context)) score -= 8;
    if (input.type === "number" || input.inputMode === "numeric") score += 2;
    return score;
  }

  function findVisibleHpAmountInput(root = null) {
    const scope = root || document;
    const inputs = [...scope.querySelectorAll('input:not([type="hidden"]),textarea')].filter(isVisible);
    const ranked = inputs
      .map(input => ({ input, score: scoreHpInput(input, root) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 4 ? ranked[0].input : null;
  }

  function findHpAmountInputByLayout(buttons = visibleDamageHealButtons()) {
    const root = hpPanelRoot(buttons);
    if (!root) return null;
    const candidates = [...root.querySelectorAll('input:not([type="hidden"]),textarea')].filter(input => {
      if (!isVisible(input) || input.closest(`.${EXT}-modal-backdrop`)) return false;
      const context = normalize(`${input.getAttribute?.("aria-label") || ""} ${input.placeholder || ""} ${input.closest("label")?.innerText || ""}`);
      return !/temp|temporary|max hp|maximum|override|search|filter|initiative/.test(context);
    });
    if (!candidates.length) return null;

    const healRect = buttons.heal?.getBoundingClientRect?.();
    const damageRect = buttons.damage?.getBoundingClientRect?.();
    if (healRect && damageRect) {
      const left = Math.min(healRect.right, damageRect.right);
      const right = Math.max(healRect.left, damageRect.left);
      const middle = candidates
        .map(input => ({ input, rect: input.getBoundingClientRect() }))
        .filter(item => item.rect.left >= left - 24 && item.rect.right <= right + 24 && Math.abs(item.rect.top - healRect.top) < 80)
        .sort((a, b) => Math.abs((a.rect.left + a.rect.right) / 2 - (healRect.right + damageRect.left) / 2) - Math.abs((b.rect.left + b.rect.right) / 2 - (healRect.right + damageRect.left) / 2));
      if (middle[0]?.input) return middle[0].input;
    }

    // Current Maps HP flyout has a single editable amount box between HEAL and
    // DAMAGE. When its accessible labels change, one visible numeric field in
    // the HP panel is still a safe fallback.
    if (candidates.length === 1) return candidates[0];
    return candidates
      .map(input => ({ input, score: scoreHpInput(input, root) }))
      .sort((a, b) => b.score - a.score)[0]?.input || null;
  }

  function findDamageAmountInput(actionButton) {
    const buttons = visibleDamageHealButtons();
    const root = hpPanelRoot(buttons) || actionButton?.parentElement || document;
    return findVisibleHpAmountInput(root) || findHpAmountInputByLayout(buttons) || findVisibleHpAmountInput();
  }

  async function prefillNativeHpDamage(target = lastHpTarget) {
    if (!lastDamageMessage) await requestLastDamage();
    if (!lastDamageMessage) return;
    if (!lastDamageProfile || lastDamageProfile?.message?.id !== lastDamageMessage.id) {
      lastDamageProfile = await buildDamageProfile(lastDamageMessage).catch(() => null);
    }
    if (!lastDamageProfile) return;
    const buttons = await waitForHpFlyout(1600);
    const actionButton = buttons.damage || null;
    const input = buttons.input || findDamageAmountInput(actionButton);
    if (!input || input.dataset.ddbQolPrefilledFor === String(lastDamageMessage.id)) return;

    // If Maps no longer exposes the selected token through the HP header, still
    // offer the last rolled damage. When we do know the target, preserve the
    // automatic resistance/immunity/vulnerability adjustment.
    const rawAmount = Number(lastDamageProfile?.total);
    const amount = target
      ? await adjustedDamageForTarget(target, lastDamageProfile).catch(() => rawAmount)
      : rawAmount;
    if (!Number.isFinite(amount)) return;
    if (!String(input.value || "").trim() || /^0+$/.test(String(input.value || "").trim()) || input.dataset.ddbQolAutoValue === String(input.value)) {
      nativeSetInputValue(input, Math.max(0, Math.floor(amount)));
      input.dataset.ddbQolPrefilledFor = String(lastDamageMessage.id);
      input.dataset.ddbQolAutoValue = String(Math.max(0, Math.floor(amount)));
    }
  }

  function wireHpPrefillTargets() {
    for (const target of discoverHpTargets()) {
      const button = target.hpButton;
      if (!button || button.dataset.ddbQolHpPrefill === "1") continue;
      button.dataset.ddbQolHpPrefill = "1";
      button.addEventListener("click", () => {
        const fresh = discoverHpTargets().find(item => item.hpButton === button) || target;
        lastHpTarget = { ...fresh, hpButton: button, row: fresh.row };
        if (!lastDamageMessage) requestLastDamage().catch(() => {});
        for (const delay of [90, 220, 480, 850]) setTimeout(() => prefillNativeHpDamage(lastHpTarget).catch(() => {}), delay);
      }, { passive: true });
    }
  }


  let hpPrefillCaptureInstalled = false;
  function installHpPrefillCapture() {
    if (hpPrefillCaptureInstalled) return;
    hpPrefillCaptureInstalled = true;
    document.addEventListener("click", event => {
      if (!lastDamageMessage) requestLastDamage().catch(() => {});
      const trigger = event.target?.closest?.("button");
      if (trigger) {
        const hp = parseHpText(trigger.innerText || trigger.textContent || trigger.getAttribute("aria-label") || trigger.title);
        if (hp) {
          window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_HP_TARGETS" }, location.origin);
          const fresh = discoverHpTargets().find(item => item.hpButton === trigger);
          if (fresh) lastHpTarget = fresh;
        }
      }
      for (const delay of [70, 180, 380, 750]) {
        setTimeout(() => prefillNativeHpDamage(lastHpTarget).catch(() => {}), delay);
      }
    }, true);
  }

  const tokenHpUpdateRequests = new Map();

  function requestNativeTokenHpUpdate(target, hpInfo, timeout = 1800) {
    const tokenId = String(target?.tokenId || target?.id || "").trim();
    if (!tokenId) return Promise.reject(new Error(`${target?.name || "Token"}: ID do token não encontrado.`));
    const requestId = `hp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.postMessage({
      source: "ddb-qol-content",
      type: "TOKEN_HP_UPDATE",
      requestId,
      payload: { id: tokenId, hpInfo }
    }, location.origin);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        tokenHpUpdateRequests.delete(requestId);
        reject(new Error(`${target?.name || "Token"}: Maps não confirmou a atualização de HP.`));
      }, timeout);
      tokenHpUpdateRequests.set(requestId, result => {
        clearTimeout(timer);
        tokenHpUpdateRequests.delete(requestId);
        if (result?.ok) resolve(result.hpInfo || hpInfo);
        else reject(new Error(result?.error || `${target?.name || "Token"}: falha ao atualizar HP.`));
      });
    });
  }

  async function ensureTargetHpInfo(target) {
    const current = Number(target?.hp?.current);
    const max = Number(target?.hp?.max);
    if (Number.isFinite(current) && Number.isFinite(max)) {
      return {
        current,
        max,
        temp: Math.max(0, Number(target?.hp?.temp) || 0),
        maxOverride: target?.hp?.maxOverride == null ? null : Number(target.hp.maxOverride)
      };
    }
    if (target?.characterId) {
      try {
        const character = await getDdbCharacter(target.characterId);
        const hp = ddbCharacterHpInfo(character);
        if (hp) {
          target.hp = hp;
          return hp;
        }
      } catch {}
    }
    throw new Error(`${target?.name || "Token"}: HP atual não pôde ser identificado.`);
  }

  async function applyNativeHpChange(target, amount, operation = "damage") {
    const hp = await ensureTargetHpInfo(target);
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    let current = Math.max(0, Number(hp.current) || 0);
    const max = Math.max(0, Number(hp.max) || 0);
    let temp = Math.max(0, Number(hp.temp) || 0);

    if (operation === "heal") {
      current = Math.min(max, current + value);
    } else {
      const absorbed = Math.min(temp, value);
      temp -= absorbed;
      current = Math.max(0, current - Math.max(0, value - absorbed));
    }

    const nextHp = {
      current,
      max,
      maxOverride: hp.maxOverride == null || !Number.isFinite(Number(hp.maxOverride)) ? null : Math.max(0, Number(hp.maxOverride)),
      temp
    };
    const confirmed = await requestNativeTokenHpUpdate(target, nextHp);
    target.hp = { ...nextHp, ...(confirmed || {}) };
    return target.hp;
  }

  // ---------------------------------------------------------------------------
  // Quick HP HUD — one selected token, anchored above the native Maps toolbar.
  // ---------------------------------------------------------------------------
  const activeTokenRequests = new Map();
  let quickHpHud = null;
  let quickHpHudToolbar = null;
  let quickHpHudTarget = null;
  let quickHpHudResolveSeq = 0;
  let quickHpHudRaf = 0;

  function requestActiveSceneToken(timeout = 900) {
    const requestId = `active-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.postMessage({ source: "ddb-qol-content", type: "REQUEST_ACTIVE_TOKEN", requestId }, location.origin);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        activeTokenRequests.delete(requestId);
        resolve(null);
      }, timeout);
      activeTokenRequests.set(requestId, token => {
        clearTimeout(timer);
        activeTokenRequests.delete(requestId);
        resolve(token && typeof token === "object" ? token : null);
      });
    });
  }

  function findNativeSingleTokenToolbar() {
    const toolbars = [...document.querySelectorAll('[data-testid="item-toolbar-rebuild-portal"]')]
      .filter(el => isVisible(el) && !el.closest?.(`#${EXT}-quick-hp-hud`));
    const single = toolbars.filter(el => {
      const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || /\b\d+\s+tokens?\s+selected\b/i.test(text)) return false;
      return /\b\d+\s*\/\s*\d+\b/.test(text) || /\bconditions\b/i.test(text);
    });
    if (single.length !== 1) return null;
    return single[0];
  }

  function hpFromToolbarText(toolbar) {
    const text = String(toolbar?.innerText || toolbar?.textContent || "");
    const match = text.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    return match ? { current: Number(match[1]), max: Number(match[2]) } : null;
  }

  function mergeQuickTarget(primary, secondary) {
    if (!primary && !secondary) return null;
    const a = primary || {};
    const b = secondary || {};
    return {
      ...b,
      ...a,
      id: String(a.tokenId || a.id || b.tokenId || b.id || ""),
      tokenId: String(a.tokenId || b.tokenId || ""),
      name: String(a.name || b.name || "Token"),
      hp: a.hp || b.hp || null,
      imageUrl: a.imageUrl || b.imageUrl || "",
      monsterId: a.monsterId || b.monsterId || "",
      characterId: a.characterId || b.characterId || "",
      inlineDamageAdjustments: a.damageAdjustments || a.inlineDamageAdjustments || b.damageAdjustments || b.inlineDamageAdjustments || []
    };
  }

  async function resolveQuickHpHudTarget(toolbar) {
    if (!toolbar) return null;
    window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_HP_TARGETS" }, location.origin);
    const [active, scene] = await Promise.all([
      requestActiveSceneToken().catch(() => null),
      requestSceneTokens().catch(() => [])
    ]);
    if (!toolbar.isConnected || toolbar !== findNativeSingleTokenToolbar()) return null;

    const toolbarText = normalize(toolbar.innerText || toolbar.textContent || "");
    const hp = hpFromToolbarText(toolbar);
    const visible = discoverHpTargets();

    const enrichByName = token => {
      if (!token?.name) return token;
      const matches = visible.filter(item => normalize(item.name) === normalize(token.name));
      const best = matches.find(item => {
        if (!hp) return true;
        return Number(item?.hp?.current) === hp.current && Number(item?.hp?.max) === hp.max;
      }) || matches[0] || null;
      return mergeQuickTarget(token, best);
    };

    if (active?.tokenId || active?.id) {
      const activeName = normalize(active.name || "");
      if (!activeName || toolbarText.includes(activeName)) return enrichByName(active);
    }

    const sceneMatches = (scene || []).filter(token => {
      const name = normalize(token?.name || "");
      if (!name || !toolbarText.includes(name)) return false;
      if (!hp) return true;
      const current = Number(token?.hp?.current);
      const max = Number(token?.hp?.max);
      return !Number.isFinite(current) || !Number.isFinite(max) || (current === hp.current && max === hp.max);
    });
    const exact = sceneMatches.filter(token => normalize(token?.name || "") && toolbarText.includes(normalize(token.name)));
    const candidates = exact.length ? exact : sceneMatches;
    const uniqueIds = new Map(candidates.filter(item => item?.tokenId || item?.id).map(item => [String(item.tokenId || item.id), item]));
    if (uniqueIds.size === 1) return enrichByName([...uniqueIds.values()][0]);
    return null;
  }

  function removeQuickHpHud() {
    if (quickHpHudRaf) cancelAnimationFrame(quickHpHudRaf);
    quickHpHudRaf = 0;
    quickHpHud?.remove();
    quickHpHud = null;
    quickHpHudToolbar = null;
    quickHpHudTarget = null;
  }

  function positionQuickHpHud() {
    if (!quickHpHud || !quickHpHudToolbar?.isConnected || !isVisible(quickHpHudToolbar)) {
      removeQuickHpHud();
      return;
    }
    const rect = quickHpHudToolbar.getBoundingClientRect();
    const hudRect = quickHpHud.getBoundingClientRect();
    const width = Math.min(430, Math.max(340, rect.width));
    quickHpHud.style.width = `${width}px`;
    const measured = quickHpHud.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - measured.width - 8, rect.left + rect.width / 2 - measured.width / 2));
    const top = Math.max(8, rect.top - measured.height - 9);
    quickHpHud.style.left = `${Math.round(left)}px`;
    quickHpHud.style.top = `${Math.round(top)}px`;
    quickHpHudRaf = requestAnimationFrame(positionQuickHpHud);
  }

  async function quickHpSuggestedDamage(target = quickHpHudTarget) {
    if (!lastDamageMessage) await requestLastDamage(600);
    if (!lastDamageMessage) return null;
    if (!lastDamageProfile || lastDamageProfile?.message?.id !== lastDamageMessage.id) {
      lastDamageProfile = await buildDamageProfile(lastDamageMessage).catch(() => null);
    }
    if (!lastDamageProfile) return null;
    const raw = Number(lastDamageProfile.total);
    if (!Number.isFinite(raw)) return null;
    if (!target) return Math.max(0, Math.floor(raw));
    const adjusted = await adjustedDamageForTarget(target, lastDamageProfile).catch(() => raw);
    return Number.isFinite(adjusted) ? Math.max(0, Math.floor(adjusted)) : Math.max(0, Math.floor(raw));
  }

  async function refreshQuickHpHudSuggestion(force = false) {
    if (!quickHpHud?.isConnected || !quickHpHudTarget) return;
    const input = quickHpHud.querySelector(`.${EXT}-quick-hp-input`);
    if (!input) return;
    const amount = await quickHpSuggestedDamage(quickHpHudTarget);
    if (amount == null || !quickHpHud?.isConnected) return;
    const mayReplace = force || !String(input.value || "").trim() || input.dataset.ddbQolAutoValue === String(input.value);
    if (!mayReplace) return;
    input.value = String(amount);
    input.dataset.ddbQolAutoValue = String(amount);
    input.dataset.ddbQolDamageId = String(lastDamageMessage?.id || "");
  }

  function quickHpHudStatus(text, isError = false) {
    if (!quickHpHud?.isConnected) return;
    const status = quickHpHud.querySelector(`.${EXT}-quick-hp-status`);
    if (!status) return;
    status.textContent = text || "";
    status.classList.toggle(`${EXT}-quick-hp-error`, Boolean(isError));
    clearTimeout(Number(status.dataset.timer || 0));
    const timer = setTimeout(() => {
      if (status.isConnected) status.textContent = "";
    }, 2200);
    status.dataset.timer = String(timer);
  }

  function buildQuickHpHud(toolbar, target) {
    removeQuickHpHud();
    quickHpHudToolbar = toolbar;
    quickHpHudTarget = target;
    const hud = document.createElement("div");
    hud.id = `${EXT}-quick-hp-hud`;
    hud.className = `${EXT}-quick-hp-hud`;
    hud.innerHTML = `
      <button type="button" class="${EXT}-quick-hp-action ${EXT}-quick-hp-heal" data-act="heal"><span aria-hidden="true">＋</span> HEAL</button>
      <input class="${EXT}-quick-hp-input" type="number" inputmode="numeric" min="0" step="1" aria-label="HP amount" placeholder="—">
      <button type="button" class="${EXT}-quick-hp-action ${EXT}-quick-hp-damage" data-act="damage">DAMAGE <span aria-hidden="true">−</span></button>
      <span class="${EXT}-quick-hp-status" aria-live="polite"></span>`;
    document.body.appendChild(hud);
    quickHpHud = hud;

    const input = hud.querySelector(`.${EXT}-quick-hp-input`);
    input.addEventListener("input", () => { delete input.dataset.ddbQolAutoValue; });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") hud.querySelector('[data-act="damage"]')?.click();
    });

    const run = async operation => {
      if (!quickHpHudTarget?.tokenId) {
        quickHpHudStatus("Não consegui identificar este token.", true);
        return;
      }
      const amount = Math.max(0, Math.floor(Number(input.value) || 0));
      const button = hud.querySelector(`[data-act="${operation}"]`);
      button.disabled = true;
      try {
        const hp = await applyNativeHpChange(quickHpHudTarget, amount, operation);
        quickHpHudStatus(operation === "heal" ? `+${amount} HP` : `−${amount} HP`);
        if (hp) quickHpHudTarget.hp = hp;
      } catch (error) {
        quickHpHudStatus(String(error?.message || "Falha ao atualizar HP."), true);
      } finally {
        button.disabled = false;
      }
    };
    hud.querySelector('[data-act="heal"]').addEventListener("click", () => run("heal"));
    hud.querySelector('[data-act="damage"]').addEventListener("click", () => run("damage"));
    refreshQuickHpHudSuggestion(true).catch(() => {});
    quickHpHudRaf = requestAnimationFrame(positionQuickHpHud);
  }

  let quickHpHudSyncPending = false;
  function syncQuickHpHud() {
    if (SETTINGS.damageApplicator === false || !isMapsPage()) {
      removeQuickHpHud();
      return;
    }
    const toolbar = findNativeSingleTokenToolbar();
    if (!toolbar) {
      removeQuickHpHud();
      return;
    }
    if (quickHpHud?.isConnected && quickHpHudToolbar === toolbar && quickHpHudTarget?.tokenId) return;
    if (quickHpHudSyncPending) return;
    quickHpHudSyncPending = true;
    const seq = ++quickHpHudResolveSeq;
    resolveQuickHpHudTarget(toolbar).then(target => {
      if (seq !== quickHpHudResolveSeq) return;
      const current = findNativeSingleTokenToolbar();
      if (!target?.tokenId || current !== toolbar) {
        removeQuickHpHud();
        return;
      }
      buildQuickHpHud(toolbar, target);
    }).catch(() => removeQuickHpHud()).finally(() => {
      if (seq === quickHpHudResolveSeq) quickHpHudSyncPending = false;
    });
  }

  function closeDamageModal() {
    document.getElementById(`${EXT}-damage-modal`)?.remove();
  }

  const SAVE_ABILITIES = {
    str: "Strength",
    dex: "Dexterity",
    con: "Constitution",
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma"
  };

  function initiativeRowForTarget(name) {
    const wanted = normalize(name);
    const base = normalize(String(name || "").replace(/\s+[A-Z0-9]+$/i, ""));
    let best = null;
    for (const el of document.querySelectorAll('button,[role="button"],li,div')) {
      if (el.closest?.(`#${EXT}-damage-modal`)) continue;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 130 || rect.width > 430 || rect.height < 38 || rect.height > 150 || rect.left > 430 || rect.top < 35) continue;
      const text = normalize(el.innerText || el.textContent || "");
      if (!text || !/initiative|ac:|hp|\/\s*\d+/.test(text)) continue;
      let score = 0;
      if (text.includes(wanted)) score += 10;
      if (base && text.includes(base)) score += 5;
      if (/ac:|initiative/.test(text)) score += 2;
      if (!score) continue;
      if (!best || score > best.score || (score === best.score && rect.height < best.rect.height)) best = { el, score, rect };
    }
    return best?.el || null;
  }

  function targetNameClickElement(row, targetName) {
    if (!row) return null;
    const wanted = normalize(targetName);
    const hpButtons = new Set([...row.querySelectorAll?.("button") || []].filter(button => parseHpText(button.innerText || button.textContent || button.getAttribute("aria-label") || button.title)));
    const candidates = [...row.querySelectorAll?.('button,[role="button"],a,span,div,img') || []]
      .filter(el => !hpButtons.has(el) && ![...hpButtons].some(button => button.contains?.(el)))
      .map(el => {
        const text = normalize(`${el.innerText || el.textContent || ""} ${el.getAttribute?.("aria-label") || ""} ${el.title || ""} ${el.alt || ""}`);
        const rect = el.getBoundingClientRect?.() || { width: 9999, height: 9999 };
        let score = 0;
        if (text === wanted) score += 20;
        else if (wanted && text.includes(wanted)) score += 10;
        if (el.tagName === "IMG") score += 5;
        if (el.matches?.('button,[role="button"],a')) score += 4;
        if (parseHpText(text)) score -= 30;
        return { el, score, area: rect.width * rect.height };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.area - b.area);
    const el = candidates[0]?.el;
    if (!el) return null;
    return el.matches?.('button,[role="button"],a') ? el : el.closest?.('button,[role="button"],a') || el;
  }

  async function openTargetStatblock(target) {
    const row = initiativeRowForTarget(target.name);
    if (row) {
      const clickable = targetNameClickElement(row, target.name);
      if (clickable) {
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        await sleep(240);
        return true;
      }
    }
    const mapToken = findMapTokenClickable(target);
    if (mapToken) {
      mapToken.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await sleep(240);
      return true;
    }
    return false;
  }

  function findSaveButtonByPosition(ability) {
    const order = ["str", "dex", "con", "int", "wis", "cha"];
    const index = order.indexOf(String(ability || "").toLowerCase());
    if (index < 0) return null;
    const labels = [...document.querySelectorAll('div,span,p,strong,label')]
      .filter(el => isVisible(el) && /saving\s*throws?\s*:?/i.test(String(el.innerText || el.textContent || "").trim()))
      .sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
    for (const label of labels) {
      const labelRect = label.getBoundingClientRect();
      for (let root = label.parentElement, depth = 0; root && depth < 5; root = root.parentElement, depth++) {
        const buttons = [...root.querySelectorAll("button")].filter(button => {
          if (!isVisible(button) || button.closest?.(`#${EXT}-damage-modal`)) return false;
          const text = String(button.innerText || button.textContent || "").trim();
          const rect = button.getBoundingClientRect();
          return /^[+−-]?\d+$/.test(text) && rect.top >= labelRect.top - 5 && rect.top <= labelRect.bottom + 120 && rect.width <= 80;
        });
        if (buttons.length < 6) continue;
        const rows = [];
        for (const button of buttons.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)) {
          const rect = button.getBoundingClientRect();
          let group = rows.find(row => Math.abs(row.top - rect.top) <= 12);
          if (!group) { group = { top: rect.top, buttons: [] }; rows.push(group); }
          group.buttons.push(button);
        }
        const group = rows.filter(row => row.buttons.length >= 6).sort((a, b) => Math.abs(a.top - labelRect.bottom) - Math.abs(b.top - labelRect.bottom))[0];
        if (group) {
          const ordered = group.buttons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          if (ordered[index]) return ordered[index];
        }
      }
    }
    return null;
  }

  function findVisibleSaveRollButton(ability) {
    const full = normalize(SAVE_ABILITIES[ability] || ability);
    const short = normalize(ability);
    let best = null;
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (el.closest?.(`#${EXT}-damage-modal`)) continue;
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 18 || rect.height < 18) continue;
      const attrs = normalize([
        el.innerText, el.textContent, el.getAttribute?.("aria-label"), el.getAttribute?.("title"),
        el.getAttribute?.("data-testid"), el.getAttribute?.("data-cy")
      ].filter(Boolean).join(" "));
      let score = 0;
      if (attrs.includes("saving throw") || attrs.includes("save")) score += 8;
      if (attrs.includes(full)) score += 7;
      if (new RegExp(`\\b${short}\\b`).test(attrs)) score += 6;
      const parentText = normalize(el.parentElement?.innerText || "");
      if (/saving throw|saves?/.test(parentText)) score += 4;
      if (parentText.includes(full) || new RegExp(`\\b${short}\\b`).test(parentText)) score += 3;
      if (score < 10) continue;
      if (!best || score > best.score) best = { el, score };
    }
    return best?.el || findSaveButtonByPosition(ability) || null;
  }

  async function clickRollWithMode(button, mode = "normal") {
    if (!button) throw new Error("Botão nativo de save não encontrado.");
    if (mode === "normal") {
      button.click();
      return;
    }
    const rect = button.getBoundingClientRect();
    button.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 2,
      buttons: 2
    }));
    await sleep(140);
    const wanted = mode === "adv" ? /advantage|vantagem/i : /disadvantage|desvantagem/i;
    const option = [...document.querySelectorAll('button,[role="menuitem"],[role="option"],li,div')]
      .filter(el => isVisible(el) && !el.closest?.(`#${EXT}-damage-modal`) && wanted.test(String(el.innerText || el.textContent || "").trim()))
      .sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height))[0];
    if (!option) throw new Error(mode === "adv" ? "Opção de vantagem não encontrada." : "Opção de desvantagem não encontrada.");
    option.click();
  }

  function parseSignedNumber(value) {
    if (value == null) return null;
    const match = String(value).replace(/[−–—]/g, "-").match(/[+-]?\d+/);
    return match ? Number(match[0]) : null;
  }

  function abilityModifier(score) {
    const n = Number(score);
    return Number.isFinite(n) ? Math.floor((n - 10) / 2) : null;
  }

  function ddbMonsterSaveModifier(monster, ability) {
    if (!monster || typeof monster !== "object") return null;
    const short = String(ability || "").toLowerCase();
    const full = normalize(SAVE_ABILITIES[short] || short);
    const seen = new WeakSet();
    let explicit = null;
    let score = null;
    const walk = (value, depth = 0, path = "") => {
      if (value == null || depth > 9 || explicit != null) return;
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      const name = normalize(value.name || value.label || value.statName || value.friendlyName || "");
      const type = normalize(value.type || value.kind || value.category || path);
      const statId = Number(value.id ?? value.statId ?? value.abilityId ?? value.entityId);
      const ids = { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6 };
      if ((name === full || name === short || statId === ids[short]) && /save|saving/.test(type)) {
        explicit = parseSignedNumber(value.modifier ?? value.bonus ?? value.value ?? value.total ?? value.score);
        if (explicit != null) return;
      }
      if ((name === full || name === short || statId === ids[short]) && !/save|saving/.test(type)) {
        const maybe = Number(value.value ?? value.score ?? value.total);
        if (Number.isFinite(maybe) && maybe >= 1 && maybe <= 40) score ??= maybe;
      }
      for (const [key, child] of Object.entries(value)) {
        if (typeof child === "object" && child) walk(child, depth + 1, key);
      }
    };
    walk(monster);
    if (explicit != null) return explicit;
    return abilityModifier(score);
  }

  function ddbCharacterSaveModifier(character, ability) {
    if (!character || typeof character !== "object") return null;
    const short = String(ability || "").toLowerCase();
    const ids = { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6 };
    const full = normalize(SAVE_ABILITIES[short] || short);
    const statId = ids[short];
    const statList = Array.isArray(character.stats) ? character.stats : [];
    const bonusList = Array.isArray(character.bonusStats) ? character.bonusStats : [];
    const overrideList = Array.isArray(character.overrideStats) ? character.overrideStats : [];
    const base = Number(statList.find(x => Number(x?.id) === statId)?.value || 10);
    const bonus = Number(bonusList.find(x => Number(x?.id) === statId)?.value || 0);
    const override = Number(overrideList.find(x => Number(x?.id) === statId)?.value || 0);
    const score = override > 0 ? override : base + bonus;
    let total = abilityModifier(score) ?? 0;
    const level = (character.classes || []).reduce((sum, cls) => sum + Number(cls?.level || 0), 0) || 1;
    const proficiency = 2 + Math.floor((Math.max(1, level) - 1) / 4);
    const modifiers = Object.values(character.modifiers || {}).flatMap(v => Array.isArray(v) ? v : []);
    const saveKey = `${full}-saving-throws`;
    let proficient = false;
    let extra = 0;
    for (const mod of modifiers) {
      const sub = normalize(mod?.subType || mod?.friendlySubtypeName || mod?.name || "");
      const type = normalize(mod?.type || mod?.friendlyTypeName || "");
      if (!(sub.includes(saveKey) || (sub.includes(full) && /saving|save/.test(sub)))) continue;
      if (/proficiency/.test(type)) proficient = true;
      if (/bonus/.test(type)) extra += Number(mod?.value || mod?.fixedValue || 0) || 0;
    }
    if (proficient) total += proficiency;
    total += extra;
    return total;
  }

  async function targetSaveModifier(target, ability) {
    if (target?.characterId) {
      try {
        const character = await getDdbCharacter(target.characterId);
        const mod = ddbCharacterSaveModifier(character, ability);
        if (mod != null) return mod;
      } catch {}
    }
    if (target?.monsterId) {
      try {
        const monster = await getDdbMonster(target.monsterId);
        const mod = ddbMonsterSaveModifier(monster, ability);
        if (mod != null) return mod;
      } catch {}
    }
    try {
      const monster = await fiveToolsMonsterForTarget(target);
      const short = String(ability || "").toLowerCase();
      const explicit = parseSignedNumber(monster?.save?.[short]);
      if (explicit != null) return explicit;
      const score = Number(monster?.[short]);
      const mod = abilityModifier(score);
      if (mod != null) return mod;
    } catch {}
    return 0;
  }

  function secureDie(sides) {
    const max = Math.max(2, Number(sides) || 20);
    try {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return (buf[0] % max) + 1;
    } catch { return Math.floor(Math.random() * max) + 1; }
  }

  async function rollSaveLocally(target, ability, mode = "normal") {
    const modifier = await targetSaveModifier(target, ability);
    const rolls = [secureDie(20)];
    if (mode === "adv" || mode === "dis") rolls.push(secureDie(20));
    const die = mode === "adv" ? Math.max(...rolls) : mode === "dis" ? Math.min(...rolls) : rolls[0];
    return { total: die + modifier, die, rolls, modifier, native: false };
  }

  function visibleStatblockMatchesTarget(target) {
    const wanted = normalize(target?.name || "");
    if (!wanted) return false;
    return [...document.querySelectorAll('aside,[role="dialog"],[class*="sidebar" i]')]
      .filter(isVisible)
      .some(root => {
        const text = normalize(root.innerText || root.textContent || "");
        return text.includes(wanted) && /saving\s*throw|traits|actions/.test(text);
      });
  }

  async function rollNativeSaveForTarget(target, ability, mode = "normal") {
    // Only use a native save button when the correct stat block is already
    // open. Trying to open it indirectly was clicking HP controls behind the
    // modal. If no native button is exposed, roll deterministically in the
    // extension using the target's DDB/5etools save modifier.
    if (visibleStatblockMatchesTarget(target)) {
      const button = findVisibleSaveRollButton(ability);
      if (button) {
        try {
          const waitRoll = waitForNextNativeSaveRoll(4500);
          await clickRollWithMode(button, mode);
          const message = await waitRoll;
          return { message, total: saveRollTotal(message), native: true };
        } catch (error) {
          console.info("[DDB QoL] Save nativo indisponível; usando fallback local.", error);
        }
      }
    }
    return rollSaveLocally(target, ability, mode);
  }


  function tokenUiExcluded(el) {
    if (!el) return false;
    const tokenBrowser = typeof findTokenBrowserPanel === "function" ? findTokenBrowserPanel() : null;
    if (tokenBrowser?.contains?.(el)) return true;
    return Boolean(el.closest?.(`#${EXT}-damage-modal,#${EXT}-sticker-panel,[role="dialog"],aside,[class*="browser" i],[class*="gameLog" i],[class*="initiative" i],[class*="toolbar" i]`));
  }

  const sceneTokenRequests = new Map();

  function requestSceneTokens(timeout = 1600) {
    const requestId = `scene-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.postMessage({ source: "ddb-qol-content", type: "REQUEST_SCENE_TOKENS", requestId }, location.origin);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        sceneTokenRequests.delete(requestId);
        resolve([]);
      }, timeout);
      sceneTokenRequests.set(requestId, tokens => {
        clearTimeout(timer);
        sceneTokenRequests.delete(requestId);
        resolve(Array.isArray(tokens) ? tokens : []);
      });
    });
  }

  window.addEventListener("message", event => {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || msg?.source !== "ddb-qol-page") return;
    if (msg.type === "SCENE_TOKENS") {
      sceneTokenRequests.get(String(msg.requestId || ""))?.(msg.tokens || []);
    }
    if (msg.type === "ACTIVE_TOKEN") {
      activeTokenRequests.get(String(msg.requestId || ""))?.(msg.token || null);
    }
    if (msg.type === "TOKEN_HP_UPDATE_RESULT") {
      tokenHpUpdateRequests.get(String(msg.requestId || ""))?.(msg);
    }
  });

  async function collectDamageTargets() {
    window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_HP_TARGETS" }, location.origin);
    await sleep(60);
    const visible = discoverHpTargets();
    const scene = await requestSceneTokens().catch(() => []);
    const merged = new Map();
    const add = target => {
      if (!target?.name) return;
      const normalizedName = normalize(target.name);
      const explicitTokenKey = target.tokenId ? `token:${target.tokenId}` : "";
      const directKey = explicitTokenKey || (target.id ? `id:${target.id}` : "");
      let existingKey = directKey && merged.has(directKey) ? directKey : "";
      if (!existingKey && !explicitTokenKey) {
        const same = [...merged.entries()].filter(([, item]) => normalize(item.name) === normalizedName);
        if (same.length === 1) existingKey = same[0][0];
      }
      existingKey ||= directKey || `name:${normalizedName}:${merged.size}`;
      const prev = merged.get(existingKey) || {};
      merged.set(existingKey, {
        ...prev,
        ...target,
        id: String(target.tokenId || target.id || prev.id || existingKey),
        tokenId: String(target.tokenId || prev.tokenId || ""),
        hp: target.hp || prev.hp || { current: "—", max: "—" },
        imageUrl: target.imageUrl || prev.imageUrl || "",
        monsterId: target.monsterId || prev.monsterId || "",
        characterId: target.characterId || prev.characterId || "",
        inlineDamageAdjustments: target.inlineDamageAdjustments || target.damageAdjustments || prev.inlineDamageAdjustments || [],
        hpButton: target.hpButton || prev.hpButton || null,
        row: target.row || prev.row || null,
        position: target.position || prev.position || null,
        screenPoint: target.screenPoint || prev.screenPoint || null,
        mapElement: target.mapElement || prev.mapElement || null
      });
    };

    for (const target of scene) add(target);
    if (scene.length) {
      // Sidebar rows can stay mounted while changing maps. With a current-scene
      // snapshot, they may enrich only names that are really present in this map.
      const sceneNames = new Set(scene.map(item => normalize(item.name)));
      for (const target of visible) if (sceneNames.has(normalize(target.name))) add(target);
    } else {
      // Safe fallback when the scene bridge has not exposed a snapshot yet.
      for (const target of visible) add(target);
    }

    const out = [...merged.values()];

    // Character tokens do not always expose hpInfo in the Maps scene snapshot.
    // When we have the native characterId, use DDB's own Character Service to
    // calculate current/max/temp HP before rendering the applicator.
    await Promise.all(out.map(async target => {
      const current = Number(target?.hp?.current);
      const max = Number(target?.hp?.max);
      if (Number.isFinite(current) && Number.isFinite(max)) return;
      if (!target?.characterId) return;
      try {
        const character = await getDdbCharacter(target.characterId);
        const hp = ddbCharacterHpInfo(character);
        if (hp) target.hp = hp;
      } catch {}
    }));

    out.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" }));
    return out;
  }

  function findMapTokenClickable(target) {
    if (target?.mapElement?.isConnected) {
      const direct = target.mapElement.matches?.('button,[role="button"]') ? target.mapElement : target.mapElement.closest?.('button,[role="button"]');
      if (direct) return direct;
      return target.mapElement;
    }
    if (target?.screenPoint && Number.isFinite(target.screenPoint.x) && Number.isFinite(target.screenPoint.y)) {
      const atPoint = document.elementFromPoint(target.screenPoint.x, target.screenPoint.y);
      if (atPoint && !tokenUiExcluded(atPoint)) return atPoint.closest?.('button,[role="button"],[class*="token" i]') || atPoint;
    }
    const wanted = normalize(target?.name || "");
    if (!wanted) return null;
    const candidates = [];
    for (const el of document.querySelectorAll('button,[role="button"],div,span,img')) {
      if (el.closest?.(`#${EXT}-damage-modal`) || el.closest?.('[role="dialog"],aside,[class*="sidebar" i]')) continue;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 18 || rect.height < 14 || rect.width > 180 || rect.height > 130) continue;
      const text = normalize(`${el.innerText || el.textContent || ""} ${el.getAttribute?.("aria-label") || ""} ${el.title || ""} ${el.alt || ""}`);
      if (!text || (!text.includes(wanted) && !wanted.includes(text))) continue;
      let score = 0;
      if (text === wanted) score += 10;
      if (el.tagName === "IMG") score += 3;
      if (el.matches?.('button,[role="button"]')) score += 4;
      if (rect.left > 250 && rect.right < window.innerWidth - 220 && rect.top > 45) score += 4;
      candidates.push({ el, score, area: rect.width * rect.height });
    }
    candidates.sort((a, b) => b.score - a.score || a.area - b.area);
    const hit = candidates[0]?.el;
    return hit?.matches?.('button,[role="button"]') ? hit : hit?.closest?.('button,[role="button"]') || hit;
  }

  async function ensureNativeHpTarget(target) {
    if (target?.hpButton?.isConnected) return target;
    window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_HP_TARGETS" }, location.origin);
    await sleep(50);
    let match = discoverHpTargets().find(item => normalize(item.name) === normalize(target?.name));
    if (match) return Object.assign(target, match);
    const tokenEl = findMapTokenClickable(target);
    if (tokenEl) {
      tokenEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await sleep(220);
      window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_HP_TARGETS" }, location.origin);
      await sleep(100);
      match = discoverHpTargets().find(item => normalize(item.name) === normalize(target?.name));
      if (match) return Object.assign(target, match);
    }
    return target;
  }

  async function openDamageApplicator(message) {
    closeDamageModal();
    const profile = await buildDamageProfile(message);
    const total = profile?.total;
    if (total == null) return;
    const damageTypes = profile.types || [];
    const isResolvedMixed = profile.components?.length > 1 && profile.components.every(component => component?.type);
    const targets = await collectDamageTargets();

    const overlay = document.createElement("div");
    overlay.id = `${EXT}-damage-modal`;
    overlay.className = `${EXT}-modal-backdrop`;
    overlay.innerHTML = `
      <section class="${EXT}-modal" role="dialog" aria-modal="true">
        <div class="${EXT}-modal-head">
          <div><strong>${escapeHtml(message?.data?.action || "Damage")}</strong><small>${total} de dano</small></div>
          <button type="button" class="${EXT}-modal-close" aria-label="Fechar">×</button>
        </div>
        <div class="${EXT}-damage-type-row">
          <label>Tipo de dano
            <select id="${EXT}-damage-type" ${isResolvedMixed ? "disabled" : ""}>
              ${isResolvedMixed
                ? `<option value="__mixed__">Misto: ${profile.components.map(component => `${component.total} ${titleCase(component.type)}`).join(" + ")}</option>`
                : (damageTypes.length ? damageTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(titleCase(type))}</option>`).join("") : `<option value="">Não identificado</option>${DAMAGE_TYPES.map(type => `<option value="${type}">${titleCase(type)}</option>`).join("")}`)}
            </select>
          </label>
        </div>
        <div class="${EXT}-damage-note">Marque os alvos para aplicar dano ou cura. Resistência, imunidade e vulnerabilidade continuam editáveis por alvo.</div>
        <div class="${EXT}-target-columns-head"><span>Dano</span><span></span><span>Alvo</span><span>Defesa</span><span>Final</span></div>
        <div id="${EXT}-target-list" class="${EXT}-target-list"></div>
        <div class="${EXT}-modal-footer">
          <span id="${EXT}-apply-status"></span>
          <button type="button" id="${EXT}-apply-heal">Curar</button>
          <button type="button" id="${EXT}-apply-damage" class="${EXT}-primary">Aplicar dano</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const typeSelect = overlay.querySelector(`#${EXT}-damage-type`);
    const listEl = overlay.querySelector(`#${EXT}-target-list`);
    const statusEl = overlay.querySelector(`#${EXT}-apply-status`);
    let activeTargets = targets;

    const renderTargets = async () => {
      listEl.innerHTML = "";
      if (!activeTargets.length) {
        listEl.innerHTML = `<div class="${EXT}-empty">Nenhum token encontrado na cena.</div>`;
        return;
      }
      const type = typeSelect.value;
      const resolvedTargets = await Promise.all(activeTargets.map(async target => ({
        target,
        defense: isResolvedMixed ? null : await defenseForTarget(target, type),
        breakdown: isResolvedMixed ? await damageBreakdownForTarget(target, profile) : null
      })));
      for (const resolved of resolvedTargets) {
        const { target, defense, breakdown } = resolved;
        const row = document.createElement("div");
        row.className = `${EXT}-target-row`;
        row.dataset.targetId = target.id;
        row.innerHTML = `
          <input type="checkbox" class="${EXT}-target-check" title="Aplicar dano/cura">
          <span class="${EXT}-target-avatar">${target.imageUrl ? `<img src="${escapeHtml(target.imageUrl)}" alt="">` : `<span aria-hidden="true">?</span>`}</span>
          <span class="${EXT}-target-name"><strong>${escapeHtml(target.name)}</strong><small>HP ${target.hp?.current ?? "—"}/${target.hp?.max ?? "—"}<span class="${EXT}-defense-summary"></span></small></span>
          <select class="${EXT}-defense-mode" title="Ajuste de dano" ${isResolvedMixed ? "disabled" : ""}>
            ${isResolvedMixed ? `<option value="mixed">Misto automático</option>` : `
            <option value="normal">Normal</option>
            <option value="resist">Resistance ½</option>
            <option value="immune">Immunity 0</option>
            <option value="vulnerable">Vulnerability ×2</option>`}
          </select>
          <span class="${EXT}-final-damage"></span>`;
        const mode = row.querySelector(`.${EXT}-defense-mode`);
        const output = row.querySelector(`.${EXT}-final-damage`);
        const summary = row.querySelector(`.${EXT}-defense-summary`);
        if (isResolvedMixed) {
          output.textContent = String(breakdown.total);
          summary.textContent = breakdown?.detected ? " • defesas aplicadas" : "";
          row.dataset.finalDamage = String(breakdown.total);
        } else {
          mode.value = defense.mode;
          if (defense?.detected && defense?.mode !== "normal") summary.textContent = ` • ${defense.label}`;
          else summary.textContent = "";
          const refresh = () => {
            const value = adjustedDamage(total, mode.value);
            output.textContent = String(value);
            row.dataset.finalDamage = String(value);
          };
          mode.addEventListener("change", refresh);
          refresh();
        }
        listEl.appendChild(row);
      }
    };


    const run = async operation => {
      const checkedRows = [...listEl.querySelectorAll(`.${EXT}-target-row`)].filter(row => row.querySelector(`.${EXT}-target-check`)?.checked);
      if (!checkedRows.length) {
        statusEl.textContent = "Escolha pelo menos um alvo.";
        return;
      }
      const applyBtn = overlay.querySelector(`#${EXT}-apply-damage`);
      const healBtn = overlay.querySelector(`#${EXT}-apply-heal`);
      applyBtn.disabled = healBtn.disabled = true;
      const failures = [];
      let done = 0;
      for (const row of checkedRows) {
        const target = activeTargets.find(item => item.id === row.dataset.targetId);
        if (!target) continue;
        const mode = row.querySelector(`.${EXT}-defense-mode`)?.value || "normal";
        const amount = operation === "heal" ? total : (isResolvedMixed ? Number(row.dataset.finalDamage || total) : adjustedDamage(total, mode));
        statusEl.textContent = `${operation === "heal" ? "Curando" : "Aplicando"} ${target.name}...`;
        try {
          await applyNativeHpChange(target, amount, operation);
          done++;
        } catch (error) {
          failures.push(error.message);
        }
      }
      statusEl.textContent = failures.length ? `${done} aplicado(s). ${failures.join(" | ")}` : `${done} alvo(s) atualizado(s).`;
      applyBtn.disabled = healBtn.disabled = false;
      if (done > 0) setTimeout(closeDamageModal, 40);
    };

    overlay.querySelector(`.${EXT}-modal-close`).addEventListener("click", closeDamageModal);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeDamageModal(); });
    typeSelect.addEventListener("change", renderTargets);
    overlay.querySelector(`#${EXT}-apply-damage`).addEventListener("click", () => run("damage"));
    overlay.querySelector(`#${EXT}-apply-heal`).addEventListener("click", () => run("heal"));
    await renderTargets();

    // Scene state can finish arriving just after the modal opens. Do one silent
    // enrichment pass so HP/IDs populate automatically; no manual refresh button.
    setTimeout(async () => {
      if (!overlay.isConnected) return;
      const refreshed = await collectDamageTargets().catch(() => []);
      if (!refreshed.length) return;
      const hadHp = activeTargets.filter(item => Number.isFinite(Number(item?.hp?.current)) && Number.isFinite(Number(item?.hp?.max))).length;
      const hasHp = refreshed.filter(item => Number.isFinite(Number(item?.hp?.current)) && Number.isFinite(Number(item?.hp?.max))).length;
      if (refreshed.length !== activeTargets.length || hasHp > hadHp) {
        activeTargets = refreshed;
        await renderTargets();
      }
    }, 450);
  }



  function findDamageCardForElement(el, message) {
    const action = normalize(message?.data?.action || "");
    let cur = el;
    let fallback = null;
    for (let i = 0; cur && cur !== document.body && i < 10; i++, cur = cur.parentElement) {
      const cls = String(cur.className || "");
      const text = normalize(cur.innerText || cur.textContent || "");
      const rect = cur.getBoundingClientRect?.() || { width: 0, height: 0 };
      if (/GameLogMessage/i.test(cls)) fallback = cur;
      if (action && text.includes(action) && text.includes("damage") && rect.width > 160 && rect.height > 40 && rect.height < 700) {
        fallback = cur;
        if (/GameLogMessage|message|card/i.test(cls) || cur.tagName === "LI") return cur;
      }
    }
    return fallback || el.closest?.("li") || el.parentElement;
  }

  function findDamageRollBox(card, total) {
    if (!card?.querySelectorAll) return null;
    const totalText = String(total);
    const candidates = [...card.querySelectorAll("div,section,span,button")].filter(el => {
      if (el.closest?.(`.${EXT}-modal-backdrop`) || el.classList?.contains(`${EXT}-apply-damage-button`)) return false;
      const text = normalize(el.innerText || el.textContent || "");
      if (!text.includes("damage") || !text.includes(totalText)) return false;
      const r = el.getBoundingClientRect?.();
      return r && r.width >= 90 && r.height >= 28 && r.height <= 100;
    });
    candidates.sort((a, b) => {
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      return (A.width * A.height) - (B.width * B.height);
    });
    return candidates[0] || null;
  }

  function injectOneDamageButton(el, message, seenMessages) {
    if (!message?.id || seenMessages.has(message.id)) return;
    rememberLastDamage(message);
    const total = messageDamageTotal(message);
    if (total == null) return;
    seenMessages.add(message.id);

    const card = findDamageCardForElement(el, message);
    if (!card?.appendChild) return;
    if (document.querySelector?.(`.${EXT}-apply-damage-button[data-ddb-qol-damage-id="${CSS.escape(String(message.id))}"]`)) return;

    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    card.style.overflow = "visible";
    const rollBox = findDamageRollBox(card, total);
    const anchor = rollBox?.appendChild ? rollBox : card;
    if (anchor && getComputedStyle(anchor).position === "static") anchor.style.position = "relative";
    if (anchor?.style) anchor.style.overflow = "visible";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `${EXT}-apply-damage-button`;
    button.dataset.ddbQolDamageId = String(message.id);
    button.dataset.ddbQolAnchor = anchor === rollBox ? "roll-box" : "card";
    button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M13.4 2 5.8 13h5.1L9.8 22 18.2 10h-5.3L13.4 2Z"/></svg>`;
    button.setAttribute("aria-label", `Aplicar ${total} de dano`);
    button.title = `Aplicar ${total} de dano`;
    button.style.top = "50%";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openDamageApplicator(message).catch(error => console.error("[DDB QoL] Damage Applicator", error));
    });
    anchor.appendChild(button);
  }

  function injectDamageButtons() {
    if (SETTINGS.damageApplicator === false) return;
    const seenMessages = new Set();

    // v0.3.2: React stores these objects in the page's MAIN world. Chrome content
    // scripts run in an isolated world and cannot reliably read those expando
    // properties. page-bridge.js marks the exact DOM node in MAIN world; read the
    // serialized message here and keep the UI/actions in the extension world.
    for (const el of document.querySelectorAll('[data-ddb-qol-damage-message]')) {
      try {
        const raw = el.getAttribute('data-ddb-qol-damage-message');
        const message = JSON.parse(raw || "null");
        injectOneDamageButton(el, message, seenMessages);
      } catch (error) {
        console.warn("[DDB QoL] Mensagem de dano marcada não pôde ser lida", error);
      }
    }

    // Fallback para páginas/versões onde os props React sejam visíveis ao content script.
    const candidates = [];
    for (const el of document.querySelectorAll("*")) {
      let keys = [];
      try { keys = Object.keys(el); } catch {}
      if (keys.some(key => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"))) candidates.push(el);
    }
    for (const el of candidates) injectOneDamageButton(el, findMessageOnElement(el), seenMessages);
  }


  // ---------------------------------------------------------------------------
  // Maps QoL — busca/ordenação de mapas + stickers personalizados
  // ---------------------------------------------------------------------------
  const CUSTOM_STICKERS_KEY = "ddbQolCustomStickersV1";
  const CUSTOM_STICKER_INSTANCES_KEY = "ddbQolCustomStickerInstancesV1";
  const CUSTOM_STICKER_TOMBSTONES_KEY = "ddbQolCustomStickerTombstonesV1";
  const MAP_THUMB_CACHE_KEY = "ddbQolMapThumbCacheV2";
  const OLD_MAP_THUMB_CACHE_KEY = "ddbQolMapThumbCacheV1";
  let mapThumbCache = null;
  let mapSearchValue = "";
  let mapSortDirection = "desc";
  let customStickerUiReady = false;
  let customStickerStatusTimer = null;
  const stickerDeletedIds = new Set();

  function currentStickerScope() {
    return {
      gameId: currentGameId(),
      mapName: currentMapScopeName()
    };
  }

  function sameStickerScope(item, scope = currentStickerScope()) {
    if (!item) return false;
    if (item.gameId && String(item.gameId) !== String(scope.gameId)) return false;
    if (item.mapName && scope.mapName && normalize(item.mapName) !== normalize(scope.mapName)) return false;
    return Boolean(item.gameId || item.mapName);
  }

  function isMapsPage() {
    return /^\/games\/\d+/i.test(location.pathname);
  }

  function currentGameId() {
    return location.pathname.match(/^\/games\/(\d+)/i)?.[1] || "unknown";
  }

  function mapOptionName(label) {
    return String(label?.innerText || label?.textContent || "").replace(/\s+/g, " ").trim();
  }

  async function loadMapThumbCache() {
    if (mapThumbCache) return mapThumbCache;
    const stored = await getStorage(MAP_THUMB_CACHE_KEY).catch(() => null);
    mapThumbCache = stored && typeof stored === "object" ? stored : {};
    // V1 used a name/DOM-image heuristic that could associate the wrong image
    // with a map. Never migrate it into the strict V2 cache.
    await removeStorage(OLD_MAP_THUMB_CACHE_KEY).catch(() => {});
    return mapThumbCache;
  }

  function mapThumbCacheKey(label, name) {
    const mapId = String(label?.dataset?.ddbQolMapId || "").trim();
    const assetKey = String(label?.dataset?.ddbQolMapThumbKey || "").trim();
    if (mapId) return `${currentGameId()}|id:${mapId}`;
    if (assetKey) return `${currentGameId()}|asset:${assetKey}`;
    return `${currentGameId()}|name:${normalize(name)}`;
  }

  function directMapLabelImageUrl(label) {
    if (!label?.querySelectorAll) return "";
    const images = [...label.querySelectorAll("img")].filter(img => !img.closest?.(`.${EXT}-map-thumb`));
    for (const img of images) {
      const src = String(img.currentSrc || img.src || "").trim();
      if (/^(?:https?:|data:image\/|blob:)/i.test(src)) return src;
    }
    return "";
  }

  async function applyMapThumbnails(labels) {
    const cache = await loadMapThumbCache();
    let changed = false;
    for (const label of labels) {
      const name = mapOptionName(label);
      const key = mapThumbCacheKey(label, name);
      // Only trust a URL explicitly annotated from the native map metadata.
      // Never guess from nearby DOM images: that was the source of mismatched thumbs.
      let url = String(label.dataset.ddbQolMapThumb || "").trim();
      if (!url) url = directMapLabelImageUrl(label);
      if (url) {
        if (cache[key] !== url) { cache[key] = url; changed = true; }
      } else if (cache[key]) {
        url = String(cache[key]);
      }
      let thumb = label.querySelector(`:scope > .${EXT}-map-thumb`);
      if (!url) {
        thumb?.remove();
        label.classList.remove(`${EXT}-map-option-with-thumb`);
        continue;
      }
      if (!thumb) {
        thumb = document.createElement("span");
        thumb.className = `${EXT}-map-thumb`;
        thumb.innerHTML = '<img alt="" loading="lazy" decoding="async">';
        const directInput = label.querySelector(':scope > input');
        if (directInput?.nextSibling) label.insertBefore(thumb, directInput.nextSibling);
        else if (directInput) label.appendChild(thumb);
        else label.prepend(thumb);
      }
      const img = thumb.querySelector("img");
      if (img && img.src !== url) {
        img.onerror = () => {
          if (cache[key] === url) {
            delete cache[key];
            setStorage(MAP_THUMB_CACHE_KEY, cache).catch(() => {});
          }
          thumb?.remove();
          label.classList.remove(`${EXT}-map-option-with-thumb`);
        };
        img.src = url;
      }
      label.classList.add(`${EXT}-map-option-with-thumb`);
    }
    if (changed) await setStorage(MAP_THUMB_CACHE_KEY, cache).catch(() => {});
  }

  function findVisibleMapDropdowns() {
    const candidates = [...document.querySelectorAll('[class*="dropdownOptionsVisible"], [role="listbox"], [class*="dropdownOptions"]')];
    return candidates.filter(el => {
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 160 || rect.height < 80) return false;
      const text = normalize(el.innerText || "");
      const labels = el.querySelectorAll('label[class*="dropdownOption"], [role="option"]');
      return labels.length >= 3 && (text.includes("open map browser") || text.includes("display map") || el.querySelector('button[class*="addMapButton"]'));
    });
  }

  function mapDateCoverage(labels) {
    const dated = labels.filter(label => {
      const n = Number(label.dataset.ddbQolMapCreated || 0);
      return Number.isFinite(n) && n > 0;
    });
    return { dated: dated.length, total: labels.length, complete: labels.length > 1 && dated.length === labels.length };
  }

  function mapOrderCoverage(labels) {
    const ordered = labels.filter(label => Number.isFinite(Number(label.dataset.ddbQolMapOrder)));
    return { ordered: ordered.length, total: labels.length, complete: labels.length > 1 && ordered.length === labels.length };
  }

  function internalMapOrderLooksAlphabetical(labels) {
    const coverage = mapOrderCoverage(labels);
    if (!coverage.complete) return false;
    const byInternal = [...labels]
      .sort((a, b) => Number(a.dataset.ddbQolMapOrder) - Number(b.dataset.ddbQolMapOrder))
      .map(mapOptionName);
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    const asc = [...byInternal].sort(collator.compare);
    const desc = [...asc].reverse();
    const same = (a, b) => a.every((value, index) => value === b[index]);
    return same(byInternal, asc) || same(byInternal, desc);
  }

  function mapSortSource(labels) {
    if (mapDateCoverage(labels).complete) return "date";
    if (mapOrderCoverage(labels).complete && !internalMapOrderLooksAlphabetical(labels)) return "internal";
    return "";
  }

  function sortMapLabels(labels, direction = mapSortDirection) {
    const list = labels[0]?.parentElement;
    if (!list) return false;
    const source = mapSortSource(labels);
    if (!source) return false;
    const originalIndex = new Map(labels.map((label, index) => [label, index]));
    const sorted = [...labels].sort((a, b) => {
      if (source === "date") {
        const A = Number(a.dataset.ddbQolMapCreated || 0);
        const B = Number(b.dataset.ddbQolMapCreated || 0);
        const sign = direction === "asc" ? 1 : -1;
        return sign * (A - B) || originalIndex.get(a) - originalIndex.get(b);
      }
      const A = Number(a.dataset.ddbQolMapOrder);
      const B = Number(b.dataset.ddbQolMapOrder);
      // For internal order, "desc" means the order returned by DDB; "asc" reverses it.
      return (direction === "desc" ? A - B : B - A) || originalIndex.get(a) - originalIndex.get(b);
    });
    sorted.forEach(label => list.appendChild(label));
    return true;
  }

  function setMapSortButtonState(button, direction, labels = []) {
    if (!button) return;
    const dates = mapDateCoverage(labels);
    const orders = mapOrderCoverage(labels);
    const source = mapSortSource(labels);
    button.dataset.currentDir = direction;
    button.dataset.sortSource = source;
    if (!source) {
      // Current DDB campaign dropdown can contain only the new alphabetical order and no historical timestamp.
      // Do not display a dead/fake sorter until a real date or non-alphabetical backend order is found.
      button.disabled = true;
      button.hidden = true;
      button.style.setProperty("display", "none", "important");
      button.textContent = "";
      button.title = "";
      return;
    }
    button.hidden = false;
    button.style.removeProperty("display");
    button.disabled = false;
    if (source === "date") {
      button.textContent = direction === "desc" ? "Recentes primeiro" : "Antigos primeiro";
      button.title = "Ordenação pela data real de inclusão/criação exposta pelo D&D Beyond. Clique para inverter.";
    } else {
      button.textContent = direction === "desc" ? "Ordem DDB" : "Ordem DDB inversa";
      button.title = "O D&D Beyond não expôs datas, mas expôs uma ordem interna não alfabética. Clique para inverter essa ordem.";
    }
  }


  async function installMapSearch(dropdown) {
    const list = dropdown.querySelector('[class*="optionsList"]') || [...dropdown.querySelectorAll('div,ul')].find(el => el.querySelectorAll(':scope > label[class*="dropdownOption"], :scope > [role="option"]').length >= 3);
    if (!list) return;
    const labels = [...list.querySelectorAll(':scope > label[class*="dropdownOption"], :scope > [role="option"]')];
    if (labels.length < 3) return;

    let wrap = dropdown.querySelector(`.${EXT}-map-search-wrap`);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = `${EXT}-map-search-wrap`;
      wrap.innerHTML = `<input class="${EXT}-map-search" type="search" placeholder="🔎 Buscar mapa..." autocomplete="off" spellcheck="false"><button type="button" class="${EXT}-map-order-button"></button>`;
      list.parentElement?.insertBefore(wrap, list);
      const input = wrap.querySelector(`.${EXT}-map-search`);
      const sortBtn = wrap.querySelector(`.${EXT}-map-order-button`);
      input.value = mapSearchValue;
      setMapSortButtonState(sortBtn, mapSortDirection, labels);
      const stop = e => e.stopPropagation();
      ["keydown", "keyup", "keypress"].forEach(type => input.addEventListener(type, stop));
      input.addEventListener("input", () => {
        mapSearchValue = input.value;
        const q = normalize(mapSearchValue);
        for (const label of list.querySelectorAll(':scope > label[class*="dropdownOption"], :scope > [role="option"]')) {
          label.style.display = !q || normalize(mapOptionName(label)).includes(q) ? "" : "none";
        }
      });
      sortBtn.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_MAP_ORDER" }, location.origin);
        await new Promise(r => setTimeout(r, 120));
        const fresh = [...list.querySelectorAll(':scope > label[class*="dropdownOption"], :scope > [role="option"]')];
        await applyMapThumbnails(fresh);
        if (!mapSortSource(fresh)) {
          setMapSortButtonState(sortBtn, mapSortDirection, fresh);
          return;
        }
        const current = sortBtn.dataset.currentDir || mapSortDirection || "desc";
        const desired = current === "desc" ? "asc" : "desc";
        mapSortDirection = desired;
        sortMapLabels(fresh, desired);
        setMapSortButtonState(sortBtn, desired, fresh);
      });
    }

    window.postMessage({ source: "ddb-qol-content", type: "ANNOTATE_MAP_ORDER" }, location.origin);
    await new Promise(r => setTimeout(r, 120));
    const freshLabels = [...list.querySelectorAll(':scope > label[class*="dropdownOption"], :scope > [role="option"]')];
    await applyMapThumbnails(freshLabels);
    sortMapLabels(freshLabels, mapSortDirection);
    setMapSortButtonState(wrap.querySelector(`.${EXT}-map-order-button`), mapSortDirection, freshLabels);

    const q = normalize(mapSearchValue);
    for (const label of freshLabels) label.style.display = !q || normalize(mapOptionName(label)).includes(q) ? "" : "none";
  }

  function injectMapSearch() {
    if (!isMapsPage() || SETTINGS.mapSearch === false) return;
    for (const dropdown of findVisibleMapDropdowns()) installMapSearch(dropdown).catch(() => {});
  }

  function stickerToast(text, isError = false) {
    let toast = document.getElementById(`${EXT}-sticker-toast`);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = `${EXT}-sticker-toast`;
      toast.className = `${EXT}-sticker-toast`;
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.toggle(`${EXT}-sticker-toast-error`, isError);
    toast.hidden = false;
    clearTimeout(customStickerStatusTimer);
    customStickerStatusTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  async function canvasDataUrl(bitmap, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { imageUrl: canvas.toDataURL("image/webp", quality), width, height };
  }

  async function prepareStickerImage(file) {
    const type = String(file?.type || "").toLowerCase();
    if (!/^image\/(png|jpeg|webp)$/i.test(type)) throw new Error("Use PNG, JPG ou WebP.");

    const base = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Sticker",
      createdAt: Date.now()
    };

    const bitmap = await createImageBitmap(file);
    try {
      let out = await canvasDataUrl(bitmap, 768, 0.84);
      if (out.imageUrl.length > 520000) out = await canvasDataUrl(bitmap, 512, 0.76);
      if (out.imageUrl.length > 520000) out = await canvasDataUrl(bitmap, 384, 0.66);
      if (out.imageUrl.length > 700000) throw new Error("Imagem ainda ficou grande demais após compressão.");
      return {
        ...base,
        imageUrl: out.imageUrl,
        aspectRatio: out.width / out.height
      };
    } finally { bitmap.close?.(); }
  }

  async function loadStickerLibrary() {
    const raw = await getStorage(CUSTOM_STICKERS_KEY).catch(() => []);
    if (!Array.isArray(raw)) return [];
    const list = raw.filter(item => {
      if (!item || typeof item !== "object" || !item.id || !item.imageUrl) return false;
      const url = String(item.imageUrl);
      return !/^data:/i.test(url) || /^data:image\/(?:png|jpeg|webp)/i.test(url);
    });
    if (list.length !== raw.length) await setStorage(CUSTOM_STICKERS_KEY, list).catch(() => {});
    return list;
  }

  async function saveStickerLibrary(list) {
    let trimmed = [...list].sort((a,b) => Number(b.createdAt||0) - Number(a.createdAt||0)).slice(0, 10);
    while (trimmed.length > 1 && JSON.stringify(trimmed).length > 4500000) trimmed.pop();
    await setStorage(CUSTOM_STICKERS_KEY, trimmed);
    return trimmed;
  }

  async function loadStickerInstances() {
    const list = await getStorage(CUSTOM_STICKER_INSTANCES_KEY).catch(() => []);
    return Array.isArray(list) ? list : [];
  }

  async function saveStickerInstances(list) {
    const trimmed = [...list]
      .filter(item => item?.id && (item?.libraryId || item?.imageUrl))
      .sort((a,b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
      .slice(0, 60);
    await setStorage(CUSTOM_STICKER_INSTANCES_KEY, trimmed);
    return trimmed;
  }

  async function loadStickerTombstones() {
    const list = await getStorage(CUSTOM_STICKER_TOMBSTONES_KEY).catch(() => []);
    return Array.isArray(list) ? list : [];
  }

  async function saveStickerTombstones(list) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trimmed = [...list]
      .filter(item => item?.id && Number(item.deletedAt || 0) >= cutoff)
      .sort((a,b) => Number(b.deletedAt || 0) - Number(a.deletedAt || 0))
      .slice(0, 120);
    await setStorage(CUSTOM_STICKER_TOMBSTONES_KEY, trimmed);
    return trimmed;
  }

  async function syncCustomStickerIdsToBridge() {
    try {
      const [instances, tombstones] = await Promise.all([loadStickerInstances(), loadStickerTombstones()]);
      const deleted = new Set(tombstones.map(item => String(item.id)));
      const scope = currentStickerScope();
      const ids = instances
        .filter(item => sameStickerScope(item, scope))
        .map(item => String(item.id))
        .filter(id => id && !deleted.has(id) && !stickerDeletedIds.has(id));
      window.postMessage({ source: "ddb-qol-content", type: "SYNC_CUSTOM_STICKER_IDS", ids }, location.origin);
    } catch {}
  }

  async function clearStickerTombstone(id) {
    if (!id) return;
    const list = await loadStickerTombstones();
    if (!list.some(item => item.id === id)) return;
    await saveStickerTombstones(list.filter(item => item.id !== id));
  }

  async function markStickerDeleted(id) {
    if (!id) return;
    const list = await loadStickerTombstones();
    await saveStickerTombstones([{ id: String(id), deletedAt: Date.now() }, ...list.filter(item => item.id !== String(id))]);
  }

  async function rememberStickerInstance(sticker) {
    if (!sticker?.id || (!sticker?.libraryId && !sticker?.imageUrl)) return;
    stickerDeletedIds.delete(String(sticker.id));
    await clearStickerTombstone(String(sticker.id));
    const current = await loadStickerInstances();
    const existing = current.find(item => item.id === String(sticker.id)) || {};
    const scope = currentStickerScope();
    const compact = {
      ...existing,
      id: String(sticker.id),
      libraryId: String(sticker.libraryId || existing.libraryId || ""),
      gameId: String(sticker.gameId || existing.gameId || scope.gameId || ""),
      mapName: String(sticker.mapName || existing.mapName || scope.mapName || ""),
      name: sticker.name || existing.name || "Sticker",
      type: sticker.type || existing.type || "rectangle",
      imageKey: sticker.imageKey || existing.imageKey || "official/stickers/br-2024/map_and_utility-arrow_down.png",
      thumbnailKey: sticker.thumbnailKey || existing.thumbnailKey || "thumbnails/official/stickers/br-2024/map_and_utility-arrow_down.png",
      aspectRatio: Number(sticker.aspectRatio ?? existing.aspectRatio) || 1,
      size: Number(sticker.size ?? existing.size) || 1.5,
      rotation: Number(sticker.rotation ?? existing.rotation) || 0,
      hidden: sticker.hidden != null ? Boolean(sticker.hidden) : Boolean(existing.hidden),
      locked: sticker.locked != null ? Boolean(sticker.locked) : Boolean(existing.locked),
      position: Array.isArray(sticker.position) ? sticker.position.slice(0, 2) : existing.position,
      imageUrl: sticker.imageUrl || existing.imageUrl || undefined,
      updatedAt: Date.now()
    };
    const next = [compact, ...current.filter(item => item.id !== compact.id)];
    await saveStickerInstances(next);
    syncCustomStickerIdsToBridge();
  }

  async function mergeNativeStickerInstance(sticker) {
    if (!sticker?.id) return;
    const id = String(sticker.id);
    if (stickerDeletedIds.has(id)) return;
    const tombstones = await loadStickerTombstones();
    if (tombstones.some(item => item.id === id)) return;
    const current = await loadStickerInstances();
    const existing = current.find(item => item.id === id);
    if (!existing) return; // official/non-custom sticker: never adopt it into our cache
    const scope = currentStickerScope();
    const merged = {
      ...existing,
      gameId: existing.gameId || scope.gameId,
      mapName: existing.mapName || scope.mapName,
      name: sticker.name ?? existing.name,
      type: sticker.type ?? existing.type,
      imageKey: sticker.imageKey ?? existing.imageKey,
      thumbnailKey: sticker.thumbnailKey ?? existing.thumbnailKey,
      aspectRatio: Number(sticker.aspectRatio ?? existing.aspectRatio) || existing.aspectRatio || 1,
      size: Number(sticker.size ?? existing.size) || existing.size || 1.5,
      rotation: Number(sticker.rotation ?? existing.rotation) || 0,
      hidden: sticker.hidden != null ? Boolean(sticker.hidden) : Boolean(existing.hidden),
      locked: sticker.locked != null ? Boolean(sticker.locked) : Boolean(existing.locked),
      position: Array.isArray(sticker.position) ? sticker.position.slice(0, 2) : existing.position,
      imageUrl: sticker.imageUrl || existing.imageUrl,
      libraryId: existing.libraryId,
      updatedAt: Date.now()
    };
    await saveStickerInstances([merged, ...current.filter(item => item.id !== id)]);
    syncCustomStickerIdsToBridge();
  }

  async function forgetStickerInstance(id) {
    if (!id) return;
    id = String(id);
    stickerDeletedIds.add(id);
    await markStickerDeleted(id);
    const current = await loadStickerInstances();
    await saveStickerInstances(current.filter(item => item.id !== id));
    syncCustomStickerIdsToBridge();
  }

  function sendCustomSticker(sticker, hidden = false, options = {}) {
    const id = options.id || crypto.randomUUID();
    window.postMessage({
      source: "ddb-qol-content",
      type: "SEND_CUSTOM_STICKER",
      payload: {
        id,
        libraryId: sticker.id || sticker.libraryId || "",
        name: sticker.name || "Sticker",
        type: sticker.type || "rectangle",
        imageKey: options.imageKey || sticker.imageKey,
        thumbnailKey: options.thumbnailKey || sticker.thumbnailKey,
        imageUrl: sticker.imageUrl,
        aspectRatio: Number(options.aspectRatio ?? sticker.aspectRatio) || 1,
        size: Number(options.size ?? sticker.size) || 1.5,
        rotation: Number(options.rotation ?? sticker.rotation) || 0,
        position: Array.isArray(options.position ?? sticker.position) ? (options.position ?? sticker.position) : undefined,
        hidden: Boolean(options.hidden ?? hidden),
        locked: Boolean(options.locked ?? sticker.locked),
        rehydrate: Boolean(options.rehydrate)
      }
    }, location.origin);
    return id;
  }

  let stickerRehydrateInFlight = false;
  async function rehydrateCustomStickers() {
    if (stickerRehydrateInFlight) return;
    syncCustomStickerIdsToBridge();
    stickerRehydrateInFlight = true;
    try {
      const [list, library, tombstones] = await Promise.all([loadStickerInstances(), loadStickerLibrary(), loadStickerTombstones()]);
      const deleted = new Set(tombstones.map(item => item.id));
      const byLibraryId = new Map(library.map(item => [item.id, item]));
      const scope = currentStickerScope();
      for (const item of list) {
        // Legacy unscoped snapshots are deliberately NOT replayed. They were the main
        // cause of deleted/moved stickers being resurrected on a different map.
        if (!sameStickerScope(item, scope)) continue;
        if (deleted.has(item.id) || stickerDeletedIds.has(item.id)) continue;
        const source = item.libraryId ? byLibraryId.get(item.libraryId) : item;
        if (!source?.imageUrl) continue;
        sendCustomSticker({ ...source, name: item.name || source.name, libraryId: item.libraryId || source.id }, Boolean(item.hidden), {
          id: item.id,
          imageKey: item.imageKey,
          thumbnailKey: item.thumbnailKey,
          aspectRatio: item.aspectRatio,
          position: item.position,
          size: item.size,
          rotation: item.rotation,
          hidden: item.hidden,
          locked: item.locked,
          rehydrate: true
        });
      }
    } finally {
      setTimeout(() => { stickerRehydrateInFlight = false; }, 1800);
    }
  }

  let draggedCustomSticker = null;
  const pendingStickerDrops = new Map();
  let stickerDropHandlersInstalled = false;

  function requestStickerDropPlacement(sticker, hidden, clientX, clientY) {
    const requestId = crypto.randomUUID();
    pendingStickerDrops.set(requestId, { sticker, hidden, createdAt: Date.now() });
    window.postMessage({
      source: "ddb-qol-content",
      type: "RESOLVE_MAP_POINT",
      requestId,
      clientX,
      clientY
    }, location.origin);
    stickerToast("Posicionando sticker...");
    setTimeout(() => pendingStickerDrops.delete(requestId), 8000);
  }

  function installStickerDropHandlers() {
    if (stickerDropHandlersInstalled) return;
    stickerDropHandlersInstalled = true;
    document.addEventListener("dragover", event => {
      if (!draggedCustomSticker) return;
      if (event.target?.closest?.(`#${EXT}-sticker-panel`)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      document.documentElement.classList.add(`${EXT}-sticker-drag-active`);
    }, true);
    document.addEventListener("drop", event => {
      if (!draggedCustomSticker) return;
      if (event.target?.closest?.(`#${EXT}-sticker-panel`)) return;
      event.preventDefault();
      event.stopPropagation();
      const payload = draggedCustomSticker;
      draggedCustomSticker = null;
      document.documentElement.classList.remove(`${EXT}-sticker-drag-active`);
      requestStickerDropPlacement(payload.item, payload.hidden, event.clientX, event.clientY);
    }, true);
    document.addEventListener("dragend", () => {
      draggedCustomSticker = null;
      document.documentElement.classList.remove(`${EXT}-sticker-drag-active`);
    }, true);
  }

  async function renderStickerLibrary(panel) {
    installStickerDropHandlers();
    const grid = panel.querySelector(`.${EXT}-sticker-grid`);
    const list = await loadStickerLibrary();
    grid.innerHTML = list.length ? "" : `<div class="${EXT}-sticker-empty">Nenhum sticker salvo ainda.</div>`;
    for (const item of list) {
      const card = document.createElement("div");
      card.className = `${EXT}-sticker-card`;
      card.draggable = true;
      card.dataset.stickerId = item.id;
      card.innerHTML = `
        <img alt="" draggable="false">
        <div class="${EXT}-sticker-card-name"></div>
        <div class="${EXT}-sticker-drag-hint">↗ Arraste para o mapa</div>
        <div class="${EXT}-sticker-card-actions">
          <label class="${EXT}-sticker-hidden-toggle" title="Se marcado, o sticker nasce oculto para jogadores">
            <input type="checkbox" data-act="hidden"> Oculto
          </label>
          <button type="button" data-act="delete" title="Remover da biblioteca">×</button>
        </div>`;
      const preview = card.querySelector("img");
      if (preview) preview.src = item.imageUrl;
      card.querySelector(`.${EXT}-sticker-card-name`).textContent = item.name;
      const hiddenInput = card.querySelector('[data-act="hidden"]');
      card.addEventListener("dragstart", event => {
        draggedCustomSticker = { item, hidden: Boolean(hiddenInput?.checked) };
        try {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("application/x-ddb-qol-sticker", item.id);
          event.dataTransfer.setData("text/plain", item.name || "Sticker");
          const img = card.querySelector("img");
          if (img && event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(img, Math.min(45, img.clientWidth / 2), Math.min(45, img.clientHeight / 2));
        } catch {}
      });
      card.querySelector('[data-act="delete"]').addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const next = (await loadStickerLibrary()).filter(x => x.id !== item.id);
        await saveStickerLibrary(next);
        // Remove only library metadata. Placed instances are independent and remain on the map.
        await renderStickerLibrary(panel);
      });
      grid.appendChild(card);
    }
  }

  let lastMapSelectorRect = null;

  function cleanCurrentMapLabel(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[⌄⌃▼▲▾▴]+$/g, "")
      .trim();
  }

  function isPlausibleCurrentMapSelector(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width < 130 || rect.width > Math.min(620, window.innerWidth * .55) || rect.height < 24 || rect.height > 64) return false;
    if (rect.top < -4 || rect.top > 76 || rect.right < 210 || rect.left > window.innerWidth - 220) return false;
    const raw = cleanCurrentMapLabel(el.innerText || el.textContent || el.getAttribute?.("aria-label") || "");
    const text = normalize(raw);
    if (!raw || raw.length < 2 || raw.length > 140) return false;
    if (/campaign journal|everyone|initiative order|game log|feedback|hide map|open map browser|quick jot|settings|menu/.test(text)) return false;
    return true;
  }

  function findCurrentMapSelector() {
    const candidates = [...document.querySelectorAll('button,[role="button"]')].filter(isPlausibleCurrentMapSelector);
    let best = null;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const raw = cleanCurrentMapLabel(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
      const text = normalize(raw);
      let score = 0;
      const popup = normalize(el.getAttribute("aria-haspopup") || "");
      if (/listbox|menu/.test(popup)) score += 45;
      if (el.querySelector("svg")) score += 18;
      if (rect.width >= 180) score += 18;
      if (rect.left >= 230 && rect.left <= window.innerWidth * .65) score += 20;
      if (rect.top <= 48) score += 15;
      if (/[.…]{1,3}$/.test(raw) || text.length > 8) score += 8;
      if (el.closest('header,[class*="top" i],[class*="toolbar" i],[class*="header" i]')) score += 15;
      if (!best || score > best.score) best = { el, score };
    }
    return best?.el || null;
  }

  function currentMapScopeName() {
    const selector = findCurrentMapSelector();
    const live = cleanCurrentMapLabel(selector?.innerText || selector?.textContent || "");
    if (live) {
      try { sessionStorage.setItem("ddbQolCurrentMapNameV1", live); } catch {}
      return live;
    }
    try { return String(sessionStorage.getItem("ddbQolCurrentMapNameV1") || "").trim(); } catch { return ""; }
  }

  function saveMapSelectorRect(rect) {
    if (!rect || rect.width < 80 || rect.height < 20) return;
    lastMapSelectorRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    try { sessionStorage.setItem("ddbQolMapSelectorRectV1", JSON.stringify(lastMapSelectorRect)); } catch {}
  }

  function readMapSelectorRect() {
    if (lastMapSelectorRect) return lastMapSelectorRect;
    try {
      const parsed = JSON.parse(sessionStorage.getItem("ddbQolMapSelectorRectV1") || "null");
      if (parsed && [parsed.left, parsed.top, parsed.width, parsed.height].every(Number.isFinite)) lastMapSelectorRect = parsed;
    } catch {}
    return lastMapSelectorRect;
  }

  function placeStickerLauncherInToolbar() {
    const launcher = document.getElementById(`${EXT}-sticker-launcher`);
    if (!launcher) return false;
    if (launcher.parentElement !== document.body) document.body.appendChild(launcher);

    const selector = findCurrentMapSelector();
    let rect = selector?.getBoundingClientRect?.();
    if (rect && rect.width >= 80 && rect.height >= 20) saveMapSelectorRect(rect);
    else rect = readMapSelectorRect();

    if (!rect) {
      launcher.style.setProperty("visibility", "hidden", "important");
      launcher.style.setProperty("pointer-events", "none", "important");
      return false;
    }

    const size = Math.max(28, Math.min(34, Math.round(rect.height - 4) || 30));
    const gap = 6;
    const left = Math.max(8, Math.min(window.innerWidth - size - 8, rect.right + gap));
    const top = Math.max(6, Math.min(window.innerHeight - size - 6, rect.top + (rect.height - size) / 2));
    launcher.classList.add(`${EXT}-sticker-toolbar-button`);
    launcher.style.setProperty("display", "grid", "important");
    launcher.style.setProperty("visibility", "visible", "important");
    launcher.style.setProperty("opacity", "1", "important");
    launcher.style.setProperty("pointer-events", "auto", "important");
    launcher.style.setProperty("position", "fixed", "important");
    launcher.style.setProperty("left", `${left}px`, "important");
    launcher.style.setProperty("top", `${top}px`, "important");
    launcher.style.setProperty("right", "auto", "important");
    launcher.style.setProperty("bottom", "auto", "important");
    launcher.style.setProperty("width", `${size}px`, "important");
    launcher.style.setProperty("height", `${size}px`, "important");
    launcher.style.setProperty("z-index", "2147483000", "important");
    return true;
  }

  function positionStickerPanel() {
    const launcher = document.getElementById(`${EXT}-sticker-launcher`);
    const panel = document.getElementById(`${EXT}-sticker-panel`);
    if (!launcher || !panel || panel.hidden) return;
    const rect = launcher.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const width = Math.min(360, Math.max(280, window.innerWidth - margin * 2));
    const maxHeight = Math.max(180, window.innerHeight - margin * 2);
    panel.style.setProperty("width", `${width}px`, "important");
    panel.style.setProperty("max-height", `${maxHeight}px`, "important");
    panel.style.setProperty("right", "auto", "important");
    panel.style.setProperty("bottom", "auto", "important");

    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
    panel.style.setProperty("left", `${left}px`, "important");

    // Measure after width/max-height are applied and choose the side that fits.
    const measuredHeight = Math.min(maxHeight, Math.max(180, panel.getBoundingClientRect().height || panel.scrollHeight || 360));
    const roomBelow = window.innerHeight - rect.bottom - gap - margin;
    const roomAbove = rect.top - gap - margin;
    let top;
    if (roomBelow >= Math.min(measuredHeight, 260) || roomBelow >= roomAbove) top = rect.bottom + gap;
    else top = rect.top - gap - measuredHeight;
    top = Math.max(margin, Math.min(window.innerHeight - measuredHeight - margin, top));
    panel.style.setProperty("top", `${top}px`, "important");
  }

  let stickerPeerRehydrateTimer = null;
  function scheduleStickerRehydrate(delay = 650) {
    clearTimeout(stickerPeerRehydrateTimer);
    stickerPeerRehydrateTimer = setTimeout(() => rehydrateCustomStickers().catch(() => {}), delay);
  }

  function injectCustomStickerUi() {
    if (!isMapsPage() || SETTINGS.customStickers === false) return;

    let launcher = document.getElementById(`${EXT}-sticker-launcher`);
    let panel = document.getElementById(`${EXT}-sticker-panel`);
    if (!launcher || !panel) {
      customStickerUiReady = true;
      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.id = `${EXT}-sticker-launcher`;
      launcher.className = `${EXT}-sticker-launcher`;
      launcher.setAttribute("aria-label", "Adicionar sticker personalizado");
      launcher.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v10a4 4 0 0 1-4 4H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm9 2v4h4"/><path d="M8 13h6M11 10v6"/></svg>`;
      launcher.title = "Adicionar sticker personalizado";

      panel = document.createElement("section");
      panel.id = `${EXT}-sticker-panel`;
      panel.className = `${EXT}-sticker-panel`;
      panel.hidden = true;
      panel.innerHTML = `
        <div class="${EXT}-sticker-panel-head"><strong>Stickers personalizados</strong><button type="button" data-act="close">×</button></div>
        <div class="${EXT}-sticker-panel-tools"><button type="button" data-act="upload">Escolher PNG / JPG / WebP</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden></div>
        <div class="${EXT}-sticker-hint">Arraste o sticker salvo para o mapa.</div>
        <div class="${EXT}-sticker-grid"></div>`;

      document.body.appendChild(launcher);
      document.body.appendChild(panel);
      const input = panel.querySelector('input[type="file"]');
      launcher.addEventListener("click", event => {
        event.stopPropagation();
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          renderStickerLibrary(panel);
          requestAnimationFrame(() => { positionStickerPanel(); requestAnimationFrame(positionStickerPanel); });
        }
      });
      panel.querySelector('[data-act="close"]').addEventListener("click", () => { panel.hidden = true; });
      panel.querySelector('[data-act="upload"]').addEventListener("click", () => input.click());
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        try {
          stickerToast("Preparando sticker...");
          const sticker = await prepareStickerImage(file);
          const current = await loadStickerLibrary();
          await saveStickerLibrary([sticker, ...current.filter(x => x.name !== sticker.name || x.imageUrl !== sticker.imageUrl)]);
          await renderStickerLibrary(panel);
          stickerToast("Sticker salvo. Arraste o card para o mapa.");
        } catch (error) {
          stickerToast(error?.message || "Não foi possível preparar o sticker.", true);
        }
      });

      window.addEventListener("resize", () => { placeStickerLauncherInToolbar(); positionStickerPanel(); }, { passive: true });
      window.addEventListener("scroll", () => { placeStickerLauncherInToolbar(); positionStickerPanel(); }, { passive: true, capture: true });

      window.addEventListener("message", event => {
        const msg = event.data;
        if (event.source !== window || event.origin !== location.origin || msg?.source !== "ddb-qol-page") return;
        if (msg.type === "MAP_POINT_RESOLVED") {
          const pending = pendingStickerDrops.get(String(msg.requestId || ""));
          if (pending) {
            pendingStickerDrops.delete(String(msg.requestId || ""));
            if (Array.isArray(msg.position) && msg.position.length >= 2) {
              sendCustomSticker(pending.sticker, pending.hidden, { position: msg.position });
              panel.hidden = true;
            } else {
              stickerToast(msg.error || "Não consegui posicionar o sticker nesse ponto.", true);
            }
          }
        }
        if (msg.type === "CUSTOM_STICKER_SENT") {
          if (msg.sticker && !msg.rehydrate) rememberStickerInstance(msg.sticker).catch(() => {});
          if (!msg.rehydrate && !msg.silent) stickerToast("Sticker colocado no mapa.");
        }
        if (msg.type === "CUSTOM_STICKER_NATIVE_UPSERT" && msg.sticker) mergeNativeStickerInstance(msg.sticker).catch(() => {});
        if (msg.type === "CUSTOM_STICKER_REMOVED_NATIVE") forgetStickerInstance(msg.id).catch(() => {});
        // Give DDB time to deliver its snapshot first; then reapply imageUrl onto the latest native state.
        if (msg.type === "MAP_SOCKET_READY") scheduleStickerRehydrate(2200);
        if (msg.type === "MAP_PEER_RECONNECT") scheduleStickerRehydrate(1700);
        if (msg.type === "CUSTOM_STICKER_ERROR") stickerToast(msg.message || "Para ativar o drop de stickers: pressione X e faça 1 Ping em qualquer ponto do mapa. Depois arraste o sticker novamente.", true);
      });
      syncCustomStickerIdsToBridge();
      window.postMessage({ source: "ddb-qol-content", type: "REQUEST_MAP_SOCKET_READY" }, location.origin);
      setInterval(() => { if (document.visibilityState === "visible") placeStickerLauncherInToolbar(); }, 700);

    }

    placeStickerLauncherInToolbar();
    positionStickerPanel();
  }


  function styleHomebrewStatblockHeadings() {
    if (!isMapsPage()) return;
    const roots = [...document.querySelectorAll('aside,[role="dialog"],[class*="sidebar" i],[class*="initiative" i]')].filter(isVisible);
    for (const root of roots) {
      for (const p of root.querySelectorAll('p')) {
        if (p.closest?.(`#${EXT}-damage-modal`)) continue;
        const first = p.querySelector(':scope > strong:first-child, :scope > em:first-child, :scope > b:first-child, :scope > i:first-child');
        if (!first) continue;
        const headingText = String(first.innerText || first.textContent || "").trim();
        const fullText = String(p.innerText || p.textContent || "").trim();
        if (!headingText || headingText.length > 100 || fullText.length <= headingText.length + 2) continue;
        if (!/[.!?]$/.test(headingText)) continue;
        first.classList.add(`${EXT}-hb-feature-heading`);
        first.querySelectorAll?.('strong,em,b,i').forEach(el => el.classList.add(`${EXT}-hb-feature-heading`));
      }
    }
  }

  const diagnosticStatusRequests = new Map();

  function requestBridgeDiagnosticStatus(timeout = 900) {
    if (!isMapsPage()) return Promise.resolve(null);
    const requestId = `diag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.postMessage({ source: "ddb-qol-content", type: "REQUEST_DIAGNOSTIC_STATUS", requestId }, location.origin);
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        diagnosticStatusRequests.delete(requestId);
        resolve(null);
      }, timeout);
      diagnosticStatusRequests.set(requestId, value => {
        clearTimeout(timer);
        diagnosticStatusRequests.delete(requestId);
        resolve(value || null);
      });
    });
  }

  window.addEventListener("message", event => {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || msg?.source !== "ddb-qol-page") return;
    if (msg.type === "DIAGNOSTIC_STATUS") {
      diagnosticStatusRequests.get(String(msg.requestId || ""))?.(msg.status || null);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "DDB_QOL_GET_STATUS") return;
    (async () => {
      const mapsPage = isMapsPage();
      const createPage = location.pathname.includes("/homebrew/creations/create-monster/create");
      const editPage = /\/homebrew\/creations\/monsters\/\d+-[^/]+\/edit/i.test(location.pathname);
      const bridge = mapsPage ? await requestBridgeDiagnosticStatus().catch(() => null) : null;
      const mapsDetected = mapsPage && ([...document.querySelectorAll("canvas")].some(isVisible) || Boolean(findCurrentMapSelector()));
      sendResponse({
        ok: true,
        page: mapsPage ? "maps" : (createPage ? "homebrew-create" : (editPage ? "homebrew-edit" : "ddb")),
        mapsDetected,
        gameLogReady: Boolean(mapsPage && bridge?.bridgeLoaded && SETTINGS.damageApplicator !== false),
        mapSocketReady: Boolean(bridge?.mapSocketReady),
        stickerDropReady: SETTINGS.customStickers === false ? null : Boolean(bridge?.stickerDropReady),
        stickerCalibrationAnchors: Number(bridge?.calibrationAnchors || 0),
        importerAvailable: Boolean(SETTINGS.hbButtons !== false && (mapsPage || createPage || editPage)),
        settings: {
          hbButtons: SETTINGS.hbButtons !== false,
          damageApplicator: SETTINGS.damageApplicator !== false,
          extendedBestiary: SETTINGS.extendedBestiary !== false,
          mapSearch: SETTINGS.mapSearch !== false,
          customStickers: SETTINGS.customStickers !== false
        }
      });
    })().catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  let observerScheduled = false;
  const observer = new MutationObserver(() => {
    if (observerScheduled) return;
    observerScheduled = true;
    setTimeout(() => {
      observerScheduled = false;
      injectMonsterHbButtons();
      injectMonster5eToolsButtons();
      injectDamageButtons();
      wireHpPrefillTargets();
      installHpPrefillCapture();
      syncQuickHpHud();
      injectMapSearch();
      injectCustomStickerUi();
      styleHomebrewStatblockHeadings();
      if (location.pathname.includes("/homebrew/creations/create-monster/create")) makeImporterPanel();
    }, 180);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  (async () => {
    try {
      const stored = await getStorage(SETTINGS_KEY);
      SETTINGS = { ...DEFAULT_SETTINGS, ...(stored || {}) };
    } catch (_e) {}
    injectMonsterHbButtons();
    injectMonster5eToolsButtons();
    injectDamageButtons();
    wireHpPrefillTargets();
    installHpPrefillCapture();
    syncQuickHpHud();
    injectMapSearch();
    injectCustomStickerUi();
    styleHomebrewStatblockHeadings();
    if (location.pathname.includes("/homebrew/creations/create-monster/create")) makeImporterPanel();
    if (/\/homebrew\/creations\/monsters\/\d+-[^/]+\/edit/i.test(location.pathname)) {
      setTimeout(resumePendingImport, 800);
    }

    // The loader is only useful when startup is perceptibly slow. On Maps, wait
    // briefly for the map surface and the optional sticker launcher before hiding it.
    if (isMapsPage()) {
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const mapSurfaceReady = [...document.querySelectorAll("canvas")].some(isVisible) || Boolean(findCurrentMapSelector());
        const stickerReady = SETTINGS.customStickers === false || placeStickerLauncherInToolbar();
        if (mapSurfaceReady && stickerReady) break;
        await sleep(120);
      }
    }
    window.postMessage({ source: "ddb-qol-content", type: "EXTENSION_READY" }, location.origin);
  })();
})();
