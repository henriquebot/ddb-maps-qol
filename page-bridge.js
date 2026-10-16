(() => {
  "use strict";

  const MARKER_ATTR = "data-ddb-qol-damage-message";
  const ID_ATTR = "data-ddb-qol-damage-message-id";
  let scheduled = false;
  const postedDamageIds = new Set();
  const postedRollIds = new Set();
  let latestDamageCompact = null;
  let latestDamageStamp = -Infinity;
  const entityIndex = new Map();
  const entityByAnyId = new Map();
  const runtimeSceneTokenIndex = new Map();
  const mapMetaIndex = new Map();
  let activeSceneIdentity = "";
  let activeSceneEpoch = 0;

  // Lightweight startup indicator. It is delayed to avoid a distracting flash on
  // fast loads and removed as soon as the isolated-world content script reports ready.
  const STARTUP_LOADER_ID = "ddb-qol-startup-loader";
  const STARTUP_LOADER_STYLE_ID = "ddb-qol-startup-loader-style";
  let startupLoaderShowTimer = null;
  let startupLoaderFailsafeTimer = null;

  function removeStartupLoader() {
    clearTimeout(startupLoaderShowTimer);
    clearTimeout(startupLoaderFailsafeTimer);
    document.getElementById(STARTUP_LOADER_ID)?.remove();
    document.getElementById(STARTUP_LOADER_STYLE_ID)?.remove();
  }

  function showStartupLoader() {
    if (!/^\/games\/\d+/i.test(location.pathname) || document.getElementById(STARTUP_LOADER_ID)) return;
    const host = document.body || document.documentElement;
    if (!host) return;

    if (!document.getElementById(STARTUP_LOADER_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STARTUP_LOADER_STYLE_ID;
      style.textContent = `
        @keyframes ddbQolStartupSlide {
          0% { transform: translateX(-130%); }
          55% { transform: translateX(120%); }
          100% { transform: translateX(250%); }
        }
        #${STARTUP_LOADER_ID} {
          position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
          width: min(240px, 42vw); height: 5px; overflow: hidden;
          border-radius: 999px; background: rgba(12, 14, 17, .68);
          box-shadow: 0 1px 7px rgba(0,0,0,.38); z-index: 2147483646;
          pointer-events: none;
        }
        #${STARTUP_LOADER_ID} > span {
          display: block; width: 42%; height: 100%; border-radius: inherit;
          background: rgba(232, 190, 84, .96);
          animation: ddbQolStartupSlide .9s ease-in-out infinite;
          will-change: transform;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    const loader = document.createElement("div");
    loader.id = STARTUP_LOADER_ID;
    loader.setAttribute("aria-hidden", "true");
    loader.innerHTML = "<span></span>";
    host.appendChild(loader);
  }

  if (/^\/games\/\d+/i.test(location.pathname)) {
    startupLoaderShowTimer = setTimeout(showStartupLoader, 350);
    startupLoaderFailsafeTimer = setTimeout(removeStartupLoader, 8000);
    window.addEventListener("message", event => {
      if (event.source === window && event.origin === location.origin && event.data?.source === "ddb-qol-content" && event.data?.type === "EXTENSION_READY") {
        removeStartupLoader();
      }
    });
  }

  function sceneIdentityFromMessage(msg) {
    if (!msg || typeof msg !== "object") return "";
    const candidates = [
      msg.scenarioId,
      msg.payload?.scenarioId,
      msg.payload?.scenario?.id,
      msg.payload?.scenario?.scenarioId,
      msg.payload?.game?.scenarioId,
      msg.payload?.state?.scenarioId,
      msg.state?.scenarioId,
      msg.game?.scenarioId,
      msg.data?.scenarioId,
      msg.data?.scenario?.id
    ];
    const value = candidates.find(v => v != null && String(v).trim());
    return value == null ? "" : String(value);
  }

  function syncSceneIdentity(msg) {
    const next = sceneIdentityFromMessage(msg);
    if (!next) return;
    if (activeSceneIdentity && next !== activeSceneIdentity) {
      runtimeSceneTokenIndex.clear();
      activeSceneEpoch++;
    }
    activeSceneIdentity = next;
  }

  function removeRuntimeSceneTokenIds(ids) {
    const wanted = new Set((Array.isArray(ids) ? ids : [ids]).filter(v => v != null).map(String));
    if (!wanted.size) return;
    for (const [key, item] of runtimeSceneTokenIndex) {
      if (wanted.has(String(item?.tokenId || item?.id || key))) runtimeSceneTokenIndex.delete(key);
    }
  }

  function observeSceneLifecycleMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    syncSceneIdentity(msg);
    const type = String(msg?.type || "").toUpperCase();
    if (type === "TOKEN_DELETE") removeRuntimeSceneTokenIds(msg?.payload?.id ?? msg?.payload);
    if (type === "MULTI_SELECT_DELETE" && Array.isArray(msg?.payload)) removeRuntimeSceneTokenIds(msg.payload);

    // HP updates are commonly sent as a small TOKEN_SET_HP_INFO patch rather
    // than a full token snapshot. Keep the scene cache in sync so the Damage
    // Applicator can show HP without requiring the native HP flyout to be open.
    if (type === "TOKEN_SET_HP_INFO" && msg?.payload && typeof msg.payload === "object") {
      const tokenId = String(msg.payload.id ?? msg.payload.tokenId ?? "");
      const hp = tokenHpFromValue(msg.payload) || tokenHpFromValue(msg.payload.hpInfo || {});
      if (tokenId && hp) {
        for (const [key, item] of runtimeSceneTokenIndex) {
          if (String(item?.tokenId || item?.id || key) !== tokenId) continue;
          runtimeSceneTokenIndex.set(key, { ...item, hp, seenAt: Date.now() });
        }
      }
    }

    if (/^(?:SET_IS_LOADING|MAP_CHANGE|SCENARIO_CHANGE)$/.test(type) && msg?.payload === true) {
      runtimeSceneTokenIndex.clear();
      activeSceneEpoch++;
    }
  }


  function isDamageMessage(message) {
    return Boolean(
      message?.id &&
      Array.isArray(message?.data?.rolls) &&
      message.data.rolls.some(roll => String(roll?.rollType || "").trim().toLowerCase() === "damage")
    );
  }

  function parseHpText(text) {
    const clean = String(text || "").replace(/,/g, "");
    let m = clean.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    if (m) return { current: Number(m[1]), max: Number(m[2]) };
    m = clean.match(/\bHP\s*(\d+)\s*(?:\/|of)\s*(\d+)\b/i);
    return m ? { current: Number(m[1]), max: Number(m[2]) } : null;
  }

  function hpRow(button) {
    let cur = button;
    for (let i = 0; cur && i < 8; i++, cur = cur.parentElement) {
      const text = String(cur.innerText || cur.textContent || "");
      const rect = cur.getBoundingClientRect?.() || { width: 0, height: 0 };
      if (parseHpText(text) && rect.height >= 34 && rect.height <= 240 && rect.width >= 120) return cur;
    }
    return button?.parentElement || button || null;
  }

  function hpTargetName(row) {
    return String(row?.innerText || "")
      .split(/\n+/).map(line => line.trim()).filter(Boolean)
      .filter(line => !parseHpText(line))
      .filter(line => !/^(damage|heal|temp hp|override max hp|hp|initiative|remove|open)/i.test(line))
      .filter(line => !/^[-+]?\d+$/.test(line))[0] || "";
  }

  function reactRoots(el) {
    const roots = [];
    for (let cur = el, i = 0; cur && i < 5; i++, cur = cur.parentElement) {
      let keys = [];
      try { keys = Object.keys(cur); } catch {}
      for (const key of keys) {
        if (!key.startsWith("__reactProps$") && !key.startsWith("__reactFiber$")) continue;
        try { roots.push(cur[key]); } catch {}
      }
    }
    return roots;
  }

  function normalizeIndexName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function numericId(value) {
    return value != null && /^\d+$/.test(String(value)) ? String(value) : "";
  }

  function directEntityIds(value) {
    if (!value || typeof value !== "object") return { monsterId: "", characterId: "" };
    const entityType = normalizeIndexName(
      value?.entityType || value?.type || value?.entity?.type || value?.definition?.entityType ||
      value?.gameElementType || value?.contentType || ""
    );

    let monsterId =
      numericId(value?.monsterId) ||
      numericId(value?.monsterDefinitionId) ||
      numericId(value?.monsterEntityId) ||
      numericId(value?.monster?.id) ||
      numericId(value?.monster?.definitionId) ||
      numericId(value?.definition?.monsterId);

    let characterId =
      numericId(value?.characterId) ||
      numericId(value?.characterEntityId) ||
      numericId(value?.playerCharacterId) ||
      numericId(value?.character?.id);

    if (!monsterId && /(monster|creature|npc)/.test(entityType)) {
      monsterId =
        numericId(value?.definitionId) ||
        numericId(value?.entityId) ||
        numericId(value?.gameElementId) ||
        numericId(value?.definition?.id);
    }
    if (!characterId && /(character|player character|pc)/.test(entityType)) {
      characterId =
        numericId(value?.entityId) ||
        numericId(value?.gameElementId) ||
        numericId(value?.definitionId);
    }
    return { monsterId, characterId };
  }

  function indexEntityCandidate(value, source = "") {
    if (!value || typeof value !== "object") return;
    const name = String(
      value?.name || value?.displayName || value?.tokenName ||
      value?.definition?.name || value?.monster?.name || value?.character?.name || ""
    ).trim();
    if (!name) return;
    const ids = directEntityIds(value);
    const damageAdjustments = value?.damageAdjustments
      || value?.definition?.damageAdjustments
      || value?.monster?.damageAdjustments
      || value?.stats?.damageAdjustments
      || null;
    if (!ids.monsterId && !ids.characterId && !Array.isArray(damageAdjustments)) return;
    const key = normalizeIndexName(name);
    const prev = entityIndex.get(key) || { monsterId: "", characterId: "", damageAdjustments: null, score: -1, source: "" };
    let score = 1;
    if (ids.monsterId || ids.characterId) score += 3;
    if (Array.isArray(damageAdjustments) && damageAdjustments.length) score += 4;
    if (value?.definition || value?.monster || value?.character) score += 2;
    if (value?.entityId || value?.gameElementId) score += 1;
    const merged = {
      ...prev,
      name: name || prev.name || "",
      monsterId: ids.monsterId || prev.monsterId || "",
      characterId: ids.characterId || prev.characterId || "",
      damageAdjustments: (Array.isArray(damageAdjustments) && damageAdjustments.length) ? damageAdjustments : prev.damageAdjustments,
      score: Math.max(prev.score, score),
      source: score >= prev.score ? source : prev.source
    };
    entityIndex.set(key, merged);

    const anyIds = [
      value?.id, value?.tokenId, value?.entityId, value?.gameElementId, value?.definitionId,
      value?.monsterId, value?.monsterDefinitionId, value?.characterId,
      value?.definition?.id, value?.monster?.id, value?.character?.id
    ].filter(v => v != null && String(v).trim());
    for (const rawId of anyIds) {
      const idKey = String(rawId);
      const prevById = entityByAnyId.get(idKey) || {};
      entityByAnyId.set(idKey, {
        ...prevById,
        ...merged,
        name: name || prevById.name || ""
      });
    }
  }


  function harvestEntities(root, source = "runtime", maxDepth = 10, budgetLimit = 30000) {
    if (!root || typeof root !== "object") return;
    const seen = new WeakSet();
    let budget = budgetLimit;
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > maxDepth || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      indexEntityCandidate(value, source);
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 400)) walk(child, depth + 1);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    walk(root, 0);
  }

  function entityIdsForRow(row, wantedName = "") {
    const wanted = normalizeIndexName(wantedName);
    const seen = new WeakSet();
    let best = { score: -1, monsterId: "", characterId: "" };
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 10 || seen.has(value)) return;
      seen.add(value);
      indexEntityCandidate(value, "hp-row");
      const name = normalizeIndexName(value?.name || value?.displayName || value?.definition?.name || value?.monster?.name || value?.character?.name);
      const ids = directEntityIds(value);
      if (ids.monsterId || ids.characterId) {
        let score = 1;
        if (wanted && name === wanted) score += 10;
        else if (wanted && name && (name.includes(wanted) || wanted.includes(name))) score += 4;
        if (value?.definition || value?.monster || value?.character) score += 2;
        if (score > best.score) best = { score, ...ids };
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    for (const root of reactRoots(row)) walk(root, 0);

    if (best.score >= 0) return best;
    const indexed = entityIndex.get(wanted);
    return indexed ? { score: indexed.score, monsterId: indexed.monsterId || "", characterId: indexed.characterId || "" } : best;
  }

  function refreshGlobalEntityIndex() {
    const roots = [];
    const unique = new Set();
    for (const el of document.querySelectorAll('[role="dialog"],aside,[class*="sidebar" i],[class*="encounter" i],[class*="token" i],body')) {
      for (const root of reactRoots(el)) {
        if (!root || unique.has(root)) continue;
        unique.add(root);
        roots.push(root);
        if (roots.length >= 8) break;
      }
      if (roots.length >= 8) break;
    }
    for (const root of roots) harvestEntities(root, "react-global", 8, 9000);
  }

  function defensePayloadFromRow(row, wantedName = "") {
    const wanted = normalizeIndexName(wantedName).replace(/\s+[a-z0-9]+$/i, "");
    const seen = new WeakSet();
    let best = null;
    let budget = 16000;
    const scoreName = value => {
      const name = normalizeIndexName(value?.name || value?.displayName || value?.tokenName || value?.definition?.name || value?.monster?.name || "");
      if (!name) return 0;
      if (name === normalizeIndexName(wantedName)) return 8;
      if (wanted && (name === wanted || name.includes(wanted) || wanted.includes(name))) return 5;
      return 1;
    };
    const walk = (value, depth = 0, inheritedScore = 0) => {
      if (!value || typeof value !== "object" || depth > 10 || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      const localScore = Math.max(inheritedScore, scoreName(value));
      const raw = value?.damageAdjustments || value?.definition?.damageAdjustments || value?.monster?.damageAdjustments || value?.stats?.damageAdjustments;
      if (Array.isArray(raw) && raw.length) {
        const score = localScore + (value?.definition ? 2 : 0);
        if (!best || score > best.score) best = { score, raw };
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1, localScore);
      }
    };
    for (const root of reactRoots(row)) walk(root, 0, 0);
    if (!best?.raw) return "";
    try {
      const text = JSON.stringify(best.raw);
      return text.length <= 12000 ? text : "";
    } catch {
      return "";
    }
  }

  function markHpTargets() {
    refreshGlobalEntityIndex();
    const seen = new Set();
    for (const button of document.querySelectorAll("button")) {
      const hp = parseHpText(button.innerText || button.textContent || button.getAttribute("aria-label") || button.title);
      if (!hp) continue;
      const row = hpRow(button);
      if (!row || seen.has(row)) continue;
      seen.add(row);
      const ids = entityIdsForRow(row, hpTargetName(row));
      if (ids.monsterId) {
        row.setAttribute("data-ddb-qol-monster-id", ids.monsterId);
        button.setAttribute("data-ddb-qol-monster-id", ids.monsterId);
      }
      if (ids.characterId) {
        row.setAttribute("data-ddb-qol-character-id", ids.characterId);
        button.setAttribute("data-ddb-qol-character-id", ids.characterId);
      }
      if (ids.monsterId || ids.characterId) {
        row.setAttribute("data-ddb-qol-entity-source", entityIndex.get(normalizeIndexName(hpTargetName(row)))?.source || "row");
      }
      let defensePayload = defensePayloadFromRow(row, hpTargetName(row));
      if (!defensePayload) {
        const indexed = entityIndex.get(normalizeIndexName(hpTargetName(row)));
        if (Array.isArray(indexed?.damageAdjustments) && indexed.damageAdjustments.length) {
          try {
            const text = JSON.stringify(indexed.damageAdjustments);
            if (text.length <= 12000) defensePayload = text;
          } catch {}
        }
      }
      if (defensePayload) {
        row.setAttribute("data-ddb-qol-damage-adjustments", defensePayload);
        button.setAttribute("data-ddb-qol-damage-adjustments", defensePayload);
      }
    }
  }

  function compactMessage(message) {
    return {
      id: message.id,
      dateTime: message.dateTime,
      gameId: message.gameId,
      userId: message.userId,
      source: message.source,
      data: {
        action: message?.data?.action || "",
        context: message?.data?.context || null,
        rollId: message?.data?.rollId || null,
        setId: message?.data?.setId || null,
        rolls: message?.data?.rolls || []
      },
      entityId: message.entityId,
      entityType: message.entityType,
      eventType: message.eventType,
      messageScope: message.messageScope,
      messageTarget: message.messageTarget,
      persist: message.persist
    };
  }

  function directMessages(props) {
    return [
      props?.message,
      props?.children?.props?.message,
      props?.children?.message,
      props?.children?.props?.children?.props?.message,
      props?.props?.message
    ].filter(Boolean);
  }

  function damageMessageStamp(message, fallback = 0) {
    const raw = message?.dateTime ?? message?.data?.dateTime ?? message?.createdAt ?? message?.timestamp;
    const parsed = typeof raw === "number" ? raw : (raw ? Date.parse(raw) : NaN);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function markDamageMessages() {
    const seenIds = new Set();

    for (const el of document.querySelectorAll("*")) {
      let keys;
      try { keys = Object.keys(el); } catch { continue; }
      const reactKeys = keys.filter(key => key.startsWith("__reactProps$"));
      if (!reactKeys.length) continue;

      for (const key of reactKeys) {
        let props;
        try { props = el[key]; } catch { continue; }
        for (const message of directMessages(props)) {
          if (!message?.id || !Array.isArray(message?.data?.rolls) || !message.data.rolls.length) continue;
          const compact = compactMessage(message);
          if (!postedRollIds.has(message.id)) {
            postedRollIds.add(message.id);
            postBridge("GAME_LOG_ROLL", { message: compact });
          }
          if (!isDamageMessage(message) || seenIds.has(message.id)) continue;
          seenIds.add(message.id);
          try {
            el.setAttribute(ID_ATTR, String(message.id));
            el.setAttribute(MARKER_ATTR, JSON.stringify(compact));
          } catch {}
          const stamp = damageMessageStamp(message, Date.now());
          if (!latestDamageCompact || stamp >= latestDamageStamp) {
            latestDamageCompact = compact;
            latestDamageStamp = stamp;
          }
          if (!postedDamageIds.has(message.id)) {
            postedDamageIds.add(message.id);
            postBridge("GAME_LOG_DAMAGE", { message: compact });
          }
        }
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      markDamageMessages();
      markHpTargets();
    }, 80);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  window.addEventListener("focus", schedule);
  schedule();
  setInterval(() => { markDamageMessages(); markHpTargets(); }, 1200);


  // Maps native WebSocket bridge
  // Runs in MAIN world so it can reuse the exact socket opened by D&D Beyond.
  let ddbMapSocket = null;
  let ddbMapClientId = null;
  let ddbMapActionIndex = 0;
  const observedSockets = new WeakSet();
  const originalWsSend = WebSocket.prototype.send;

  // Lightweight diagnostics for intermittent Maps disconnects/performance stalls.
  // No message payloads, campaign IDs, token IDs, or player data are recorded.
  const ddbDiag = {
    startedAt: Date.now(),
    socketsObserved: 0,
    opens: 0,
    closes: 0,
    errors: 0,
    incoming: 0,
    outgoing: 0,
    incomingWorkMs: 0,
    outgoingWorkMs: 0,
    incomingMaxMs: 0,
    outgoingMaxMs: 0,
    lastMessageAt: 0,
    lastClose: null
  };

  function ddbDiagLog(event, extra = {}) {
    try {
      console.info("[DDB QoL DIAG]", event, {
        at: new Date().toISOString(),
        ...extra
      });
    } catch {}
  }

  function ddbDiagWork(direction, startedAt) {
    const elapsed = Math.max(0, performance.now() - startedAt);
    if (direction === "incoming") {
      ddbDiag.incoming++;
      ddbDiag.incomingWorkMs += elapsed;
      ddbDiag.incomingMaxMs = Math.max(ddbDiag.incomingMaxMs, elapsed);
    } else {
      ddbDiag.outgoing++;
      ddbDiag.outgoingWorkMs += elapsed;
      ddbDiag.outgoingMaxMs = Math.max(ddbDiag.outgoingMaxMs, elapsed);
    }
    ddbDiag.lastMessageAt = Date.now();
  }

  if (/^\/games\/\d+/i.test(location.pathname)) {
    setInterval(() => {
      ddbDiagLog("summary", {
        uptimeSec: Math.round((Date.now() - ddbDiag.startedAt) / 1000),
        socketReady: Boolean(ddbMapSocket?.readyState === WebSocket.OPEN && ddbMapClientId),
        socketsObserved: ddbDiag.socketsObserved,
        opens: ddbDiag.opens,
        closes: ddbDiag.closes,
        errors: ddbDiag.errors,
        incoming: ddbDiag.incoming,
        outgoing: ddbDiag.outgoing,
        incomingWorkMs: Math.round(ddbDiag.incomingWorkMs),
        outgoingWorkMs: Math.round(ddbDiag.outgoingWorkMs),
        incomingMaxMs: Math.round(ddbDiag.incomingMaxMs * 10) / 10,
        outgoingMaxMs: Math.round(ddbDiag.outgoingMaxMs * 10) / 10,
        lastMessageAgoMs: ddbDiag.lastMessageAt ? Date.now() - ddbDiag.lastMessageAt : null,
        lastClose: ddbDiag.lastClose
      });
    }, 10000);
  }

  function sendNativeMapAction(type, payload, state = "FULFILLED") {
    if (!ddbMapSocket || ddbMapSocket.readyState !== WebSocket.OPEN || !ddbMapClientId) return false;
    const msg = {
      type,
      meta: {
        source: "CLIENT",
        clientNow: Date.now(),
        clientActionIndex: ++ddbMapActionIndex,
        clientId: ddbMapClientId
      },
      payload
    };
    if (state != null && state !== "") msg.state = state;
    try {
      originalWsSend.call(ddbMapSocket, JSON.stringify(msg));
      return true;
    } catch { return false; }
  }

  function sendTokenHpUpdate(requestId, payload = {}) {
    const tokenId = String(payload?.id || payload?.tokenId || "").trim();
    const rawHp = payload?.hpInfo || {};
    const current = Number(rawHp.current);
    const max = Number(rawHp.max);
    const temp = Number(rawHp.temp ?? 0);
    const rawOverride = rawHp.maxOverride;
    const maxOverride = rawOverride == null || rawOverride === "" ? null : Number(rawOverride);

    if (!tokenId || !Number.isFinite(current) || !Number.isFinite(max)) {
      postBridge("TOKEN_HP_UPDATE_RESULT", { requestId, ok: false, error: "Token/HP inválido para atualização nativa." });
      return;
    }

    const hpInfo = {
      current: Math.max(0, Math.floor(current)),
      max: Math.max(0, Math.floor(max)),
      maxOverride: Number.isFinite(maxOverride) ? Math.max(0, Math.floor(maxOverride)) : null,
      temp: Number.isFinite(temp) ? Math.max(0, Math.floor(temp)) : 0
    };
    const actionPayload = { id: tokenId, hpInfo };

    // SET_TOKEN_BORDER_COLOR and TOKEN_SET_HP_INFO are immediate token patches;
    // unlike TOKEN_MOVE they do not need a PENDING/FULFILLED pair.
    const ok = sendNativeMapAction("TOKEN_SET_HP_INFO", actionPayload, null);
    if (ok) observeSceneLifecycleMessage({ type: "TOKEN_SET_HP_INFO", payload: actionPayload });
    postBridge("TOKEN_HP_UPDATE_RESULT", {
      requestId,
      ok,
      hpInfo,
      error: ok ? "" : "Socket do Maps ainda não está pronto para atualizar HP."
    });
  }


  function validWorldPoint(value) {
    if (Array.isArray(value) && value.length >= 2) {
      const x = Number(value[0]), y = Number(value[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    if (value && typeof value === "object") {
      const x = Number(value.x ?? value[0]), y = Number(value.y ?? value[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    return null;
  }

  function parseWsMessage(data) {
    try {
      if (typeof data === "string") return JSON.parse(data);
      if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
    } catch {}
    return null;
  }

  function observeMapSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    ddbDiag.socketsObserved++;
    ddbDiagLog("socket-observed", {
      urlHost: (() => { try { return new URL(socket.url).hostname; } catch { return ""; } })()
    });
    socket.addEventListener("open", () => {
      ddbDiag.opens++;
      ddbDiagLog("socket-open", { readyState: socket.readyState });
    });
    socket.addEventListener("close", event => {
      ddbDiag.closes++;
      ddbDiag.lastClose = {
        at: new Date().toISOString(),
        code: Number(event.code || 0),
        reason: String(event.reason || "").slice(0, 160),
        wasClean: Boolean(event.wasClean)
      };
      ddbDiagLog("socket-close", ddbDiag.lastClose);
    });
    socket.addEventListener("error", () => {
      ddbDiag.errors++;
      ddbDiagLog("socket-error", { readyState: socket.readyState });
    });
    socket.addEventListener("message", event => {
      const workStartedAt = performance.now();
      try {
        const msg = parseWsMessage(event.data);
        if (msg) {
          observeSceneLifecycleMessage(msg);
          harvestEntities(msg, "ws-incoming", 10, 12000);
          harvestSceneTokenCandidates(msg, `ws-incoming:${String(msg?.type || "")}`, 10, 12000);
        }
      } catch (error) {
        ddbDiag.errors++;
        ddbDiagLog("incoming-handler-error", { message: String(error?.message || error).slice(0, 300) });
      } finally {
        ddbDiagWork("incoming", workStartedAt);
      }
    });
  }

  WebSocket.prototype.send = function(data) {
    const isDdbMapSocket = String(this.url || "").includes("games.dndbeyond.com");
    const workStartedAt = isDdbMapSocket ? performance.now() : 0;
    try {
      if (isDdbMapSocket) {
        ddbMapSocket = this;
        observeMapSocket(this);
        const msg = parseWsMessage(data);
        if (msg) {
          observeSceneLifecycleMessage(msg);
          harvestEntities(msg, "ws-outgoing", 10, 12000);
          harvestSceneTokenCandidates(msg, `ws-outgoing:${String(msg?.type || "")}`, 10, 12000);
        }
        if (msg?.meta?.clientId) ddbMapClientId = msg.meta.clientId;
        if (Number.isFinite(Number(msg?.meta?.clientActionIndex))) {
          ddbMapActionIndex = Math.max(ddbMapActionIndex, Number(msg.meta.clientActionIndex));
        }
      }
    } catch (error) {
      if (isDdbMapSocket) {
        ddbDiag.errors++;
        ddbDiagLog("outgoing-handler-error", { message: String(error?.message || error).slice(0, 300) });
      }
    } finally {
      if (isDdbMapSocket) ddbDiagWork("outgoing", workStartedAt);
    }
    return originalWsSend.apply(this, arguments);
  };

  function postBridge(type, extra = {}) {
    try { window.postMessage({ source: "ddb-qol-page", type, ...extra }, location.origin); } catch {}
  }

  function valueName(obj) {
    if (!obj || typeof obj !== "object") return "";
    return String(obj.name || obj.title || obj.label || obj.scenarioName || obj.mapName || obj?.map?.name || obj?.definition?.name || "").trim();
  }

  function createdTime(obj) {
    if (!obj || typeof obj !== "object") return 0;
    const parseDateValue = raw => {
      if (raw == null || raw === "") return 0;
      const text = String(raw).trim();
      const n = typeof raw === "number" ? raw : (/^\d{10,13}$/.test(text) ? Number(text) : Date.parse(text));
      if (!Number.isFinite(n) || n <= 0) return 0;
      return n < 1e12 ? n * 1000 : n;
    };
    const keys = [
      "createdAt", "createdDate", "dateCreated", "createdOn", "createdOnUtc", "createdUtc", "created",
      "creationDate", "creationTime", "creationTimestamp", "createdTimestamp", "timeCreated", "created_at", "date_created",
      "addedAt", "dateAdded", "addedOn", "addedDate", "addedTimestamp",
      "uploadedAt", "uploadedOn", "uploadDate", "dateUploaded", "uploadTimestamp",
      "insertedAt", "insertedOn", "insertedDate", "insertedTimestamp"
    ];
    const scopes = [obj, obj?.metadata, obj?.map, obj?.audit, obj?.definition].filter(Boolean);
    for (const scope of scopes) {
      for (const key of keys) {
        const parsed = parseDateValue(scope?.[key]);
        if (parsed) return parsed;
      }
      for (const [key, raw] of Object.entries(scope || {})) {
        if (!/(?:creat|add|upload|insert).*(?:at|date|time|timestamp)|(?:date|time).*(?:creat|add|upload|insert)/i.test(key)) continue;
        const parsed = parseDateValue(raw);
        if (parsed) return parsed;
      }
    }
    return 0;
  }

  function looksLikeMapObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const name = valueName(obj);
    if (!name) return false;
    const signals = [
      obj.imageKey, obj.thumbnailKey, obj.mapPosition, obj.tokenPosition, obj.imageDimensions,
      obj.zoomFactor, obj.map?.imageKey, obj.map?.thumbnailKey
    ].filter(v => v != null).length;
    return signals >= 2;
  }

  function mapThumbnailUrl(obj) {
    if (!obj || typeof obj !== "object") return "";

    // Root/map metadata often contains a generic "url" that points to an API
    // route or map page rather than an image. Only accept explicitly image-named
    // fields there; generic src/url is trusted only inside thumbnail/image/preview.
    const explicitScopes = [obj, obj?.map, obj?.metadata, obj?.definition].filter(Boolean);
    const explicitKeys = [
      "thumbnailUrl", "thumbnailURL", "thumbUrl", "thumbURL", "previewUrl", "previewURL",
      "imageUrl", "imageURL"
    ];
    for (const scope of explicitScopes) {
      for (const key of explicitKeys) {
        const value = scope?.[key];
        if (typeof value !== "string") continue;
        const url = value.trim();
        if (/^(?:https?:|data:image\/|blob:)/i.test(url)) return url;
      }
    }

    const imageScopes = [obj?.thumbnail, obj?.image, obj?.preview].filter(Boolean);
    const imageKeys = [
      "thumbnailUrl", "thumbnailURL", "thumbUrl", "thumbURL", "previewUrl", "previewURL",
      "imageUrl", "imageURL", "downloadUrl", "downloadURL", "signedUrl", "signedURL", "src", "url"
    ];
    for (const scope of imageScopes) {
      for (const key of imageKeys) {
        const value = scope?.[key];
        if (typeof value !== "string") continue;
        const url = value.trim();
        if (/^(?:https?:|data:image\/|blob:)/i.test(url)) return url;
      }
    }

    const keyAsUrl = [obj?.thumbnailKey, obj?.imageKey, obj?.map?.thumbnailKey, obj?.map?.imageKey]
      .find(value => typeof value === "string" && /^https?:/i.test(value));
    return keyAsUrl ? String(keyAsUrl) : "";
  }

  function mapAssetKeys(obj) {
    if (!obj || typeof obj !== "object") return [];
    const values = [
      obj?.thumbnailKey, obj?.imageKey,
      obj?.map?.thumbnailKey, obj?.map?.imageKey,
      obj?.metadata?.thumbnailKey, obj?.metadata?.imageKey,
      obj?.definition?.thumbnailKey, obj?.definition?.imageKey
    ];
    return [...new Set(values.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))];
  }

  function performanceMapImageForKeys(keys) {
    if (!Array.isArray(keys) || !keys.length) return "";
    let resources = [];
    try {
      resources = performance.getEntriesByType("resource")
        .map(entry => String(entry.name || ""))
        .filter(url => /^https?:/i.test(url));
    } catch {}
    if (!resources.length) return "";

    const decode = value => {
      try { return decodeURIComponent(String(value || "")).replace(/\\u0026/gi, "&"); }
      catch { return String(value || ""); }
    };
    for (const assetKey of keys) {
      const normalizedKey = decode(assetKey).replace(/^\/+/, "");
      const base = normalizedKey.split("/").pop();
      const matched = resources.find(url => {
        const decodedUrl = decode(url);
        return decodedUrl.includes(normalizedKey) || (base && base.length >= 8 && decodedUrl.includes(base));
      });
      if (matched) return matched;
    }
    return "";
  }

  function mapObjectId(obj) {
    if (!obj || typeof obj !== "object") return "";
    const scopes = [obj, obj?.map, obj?.metadata, obj?.definition].filter(Boolean);
    for (const scope of scopes) {
      const raw = scope.id ?? scope.mapId ?? scope.mapID ?? scope.sceneId ?? scope.scenarioId;
      if (raw != null && String(raw).trim()) return String(raw);
    }
    return "";
  }

  function rememberMapMeta(obj, source = "runtime", order = null) {
    if (!looksLikeMapObject(obj)) return;
    const name = valueName(obj);
    const key = normalizeIndexName(name);
    const created = createdTime(obj);
    const prev = mapMetaIndex.get(key) || { id: "", name, created: 0, source: "", order: null, orderSource: "", thumbnailUrl: "", thumbnailKey: "", imageKey: "" };
    const next = { ...prev, name: prev.name || name };
    const objectId = mapObjectId(obj);
    if (objectId && !next.id) next.id = objectId;
    const thumbnailUrl = mapThumbnailUrl(obj);
    if (thumbnailUrl && !next.thumbnailUrl) next.thumbnailUrl = thumbnailUrl;
    if (obj?.thumbnailKey && !next.thumbnailKey) next.thumbnailKey = String(obj.thumbnailKey);
    if (obj?.imageKey && !next.imageKey) next.imageKey = String(obj.imageKey);
    if (obj?.map?.thumbnailKey && !next.thumbnailKey) next.thumbnailKey = String(obj.map.thumbnailKey);
    if (obj?.map?.imageKey && !next.imageKey) next.imageKey = String(obj.map.imageKey);
    if (created && !next.created) {
      next.created = created;
      next.source = source;
    }
    if (order !== null && order !== undefined && order !== "" && Number.isFinite(Number(order)) && next.order == null) {
      next.order = Number(order);
      next.orderSource = source;
    }
    mapMetaIndex.set(key, next);
  }

  function harvestMapMetadata(root, source = "runtime", maxDepth = 10, budgetLimit = 25000) {
    if (!root || typeof root !== "object") return;
    const seen = new WeakSet();
    let budget = budgetLimit;
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > maxDepth || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      if (looksLikeMapObject(value)) rememberMapMeta(value, source);
      if (Array.isArray(value)) {
        value.slice(0, 500).forEach((item, index) => {
          if (looksLikeMapObject(item)) rememberMapMeta(item, source, index);
          walk(item, depth + 1);
        });
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    walk(root, 0);
  }

  function harvestMapMetadataText(text, source = "network-rsc") {
    const original = String(text || "");
    if (!original || original.length > 15_000_000) return;
    const raw = original.includes('\\"') ? original.replace(/\\"/g, '"') : original;
    const nameRe = /["']name["']\s*:\s*["']([^"']{1,140})["']/g;
    const dateKey = "(?:createdAt|createdDate|dateCreated|createdOn|createdOnUtc|createdUtc|created|creationDate|creationTime|creationTimestamp|createdTimestamp|timeCreated|created_at|date_created|addedAt|dateAdded|addedOn|addedDate|addedTimestamp|uploadedAt|uploadedOn|uploadDate|dateUploaded|uploadTimestamp|insertedAt|insertedOn|insertedDate|insertedTimestamp)";
    let match;
    let count = 0;
    while ((match = nameRe.exec(raw)) && count++ < 600) {
      const from = Math.max(0, match.index - 1200);
      const to = Math.min(raw.length, match.index + 2600);
      const chunk = raw.slice(from, to);
      if (!/(imageKey|thumbnailKey|mapPosition|tokenPosition|imageDimensions|zoomFactor|thumbnailUrl|imageUrl|previewUrl)/i.test(chunk)) continue;

      const key = normalizeIndexName(match[1]);
      const prev = mapMetaIndex.get(key) || { id: "", name: match[1], created: 0, source: "", order: null, orderSource: "", thumbnailUrl: "", thumbnailKey: "", imageKey: "" };
      const next = { ...prev };

      const dateMatch = chunk.match(new RegExp(`["']${dateKey}["']\\s*:\\s*["']?([^,"'}\\]\\s]+)`, "i"));
      if (dateMatch && !next.created) {
        const rawDate = dateMatch[1].trim();
        const n = /^\d{10,13}$/.test(rawDate) ? Number(rawDate) : Date.parse(rawDate);
        if (Number.isFinite(n) && n > 0) {
          next.created = n < 1e12 ? n * 1000 : n;
          next.source = source;
        }
      }

      // Thumbnail URLs/keys are intentionally not inferred from this broad text window.
      // Adjacent map records may appear in the same RSC chunk and produce false matches.

      mapMetaIndex.set(key, next);
    }
  }



  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = async function(...args) {
      const response = await nativeFetch.apply(this, args);
      try {
        const url = String(args?.[0]?.url || args?.[0] || "");
        const contentType = String(response.headers?.get?.("content-type") || "");
        const clone = response.clone();
        if (/json/i.test(contentType)) {
          clone.json().then(data => {
            const before = mapMetaIndex.size;
            harvestMapMetadata(data, `fetch:${url}`, 11, 35000);
            harvestEntities(data, `fetch:${url}`, 10, 18000);
            harvestSceneTokenCandidates(data, `fetch:${url}`, 10, 16000);
            setTimeout(annotateMapOrder, 0);
          }).catch(() => {});
        } else if (/text\/x-component|text\/plain/i.test(contentType)) {
          clone.text().then(text => {
            const before = mapMetaIndex.size;
            harvestMapMetadataText(text, `fetch:${url}`);
            setTimeout(annotateMapOrder, 0);
          }).catch(() => {});
        }
      } catch {}
      return response;
    };
  }

  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  const nativeXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    try { this.__ddbQolUrl = String(url || ""); } catch {}
    return nativeXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    try {
      this.addEventListener("load", () => {
        try {
          const url = String(this.__ddbQolUrl || this.responseURL || "");
          const before = mapMetaIndex.size;
          let data = null;
          if (this.responseType === "json") data = this.response;
          else if (!this.responseType || this.responseType === "text") {
            const text = String(this.responseText || "");
            try { data = JSON.parse(text); } catch { harvestMapMetadataText(text, `xhr:${url}`); }
          }
          if (data && typeof data === "object") {
            harvestMapMetadata(data, `xhr:${url}`, 11, 35000);
            harvestEntities(data, `xhr:${url}`, 10, 18000);
            harvestSceneTokenCandidates(data, `xhr:${url}`, 10, 16000);
          }
          setTimeout(annotateMapOrder, 0);
        } catch {}
      }, { once: true });
    } catch {}
    return nativeXhrSend.apply(this, arguments);
  };

  function collectReactRoots(el) {
    const roots = [];
    for (let cur = el, i = 0; cur && i < 5; i++, cur = cur.parentElement) {
      let keys = [];
      try { keys = Object.keys(cur); } catch {}
      for (const key of keys) {
        if (!key.startsWith("__reactProps$") && !key.startsWith("__reactFiber$")) continue;
        try { roots.push(cur[key]); } catch {}
      }
    }
    return roots;
  }

  function findBestMapArray(roots, names) {
    const wanted = new Set(names.map(normalizeIndexName).filter(Boolean));
    const seen = new WeakSet();
    let best = null;
    let budget = 24000;
    const visit = (value, depth) => {
      if (!value || budget-- <= 0 || depth > 10) return;
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        const matches = value.filter(v => wanted.has(normalizeIndexName(valueName(v))));
        if (matches.length >= Math.min(3, wanted.size) && (!best || matches.length > best.matches)) best = { array: value, matches: matches.length };
        for (const item of value.slice(0, 250)) visit(item, depth + 1);
        return;
      }
      for (const key of Object.keys(value).slice(0, 80)) {
        if (key === "return" || key === "child" || key === "sibling" || key === "stateNode" || key === "_owner") continue;
        let next;
        try { next = value[key]; } catch { continue; }
        visit(next, depth + 1);
      }
    };
    for (const root of roots) visit(root, 0);
    return best?.array || null;
  }

  function harvestPerformanceMapImages() {
    let resources = [];
    try { resources = performance.getEntriesByType("resource").map(entry => String(entry.name || "")).filter(url => /^https?:/i.test(url)); } catch {}
    if (!resources.length || !mapMetaIndex.size) return;
    const decode = value => {
      try { return decodeURIComponent(String(value || "")).replace(/\\u0026/gi, "&"); } catch { return String(value || ""); }
    };
    for (const [key, meta] of mapMetaIndex.entries()) {
      if (meta?.thumbnailUrl) continue;
      const candidates = [meta?.thumbnailKey, meta?.imageKey].filter(Boolean).map(decode);
      let matched = "";
      for (const assetKey of candidates) {
        const normalizedKey = assetKey.replace(/^\/+/, "");
        const base = normalizedKey.split("/").pop();
        matched = resources.find(url => {
          const decodedUrl = decode(url);
          return decodedUrl.includes(normalizedKey) || (base && base.length >= 8 && decodedUrl.includes(base));
        }) || "";
        if (matched) break;
      }
      if (matched) mapMetaIndex.set(key, { ...meta, thumbnailUrl: matched });
    }
  }

  function annotateMapOrder() {
    const dropdowns = [...document.querySelectorAll('[class*="dropdownOptions"], [role="listbox"]')];
    for (const dropdown of dropdowns) {
      const labels = [...dropdown.querySelectorAll('label[class*="dropdownOption"], [role="option"]')];
      if (labels.length < 3) continue;
      const names = labels.map(el => String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const roots = collectReactRoots(dropdown);
      for (const root of roots) {
        harvestMapMetadata(root, "react-map-dropdown", 11, 30000);
        harvestEntities(root, "react-map-dropdown", 9, 10000);
      }
      const array = findBestMapArray(roots, names);
      const arrayBuckets = new Map();
      if (array) {
        array.forEach((item, index) => {
          rememberMapMeta(item, "react-map-array", index);
          if (!looksLikeMapObject(item)) return;
          const itemKey = normalizeIndexName(valueName(item));
          if (!itemKey) return;
          const bucket = arrayBuckets.get(itemKey) || [];
          bucket.push(item);
          arrayBuckets.set(itemKey, bucket);
        });
      }
      harvestPerformanceMapImages();

      const nameUseCount = new Map();
      let withDates = 0;
      for (const label of labels) {
        const rawName = String(label.innerText || label.textContent || "").replace(/\s+/g, " ").trim();
        const normalizedName = normalizeIndexName(rawName);
        const bucket = arrayBuckets.get(normalizedName) || [];
        const useIndex = nameUseCount.get(normalizedName) || 0;
        const directItem = bucket[useIndex] || null;
        nameUseCount.set(normalizedName, useIndex + 1);
        if (directItem) rememberMapMeta(directItem, "react-map-label", useIndex);
        const meta = mapMetaIndex.get(normalizedName);
        delete label.dataset.ddbQolMapOrder;
        delete label.dataset.ddbQolMapCreated;
        delete label.dataset.ddbQolMapOrderSource;
        if (meta?.created) {
          label.dataset.ddbQolMapCreated = String(meta.created);
          label.dataset.ddbQolMapDateSource = meta.source || "runtime";
          withDates++;
        }
        if (meta && Number.isFinite(Number(meta.order))) {
          label.dataset.ddbQolMapOrder = String(meta.order);
          label.dataset.ddbQolMapOrderSource = meta.orderSource || "runtime";
        }
        delete label.dataset.ddbQolMapId;
        delete label.dataset.ddbQolMapThumb;
        delete label.dataset.ddbQolMapThumbKey;
        const directId = mapObjectId(directItem);
        const directAssetKeys = mapAssetKeys(directItem);
        const directThumbKey = directAssetKeys[0] || "";
        const directThumb = mapThumbnailUrl(directItem) || performanceMapImageForKeys(directAssetKeys);

        // mapMetaIndex is name-based, so it is safe only when that name identifies
        // one dropdown item (or when its ID agrees with the direct React item).
        const duplicateName = bucket.length > 1;
        const metaId = String(meta?.id || "");
        const metaCompatible = !directId || !metaId || directId === metaId;
        const allowNameFallback = !duplicateName && metaCompatible;
        const fallbackThumb = allowNameFallback ? String(meta?.thumbnailUrl || "") : "";
        const fallbackThumbKey = allowNameFallback ? String(meta?.thumbnailKey || meta?.imageKey || "") : "";
        const fallbackId = allowNameFallback ? metaId : "";

        if (directId || fallbackId) label.dataset.ddbQolMapId = directId || fallbackId;
        if (directThumb || fallbackThumb) label.dataset.ddbQolMapThumb = directThumb || fallbackThumb;
        if (directThumbKey || fallbackThumbKey) label.dataset.ddbQolMapThumbKey = directThumbKey || fallbackThumbKey;
      }
      dropdown.dataset.ddbQolMapDates = String(withDates);
      dropdown.dataset.ddbQolMapTotal = String(labels.length);
      postBridge("MAP_DATE_STATUS", { withDates, total: labels.length });
    }
  }


  // Best-effort scene token snapshot. This lets the content script
  // build the Damage/Save HUD without requiring every HP flyout to be open.
  function firstFiniteNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function tokenHpFromValue(value) {
    if (!value || typeof value !== "object") return null;
    const hpObjects = [
      value.hpInfo, value.hp, value.health, value.hitPoints,
      value.token?.hpInfo, value.token?.hp, value.definition?.hpInfo, value.monster?.hpInfo, value.character?.hpInfo,
      value.currentHp && typeof value.currentHp === "object" ? value.currentHp : null
    ].filter(Boolean);
    for (const hp of hpObjects) {
      if (typeof hp !== "object") continue;
      const current = firstFiniteNumber(hp.current, hp.value, hp.currentHp, hp.currentHitPoints, hp.hitPoints, hp.remaining);
      const max = firstFiniteNumber(hp.max, hp.maximum, hp.maxHp, hp.maxHitPoints, hp.maximumHitPoints, hp.total);
      if (current != null && max != null && max >= 0) {
        const temp = firstFiniteNumber(hp.temp, hp.temporary, hp.tempHp, hp.temporaryHitPoints, 0) ?? 0;
        const maxOverrideRaw = hp.maxOverride ?? hp.override ?? hp.overrideHp ?? hp.overrideHitPoints ?? null;
        const maxOverride = maxOverrideRaw == null || maxOverrideRaw === "" ? null : Number(maxOverrideRaw);
        return {
          current,
          max,
          temp: Number.isFinite(Number(temp)) ? Number(temp) : 0,
          maxOverride: Number.isFinite(maxOverride) ? maxOverride : null
        };
      }
    }
    const current = firstFiniteNumber(value.currentHp, value.currentHP, value.currentHitPoints, value.hitPointsCurrent, value.hpCurrent, value.healthCurrent);
    const max = firstFiniteNumber(value.maxHp, value.maxHP, value.maxHitPoints, value.maximumHitPoints, value.hitPointsMax, value.hpMax, value.healthMax);
    if (current != null && max != null && max >= 0) {
      const temp = firstFiniteNumber(value.tempHp, value.temporaryHitPoints, value.hpTemp, 0) ?? 0;
      return { current, max, temp: Number(temp) || 0, maxOverride: null };
    }
    return null;
  }

  function tokenImageFromValue(value) {
    if (!value || typeof value !== "object") return "";
    const candidates = [
      value.imageUrl, value.avatarUrl, value.tokenUrl, value.thumbnailUrl, value.portraitUrl,
      value.image?.url, value.avatar?.url, value.token?.url, value.definition?.imageUrl,
      value.definition?.avatarUrl, value.definition?.tokenUrl, value.monster?.avatarUrl,
      value.character?.avatarUrl
    ];
    return String(candidates.find(url => typeof url === "string" && /^(?:https?:|data:|blob:)/i.test(url)) || "");
  }

  function tokenIdFromValue(value) {
    if (!value || typeof value !== "object") return "";
    const raw = value.tokenId ?? value.token?.id ?? value.id ?? value.uuid ?? value.entityInstanceId ?? value.instanceId;
    return raw != null && String(raw).trim() ? String(raw) : "";
  }

  function tokenSelectedFromValue(value) {
    if (!value || typeof value !== "object") return false;
    return value.selected === true || value.isSelected === true || value.selectionState === "selected" || value.state?.selected === true;
  }

  function isNonTokenSceneItem(value, source = "") {
    if (!value || typeof value !== "object") return true;
    const sourceText = String(source || "");
    if (/STICKER|OVERLAY|POINT|PING|DRAW|REVEAL|PIN/i.test(sourceText)) return true;

    const kind = [
      value.type, value.kind, value.itemType, value.mapItemType, value.objectType,
      value.entityType, value.gameElementType, value.contentType
    ].filter(v => v != null).map(v => String(v)).join(" ");
    if (/sticker|overlay|point|ping|drawing?|reveal|pin/i.test(kind)) return true;

    // Native stickers commonly look token-like at first glance: id + name +
    // image + position. Their aspect/size/rotation/catalog-key shape is the
    // reliable discriminator in snapshots where the parent event is just SYNC.
    const stickerShape =
      (value.imageKey != null || value.thumbnailKey != null) &&
      value.aspectRatio != null && value.size != null && value.rotation != null &&
      value.entitySizeId == null && value.monsterId == null && value.characterId == null;
    if (stickerShape) return true;

    return false;
  }

  function sceneTokenCandidate(value, source = "", forcedSelected = false) {
    if (!value || typeof value !== "object" || isNonTokenSceneItem(value, source)) return null;
    const position = validWorldPoint(value.position || value.coordinates || value.worldPosition || value.tokenPosition || value.location);
    const hp = tokenHpFromValue(value);
    const ids = directEntityIds(value);
    const tokenId = tokenIdFromValue(value);
    let name = String(value.name || value.displayName || value.tokenName || value.label || value.definition?.name || value.monster?.name || value.character?.name || "").trim();
    if (!name) {
      const lookupIds = [tokenId, ids.monsterId, ids.characterId, value?.entityId, value?.definitionId, value?.gameElementId].filter(Boolean).map(String);
      for (const id of lookupIds) {
        const indexed = entityByAnyId.get(id);
        if (indexed?.name) { name = String(indexed.name).trim(); break; }
      }
    }
    if (!name || name.length > 120) return null;
    // A catalog/Token Browser monster can have an id, image and even HP-like
    // metadata, but it is not a token on the current map. A real Maps token
    // always has a world position in the scene state/events, so position is
    // the hard boundary between scene instances and library/search entries.
    if (!position) return null;

    // Do not accept generic map objects merely because they have id/name/image/
    // position. Require a token/creature-specific signal as well. This is what
    // keeps native stickers (Letter C/I/R etc.) out of the Damage Applicator.
    const tokenSpecificSignal = Boolean(
      hp || ids.monsterId || ids.characterId ||
      value.entitySizeId != null || value.tokenSize != null || value.tokenScale != null ||
      value.fallbackImageUrl || value.definition?.id || value.monster?.id || value.character?.id ||
      /TOKEN/i.test(String(source || ""))
    );
    if (!tokenSpecificSignal) return null;

    const indexedByName = entityIndex.get(normalizeIndexName(name));
    const damageAdjustments = value?.damageAdjustments || value?.definition?.damageAdjustments || value?.monster?.damageAdjustments || value?.stats?.damageAdjustments || indexedByName?.damageAdjustments || null;
    let score = 0;
    if (tokenId) score += 4;
    if (position) score += 4;
    if (hp) score += 4;
    if (ids.monsterId || ids.characterId) score += 3;
    if (tokenImageFromValue(value)) score += 1;
    if (Array.isArray(damageAdjustments) && damageAdjustments.length) score += 2;
    if (score < 5) return null;
    return {
      id: tokenId || `${normalizeIndexName(name)}:${position ? position.join(",") : "entity"}`,
      tokenId,
      name,
      hp,
      imageUrl: tokenImageFromValue(value),
      fallbackImageUrl: String(value?.fallbackImageUrl || value?.definition?.fallbackImageUrl || ""),
      monsterId: ids.monsterId || indexedByName?.monsterId || "",
      characterId: ids.characterId || indexedByName?.characterId || "",
      entitySizeId: firstFiniteNumber(value?.entitySizeId, value?.sizeId, value?.definition?.sizeId),
      tokenSize: firstFiniteNumber(value?.tokenSize),
      hidden: Boolean(value?.hidden),
      damageAdjustments: Array.isArray(damageAdjustments) ? damageAdjustments : [],
      position: position || null,
      selected: Boolean(forcedSelected || tokenSelectedFromValue(value)),
      source,
      score
    };
  }

  function rememberRuntimeSceneToken(item) {
    if (!item?.name) return;
    const key = String(item.tokenId || item.id || `${normalizeIndexName(item.name)}:${item.position ? item.position.join(",") : item.monsterId || item.characterId || ""}`);
    const prev = runtimeSceneTokenIndex.get(key) || {};
    runtimeSceneTokenIndex.set(key, {
      ...prev,
      ...item,
      hp: item.hp || prev.hp || null,
      imageUrl: item.imageUrl || prev.imageUrl || "",
      monsterId: item.monsterId || prev.monsterId || "",
      characterId: item.characterId || prev.characterId || "",
      damageAdjustments: item.damageAdjustments?.length ? item.damageAdjustments : (prev.damageAdjustments || []),
      position: item.position || prev.position || null,
      selected: item.selected ?? prev.selected ?? false,
      sceneIdentity: activeSceneIdentity || prev.sceneIdentity || "",
      sceneEpoch: activeSceneEpoch,
      seenAt: Date.now()
    });
    if (runtimeSceneTokenIndex.size > 600) {
      const old = [...runtimeSceneTokenIndex.entries()].sort((a, b) => Number(a[1]?.seenAt || 0) - Number(b[1]?.seenAt || 0)).slice(0, 120);
      for (const [oldKey] of old) runtimeSceneTokenIndex.delete(oldKey);
    }
  }

  function harvestSceneTokenCandidates(root, source = "runtime", maxDepth = 10, budgetLimit = 18000) {
    if (!root || typeof root !== "object") return;
    const seen = new WeakSet();
    let budget = budgetLimit;
    const walk = (value, depth = 0, forcedSelected = false, path = "") => {
      if (!value || typeof value !== "object" || depth > maxDepth || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      const selectedContext = forcedSelected || /selected.*token|tokens?.*selected|selection/i.test(path);
      const item = sceneTokenCandidate(value, source, selectedContext);
      if (item) rememberRuntimeSceneToken(item);
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 500)) walk(child, depth + 1, selectedContext, path);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1, selectedContext || /selected.*token|tokens?.*selected|selection/i.test(key), key);
      }
    };
    walk(root, 0, false, "root");
  }

  function bridgeElementVisible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
  }

  function collectSceneTokens(selectedOnly = false) {
    const roots = [];
    const uniqueRoots = new Set();
    const addRoots = el => {
      if (!el) return;
      for (const root of reactRoots(el)) {
        if (!root || uniqueRoots.has(root)) continue;
        uniqueRoots.add(root);
        roots.push(root);
      }
    };
    for (const toolbar of document.querySelectorAll('[data-testid="item-toolbar-rebuild-portal"]')) {
      if (bridgeElementVisible(toolbar)) addRoots(toolbar);
    }
    for (const el of document.querySelectorAll('[class*="map" i],[class*="token" i],canvas')) {
      if (!bridgeElementVisible(el)) continue;
      if (el.closest?.('aside,[role="dialog"],[class*="browser" i],[class*="gameLog" i],[class*="initiative" i]')) continue;
      addRoots(el);
      if (roots.length >= 16) break;
    }

    const best = new Map();
    const selectedIds = new Set();
    const selectedNames = new Set();
    const seen = new WeakSet();
    let budget = 76000;

    const remember = (value, source, forcedSelected = false) => {
      const item = sceneTokenCandidate(value, source, forcedSelected);
      if (!item) return;
      const key = item.tokenId || `${normalizeIndexName(item.name)}:${item.position ? item.position.join(",") : item.monsterId || item.characterId || ""}`;
      const prev = best.get(key);
      if (!prev || item.score > prev.score || (item.selected && !prev.selected)) best.set(key, item);
      rememberRuntimeSceneToken(item);
      if (item.selected) {
        if (item.tokenId) selectedIds.add(String(item.tokenId));
        selectedNames.add(normalizeIndexName(item.name));
      }
    };

    const walk = (value, depth = 0, path = "", forcedSelected = false) => {
      if (!value || typeof value !== "object" || depth > 11 || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      const selectedContext = forcedSelected || /selected.*token|tokens?.*selected|selection(?:s|state)?$/i.test(path);
      remember(value, path || "react-scene", selectedContext);
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 600)) {
          if ((typeof child === "string" || typeof child === "number") && selectedContext) selectedIds.add(String(child));
          else walk(child, depth + 1, path, selectedContext);
        }
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1, key, selectedContext || /selected.*token|tokens?.*selected/i.test(key));
        else if (selectedContext && /id$/i.test(key) && child != null) selectedIds.add(String(child));
      }
    };
    for (const root of roots) walk(root, 0, "root", false);

    if (!best.size) {
      const cutoff = Date.now() - (activeSceneIdentity ? 5 * 60 * 1000 : 45 * 1000);
      for (const item of runtimeSceneTokenIndex.values()) {
        if (Number(item?.seenAt || 0) < cutoff) continue;
        if (Number(item?.sceneEpoch ?? activeSceneEpoch) !== activeSceneEpoch) continue;
        if (activeSceneIdentity && item?.sceneIdentity && String(item.sceneIdentity) !== activeSceneIdentity) continue;
        if (!Array.isArray(item?.position) || item.position.length < 2) continue;
        if (selectedOnly && !item.selected) continue;
        const key = item.tokenId || `${normalizeIndexName(item.name)}:${item.position ? item.position.join(",") : item.monsterId || item.characterId || ""}`;
        best.set(key, item);
        if (item.selected) {
          if (item.tokenId) selectedIds.add(String(item.tokenId));
          selectedNames.add(normalizeIndexName(item.name));
        }
      }
    }

    const items = [...best.values()].map(item => {
      const indexed = entityIndex.get(normalizeIndexName(item.name));
      return {
        ...item,
        monsterId: item.monsterId || indexed?.monsterId || "",
        characterId: item.characterId || indexed?.characterId || "",
        damageAdjustments: item.damageAdjustments?.length ? item.damageAdjustments : (indexed?.damageAdjustments || []),
        selected: item.selected || (item.tokenId && selectedIds.has(String(item.tokenId))) || (!selectedIds.size && selectedNames.has(normalizeIndexName(item.name)))
      };
    });

    const filtered = selectedOnly ? items.filter(item => item.selected) : items;
    filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return filtered.slice(0, 250).map(({ score, source, ...item }) => item);
  }

  function activeSingleTokenFromToolbar() {
    const toolbars = [...document.querySelectorAll('[data-testid="item-toolbar-rebuild-portal"]')].filter(bridgeElementVisible);
    const singles = toolbars.filter(toolbar => {
      const text = String(toolbar.innerText || toolbar.textContent || "").replace(/\s+/g, " ").trim();
      return text && !/\b\d+\s+tokens?\s+selected\b/i.test(text) && (/\b\d+\s*\/\s*\d+\b/.test(text) || /\bconditions\b/i.test(text));
    });
    if (singles.length !== 1) return null;
    const toolbar = singles[0];
    const selected = collectSceneTokens(true);
    if (selected.length === 1 && (selected[0]?.tokenId || selected[0]?.id)) return selected[0];
    const toolbarText = normalizeIndexName(toolbar.innerText || toolbar.textContent || "");
    const hpMatch = String(toolbar.innerText || toolbar.textContent || "").match(/\b(\d+)\s*\/\s*(\d+)\b/);
    const hpCurrent = hpMatch ? Number(hpMatch[1]) : null;
    const hpMax = hpMatch ? Number(hpMatch[2]) : null;
    const candidates = new Map();
    const seen = new WeakSet();
    let budget = 22000;
    const remember = (value, source) => {
      const item = sceneTokenCandidate(value, source);
      if (!item) return;
      const name = normalizeIndexName(item.name || "");
      if (name && !toolbarText.includes(name)) return;
      let score = Number(item.score || 0);
      if (name && toolbarText.includes(name)) score += 15;
      if (hpCurrent != null && hpMax != null && item.hp) {
        if (Number(item.hp.current) === hpCurrent && Number(item.hp.max) === hpMax) score += 12;
        else score -= 4;
      }
      const key = String(item.tokenId || item.id || `${name}:${item.position?.join(",") || ""}`);
      const prev = candidates.get(key);
      if (!prev || score > prev.score) candidates.set(key, { ...item, score });
    };
    const walk = (value, depth = 0, path = "toolbar") => {
      if (!value || typeof value !== "object" || depth > 11 || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      remember(value, path);
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 500)) walk(child, depth + 1, path);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1, key);
      }
    };
    for (const root of reactRoots(toolbar)) walk(root, 0, "toolbar-root");
    const ordered = [...candidates.values()].sort((a, b) => b.score - a.score);
    if (ordered[0]?.tokenId && (!ordered[1] || ordered[0].score > ordered[1].score)) {
      const { score, source, ...token } = ordered[0];
      return token;
    }

    // Fallback to current scene objects only when the toolbar identifies one
    // unique token by name + HP. Never guess between duplicate instances.
    const scene = collectSceneTokens().filter(item => {
      const name = normalizeIndexName(item.name || "");
      if (!name || !toolbarText.includes(name)) return false;
      if (hpCurrent == null || hpMax == null || !item.hp) return true;
      return Number(item.hp.current) === hpCurrent && Number(item.hp.max) === hpMax;
    });
    const unique = new Map(scene.map(item => [String(item.tokenId || item.id || ""), item]).filter(([id]) => id));
    return unique.size === 1 ? [...unique.values()][0] : null;
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "ddb-qol-content") return;
    if (event.data.type === "REQUEST_LAST_DAMAGE") {
      markDamageMessages();
      if (latestDamageCompact) postBridge("GAME_LOG_DAMAGE", { message: latestDamageCompact, replay: true });
    }
    if (event.data.type === "REQUEST_SCENE_TOKENS") {
      refreshGlobalEntityIndex();
      const requestId = String(event.data.requestId || "");
      const tokens = collectSceneTokens();
      postBridge("SCENE_TOKENS", { requestId, tokens });
    }
    if (event.data.type === "REQUEST_ACTIVE_TOKEN") {
      refreshGlobalEntityIndex();
      const requestId = String(event.data.requestId || "");
      postBridge("ACTIVE_TOKEN", { requestId, token: activeSingleTokenFromToolbar() });
    }
    if (event.data.type === "TOKEN_HP_UPDATE") {
      sendTokenHpUpdate(String(event.data.requestId || ""), event.data.payload || {});
    }
    if (event.data.type === "REQUEST_DIAGNOSTIC_STATUS") {
      const requestId = String(event.data.requestId || "");
      postBridge("DIAGNOSTIC_STATUS", {
        requestId,
        status: {
          bridgeLoaded: true,
          mapSocketReady: Boolean(ddbMapSocket?.readyState === WebSocket.OPEN && ddbMapClientId)
        }
      });
    }
    if (event.data.type === "ANNOTATE_MAP_ORDER") annotateMapOrder();
    if (event.data.type === "ANNOTATE_HP_TARGETS") markHpTargets();
  });

})();
