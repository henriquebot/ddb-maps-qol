(() => {
  "use strict";

  const REQUEST_SOURCE = "ddb-qol-5etools-content";
  const RESPONSE_SOURCE = "ddb-qol-5etools-page";

  function getRenderedMonster() {
    return globalThis.bestiaryPage?._lastRender?.entity
      || globalThis.dbg_page?._lastRender?.entity
      || null;
  }

  function cloneForTransfer(value) {
    if (!value || typeof value !== "object") return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return null;
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== REQUEST_SOURCE || message.type !== "GET_RENDERED_MONSTER") return;

    const requestId = String(message.requestId || "");
    if (!requestId) return;

    const monster = cloneForTransfer(getRenderedMonster());
    window.postMessage({
      source: RESPONSE_SOURCE,
      type: "RENDERED_MONSTER_RESULT",
      requestId,
      ok: Boolean(monster),
      monster,
      error: monster ? "" : "O 5etools ainda não expôs a criatura renderizada."
    }, location.origin);
  });
})();
