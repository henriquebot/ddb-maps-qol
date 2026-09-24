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
  const customStickerIds = new Set();
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
  let ddbLastPingPosition = null;
  let ddbSocketReadyPosted = false;
  let ddbLastPeerSignal = 0;
  const observedSockets = new WeakSet();
  const originalWsSend = WebSocket.prototype.send;
  let lastPointerSample = null;
  const mapCalibrationAnchors = [];

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


  document.addEventListener("pointermove", event => {
    lastPointerSample = { x: event.clientX, y: event.clientY, at: Date.now() };
  }, { capture: true, passive: true });
  document.addEventListener("pointerup", event => {
    lastPointerSample = { x: event.clientX, y: event.clientY, at: Date.now() };
  }, { capture: true, passive: true });

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

  function addMapCalibrationAnchor(screenX, screenY, position, source = "native") {
    const world = validWorldPoint(position);
    if (!world || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
    const anchor = { sx: Number(screenX), sy: Number(screenY), wx: world[0], wy: world[1], source, at: Date.now() };
    const duplicate = mapCalibrationAnchors.find(item =>
      Math.hypot(item.sx - anchor.sx, item.sy - anchor.sy) < 3 &&
      Math.hypot(item.wx - anchor.wx, item.wy - anchor.wy) < 0.02
    );
    if (!duplicate) mapCalibrationAnchors.push(anchor);
    while (mapCalibrationAnchors.length > 40) mapCalibrationAnchors.shift();
  }

  function fitLinearAxis(anchors, screenKey, worldKey) {
    if (anchors.length < 2) return null;
    const meanS = anchors.reduce((n, a) => n + a[screenKey], 0) / anchors.length;
    const meanW = anchors.reduce((n, a) => n + a[worldKey], 0) / anchors.length;
    let cov = 0, variance = 0;
    for (const a of anchors) {
      const ds = a[screenKey] - meanS;
      cov += ds * (a[worldKey] - meanW);
      variance += ds * ds;
    }
    if (variance < 25) return null;
    const scale = cov / variance;
    if (!Number.isFinite(scale) || Math.abs(scale) < 1e-8 || Math.abs(scale) > 10) return null;
    return { scale, offset: meanW - scale * meanS };
  }

  function calibratedMapPoint(clientX, clientY) {
    const recent = mapCalibrationAnchors.filter(a => Date.now() - a.at < 30 * 60 * 1000);
    const fx = fitLinearAxis(recent, "sx", "wx");
    const fy = fitLinearAxis(recent, "sy", "wy");
    if (!fx || !fy) return null;
    const out = [fx.scale * clientX + fx.offset, fy.scale * clientY + fy.offset];
    return validWorldPoint(out);
  }

  function mapCanvasForPoint(clientX, clientY) {
    const direct = document.elementsFromPoint(clientX, clientY).find(el => el?.tagName === "CANVAS");
    if (direct) return direct;
    const canvases = [...document.querySelectorAll("canvas")]
      .map(el => ({ el, rect: el.getBoundingClientRect?.() }))
      .filter(item => item.rect && item.rect.width >= 240 && item.rect.height >= 180 &&
        clientX >= item.rect.left && clientX <= item.rect.right && clientY >= item.rect.top && clientY <= item.rect.bottom)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    return canvases[0]?.el || null;
  }

  function applyMatrix4Raw(v, elements) {
    if (!Array.isArray(elements) && !(elements instanceof Float32Array) && !(elements instanceof Float64Array)) return null;
    if (elements.length < 16) return null;
    const x = Number(v[0]), y = Number(v[1]), z = Number(v[2]), w = Number(v[3] ?? 1);
    const out = [
      elements[0] * x + elements[4] * y + elements[8] * z + elements[12] * w,
      elements[1] * x + elements[5] * y + elements[9] * z + elements[13] * w,
      elements[2] * x + elements[6] * y + elements[10] * z + elements[14] * w,
      elements[3] * x + elements[7] * y + elements[11] * z + elements[15] * w
    ];
    return out.every(Number.isFinite) ? out : null;
  }

  function unprojectWithCamera(camera, ndcX, ndcY, ndcZ) {
    const projectionInverse = camera?.projectionMatrixInverse?.elements;
    const matrixWorld = camera?.matrixWorld?.elements;
    if (!projectionInverse || !matrixWorld) return null;
    let p = applyMatrix4Raw([ndcX, ndcY, ndcZ, 1], projectionInverse);
    if (!p || Math.abs(p[3]) < 1e-10) return null;
    p = [p[0] / p[3], p[1] / p[3], p[2] / p[3], 1];
    p = applyMatrix4Raw(p, matrixWorld);
    if (!p || Math.abs(p[3]) < 1e-10) return null;
    return [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
  }

  function cameraPointOnMapPlane(camera, canvas, clientX, clientY) {
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect || rect.width < 20 || rect.height < 20) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const near = unprojectWithCamera(camera, ndcX, ndcY, -1);
    const far = unprojectWithCamera(camera, ndcX, ndcY, 1);
    if (!near || !far) return null;
    const dz = far[2] - near[2];
    if (!Number.isFinite(dz) || Math.abs(dz) < 1e-9) return null;
    const t = -near[2] / dz;
    if (!Number.isFinite(t) || Math.abs(t) > 1e6) return null;
    const point = [near[0] + (far[0] - near[0]) * t, near[1] + (far[1] - near[1]) * t];
    if (!validWorldPoint(point) || Math.abs(point[0]) > 1e7 || Math.abs(point[1]) > 1e7) return null;
    return point;
  }

  function cameraMapPoint(clientX, clientY) {
    const canvas = mapCanvasForPoint(clientX, clientY);
    if (!canvas) return null;
    const roots = reactRoots(canvas);
    for (let cur = canvas.parentElement, i = 0; cur && i < 5; i++, cur = cur.parentElement) {
      for (const root of reactRoots(cur)) roots.push(root);
    }
    const seen = new WeakSet();
    let budget = 18000;
    let found = null;
    const walk = (value, depth = 0) => {
      if (found || !value || typeof value !== "object" || seen.has(value) || depth > 11 || budget-- <= 0) return;
      seen.add(value);
      const candidates = [];
      if (value?.isCamera) candidates.push(value);
      if (value?.camera?.isCamera) candidates.push(value.camera);
      if (value?.state?.camera?.isCamera) candidates.push(value.state.camera);
      for (const camera of candidates) {
        const point = cameraPointOnMapPlane(camera, canvas, clientX, clientY);
        if (point) { found = point; return; }
      }
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 180)) walk(child, depth + 1);
        return;
      }
      let entries = [];
      try { entries = Object.entries(value).slice(0, 120); } catch { return; }
      for (const [key, child] of entries) {
        if (["return", "sibling", "_owner"].includes(key)) continue;
        if (key === "stateNode" && child?.nodeType) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
        if (found) return;
      }
    };
    for (const root of roots) {
      walk(root, 0);
      if (found) return found;
    }
    return null;
  }

  function converterMapPoint(clientX, clientY) {
    const roots = [];
    const seenRoot = new Set();
    for (const el of document.elementsFromPoint(clientX, clientY).slice(0, 10)) {
      for (const root of reactRoots(el)) {
        if (root && !seenRoot.has(root)) { seenRoot.add(root); roots.push(root); }
      }
    }
    const seen = new WeakSet();
    let budget = 6000;
    const methodNames = [
      "screenToWorld", "clientToWorld", "viewportToWorld", "screenToMap", "clientToMap",
      "pointToWorld", "getWorldPoint", "toWorld"
    ];
    const tryResult = result => {
      const point = validWorldPoint(result);
      if (!point) return null;
      if (Math.abs(point[0]) > 1e7 || Math.abs(point[1]) > 1e7) return null;
      return point;
    };
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || seen.has(value) || depth > 8 || budget-- <= 0) return null;
      seen.add(value);
      for (const name of methodNames) {
        const fn = value?.[name];
        if (typeof fn !== "function") continue;
        for (const args of [[clientX, clientY], [{ x: clientX, y: clientY }]]) {
          try {
            const point = tryResult(fn.apply(value, args));
            if (point) return point;
          } catch {}
        }
      }
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 120)) {
          const found = walk(child, depth + 1);
          if (found) return found;
        }
        return null;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") {
          const found = walk(child, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };
    for (const root of roots) {
      const found = walk(root, 0);
      if (found) return found;
    }
    return null;
  }

  function nearbyName(el) {
    for (let cur = el, i = 0; cur && i < 4; i++, cur = cur.parentElement) {
      const text = String(cur.innerText || cur.textContent || "").split(/\n+/).map(v => v.trim()).filter(Boolean);
      const candidate = text.find(v => v.length > 1 && v.length < 80 && !/^\d+\s*\/\s*\d+$/.test(v));
      if (candidate) return candidate;
    }
    return "";
  }

  function positionCandidateFromRoots(roots, wantedName = "") {
    const wanted = normalizeIndexName(wantedName);
    const seen = new WeakSet();
    let best = null;
    let budget = 5000;
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || seen.has(value) || depth > 8 || budget-- <= 0) return;
      seen.add(value);
      const point = validWorldPoint(value.position || value.coordinates || value.worldPosition || value.tokenPosition);
      if (point) {
        const name = normalizeIndexName(value.name || value.displayName || value.tokenName || value?.definition?.name || "");
        let score = 1;
        if (wanted && name === wanted) score += 10;
        else if (wanted && name && (wanted.includes(name) || name.includes(wanted))) score += 5;
        if (value.tokenId || value.entityId || value.monsterId || value.characterId) score += 3;
        if (value.imageUrl || value.imageKey || value.avatarUrl) score += 1;
        if (!best || score > best.score) best = { score, point };
      }
      if (Array.isArray(value)) {
        value.slice(0, 160).forEach(child => walk(child, depth + 1));
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1);
      }
    };
    for (const root of roots) walk(root, 0);
    return best?.score >= 4 ? best.point : null;
  }

  function mapCanvasRect() {
    const canvases = [...document.querySelectorAll("canvas")]
      .map(el => ({ el, rect: el.getBoundingClientRect?.() }))
      .filter(item => item.rect && item.rect.width >= 240 && item.rect.height >= 180)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    return canvases[0]?.rect || null;
  }

  function harvestTokenLabelCalibrationAnchors() {
    const canvasRect = mapCanvasRect();
    if (!canvasRect || !runtimeSceneTokenIndex.size) return;
    const recentTokens = [...runtimeSceneTokenIndex.values()]
      .filter(item => item?.position && item?.name && Date.now() - Number(item.seenAt || 0) < 10 * 60 * 1000);
    const byName = new Map();
    for (const item of recentTokens) {
      const key = normalizeIndexName(item.name);
      if (!key) continue;
      const list = byName.get(key) || [];
      list.push(item);
      byName.set(key, list);
    }
    // Ambiguous duplicate names are intentionally skipped. A wrong anchor is
    // much worse than asking for a native calibration action.
    const unique = new Map([...byName.entries()].filter(([, items]) => items.length === 1));
    if (!unique.size) return;

    const candidates = [...document.querySelectorAll("span,div,p")];
    const bestByName = new Map();
    for (const el of candidates) {
      if (el.closest?.('aside,[role="dialog"],[class*="browser" i],[class*="gameLog" i],[class*="initiative" i],[class*="toolbar" i],[class*="sidebar" i]')) continue;
      const text = normalizeIndexName(el.textContent || "");
      if (!unique.has(text)) continue;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 6 || rect.height < 6 || rect.width > 320 || rect.height > 90) continue;
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      if (cx < canvasRect.left || cx > canvasRect.right || cy < canvasRect.top || cy > canvasRect.bottom) continue;
      const area = rect.width * rect.height;
      const prev = bestByName.get(text);
      // Prefer the smallest exact-text element; parent wrappers often contain
      // the same text but have a much larger rect.
      if (!prev || area < prev.area) bestByName.set(text, { el, rect, area });
    }
    for (const [name, match] of bestByName) {
      const token = unique.get(name)?.[0];
      if (!token?.position) continue;
      const rect = match.rect;
      addMapCalibrationAnchor(rect.left + rect.width / 2, rect.top + rect.height / 2, token.position, "token-label");
    }
  }

  function harvestDomCalibrationAnchors() {
    const candidates = [...document.querySelectorAll("img")].filter(img => {
      const r = img.getBoundingClientRect?.();
      return r && r.width >= 22 && r.width <= 140 && r.height >= 22 && r.height <= 140 &&
        r.left >= 0 && r.top >= 40 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
    }).slice(0, 80);
    for (const img of candidates) {
      const rect = img.getBoundingClientRect();
      const roots = reactRoots(img);
      if (!roots.length) continue;
      const point = positionCandidateFromRoots(roots, nearbyName(img));
      if (point) addMapCalibrationAnchor(rect.left + rect.width / 2, rect.top + rect.height / 2, point, "react-dom");
    }
  }

  function resolveMapPoint(clientX, clientY) {
    // v0.3.26: first try automatic map calibration; if unavailable, UI instructs one Ping (X) to activate sticker drops
    // or token movement when the camera object is reachable from the React tree.
    const fromCamera = cameraMapPoint(clientX, clientY);
    if (fromCamera) return fromCamera;

    // Second path: pair visible token-name labels with the native world positions
    // already present in the scene snapshot. Two or more labels are enough to
    // derive the current pan/zoom transform without any manual calibration.
    harvestTokenLabelCalibrationAnchors();
    harvestDomCalibrationAnchors();
    return calibratedMapPoint(clientX, clientY) || converterMapPoint(clientX, clientY);
  }

  function parseWsMessage(data) {
    try {
      if (typeof data === "string") return JSON.parse(data);
      if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
    } catch {}
    return null;
  }

  function nativeStickerIsDeleted(payload, type = "") {
    if (/STICKER.*(?:DELETE|REMOVE|DESTROY)/i.test(String(type || ""))) return true;
    const scopes = [payload, payload?.sticker, payload?.data, payload?.patch, payload?.changes].filter(Boolean);
    return scopes.some(scope => Boolean(scope?.deleted || scope?.isDeleted || scope?.removed || scope?.isRemoved || scope?.destroyed || scope?.isDestroyed || scope?.tombstone));
  }

  function stickerObjectId(value) {
    if (!value || typeof value !== "object") return "";
    const scopes = [value, value?.sticker, value?.data, value?.patch, value?.changes].filter(Boolean);
    for (const scope of scopes) {
      const raw = scope.id ?? scope.stickerId ?? scope.stickerID ?? scope.entityId ?? scope.overlayId;
      if (raw != null && raw !== "") return String(raw);
    }
    return "";
  }

  function normalizeNativeStickerPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    const scopes = [
      payload,
      payload?.sticker,
      payload?.data,
      payload?.patch,
      payload?.changes,
      payload?.transform,
      payload?.geometry,
      payload?.properties
    ].filter(Boolean);
    const first = (...keys) => {
      for (const scope of scopes) {
        for (const key of keys) {
          if (scope?.[key] != null) return scope[key];
        }
      }
      return undefined;
    };
    const id = stickerObjectId(payload);
    let position = first("position", "mapPosition", "worldPosition", "coordinates");
    if (!Array.isArray(position)) {
      const x = first("x", "positionX", "worldX");
      const y = first("y", "positionY", "worldY");
      if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) position = [Number(x), Number(y)];
    }
    let hidden = first("hidden", "isHidden");
    const visible = first("visible", "isVisible");
    if (hidden == null && visible != null) hidden = !Boolean(visible);
    return {
      id,
      name: first("name"),
      type: first("type"),
      imageKey: first("imageKey"),
      thumbnailKey: first("thumbnailKey"),
      imageUrl: first("imageUrl"),
      aspectRatio: first("aspectRatio"),
      size: first("size", "scale"),
      rotation: first("rotation", "angle"),
      hidden,
      locked: first("locked", "isLocked"),
      position: Array.isArray(position) ? position.slice(0, 2).map(Number) : undefined
    };
  }

  function emitNativeStickerState(payload, type = "STICKER_UPSERT", direction = "native", force = false) {
    const sticker = normalizeNativeStickerPayload(payload);
    if (!sticker?.id) return;
    if (nativeStickerIsDeleted(payload, type)) {
      postBridge("CUSTOM_STICKER_REMOVED_NATIVE", { id: String(sticker.id), direction, eventType: type });
      return;
    }
    const imageKey = String(sticker?.imageKey || sticker?.thumbnailKey || "");
    const looksSticker = /sticker/i.test(String(type))
      || /sticker/i.test(imageKey)
      || (Array.isArray(sticker?.position) && (sticker?.aspectRatio != null || sticker?.size != null));
    if (!looksSticker && !force) return;
    postBridge("CUSTOM_STICKER_NATIVE_UPSERT", {
      direction,
      eventType: type,
      sticker
    });
  }

  function harvestKnownCustomStickerStates(root, direction = "native", maxDepth = 6, budgetLimit = 3500) {
    if (!root || typeof root !== "object" || !customStickerIds.size) return;
    const seen = new WeakSet();
    let budget = budgetLimit;
    const rootType = String(root?.type || "");
    const directPayload = root?.payload;
    if (/(?:DELETE|REMOVE|DESTROY)/i.test(rootType) && (typeof directPayload === "string" || typeof directPayload === "number")) {
      const directId = String(directPayload);
      if (customStickerIds.has(directId)) postBridge("CUSTOM_STICKER_REMOVED_NATIVE", { id: directId, direction, eventType: rootType });
    }
    const walk = (value, depth = 0, inheritedType = rootType) => {
      if (!value || typeof value !== "object" || depth > maxDepth || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      const type = String(value?.type || inheritedType || "");
      const id = stickerObjectId(value);
      if (id && customStickerIds.has(id)) {
        if (nativeStickerIsDeleted(value, type) || /(?:DELETE|REMOVE|DESTROY)/i.test(type)) {
          postBridge("CUSTOM_STICKER_REMOVED_NATIVE", { id, direction, eventType: type });
        } else {
          emitNativeStickerState(value, type || "CUSTOM_STICKER_STATE", direction, true);
        }
      }
      const payload = value?.payload;
      if (payload && typeof payload === "object") {
        const payloadId = stickerObjectId(payload);
        if (payloadId && customStickerIds.has(payloadId)) {
          if (nativeStickerIsDeleted(payload, type) || /(?:DELETE|REMOVE|DESTROY)/i.test(type)) {
            postBridge("CUSTOM_STICKER_REMOVED_NATIVE", { id: payloadId, direction, eventType: type });
          } else {
            emitNativeStickerState(payload, type || "CUSTOM_STICKER_STATE", direction, true);
          }
        }
      }
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 300)) walk(child, depth + 1, inheritedType);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1, type);
      }
    };
    walk(root, 0, rootType);
  }

  function harvestNativeStickerStates(root, direction = "native", maxDepth = 7, budgetLimit = 5000) {
    if (!root || typeof root !== "object") return;
    const seen = new WeakSet();
    let budget = budgetLimit;
    const walk = (value, depth = 0, parentType = "") => {
      if (!value || typeof value !== "object" || depth > maxDepth || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      const type = String(value?.type || parentType || "");
      if (value?.payload && typeof value.payload === "object" && /STICKER/i.test(type)) emitNativeStickerState(value.payload, type, direction);
      if (value?.id && (value?.imageKey || value?.thumbnailKey) && (Array.isArray(value?.position) || value?.size != null)) emitNativeStickerState(value, type || "SNAPSHOT_STICKER", direction);
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 300)) walk(child, depth + 1, parentType);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (["return", "sibling", "stateNode", "_owner"].includes(key)) continue;
        if (child && typeof child === "object") walk(child, depth + 1, type);
      }
    };
    walk(root, 0, String(root?.type || ""));
  }

  function observeMapSocket(socket) {
    if (!socket || observedSockets.has(socket)) return;
    observedSockets.add(socket);
    socket.addEventListener("open", () => {
      if (socket === ddbMapSocket) {
        ddbSocketReadyPosted = false;
        setTimeout(() => postBridge("MAP_SOCKET_READY"), 80);
      }
    });
    socket.addEventListener("message", event => {
      const msg = parseWsMessage(event.data);
      if (msg) {
        observeSceneLifecycleMessage(msg);
        harvestEntities(msg, "ws-incoming", 10, 12000);
        harvestSceneTokenCandidates(msg, `ws-incoming:${String(msg?.type || "")}`, 10, 12000);
        harvestNativeStickerStates(msg, "incoming", 8, 7000);
        harvestKnownCustomStickerStates(msg, "incoming", 8, 7000);
      }
      const type = String(msg?.type || "");
      if (!type || /^(PONG|PING)$/i.test(type)) return;
      if (/JOIN|CONNECT|RECONNECT|PRESENCE|SESSION|SUBSCRIB|SYNC|SNAPSHOT|STATE|ROOM|MEMBER|USER|PLAYER|PARTICIPANT|CLIENT/i.test(type)) {
        const now = Date.now();
        if (now - ddbLastPeerSignal > 3500) {
          ddbLastPeerSignal = now;
          postBridge("MAP_PEER_RECONNECT", { eventType: type });
        }
      }
    });
  }

  WebSocket.prototype.send = function(data) {
    try {
      if (String(this.url || "").includes("games.dndbeyond.com")) {
        if (ddbMapSocket !== this) ddbSocketReadyPosted = false;
        ddbMapSocket = this;
        observeMapSocket(this);
        const msg = parseWsMessage(data);
        if (msg) {
          observeSceneLifecycleMessage(msg);
          harvestEntities(msg, "ws-outgoing", 10, 12000);
          harvestSceneTokenCandidates(msg, `ws-outgoing:${String(msg?.type || "")}`, 10, 12000);
          harvestNativeStickerStates(msg, "outgoing", 8, 7000);
          harvestKnownCustomStickerStates(msg, "outgoing", 8, 7000);
        }
        if (msg?.meta?.clientId) ddbMapClientId = msg.meta.clientId;
        if (Number.isFinite(Number(msg?.meta?.clientActionIndex))) {
          ddbMapActionIndex = Math.max(ddbMapActionIndex, Number(msg.meta.clientActionIndex));
        }
        if (Array.isArray(msg?.payload?.position) && msg.payload.position.length >= 2) {
          ddbLastPingPosition = msg.payload.position.slice(0, 2);
          const type = String(msg?.type || "");
          if (lastPointerSample && Date.now() - lastPointerSample.at < 1200 && /PING|TOKEN|STICKER|POINT|OVERLAY/i.test(type)) {
            addMapCalibrationAnchor(lastPointerSample.x, lastPointerSample.y, msg.payload.position, `ws:${type}`);
          }
        }
        if (ddbMapClientId && !ddbSocketReadyPosted) {
          ddbSocketReadyPosted = true;
          setTimeout(() => {
            postBridge("MAP_SOCKET_READY");
          }, 50);
        }
      }
    } catch {}
    const result = originalWsSend.apply(this, arguments);
    return result;
  };

  function postBridge(type, extra = {}) {
    try { window.postMessage({ source: "ddb-qol-page", type, ...extra }, location.origin); } catch {}
  }

  function sendCustomSticker(payload) {
    if (!ddbMapSocket || ddbMapSocket.readyState !== WebSocket.OPEN) {
      postBridge("CUSTOM_STICKER_ERROR", { message: "Para ativar o drop de stickers: pressione X e faça 1 Ping em qualquer ponto do mapa. Depois arraste o sticker novamente." });
      return;
    }
    if (!ddbMapClientId) {
      postBridge("CUSTOM_STICKER_ERROR", { message: "Para ativar o drop de stickers: pressione X e faça 1 Ping em qualquer ponto do mapa. Depois arraste o sticker novamente." });
      return;
    }
    const position = Array.isArray(payload?.position) && payload.position.length >= 2
      ? payload.position.slice(0, 2).map(Number)
      : (ddbLastPingPosition ? ddbLastPingPosition.slice(0, 2) : [0, 0]);
    const outgoingId = String(payload?.id || crypto.randomUUID());
    customStickerIds.add(outgoingId);
    const msg = {
      type: "STICKER_UPSERT",
      meta: {
        source: "CLIENT",
        clientNow: Date.now(),
        clientActionIndex: ++ddbMapActionIndex,
        clientId: ddbMapClientId
      },
      payload: {
        id: outgoingId,
        name: String(payload?.name || "Custom Sticker").slice(0, 100),
        type: "rectangle",
        // DDB currently expects catalog keys to exist, but imageUrl takes precedence in Sticker.tsx.
        imageKey: String(payload?.imageKey || "official/stickers/br-2024/map_and_utility-arrow_down.png"),
        thumbnailKey: String(payload?.thumbnailKey || "thumbnails/official/stickers/br-2024/map_and_utility-arrow_down.png"),
        imageUrl: String(payload?.imageUrl || ""),
        aspectRatio: Math.max(0.02, Number(payload?.aspectRatio) || 1),
        size: Math.max(0.1, Number(payload?.size) || 1.5),
        rotation: Number(payload?.rotation) || 0,
        hidden: Boolean(payload?.hidden),
        locked: Boolean(payload?.locked),
        position
      },
      state: "FULFILLED"
    };
    try {
      originalWsSend.call(ddbMapSocket, JSON.stringify(msg));
      postBridge("CUSTOM_STICKER_SENT", {
        id: msg.payload.id,
        rehydrate: Boolean(payload?.rehydrate),
        silent: Boolean(payload?.silent),
        sticker: { ...msg.payload, libraryId: String(payload?.libraryId || ""), imageUrl: String(payload?.imageUrl || "") }
      });
    } catch (error) {
      postBridge("CUSTOM_STICKER_ERROR", { message: error instanceof Error ? error.message : String(error) });
    }
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
    const scopes = [obj, obj?.map, obj?.metadata, obj?.definition, obj?.thumbnail, obj?.image, obj?.preview].filter(Boolean);
    const keys = [
      "thumbnailUrl", "thumbnailURL", "thumbUrl", "thumbURL", "previewUrl", "previewURL",
      "imageUrl", "imageURL", "downloadUrl", "downloadURL", "signedUrl", "signedURL", "src", "url"
    ];
    for (const scope of scopes) {
      for (const key of keys) {
        const value = scope?.[key];
        if (typeof value !== "string") continue;
        const url = value.trim();
        if (/^(?:https?:|data:image\/|blob:)/i.test(url)) return url;
      }
    }
    const keyAsUrl = [obj?.thumbnailKey, obj?.imageKey, obj?.map?.thumbnailKey, obj?.map?.imageKey].find(value => typeof value === "string" && /^https?:/i.test(value));
    return keyAsUrl ? String(keyAsUrl) : "";
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
    const wanted = new Set(names.map(n => n.toLowerCase()));
    const seen = new WeakSet();
    let best = null;
    let budget = 24000;
    const visit = (value, depth) => {
      if (!value || budget-- <= 0 || depth > 10) return;
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        const matches = value.filter(v => wanted.has(valueName(v).toLowerCase()));
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
        const directThumb = mapThumbnailUrl(directItem);
        const directThumbKey = String(directItem?.thumbnailKey || directItem?.map?.thumbnailKey || directItem?.imageKey || directItem?.map?.imageKey || "");
        if (directId || meta?.id) label.dataset.ddbQolMapId = directId || meta.id;
        if (directThumb || meta?.thumbnailUrl) label.dataset.ddbQolMapThumb = directThumb || meta.thumbnailUrl;
        if (directThumbKey || meta?.thumbnailKey || meta?.imageKey) label.dataset.ddbQolMapThumbKey = directThumbKey || meta.thumbnailKey || meta.imageKey;
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

    const id = tokenIdFromValue(value);
    if (id && customStickerIds.has(String(id))) return true;

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
    if (event.data.type === "SYNC_CUSTOM_STICKER_IDS") {
      customStickerIds.clear();
      for (const id of Array.isArray(event.data.ids) ? event.data.ids : []) {
        if (id != null && id !== "") customStickerIds.add(String(id));
      }
    }
    if (event.data.type === "SEND_CUSTOM_STICKER") sendCustomSticker(event.data.payload || {});
    if (event.data.type === "RESOLVE_MAP_POINT") {
      const requestId = String(event.data.requestId || "");
      const clientX = Number(event.data.clientX);
      const clientY = Number(event.data.clientY);
      const position = Number.isFinite(clientX) && Number.isFinite(clientY) ? resolveMapPoint(clientX, clientY) : null;
      postBridge("MAP_POINT_RESOLVED", {
        requestId,
        position,
        error: position ? "" : "Para ativar o drop de stickers: pressione X e faça 1 Ping em qualquer ponto do mapa. Depois arraste o sticker novamente."
      });
    }
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
      const rect = mapCanvasRect();
      let stickerDropReady = false;
      if (rect) {
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        stickerDropReady = Boolean(cameraMapPoint(x, y) || calibratedMapPoint(x, y) || converterMapPoint(x, y));
      }
      const recentAnchors = mapCalibrationAnchors.filter(anchor => Date.now() - anchor.at < 30 * 60 * 1000);
      postBridge("DIAGNOSTIC_STATUS", {
        requestId,
        status: {
          bridgeLoaded: true,
          mapSocketReady: Boolean(ddbMapSocket?.readyState === WebSocket.OPEN && ddbMapClientId),
          stickerDropReady,
          calibrationAnchors: recentAnchors.length
        }
      });
    }
    if (event.data.type === "REQUEST_MAP_SOCKET_READY" && ddbMapSocket?.readyState === WebSocket.OPEN && ddbMapClientId) postBridge("MAP_SOCKET_READY");
    if (event.data.type === "ANNOTATE_MAP_ORDER") annotateMapOrder();
    if (event.data.type === "ANNOTATE_HP_TARGETS") markHpTargets();
  });

})();
