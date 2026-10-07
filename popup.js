const $ = (id) => document.getElementById(id);

let pending = null; // { id, title, thumb }
let newThumb = null; // data URL

function setMsg(text, isErr = false) {
  $("msg").textContent = text;
  $("msg").className = "msg" + (isErr ? " err" : "");
}

function updateApplyState() {
  $("apply").disabled = !(pending && newThumb && $("title").value.trim());
}

function renderPending() {
  $("selected").classList.toggle("hidden", !pending);
  if (pending) {
    $("selThumb").src = pending.thumb;
    $("selTitle").textContent = pending.title;
  }
  updateApplyState();
}

function makeVideoRow(label, thumb, title, href) {
  const row = document.createElement("div");
  row.className = "vrow";
  const tag = document.createElement("em");
  tag.textContent = label;
  const img = document.createElement("img");
  img.src = thumb;
  const span = document.createElement("span");
  span.textContent = title;
  if (href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.append(span);
    row.append(tag, img, a);
  } else {
    row.append(tag, img, span);
  }
  return row;
}

function renderList(rules) {
  const ids = Object.keys(rules);
  $("count").textContent = ids.length ? `(${ids.length})` : "";
  const ul = $("list");
  ul.textContent = "";
  if (!ids.length) {
    const li = document.createElement("li");
    li.textContent = "なし";
    ul.appendChild(li);
    return;
  }
  ids.forEach((id) => {
    const r = rules[id];
    const li = document.createElement("li");
    const rows = document.createElement("div");
    rows.className = "rows";
    rows.append(
      makeVideoRow(
        "元",
        `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        r.origTitle || `(元のタイトル不明) ${id}`,
        `https://www.youtube.com/watch?v=${id}`
      ),
      makeVideoRow("後", r.thumb, r.title)
    );
    const btn = document.createElement("button");
    btn.textContent = "解除";
    btn.addEventListener("click", () => {
      chrome.storage.local.get({ rules: {} }, (d) => {
        delete d.rules[id];
        chrome.storage.local.set({ rules: d.rules });
      });
    });
    li.append(rows, btn);
    ul.appendChild(li);
  });
}

// 画像を16:9に中央トリミングして縮小(保存サイズ節約)
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 1280, H = 720;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const scale = Math.max(W / img.width, H / img.height);
      const w = img.width * scale, h = img.height * scale;
      canvas.getContext("2d").drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = url;
  });
}

$("pick").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/www\.youtube\.com\//.test(tab.url || "")) {
    setMsg("YouTubeのページを開いてください", true);
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "startPick" });
    window.close();
  } catch {
    setMsg("ページを再読み込み(F5)してからもう一度お試しください", true);
  }
});

$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newThumb = await fileToDataUrl(file);
    $("preview").src = newThumb;
    $("preview").classList.remove("hidden");
  } catch (err) {
    newThumb = null;
    setMsg(err.message, true);
  }
  updateApplyState();
});

$("title").addEventListener("input", updateApplyState);

$("apply").addEventListener("click", () => {
  chrome.storage.local.get({ rules: {} }, (d) => {
    d.rules[pending.id] = { title: $("title").value.trim(), thumb: newThumb, origTitle: pending.title };
    chrome.storage.local.set({ rules: d.rules, pending: null }, () => {
      pending = null;
      newThumb = null;
      $("title").value = "";
      $("file").value = "";
      $("preview").classList.add("hidden");
      renderPending();
      setMsg("置き換えました");
    });
  });
});

$("reset").addEventListener("click", () => {
  if (!confirm("置き換えをすべてリセットして元に戻しますか?")) return;
  chrome.storage.local.set({ rules: {} }, () => setMsg("リセットしました"));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.rules) renderList(changes.rules.newValue || {});
  if (changes.pending) {
    pending = changes.pending.newValue || null;
    renderPending();
  }
});

chrome.storage.local.get({ rules: {}, pending: null }, (d) => {
  pending = d.pending;
  renderPending();
  renderList(d.rules);
});
