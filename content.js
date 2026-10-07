(() => {
  if (window.__ytReplacerLoaded) return;
  window.__ytReplacerLoaded = true;

  // おすすめ・検索結果・チャンネル・関連動画・再生リストなど、動画カードとして使われる要素
  const CONTAINER_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-rich-grid-media",
    "ytd-rich-grid-slim-media",
    "ytd-grid-video-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-compact-autoplay-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "ytd-reel-item-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
  ].join(",");

  const THUMB_SELECTOR = [
    "ytd-thumbnail",
    "yt-thumbnail-view-model",
    "a#thumbnail",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "ytd-reel-item-renderer",
  ].join(",");

  let rules = {}; // { videoId: { title, thumb, origTitle } }

  // ---------- helpers ----------
  function getVideoId(href) {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|live)\/([\w-]{6,})/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  function findTitleEl(container) {
    return (
      container.querySelector("#video-title") ||
      container.querySelector(".yt-lockup-metadata-view-model-wiz__title") ||
      container.querySelector("h3 a, h3")
    );
  }

  // 要素の構造やクラス(=フォント・サイズ・色の指定)はそのまま、
  // 中のテキストノードの文字だけを書き換える。
  // saved: テキストノード -> { orig: 元の文字, set: こちらが書き込んだ文字 }
  function setTitleText(el, text) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    }
    if (!nodes.length) return;
    const saved = el.__ytrOrig || (el.__ytrOrig = new Map());
    nodes.forEach((n, i) => {
      const want = i === 0 ? text : "";
      if (n.nodeValue === want) return;
      const s = saved.get(n);
      if (!s || s.set !== n.nodeValue) {
        // 初めて、またはYouTube側が文字を書き換えた(要素の再利用など)
        saved.set(n, { orig: n.nodeValue, set: want });
      } else {
        s.set = want;
      }
      n.nodeValue = want;
    });
  }

  // こちらが書き込んだ文字のままのときだけ元に戻す(YouTubeが更新済みなら触らない)
  function restoreTitleText(el) {
    if (!el || !el.__ytrOrig) return;
    el.__ytrOrig.forEach((s, n) => {
      if (n.isConnected && n.nodeValue === s.set) n.nodeValue = s.orig;
    });
    el.__ytrOrig = null;
  }

  // 置き換え済みでも元のタイトルを返す
  function getTitleText(container) {
    const el = findTitleEl(container);
    if (!el) return "";
    if (el.__ytrOrig && el.__ytrOrig.size) {
      return Array.from(el.__ytrOrig.values(), (s) => s.orig).join("").trim();
    }
    return (el.getAttribute("title") || el.textContent || "").trim();
  }

  function containerHasId(container, id) {
    for (const a of container.querySelectorAll("a[href]")) {
      if (getVideoId(a.getAttribute("href")) === id) return true;
    }
    return false;
  }

  // ---------- apply replacements ----------
  function applyToContainer(container, id, rule) {
    container.setAttribute("data-ytr-id", id);

    // thumbnail
    container.querySelectorAll("img").forEach((img) => {
      if (!img.closest(THUMB_SELECTOR)) return;
      if (img.src !== rule.thumb) {
        img.dataset.ytrOrigSrc = img.src;
        img.__ytrSet = rule.thumb;
        img.src = rule.thumb;
        img.removeAttribute("srcset");
      }
      img.style.objectFit = "cover";
    });

    // title
    const titleEl = findTitleEl(container);
    if (titleEl) {
      container.__ytrTitleEl = titleEl;
      setTitleText(titleEl, rule.title);
      if (titleEl.hasAttribute("title")) titleEl.setAttribute("title", rule.title);
      if (titleEl.hasAttribute("aria-label")) titleEl.setAttribute("aria-label", rule.title);
    }
  }

  function restoreContainer(container) {
    container.removeAttribute("data-ytr-id");
    container.querySelectorAll("img[data-ytr-orig-src]").forEach((img) => {
      if (img.src === img.__ytrSet) img.src = img.dataset.ytrOrigSrc;
      delete img.dataset.ytrOrigSrc;
      img.__ytrSet = null;
    });
    restoreTitleText(container.__ytrTitleEl);
    container.__ytrTitleEl = null;
  }

  // 動画終了後に出る関連動画(エンドカード)
  function applyVideoWall() {
    document.querySelectorAll("a.ytp-videowall-still").forEach((a) => {
      const id = getVideoId(a.getAttribute("href"));
      const rule = id && rules[id];
      const image = a.querySelector(".ytp-videowall-still-image");
      const title = a.querySelector(".ytp-videowall-still-info-title");
      if (rule) {
        if (image) {
          if (image.__ytrBg === undefined) image.__ytrBg = image.style.getPropertyValue("background-image");
          image.style.setProperty("background-image", `url("${rule.thumb}")`, "important");
          image.style.setProperty("background-size", "cover", "important");
        }
        if (title) setTitleText(title, rule.title);
        a.__ytrWall = true;
      } else if (a.__ytrWall) {
        if (image && image.__ytrBg !== undefined) {
          image.style.removeProperty("background-size");
          image.style.setProperty("background-image", image.__ytrBg);
          image.__ytrBg = undefined;
        }
        restoreTitleText(title);
        a.__ytrWall = false;
      }
    });
  }

  // その動画を再生しているとき: ページ内のタイトル・プレイヤーのタイトル・タブ名を置き換える
  let docTitleSet = null;
  let docTitleOrig = null;
  function applyWatchPage() {
    const id = new URLSearchParams(location.search).get("v");
    const rule = location.pathname === "/watch" && id && rules[id];
    const targets = document.querySelectorAll("ytd-watch-metadata h1, .ytp-title-link");
    targets.forEach((el) => (rule ? setTitleText(el, rule.title) : restoreTitleText(el)));

    if (rule) {
      const want = `${rule.title} - YouTube`;
      if (document.title !== want) {
        docTitleOrig = document.title;
        docTitleSet = want;
        document.title = want;
      }
    } else if (docTitleSet) {
      if (document.title === docTitleSet) document.title = docTitleOrig;
      docTitleSet = null;
    }
  }

  function applyAll() {
    // ルールが無くなった/要素が別の動画に再利用されたものを元に戻す
    document.querySelectorAll("[data-ytr-id]").forEach((c) => {
      const id = c.getAttribute("data-ytr-id");
      if (!rules[id] || !containerHasId(c, id)) restoreContainer(c);
    });

    if (Object.keys(rules).length) {
      document.querySelectorAll("a[href]").forEach((a) => {
        const id = getVideoId(a.getAttribute("href"));
        if (!id || !rules[id]) return;
        const container = a.closest(CONTAINER_SELECTOR);
        if (container) applyToContainer(container, id, rules[id]);
      });
    }
    applyVideoWall();
    applyWatchPage();
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyAll();
    });
  }

  function loadRules() {
    chrome.storage.local.get({ rules: {} }, (d) => {
      rules = d.rules || {};
      scheduleApply();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rules) {
      rules = changes.rules.newValue || {};
      scheduleApply();
    }
  });

  new MutationObserver(scheduleApply).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["src", "href"],
  });
  window.addEventListener("yt-navigate-finish", scheduleApply);
  loadRules();

  // ---------- ホバープレビューの無効化 ----------
  // 置き換え済みの動画にカーソルを乗せても、元動画のプレビュー再生を出さない。
  // 1) YouTubeのホバー検知にイベントを届けない
  for (const type of ["mouseover", "mouseenter", "pointerover", "pointerenter"]) {
    document.addEventListener(
      type,
      (e) => {
        if (e.target.closest && e.target.closest("[data-ytr-id]")) e.stopImmediatePropagation();
      },
      true
    );
  }
  // 2) それでも出たプレビューは隠す
  const style = document.createElement("style");
  style.textContent = "html:has([data-ytr-id]:hover) ytd-video-preview { display: none !important; }";
  document.documentElement.appendChild(style);

  // ---------- pick mode ----------
  let picking = false;
  let hovered = null;
  let banner = null;
  let overlay = null;

  function showBanner(text) {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText =
        "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
        "background:#cc0000;color:#fff;padding:10px 18px;border-radius:8px;font:14px sans-serif;" +
        "box-shadow:0 2px 10px rgba(0,0,0,.4);pointer-events:none;";
      document.documentElement.appendChild(banner);
    }
    banner.textContent = text;
  }

  function hideBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  function clearHover() {
    if (hovered) {
      hovered.style.outline = hovered.dataset.ytrPrevOutline || "";
      delete hovered.dataset.ytrPrevOutline;
      hovered = null;
    }
  }

  // 透明レイヤー越しに、カーソル位置の下にある動画カードを探す
  function targetFromEvent(e) {
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      if (el === overlay) continue;
      const container = el.closest && el.closest(CONTAINER_SELECTOR);
      if (!container) continue;
      for (const a of container.querySelectorAll("a[href]")) {
        const id = getVideoId(a.getAttribute("href"));
        if (id) return { id, container };
      }
    }
    return null;
  }

  function onMove(e) {
    const t = targetFromEvent(e);
    const el = t ? t.container : null;
    if (el === hovered) return;
    clearHover();
    if (el) {
      hovered = el;
      el.dataset.ytrPrevOutline = el.style.outline;
      el.style.outline = "3px solid #cc0000";
    }
  }

  function onClick(e) {
    const t = targetFromEvent(e);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const pending = {
      id: t.id,
      title: getTitleText(t.container),
      thumb: `https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`,
    };
    chrome.storage.local.set({ pending });
    stopPicking();
    showBanner("動画を選択しました。拡張機能のアイコンをクリックしてください");
    setTimeout(hideBanner, 3500);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      stopPicking();
      hideBanner();
    }
  }

  function startPicking() {
    if (picking) return;
    picking = true;
    // 全画面の透明レイヤーでマウス操作を横取りし、YouTube本体に届かないようにする
    overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:transparent;cursor:pointer;";
    overlay.addEventListener("mousemove", onMove, true);
    overlay.addEventListener("click", onClick, true);
    for (const type of ["mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu"]) {
      overlay.addEventListener(type, (e) => e.stopPropagation(), true);
    }
    document.documentElement.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
    showBanner("置き換えたい動画をクリック(Escでキャンセル)");
  }

  function stopPicking() {
    picking = false;
    if (overlay) overlay.remove();
    overlay = null;
    document.removeEventListener("keydown", onKey, true);
    clearHover();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "startPick") {
      startPicking();
      sendResponse({ ok: true });
    }
  });
})();
