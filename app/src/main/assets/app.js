(function() {
  "use strict";
  const $ = s => document.querySelector(s);
  const feed = $("#feed");
  const infoFeed = $("#infoFeed");
  const aiPanel = $("#aiPanel");
  const aiHistory = $("#aiHistory");
  const draft = $("#draft");
  const search = $("#search");
  const alarmDialog = $("#alarmDialog");
  const menuDialog = $("#menuDialog");
  const settingsDialog = $("#settingsDialog");
  const repeatSelect = $("#repeat");

  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem("notes") || "[]");
    if (!Array.isArray(notes)) notes = [];
  } catch (_) {
    notes = [];
  }
  notes = notes.map(n => ({
    ...n,
    repeat: n.repeat || "none",
    baseAt: n.baseAt || n.alarm || null
  }));

  let activeTab = "notes";
  let view = "all";
  let infoCat = "all";
  let draftAlarm = null;
  let draftRepeat = "none";
  let target = null;
  let newsItems = [];
  const pendingFetches = {};
  const pendingGemini = {};

  function androidCall(method, ...args) {
    if (window.Android && typeof window.Android[method] === "function") {
      return window.Android[method](...args);
    }
    return null;
  }

  window.applyAlarmUpdates = function(updatesJson) {
    try {
      const updates = JSON.parse(updatesJson);
      if (!Array.isArray(updates) || !updates.length) return;
      let changed = false;
      updates.forEach(u => {
        const note = notes.find(n => String(n.id) === String(u.id));
        if (note) {
          if (u.dismissed) {
            note.alarm = null;
            note.baseAt = null;
          } else if (u.at > 0) {
            note.alarm = u.at;
            note.baseAt = u.baseAt || u.at;
          }
          changed = true;
        }
      });
      if (changed) {
        save();
        render(false);
      }
      androidCall("clearAlarmUpdates");
    } catch (_) {}
  };

  function repeatLabel(r) {
    return ({ daily: "denně", weekly: "týdně", monthly: "měsíčně", yearly: "ročně" })[r] || "";
  }

  function syncAlarms() {
    const arr = notes
      .filter(n => !n.deleted && n.alarm && n.alarm > Date.now())
      .map(n => ({
        id: String(n.id),
        text: n.text,
        at: n.alarm,
        baseAt: n.baseAt || n.alarm,
        repeat: n.repeat || "none"
      }));
    androidCall("saveAlarmIndex", JSON.stringify(arr));
  }

  function save() {
    localStorage.setItem("notes", JSON.stringify(notes));
    syncAlarms();
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function fmt(t) {
    return new Date(t).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function render(bottom) {
    const q = search.value.trim().toLocaleLowerCase("cs");
    const now = Date.now();
    const list = notes.filter(n => {
      if (view === "trash" ? !n.deleted : n.deleted) return false;
      if (view === "pinned" && !n.pinned) return false;
      return !q || n.text.toLocaleLowerCase("cs").includes(q);
    });
    feed.innerHTML = list.length ? list.map(n => {
      const overdue = n.alarm && n.alarm < now;
      const rep = repeatLabel(n.repeat);
      return `<article class="note" data-id="${n.id}">
        <div class="top">
          <div class="text">${esc(n.text)}</div>
          <div class="tools">
            <button type="button" data-action="share">↗</button>
            <button type="button" data-action="menu">⋮</button>
          </div>
        </div>
        ${n.alarm ? `<button type="button" data-action="alarm" class="alarm ${overdue ? "overdue" : ""}">
          <span class="alarm-icon">${overdue ? "⚠" : "⏰"}</span>
          <span class="alarm-text">${overdue ? "Po termínu: " : ""}${fmt(n.alarm)}${rep ? ` · ${rep}` : ""}</span>
        </button>` : ""}
        <div class="meta"><span>${fmt(n.created)}</span><span>${n.pinned ? "📌 Připnuto" : ""}</span></div>
      </article>`;
    }).join("") : "<p style='text-align:center;color:#7b8885;margin-top:30px'>Žádné zápisky.</p>";
    if (bottom) feed.scrollTop = feed.scrollHeight;
  }

  function nativeSchedule(n) {
    const result = androidCall("scheduleAlarm", String(n.id), n.text, n.alarm, n.repeat || "none", n.baseAt || n.alarm);
    if (result === "exact_alarm_permission_required") {
      androidCall("openAlarmPermissions");
      alert("Povol aplikaci Budíky a připomenutí a potom termín nastav znovu.");
    }
    return result;
  }

  function openAlarm(n) {
    target = n || null;
    const a = target?.alarm || draftAlarm;
    $("#datetime").value = a ? new Date(a - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    repeatSelect.value = target?.repeat || draftRepeat || "none";
    alarmDialog.showModal();
  }

  function setAlarm(at) {
    const rep = repeatSelect.value || "none";
    if (target) {
      target.alarm = at;
      target.baseAt = at;
      target.repeat = rep;
      nativeSchedule(target);
    } else {
      draftAlarm = at;
      draftRepeat = rep;
    }
    save();
    alarmDialog.close();
    render(false);
  }

  [[5, "5 minut"], [10, "10 minut"], [30, "30 minut"], [60, "1 hodina"], [120, "2 hodiny"], [180, "3 hodiny"]].forEach(([m, t]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t;
    b.onclick = () => setAlarm(Date.now() + m * 60000);
    $("#quick").append(b);
  });

  $("#saveAlarm").onclick = () => {
    const at = new Date($("#datetime").value).getTime();
    if (at > Date.now()) setAlarm(at);
    else alert("Vyber budoucí datum a čas.");
  };
  $("#cancelAlarm").onclick = () => alarmDialog.close();
  $("#alarm").onclick = () => openAlarm(null);
  const RSS_SOURCES = [
    { cat: "domov", label: "ČT24 Domov", url: "https://ceskatelevize.cz" },
    { cat: "svet", label: "ČT24 Svět", url: "https://ceskatelevize.cz" },
    { cat: "filmy", label: "Filmy & Stream", url: "https://totalfilm.cz" },
    { cat: "hry", label: "GFN & Hry", url: "https://tiscali.cz" },
    { cat: "hry", label: "NVIDIA / GFN", url: "https://nvidia.com" },
    { cat: "vesmir", label: "Vesmír", url: "https://kosmonautix.cz" },
    { cat: "vesmir", label: "Fyzika & Věda", url: "https://osel.cz" }
  ];

  window.onNativeFetchResult = function(reqId, ok, body) {
    const cb = pendingFetches[reqId];
    if (cb) {
      delete pendingFetches[reqId];
      cb(ok, body);
    }
  };

  function fetchRssSource(src) {
    return new Promise(resolve => {
      const reqId = "req_" + Math.random().toString(36).slice(2);
      pendingFetches[reqId] = (ok, xmlText) => {
        if (!ok || !xmlText) return resolve([]);
        try {
          const doc = new DOMParser().parseFromString(xmlText, "text/xml");
          const items = Array.from(doc.querySelectorAll("item")).slice(0, 6).map(item => {
            const title = item.querySelector("title")?.textContent?.trim() || "";
            const link = item.querySelector("link")?.textContent?.trim() || "";
            const rawDesc = item.querySelector("description")?.textContent || "";
            const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim().slice(0, 150);
            const pubDate = item.querySelector("pubDate")?.textContent || "";
            const ts = pubDate ? Date.parse(pubDate) || Date.now() : Date.now();
            return { cat: src.cat, source: src.label, title, link, desc: cleanDesc, ts };
          });
          resolve(items);
        } catch (_) {
          resolve([]);
        }
      };
      if (androidCall("fetchUrl", reqId, src.url) === null) {
        resolve([]);
      }
    });
  }

  async function loadInfoFeed(force = false) {
    if (newsItems.length && !force) {
      renderInfoFeed();
      return;
    }
    infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Načítám aktuální zprávy...</p>";
    const results = await Promise.all(RSS_SOURCES.map(fetchRssSource));
    newsItems = results.flat().sort((a, b) => b.ts - a.ts);
    renderInfoFeed();
  }

  function renderInfoFeed() {
    const q = search.value.trim().toLocaleLowerCase("cs");
    const filtered = newsItems.filter(item => {
      if (infoCat !== "all" && item.cat !== infoCat) return false;
      return !q || item.title.toLocaleLowerCase("cs").includes(q) || item.desc.toLocaleLowerCase("cs").includes(q);
    });

    if (!filtered.length) {
      infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Žádné zprávy k zobrazení. Zkus obnovit (↻).</p>";
      return;
    }

    infoFeed.innerHTML = filtered.map((item, idx) => `
      <article class="news-card" data-idx="${idx}">
        <span class="news-badge">${esc(item.source)} · ${fmt(item.ts)}</span>
        <h4 class="news-title">${esc(item.title)}</h4>
        ${item.desc ? `<p class="news-desc">${esc(item.desc)}...</p>` : ""}
        <div class="news-actions">
          ${item.link ? `<button type="button" data-news-act="open">🔗 Číst</button>` : ""}
          <button type="button" data-news-act="save">⭐ Uložit</button>
          <button type="button" class="remind-btn" data-news-act="remind">🔔 Připomenout</button>
        </div>
      </article>
    `).join("");

    infoFeed.onclick = e => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const card = btn.closest(".news-card");
      const item = filtered[Number(card.dataset.idx)];
      if (!item) return;

      if (btn.dataset.newsAct === "open") {
        if (item.link) androidCall("openUrl", item.link);
      } else if (btn.dataset.newsAct === "save") {
        const noteText = item.link ? item.title + "\n" + item.link : item.title + "\n(" + item.source + ")";
        notes.push({
          id: Date.now(),
          text: noteText,
          created: Date.now(),
          alarm: null,
          baseAt: null,
          repeat: "none",
          pinned: false,
          deleted: false
        });
        save();
        btn.textContent = "✔ Uloženo";
      } else if (btn.dataset.newsAct === "remind") {
        const newNote = {
          id: Date.now(),
          text: item.title,
          created: Date.now(),
          alarm: null,
          baseAt: null,
          repeat: "none",
          pinned: false,
          deleted: false
        };
        notes.push(newNote);
        save();
        openAlarm(newNote);
      }
    };
  }

  window.onGeminiResult = function(reqId, ok, body) {
    const cb = pendingGemini[reqId];
    if (cb) {
      delete pendingGemini[reqId];
      cb(ok, body);
    }
  };

  function appendAiBubble(role, text, allowRemind = false) {
    const div = document.createElement("div");
    div.className = "ai-bubble " + role;
    div.textContent = text;
    if (allowRemind) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-action-btn";
      btn.textContent = "🔔 Vytvořit připomínku";
      btn.onclick = () => {
        const newNote = {
          id: Date.now(),
          text: text.slice(0, 120),
          created: Date.now(),
          alarm: null,
          baseAt: null,
          repeat: "none",
          pinned: false,
          deleted: false
        };
        notes.push(newNote);
        save();
        openAlarm(newNote);
      };
      div.appendChild(document.createElement("br"));
      div.appendChild(btn);
    }
    aiHistory.appendChild(div);
    aiPanel.scrollTop = aiPanel.scrollHeight;
    return div;
  }
