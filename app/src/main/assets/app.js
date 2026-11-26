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

  const DEFAULT_TOPICS = "Zprávy z Česka, světové novinky, filmy a seriály (Netflix/HBO), GeForce NOW a hry, fyzika a vesmír";

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
  let infoCat = "prehled";
  let draftAlarm = null;
  let draftRepeat = "none";
  let target = null;
  let newsItems = [];
  let weatherCache = null;
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
            note.baseAt = null;
            changed = true;
          } else if (u.at > 0) {
            note.alarm = u.at;
            note.baseAt = u.baseAt || u.at;
            changed = true;
          }
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
      const overdue = n.alarm && n.alarm <= now;
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

  setInterval(() => {
    if (activeTab === "notes" && !alarmDialog.open && !menuDialog.open && !settingsDialog.open) {
      render(false);
    }
  }, 30000);

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
    const a = (target?.alarm && target.alarm > Date.now()) ? target.alarm : draftAlarm;
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
    { cat: "domov", label: "ČT24 Domov", url: "https://" + "ct24." + "ceskatelevize." + "cz/rss/tema/domaci-9025" },
    { cat: "domov", label: "iROZHLAS ČR", url: "https://" + "www." + "irozhlas." + "cz/rss/irozhlas/section/zpravy-domov" },
    { cat: "svet", label: "ČT24 Svět", url: "https://" + "ct24." + "ceskatelevize." + "cz/rss/tema/svet-9026" },
    { cat: "filmy", label: "Filmy & Kino", url: "https://" + "www." + "totalfilm." + "cz/feed/" },
    { cat: "filmy", label: "Nové trailery", url: "https://" + "www." + "totalfilm." + "cz/kategorie/trailery/feed/" },
    { cat: "filmy", label: "Streamy & VOD", url: "https://" + "filmtoro." + "cz/rss" },
    { cat: "hry", label: "GFN & Hry", url: "https://" + "games." + "tiscali." + "cz/rss" },
    { cat: "hry", label: "NVIDIA / GFN", url: "https://" + "nvidianews." + "nvidia." + "com/releases.xml" },
    { cat: "vesmir", label: "Vesmír", url: "https://" + "kosmonautix." + "cz/feed/" },
    { cat: "vesmir", label: "Fyzika & Věda", url: "https://" + "www." + "osel." + "cz/rss.php" }
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
      if (androidCall("fetchUrl", reqId, src.url) === null) resolve([]);
    });
  }
  function wmoToCzech(code) {
    if (code === 0) return { icon: "☀️", text: "Jasno" };
    if (code === 1 || code === 2) return { icon: "⛅", text: "Polojasno" };
    if (code === 3) return { icon: "☁️", text: "Zataženo" };
    if (code === 45 || code === 48) return { icon: "🌫️", text: "Mlha" };
    if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Mrholení" };
    if (code >= 61 && code <= 67) return { icon: "🌧️", text: "Déšť" };
    if (code >= 71 && code <= 77) return { icon: "❄️", text: "Sněžení" };
    if (code >= 80 && code <= 82) return { icon: "🌦️", text: "Přeháňky" };
    if (code >= 85 && code <= 86) return { icon: "🌨️", text: "Sněhové přeháňky" };
    if (code >= 95) return { icon: "⛈️", text: "Bouřka" };
    return { icon: "🌤️", text: "Proměnlivo" };
  }

  function fetchWeatherData() {
    return new Promise(resolve => {
      const reqId = "w_" + Math.random().toString(36).slice(2);
      const wUrl = "https://" + "api." + "open-meteo." + "com/v1/forecast?latitude=50.11&longitude=14.50" +
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m" +
        "&hourly=temperature_2m,weather_code,precipitation_probability" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
        "&timezone=Europe%2FPrague&forecast_days=5";

      pendingFetches[reqId] = (ok, body) => {
        if (!ok || !body) return resolve(null);
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          resolve(null);
        }
      };
      if (androidCall("fetchUrl", reqId, wUrl) === null) resolve(null);
    });
  }

  function renderWeatherView() {
    if (!weatherCache || !weatherCache.current) {
      infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Nepodařilo se načíst počasí. Zkus obnovit (↻).</p>";
      return;
    }
    const c = weatherCache.current;
    const st = wmoToCzech(c.weather_code);
    const nowHourIdx = Math.max(0, (weatherCache.hourly?.time || []).findIndex(t => Date.parse(t) >= Date.now() - 3600000));

    const hourlyHtml = (weatherCache.hourly?.time || []).slice(nowHourIdx, nowHourIdx + 12).map((t, i) => {
      const idx = nowHourIdx + i;
      const hr = t.slice(11, 16);
      const temp = Math.round(weatherCache.hourly.temperature_2m[idx]);
      const pop = weatherCache.hourly.precipitation_probability?.[idx] ?? 0;
      const hSt = wmoToCzech(weatherCache.hourly.weather_code[idx]);
      return "<div class='weather-hour'><span>" + hr + "</span><span style='font-size:18px;margin:4px 0'>" + hSt.icon + "</span><strong>" + temp + "°</strong><span style='font-size:11px;color:#5a756c'>" + (pop > 0 ? "💧" + pop + "%" : "") + "</span></div>";
    }).join("");

    const daysCz = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
    const dailyHtml = (weatherCache.daily?.time || []).map((dStr, i) => {
      const d = new Date(dStr + "T12:00:00");
      const dayName = i === 0 ? "Dnes" : daysCz[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + ".";
      const dSt = wmoToCzech(weatherCache.daily.weather_code[i]);
      const tMin = Math.round(weatherCache.daily.temperature_2m_min[i]);
      const tMax = Math.round(weatherCache.daily.temperature_2m_max[i]);
      const pop = weatherCache.daily.precipitation_probability_max?.[i] ?? 0;
      return "<div class='weather-day-row'><span style='width:85px;font-weight:600'>" + dayName + "</span><span>" + dSt.icon + " " + dSt.text + "</span><span style='font-size:12px;color:#5a756c'>" + (pop > 10 ? "💧" + pop + "%" : "") + "</span><strong>" + tMin + "° / " + tMax + "°</strong></div>";
    }).join("");

    infoFeed.innerHTML =
      "<article class='news-card' style='background:linear-gradient(135deg,#e7f0ec,#f7faf8)'>" +
      "<div style='display:flex;justify-content:space-between;align-items:center'><div>" +
      "<span class='news-badge'>Praha 9 · Právě teď</span>" +
      "<div style='font-size:42px;font-weight:700;color:#1a2b25;line-height:1.1'>" + Math.round(c.temperature_2m) + " °C</div>" +
      "<div style='color:#314c44;font-weight:600;margin-top:4px'>" + st.text + " · Pocitově " + Math.round(c.apparent_temperature) + " °C</div>" +
      "</div><div style='font-size:56px'>" + st.icon + "</div></div>" +
      "<div style='display:flex;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid #d5e2dd;font-size:13px;color:#314c44'>" +
      "<span>💨 Vítr: " + Math.round(c.wind_speed_10m) + " km/h</span><span>💧 Vlhkost: " + c.relative_humidity_2m + " %</span>" +
      "</div></article>" +
      "<article class='news-card'><span class='news-badge'>Nejbližších 12 hodin</span><div class='weather-hours-scroll'>" + hourlyHtml + "</div></article>" +
      "<article class='news-card'><span class='news-badge'>Výhled na 5 dní</span>" + dailyHtml + "</article>";
  }

  function getThreeHourSlotKey() {
    const block = Math.floor(Date.now() / (1.5 * 3600 * 1000));
    return "digest_90m_" + block;
  }

  function formatDigestHtml(rawText, indexedItems) {
    let safe = esc(rawText);
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\[(\d+)\]/g, (_, numStr) => {
      const idx = Number(numStr) - 1;
      const item = indexedItems[idx];
      if (!item || !item.link) return "";
      return " <a href='#' class='digest-link' data-url='" + esc(item.link) + "'>🔗 Číst</a>";
    });
    return safe.replace(/\n/g, "<br>");
  }

  function showDigestCard(html, ts) {
    infoFeed.innerHTML =
      "<article class='news-card' style='line-height:1.55'>" +
      "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'>" +
      "<span class='news-badge'>✨ AI Přehled (1,5 h) · " + fmt(ts) + "</span>" +
      "<button type='button' id='regenDigestBtn' style='font-size:12px;padding:4px 10px;border-radius:12px;border:1px solid #cddbd6;background:#f2f7f5;color:#1a2b25'>↻ Nový souhrn</button>" +
      "</div><div class='digest-body' style='font-size:14px;color:#1a2b25'>" + html + "</div></article>";

    const regen = $("#regenDigestBtn");
    if (regen) regen.onclick = () => renderDailyDigest(true);
    infoFeed.querySelectorAll(".digest-link").forEach(a => {
      a.onclick = e => {
        e.preventDefault();
        if (a.dataset.url) androidCall("openUrl", a.dataset.url);
      };
    });
  }

  function renderDailyDigest(force = false) {
    const apiKey = (localStorage.getItem("gemini_api_key") || "").trim();
    if (!apiKey) {
      infoFeed.innerHTML = "<article class='news-card'><span class='news-badge'>✨ AI Přehled</span><p class='news-desc'>Pro automatický souhrn vlož nejprve svůj <strong>Gemini API klíč</strong> pod ikonkou <strong>⚙</strong>.</p></article>";
      return;
    }

    const slotKey = getThreeHourSlotKey();
    const cachedRaw = !force ? localStorage.getItem(slotKey) : null;
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        showDigestCard(cached.html, cached.ts);
        return;
      } catch (_) {}
    }

    infoFeed.innerHTML = "<article class='news-card'><span class='news-badge'>✨ AI Přehled · 1,5 h</span><p style='color:#5a756c;margin:10px 0'>Připravuji aktuální souhrn podle tvých témat...</p></article>";

    const indexedItems = [];
    ["domov", "svet", "filmy", "hry", "vesmir"].forEach(cat => {
      newsItems.filter(x => x.cat === cat).slice(0, 6).forEach(item => {
        indexedItems.push(item);
      });
    });

    const articlesList = indexedItems.map((it, i) =>
      "[" + (i + 1) + "] (" + it.source + ") " + it.title
    ).join("\n");

    let weatherCtx = "Počasí se nepodařilo načíst.";
    if (weatherCache?.current && weatherCache?.daily) {
      const c = weatherCache.current;
      const d = weatherCache.daily;
      weatherCtx = "Praha 9 právě teď: " + Math.round(c.temperature_2m) + " °C (pocitově " + Math.round(c.apparent_temperature) + " °C), " + wmoToCzech(c.weather_code).text + ". " +
        "Dnes max " + Math.round(d.temperature_2m_max.at(0)) + " °C / min " + Math.round(d.temperature_2m_min.at(0)) + " °C, srážky " + (d.precipitation_probability_max?.at(0) ?? 0) + "%. " +
        "Zítra " + wmoToCzech(d.weather_code.at(1)).text + ", " + Math.round(d.temperature_2m_min.at(1)) + " až " + Math.round(d.temperature_2m_max.at(1)) + " °C.";
    }

    const userTopics = (localStorage.getItem("ai_digest_topics") || DEFAULT_TOPICS).trim() || DEFAULT_TOPICS;

    const prompt =
      "Vytvoř stručný přehled novinek v češtině pro Prahu 9 (" + fmt(Date.now()) + ").\n" +
      "Začni krátkou sekcí 🌤 **Počasí** (3 krátké odrážky) a potom přehledně rozděl novinky podle těchto témat uživatele:\n" +
      userTopics + "\n\n" +
      "Pravidla: Každé téma napiš jako tučný nadpis s vhodným emoji a pod něj dej přesně 3 krátké, věcné odrážky z dodaných titulků. Když zmiňuješ položku ze seznamu, napiš za větu její číslo v hranaté závorce např..\n\n" +
      "POČASÍ:\n" + weatherCtx + "\n\n" +
      "TITULKY:\n" + articlesList;

    const payload = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    const reqId = "dig_" + Math.random().toString(36).slice(2);

    pendingGemini[reqId] = (ok, respBody) => {
      if (!ok) {
        let errDetail = respBody;
        try { errDetail = JSON.parse(respBody)?.error?.message || respBody; } catch (_) {}
        infoFeed.innerHTML = "<article class='news-card'><span class='news-badge'>✨ AI Přehled</span><p class='news-desc'>Chyba AI (" + esc(String(errDetail).slice(0, 120)) + "). Zkus klepnout na ↻ nahoře.</p></article>";
        return;
      }
      try {
        const data = JSON.parse(respBody);
        const parts = data?.candidates?.at(0)?.content?.parts;
        const text = Array.isArray(parts) ? parts.map(p => p.text || "").join("").trim() : "";
        if (!text) throw new Error("empty");
        const html = formatDigestHtml(text, indexedItems);
        const ts = Date.now();
        localStorage.setItem(slotKey, JSON.stringify({ html, ts }));
        showDigestCard(html, ts);
      } catch (_) {
        infoFeed.innerHTML = "<article class='news-card'><span class='news-badge'>✨ AI Přehled</span><p class='news-desc'>Chyba při zpracování souhrnu. Zkus obnovit (↻).</p></article>";
      }
    };

    androidCall("askGemini", reqId, apiKey, payload);
  }
  async function loadInfoFeed(force = false) {
    if (infoCat === "pocasi") {
      if (weatherCache && !force) {
        renderWeatherView();
        return;
      }
      infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Načítám předpověď počasí...</p>";
      weatherCache = await fetchWeatherData();
      renderWeatherView();
      return;
    }

    if (newsItems.length && !force) {
      if (infoCat === "prehled") renderDailyDigest(false);
      else renderInfoFeed();
      return;
    }
    infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Načítám aktuální zprávy...</p>";
    const [results, wData] = await Promise.all([
      Promise.all(RSS_SOURCES.map(fetchRssSource)),
      weatherCache ? Promise.resolve(weatherCache) : fetchWeatherData()
    ]);
    if (wData) weatherCache = wData;
    newsItems = results.flat().sort((a, b) => b.ts - a.ts);
    if (infoCat === "prehled") renderDailyDigest(force);
    else renderInfoFeed();
  }

  function renderInfoFeed() {
    if (infoCat === "pocasi") {
      loadInfoFeed(false);
      return;
    }
    if (infoCat === "prehled") {
      if (!newsItems.length || !weatherCache) loadInfoFeed(false);
      else renderDailyDigest(false);
      return;
    }
    const q = search.value.trim().toLocaleLowerCase("cs");
    const filtered = newsItems.filter(item => {
      if (infoCat !== "all" && item.cat !== infoCat) return false;
      return !q || item.title.toLocaleLowerCase("cs").includes(q) || item.desc.toLocaleLowerCase("cs").includes(q);
    });

    if (!filtered.length) {
      infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Žádné zprávy k zobrazení. Zkus obnovit (↻).</p>";
      return;
    }

    infoFeed.innerHTML = filtered.map((item, idx) =>
      "<article class='news-card' data-idx='" + idx + "'>" +
      "<span class='news-badge'>" + esc(item.source) + " · " + fmt(item.ts) + "</span>" +
      "<h4 class='news-title'>" + esc(item.title) + "</h4>" +
      (item.desc ? "<p class='news-desc'>" + esc(item.desc) + "...</p>" : "") +
      "<div class='news-actions'>" +
      (item.link ? "<button type='button' data-news-act='open'>🔗 Číst</button>" : "") +
      "<button type='button' data-news-act='save'>⭐ Uložit</button>" +
      "<button type='button' class='remind-btn' data-news-act='remind'>🔔 Připomenout</button>" +
      "</div></article>"
    ).join("");

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
        btn.textContent = "✓ Uloženo";
      } else if (btn.dataset.newsAct === "remind") {
        target = null;
        draft.value = item.title;
        openAlarm(null);
      }
    };
  }

  window.onNativeGeminiResult = function(reqId, ok, respBody) {
    const cb = pendingGemini[reqId];
    if (cb) {
      delete pendingGemini[reqId];
      cb(ok, respBody);
    }
  };

  function appendAiBubble(role, text, withActions = false) {
    const div = document.createElement("div");
    div.className = "ai-bubble " + role;
    if (role === "assistant") {
      div.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    } else {
      div.textContent = text;
    }
    if (withActions && text) {
      const actRow = document.createElement("div");
      actRow.className = "news-actions";
      actRow.style.marginTop = "8px";
      const saveB = document.createElement("button");
      saveB.type = "button";
      saveB.textContent = "⭐ Uložit do poznámek";
      saveB.onclick = () => {
        notes.push({ id: Date.now(), text, created: Date.now(), alarm: null, baseAt: null, repeat: "none", pinned: false, deleted: false });
        save();
        saveB.textContent = "✓ Uloženo";
      };
      const remB = document.createElement("button");
      remB.type = "button";
      remB.textContent = "🔔 Připomenout";
      remB.onclick = () => {
        target = null;
        draft.value = text.slice(0, 100);
        openAlarm(null);
      };
      actRow.append(saveB, remB);
      div.appendChild(actRow);
    }
    aiHistory.appendChild(div);
    aiPanel.scrollTop = aiPanel.scrollHeight;
    return div;
  }
  function sendAiQuery(question) {
    const apiKey = (localStorage.getItem("gemini_api_key") || "").trim();
    if (!apiKey) {
      appendAiBubble("system", "Nemáš nastavený Gemini API klíč. Klikni na ⚙ v záložce Připomínkovač (📝) a vlož svůj klíč z Google AI Studio.");
      return;
    }

    appendAiBubble("user", question);
    const loadingBubble = appendAiBubble("system", "Přemýšlím a hledám...");

    const activeNotes = notes.filter(n => !n.deleted).map(n =>
      "- " + n.text + (n.alarm ? " [Budík: " + fmt(n.alarm) + "]" : "")
    ).join("\n");

    const newsSummary = newsItems.slice(0, 15).map(i => "- [" + i.source + "] " + i.title).join("\n");
    const weatherSummary = weatherCache?.current
      ? "Praha 9 právě teď: " + Math.round(weatherCache.current.temperature_2m) + " °C (pocitově " + Math.round(weatherCache.current.apparent_temperature) + " °C), " + wmoToCzech(weatherCache.current.weather_code).text + "."
      : "";

    const systemPrompt =
      "Jsi osobní český asistent v aplikaci Připomínkovač. Dnes je " + fmt(Date.now()) + ".\n" +
      "Odpovídej stručně, věcně a česky.\n\n" +
      (weatherSummary ? "AKTUÁLNÍ POČASÍ:\n" + weatherSummary + "\n\n" : "") +
      "ULOŽENÉ POZNÁMKY A BUDÍKY UŽIVATELE:\n" + (activeNotes || "(žádné)") + "\n\n" +
      "POSLEDNÍ ZPRÁVY Z INFOKANÁLU:\n" + (newsSummary || "(zatím nenačteno)");

    const payload = JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt + "\n\nDotaz uživatele: " + question }] }]
    });

    const reqId = "gem_" + Math.random().toString(36).slice(2);
    pendingGemini[reqId] = (ok, respBody) => {
      loadingBubble.remove();
      if (!ok) {
        let errDetail = respBody;
        try {
          errDetail = JSON.parse(respBody)?.error?.message || respBody;
        } catch (_) {}
        appendAiBubble("assistant", "Chyba Gemini API: " + errDetail);
        return;
      }
      try {
        const data = JSON.parse(respBody);
        const parts = data?.candidates?.at(0)?.content?.parts;
        const answer = Array.isArray(parts) ? parts.map(p => p.text || "").join("") : "Nepodařilo se získat odpověď.";
        appendAiBubble("assistant", answer.trim(), true);
      } catch (_) {
        appendAiBubble("assistant", "Nepodařilo se zpracovat odpověď od Gemini.");
      }
    };

    if (androidCall("askGemini", reqId, apiKey, payload) === null) {
      loadingBubble.remove();
      appendAiBubble("system", "Tato funkce vyžaduje spuštění v Android aplikaci.");
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

    feed.classList.toggle("hidden", tab !== "notes");
    infoFeed.classList.toggle("hidden", tab !== "info");
    aiPanel.classList.toggle("hidden", tab !== "ai");

    $("#subNavNotes").classList.toggle("hidden", tab !== "notes");
    $("#subNavFeed").classList.toggle("hidden", tab !== "info");

    if (tab === "notes") {
      draft.placeholder = "Napiš nebo nadiktuj zápisek...";
      $("#add").textContent = "Přidat";
      $("#alarm").classList.remove("hidden");
      render(false);
    } else if (tab === "info") {
      draft.placeholder = "Rychlý zápisek k přečtenému článku...";
      $("#add").textContent = "Uložit";
      $("#alarm").classList.add("hidden");
      loadInfoFeed(false);
    } else if (tab === "ai") {
      draft.placeholder = "Zeptej se Gemini (např. Mám připomínku na STK?)...";
      $("#add").textContent = "Zeptat se";
      $("#alarm").classList.add("hidden");
      aiPanel.scrollTop = aiPanel.scrollHeight;
    }
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  $("#add").onclick = () => {
    const text = draft.value.trim();
    if (!text) return;
    if (activeTab === "ai") {
      draft.value = "";
      sendAiQuery(text);
      return;
    }
    const n = {
      id: Date.now(),
      text,
      created: Date.now(),
      alarm: draftAlarm,
      baseAt: draftAlarm,
      repeat: draftRepeat,
      pinned: false,
      deleted: false
    };
    notes.push(n);
    if (n.alarm) nativeSchedule(n);
    draft.value = "";
    localStorage.removeItem("draft");
    draftAlarm = null;
    draftRepeat = "none";
    save();
    if (activeTab !== "notes") switchTab("notes");
    render(true);
    draft.blur();
  };

  draft.value = localStorage.getItem("draft") || "";
  draft.oninput = () => localStorage.setItem("draft", draft.value);

  search.oninput = () => {
    if (activeTab === "notes") render(false);
    else if (activeTab === "info") renderInfoFeed();
  };

  document.querySelectorAll("#subNavNotes [data-view]").forEach(b => b.onclick = () => {
    view = b.dataset.view;
    document.querySelectorAll("#subNavNotes [data-view]").forEach(x => x.classList.toggle("active", x === b));
    render(false);
  });

  document.querySelectorAll("#subNavFeed [data-cat]").forEach(b => b.onclick = () => {
    infoCat = b.dataset.cat;
    document.querySelectorAll("#subNavFeed [data-cat]").forEach(x => x.classList.toggle("active", x === b));
    renderInfoFeed();
  });
  $("#refreshFeed").onclick = () => loadInfoFeed(true);

  feed.onclick = e => {
    const card = e.target.closest(".note");
    if (!card) return;
    target = notes.find(n => String(n.id) === card.dataset.id);
    if (!target) return;
    const a = e.target.closest("button")?.dataset.action;
    if (a === "alarm") openAlarm(target);
    if (a === "share") androidCall("share", target.text);
    if (a === "menu") openMenu();
  };

  function openMenu() {
    const box = $("#menuItems");
    box.innerHTML = "";
    const items = target.deleted
      ? [["Obnovit", "restore"], ["Smazat natrvalo", "perma"]]
      : [
          ["Upravit text", "edit"],
          ["Změnit upomínku", "alarm"],
          [target.pinned ? "Odepnout" : "Připnout", "pin"],
          ["Poslat e-mailem", "email"],
          ["Přesunout do koše", "delete"]
        ];
    items.forEach(([t, a]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item";
      b.textContent = t;
      b.onclick = () => menuAction(a);
      box.append(b);
    });
    menuDialog.showModal();
  }

  function menuAction(a) {
    if (a === "edit") {
      const v = prompt("Upravit text", target.text);
      if (v?.trim()) {
        target.text = v.trim();
        if (target.alarm) nativeSchedule(target);
      }
    }
    if (a === "alarm") {
      menuDialog.close();
      openAlarm(target);
      return;
    }
    if (a === "pin") target.pinned = !target.pinned;
    if (a === "email") androidCall("email", target.text);
    if (a === "delete") {
      target.deleted = true;
      androidCall("cancelAlarm", String(target.id));
    }
    if (a === "restore") target.deleted = false;
    if (a === "perma") {
      androidCall("cancelAlarm", String(target.id));
      notes = notes.filter(n => n !== target);
    }
    save();
    menuDialog.close();
    render(false);
  }

  $("#closeMenu").onclick = () => menuDialog.close();

  $("#settings").onclick = () => {
    $("#geminiKeyInput").value = localStorage.getItem("gemini_api_key") || "";
    const topicsEl = $("#aiTopicsInput");
    if (topicsEl) {
      topicsEl.value = localStorage.getItem("ai_digest_topics") || DEFAULT_TOPICS;
    }
    const soundSel = $("#alarmSoundSelect");
    if (soundSel) {
      const raw = androidCall("getAlarmSounds");
      if (raw) {
        try {
          const data = JSON.parse(raw);
          soundSel.innerHTML = (data.sounds || []).map(s =>
            `<option value="${esc(s.uri)}">${esc(s.title)}</option>`
          ).join("");
          soundSel.value = data.selected || "";
        } catch (_) {}
      }
    }
    settingsDialog.showModal();
  };
  $("#closeSettings").onclick = () => settingsDialog.close();
  $("#saveSettings").onclick = () => {
    const key = $("#geminiKeyInput").value.trim();
    localStorage.setItem("gemini_api_key", key);
    const topicsEl = $("#aiTopicsInput");
    if (topicsEl) {
      const prevTopics = localStorage.getItem("ai_digest_topics") || DEFAULT_TOPICS;
      const newTopics = topicsEl.value.trim() || DEFAULT_TOPICS;
      localStorage.setItem("ai_digest_topics", newTopics);
      if (prevTopics !== newTopics) {
        localStorage.removeItem(getThreeHourSlotKey());
      }
    }
    const soundSel = $("#alarmSoundSelect");
    if (soundSel) {
      androidCall("setAlarmSound", soundSel.value || "");
    }
    settingsDialog.close();
  };

  render(true);
})();
