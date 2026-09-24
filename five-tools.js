(() => {
  "use strict";
  console.info("[DDB QoL] 5etools bridge v0.3.15 carregado em", location.href);

  const BUTTON_ID = "ddb-qol-open-hb";
  const PREFILL_KEY = "ddbQolMonsterPrefillV2";
  const HOMEBREW_CREATE_URL = "https://www.dndbeyond.com/homebrew/creations/create-monster/create";

  function decodePart(value) {
    try { return decodeURIComponent(String(value || "")); } catch (_e) { return String(value || ""); }
  }

  function currentMonster() {
    const rawHash = String(location.hash || "").replace(/^#/, "").split(",")[0];
    if (!rawHash) return null;

    const decoded = decodePart(rawHash);
    const splitAt = decoded.lastIndexOf("_");
    if (splitAt <= 0) return null;

    const rawName = decoded.slice(0, splitAt).replace(/\+/g, " ").trim();
    const source = decoded.slice(splitAt + 1).trim();
    if (!rawName || !source) return null;

    return {
      name: rawName.replace(/\s+/g, " "),
      source,
      hash: rawHash
    };
  }


  function applyRequestedSearch() {
    const query = new URLSearchParams(location.search).get("ddbQolSearch")?.trim();
    if (!query) return;
    const inputs = [...document.querySelectorAll('input[type="search"], input')];
    const input = inputs.find(el => {
      const hint = `${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
      return hint.includes("search") || hint.includes("lst__search");
    });
    if (!input || input.dataset.ddbQolSearchApplied === query) return;
    input.dataset.ddbQolSearchApplied = query;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, query); else input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }

  function ensureButton() {
    if (!/\/bestiary\.html$/i.test(location.pathname)) return;
    const statsNameButton = document.querySelector(".ve-stats__btn-stats-name");
    const host = document.querySelector("#tabs-right")
      || document.querySelector("#stat-tabs")
      || statsNameButton?.parentElement
      || document.querySelector("#pagecontent")?.firstElementChild;
    if (!host) return;

    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.className = "ve-btn ve-btn-default ve-btn-xs no-print";
      button.style.marginLeft = "8px";
      button.style.whiteSpace = "nowrap";
      button.textContent = "DDB HB ↗";
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const monster = currentMonster();
        if (!monster) return;

        const payload = {
          name: monster.name,
          query: monster.name,
          source: monster.source,
          hash: monster.hash,
          from: "5etools",
          createdAt: Date.now()
        };
        await chrome.storage.local.set({ [PREFILL_KEY]: payload });
        const target = `${HOMEBREW_CREATE_URL}?ddbQolSearch=${encodeURIComponent(monster.name)}&ddbQolSource=${encodeURIComponent(monster.source)}`;
        window.open(target, "_blank", "noopener");
      });
      host.appendChild(button);
    }

    const monster = currentMonster();
    button.disabled = !monster;
    button.title = monster
      ? `Criar ${monster.name} (${monster.source}) no D&D Beyond Homebrew`
      : "Selecione um monstro primeiro";
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyRequestedSearch();
      ensureButton();
    });
  };

  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
