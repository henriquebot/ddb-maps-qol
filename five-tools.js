(() => {
  "use strict";
  console.info("[DDB QoL] 5etools bridge v0.3.15 carregado em", location.href);

  const BUTTON_ID = "ddb-qol-open-hb";
  const PREFILL_KEY = "ddbQolMonsterPrefillV2";
  const HOMEBREW_CREATE_URL = "https://www.dndbeyond.com/homebrew/creations/create-monster/create";
  const PAGE_REQUEST_SOURCE = "ddb-qol-5etools-content";
  const PAGE_RESPONSE_SOURCE = "ddb-qol-5etools-page";
  const renderedMonsterRequests = new Map();

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== PAGE_RESPONSE_SOURCE || message.type !== "RENDERED_MONSTER_RESULT") return;
    const requestId = String(message.requestId || "");
    const resolve = renderedMonsterRequests.get(requestId);
    if (!resolve) return;
    renderedMonsterRequests.delete(requestId);
    resolve(message);
  });

  function requestRenderedMonster(timeout = 1800) {
    const requestId = `monster-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        renderedMonsterRequests.delete(requestId);
        resolve({ ok: false, error: "O 5etools não respondeu a tempo." });
      }, timeout);
      renderedMonsterRequests.set(requestId, result => {
        clearTimeout(timer);
        resolve(result);
      });
      window.postMessage({
        source: PAGE_REQUEST_SOURCE,
        type: "GET_RENDERED_MONSTER",
        requestId
      }, location.origin);
    });
  }

  function decodePart(value) {
    try { return decodeURIComponent(String(value || "")); } catch (_e) { return String(value || ""); }
  }

  function currentMonster() {
    const hashParts = String(location.hash || "").replace(/^#/, "").split(",");
    const rawHash = hashParts[0];
    if (!rawHash) return null;

    const scaledPart = hashParts.slice(1)
      .map(decodePart)
      .find(part => /^scaled=/i.test(part));
    const scaledCr = scaledPart ? Number(scaledPart.split("=").slice(1).join("=")) : null;

    const decoded = decodePart(rawHash);
    const splitAt = decoded.lastIndexOf("_");
    if (splitAt <= 0) return null;

    const rawName = decoded.slice(0, splitAt).replace(/\+/g, " ").trim();
    const source = decoded.slice(splitAt + 1).trim();
    if (!rawName || !source) return null;

    return {
      name: rawName.replace(/\s+/g, " "),
      source,
      hash: rawHash,
      scaledCr: Number.isFinite(scaledCr) ? scaledCr : null
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

        const renderedResult = await requestRenderedMonster();
        const renderedMonster = renderedResult?.ok && renderedResult.monster
          && String(renderedResult.monster.name || "").trim().toLowerCase() === monster.name.toLowerCase()
          && String(renderedResult.monster.source || "").trim().toLowerCase() === monster.source.toLowerCase()
          ? renderedResult.monster
          : null;

        const payload = {
          name: monster.name,
          query: monster.name,
          source: monster.source,
          hash: monster.hash,
          scaledCr: renderedMonster?._scaledCr ?? monster.scaledCr ?? null,
          renderedMonster,
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
      ? `Criar ${monster.name} (${monster.source})${monster.scaledCr != null ? ` escalado para CR ${monster.scaledCr}` : ""} no D&D Beyond Homebrew`
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
