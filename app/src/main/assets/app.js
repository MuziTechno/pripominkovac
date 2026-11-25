(() => {
  const $ = s => document.querySelector(s);
  const feed = $("#feed"), infoFeed = $("#infoFeed"), aiPanel = $("#aiPanel");
  const draft = $("#draft"), search = $("#search");
  const alarmDialog = $("#alarmDialog"), settingsDialog = $("#settingsDialog"), apiKeyInput = $("#apiKeyInput");
  const subNavNotes = $("#subNavNotes"), subNavFeed = $("#subNavFeed");
  const addBtn = $("#add"), alarmBtn = $("#alarm");

  let view = "all";
  let activeTab = "notes";
  let infoCat = "all";
  let alarmTarget = null;
  let notes = [];
  let newsItems = [];
  let weatherCache = null;

  const pendingFetches = {};
  const pendingGemini = {};

  function androidCall(method, ...args) {
    try {
      if (window.Android && typeof window.Android[method] === "function") {
        return window.Android[method](...args);
      }
    } catch (_) {}
    return null;
  }

  function loadNotes() {
    try {
      notes = JSON.parse(localStorage.getItem("notes_v1") || "[]");
    } catch (_) {
      notes = [];
    }
    try {
      const updatesRaw = androidCall("consumeAlarmUpdates");
      if (updatesRaw) {
        const updates = JSON.parse(updatesRaw);
        let changed = false;
        updates.forEach(u => {
          const n = notes.find(x => String(x.id) === String(u.id));
          if (n) {
            if (u.dismissed) {
              n.alarm = null;
            } else if (u.at > 0) {
              n.alarm = u.at;
              if (u.baseAt > 0) n.baseAt = u.baseAt;
            }
            changed = true;
          }
        });
        if (changed) saveNotes();
      }
    } catch (_) {}
  }

  function saveNotes() {
    localStorage.setItem("notes_v1", JSON.stringify(notes));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fmt(ts) {
    return new Date(ts).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function setAlarm(at, prefillText = null) {
    const repeat = $("#repeat").value || "none";
    if (alarmTarget) {
      const n = notes.find(x => x.id === alarmTarget);
      if (n) {
        n.alarm = at;
        n.baseAt = at;
        n.repeat = repeat;
        saveNotes();
        androidCall("scheduleAlarm", String(n.id), n.text.slice(0, 80), at, repeat, at);
      }
    } else {
      const text = (prefillText || draft.value).trim();
      if (!text) return;
      const id = Date.now();
      notes.push({ id, text, created: id, alarm: at, baseAt: at, repeat, pinned: false, deleted: false });
      saveNotes();
      androidCall("scheduleAlarm", String(id), text.slice(0, 80), at, repeat, at);
      if (!prefillText) draft.value = "";
    }
    alarmDialog.close();
    renderNotes();
  }

  function openAlarm(id, prefillText = null) {
    alarmTarget = id;
    const d = new Date(Date.now() + 3600_000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $("#datetime").value = d.toISOString().slice(0, 16);
    $("#repeat").value = "none";

    const quick = $("#quick");
    quick.innerHTML = "";
    [["Za 15 min", 15], ["Za 1 hodinu", 60], ["Za 3 hodiny", 180], ["Zítra ráno", "tomorrow"]].forEach(([lbl, val]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = lbl;
      b.onclick = () => {
        if (val === "tomorrow") {
          const t = new Date();
          t.setDate(t.getDate() + 1);
          t.setHours(8, 0, 0, 0);
          setAlarm(t.getTime(), prefillText);
        } else {
          setAlarm(Date.now() + val * 60_000, prefillText);
        }
      };
      quick.appendChild(b);
    });

    $("#saveAlarm").onclick = () => {
      const at = new Date($("#datetime").value).getTime();
      if (at > Date.now()) setAlarm(at, prefillText);
      else alert("Vyber budoucí datum a čas.");
    };
    alarmDialog.showModal();
  }

  function renderNotes() {
    const q = search.value.trim().toLocaleLowerCase("cs");
    const list = notes
      .filter(n => {
        if (view === "trash") return n.deleted;
        if (n.deleted) return false;
        if (view === "pinned") return n.pinned;
        return true;
      })
      .filter(n => !q || n.text.toLocaleLowerCase("cs").includes(q))
      .sort((a, b) => (b.pinned - a.pinned) || (b.created - a.created));

    if (!list.length) {
      feed.innerHTML = `<p style="text-align:center;color:#7b8885;margin-top:40px">Žádné zápisky.</p>`;
      return;
    }

    feed.innerHTML = list.map(n => {
      const overdue = n.alarm && n.alarm < Date.now();
      return `
        <article class="card ${n.pinned ? "pinned" : ""}" data-id="${n.id}">
          <div class="meta">
            <span>${fmt(n.created)}</span>
            ${n.alarm ? `<span class="badge ${overdue ? "overdue" : ""}">⏰ ${fmt(n.alarm)}</span>` : ""}
          </div>
          <p class="body">${esc(n.text)}</p>
          <div class="actions">
            ${view === "trash"
              ? `<button type="button" data-act="restore">Obnovit</button><button type="button" data-act="purge">Smazat navždy</button>`
              : `<button type="button" data-act="pin">${n.pinned ? "Odepnout" : "Připnout"}</button>
                 <button type="button" data-act="alarm">⏰ Budík</button>
                 ${n.alarm ? `<button type="button" data-act="cancelAlarm">Zrušit budík</button>` : ""}
                 <button type="button" data-act="del">Smazat</button>`}
          </div>
        </article>`;
    }).join("");
  }

  feed.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = Number(btn.closest(".card").dataset.id);
    const n = notes.find(x => x.id === id);
    if (!n) return;
    const act = btn.dataset.act;
    if (act === "pin") n.pinned = !n.pinned;
    else if (act === "del") { n.deleted = true; if (n.alarm) { androidCall("cancelAlarm", String(n.id)); n.alarm = null; } }
    else if (act === "restore") n.deleted = false;
    else if (act === "purge") notes = notes.filter(x => x.id !== id);
    else if (act === "alarm") return openAlarm(id);
    else if (act === "cancelAlarm") { androidCall("cancelAlarm", String(n.id)); n.alarm = null; }
    saveNotes();
    renderNotes();
  };

  $("#cancelAlarm").onclick = () => alarmDialog.close();
  $("#alarm").onclick = () => openAlarm(null);
  const RSS_SOURCES = [
    { cat: "domov", label: "ČT24 Domov", url: "https://" + "ct24." + "ceskatelevize." + "cz/rss/tema/domaci-11220" },
    { cat: "svet", label: "ČT24 Svět", url: "https://" + "ct24." + "ceskatelevize." + "cz/rss/tema/svet-11221" },
    { cat: "filmy", label: "Filmy & Stream", url: "https://" + "www." + "totalfilm." + "cz/feed/" },
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
      return `<div class="weather-hour">
        <span>${hr}</span>
        <span style="font-size:18px;margin:4px 0">${hSt.icon}</span>
        <strong>${temp}°</strong>
        <span style="font-size:11px;color:#5a756c">${pop > 0 ? "💧" + pop + "%" : ""}</span>
      </div>`;
    }).join("");

    const daysCz = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
    const dailyHtml = (weatherCache.daily?.time || []).map((dStr, i) => {
      const d = new Date(dStr + "T12:00:00");
      const dayName = i === 0 ? "Dnes" : daysCz[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + ".";
      const dSt = wmoToCzech(weatherCache.daily.weather_code[i]);
      const tMin = Math.round(weatherCache.daily.temperature_2m_min[i]);
      const tMax = Math.round(weatherCache.daily.temperature_2m_max[i]);
      const pop = weatherCache.daily.precipitation_probability_max?.[i] ?? 0;
      return `<div class="weather-day-row">
        <span style="width:85px;font-weight:600">${dayName}</span>
        <span>${dSt.icon} ${dSt.text}</span>
        <span style="font-size:12px;color:#5a756c">${pop > 10 ? "💧" + pop + "%" : ""}</span>
        <strong>${tMin}° / ${tMax}°</strong>
      </div>`;
    }).join("");

    infoFeed.innerHTML = `
      <article class="news-card" style="background:linear-gradient(135deg,#e7f0ec,#f7faf8)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span class="news-badge">Praha 9 · Právě teď</span>
            <div style="font-size:42px;font-weight:700;color:#1a2b25;line-height:1.1">${Math.round(c.temperature_2m)} °C</div>
            <div style="color:#314c44;font-weight:600;margin-top:4px">${st.text} · Pocitově ${Math.round(c.apparent_temperature)} °C</div>
          </div>
          <div style="font-size:56px">${st.icon}</div>
        </div>
        <div style="display:flex;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid #d5e2dd;font-size:13px;color:#314c44">
          <span>💨 Vítr: ${Math.round(c.wind_speed_10m)} km/h</span>
          <span>💧 Vlhkost: ${c.relative_humidity_2m} %</span>
        </div>
      </article>
      <article class="news-card">
        <span class="news-badge">Nejbližších 12 hodin</span>
        <div class="weather-hours-scroll">${hourlyHtml}</div>
      </article>
      <article class="news-card">
        <span class="news-badge">Výhled na 5 dní</span>
        ${dailyHtml}
      </article>
    `;
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
      renderInfoFeed();
      return;
    }
    infoFeed.innerHTML = "<p style='text-align:center;color:#7b8885;margin-top:30px'>Načítám aktuální zprávy...</p>";
    const [results, wData] = await Promise.all([
      Promise.all(RSS_SOURCES.map(fetchRssSource)),
      weatherCache ? Promise.resolve(weatherCache) : fetchWeatherData()
    ]);
    if (wData) weatherCache = wData;
    newsItems = results.flat().sort((a, b) => b.ts - a.ts);
    renderInfoFeed();
  }
  function renderInfoFeed() {
    if (infoCat === "pocasi") {
      loadInfoFeed(false);
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
        saveNotes();
        btn.textContent = "✓ Uloženo";
      } else if (btn.dataset.newsAct === "remind") {
        openAlarm(null, item.title);
      }
    };
  }

  window.onGeminiResult = function(reqId, ok, respBody) {
    const cb = pendingGemini[reqId];
    if (cb) {
      delete pendingGemini[reqId];
      cb(ok, respBody);
    }
  };

  function appendAiBubble(role, text, withActions = false) {
    const history = $("#aiHistory");
    const div = document.createElement("div");
    div.className = "ai-bubble " + role;
    div.textContent = text;
    if (withActions && text) {
      const actRow = document.createElement("div");
      actRow.className = "news-actions";
      actRow.style.marginTop = "8px";
      const saveB = document.createElement("button");
      saveB.type = "button";
      saveB.textContent = "⭐ Uložit do poznámek";
      saveB.onclick = () => {
        notes.push({ id: Date.now(), text, created: Date.now(), alarm: null, baseAt: null, repeat: "none", pinned: false, deleted: false });
        saveNotes();
        saveB.textContent = "✓ Uloženo";
      };
      const remB = document.createElement("button");
      remB.type = "button";
      remB.textContent = "🔔 Připomenout";
      remB.onclick = () => openAlarm(null, text.slice(0, 100));
      actRow.append(saveB, remB);
      div.appendChild(actRow);
    }
    history.appendChild(div);
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
      `- ${n.text}${n.alarm ? " [Budík: " + fmt(n.alarm) + "]" : ""}`
    ).join("\n");

    const newsSummary = newsItems.slice(0, 15).map(i => `- [${i.source}] ${i.title}`).join("\n");
    const weatherSummary = weatherCache?.current
      ? `Praha 9 právě teď: ${Math.round(weatherCache.current.temperature_2m)} °C (pocitově ${Math.round(weatherCache.current.apparent_temperature)} °C), ${wmoToCzech(weatherCache.current.weather_code).text}.`
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
          const errJson = JSON.parse(respBody);
          errDetail = errJson?.error?.message || respBody;
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

    subNavNotes.classList.toggle("hidden", tab !== "notes");
    subNavFeed.classList.toggle("hidden", tab !== "info");

    if (tab === "notes") {
      draft.placeholder = "Napiš nebo nadiktuj zápisek...";
      addBtn.textContent = "Přidat";
      alarmBtn.classList.remove("hidden");
      renderNotes();
    } else if (tab === "info") {
      draft.placeholder = "Rychlý zápisek k přečtenému článku...";
      addBtn.textContent = "Uložit";
      alarmBtn.classList.add("hidden");
      loadInfoFeed(false);
    } else if (tab === "ai") {
      draft.placeholder = "Zeptej se Gemini (např. Mám připomínku na STK?)...";
      addBtn.textContent = "Zeptat se";
      alarmBtn.classList.add("hidden");
      aiPanel.scrollTop = aiPanel.scrollHeight;
    }
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  subNavNotes.onclick = e => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    view = btn.dataset.view;
    subNavNotes.querySelectorAll("button[data-view]").forEach(b => b.classList.toggle("active", b === btn));
    renderNotes();
  };

  subNavFeed.onclick = e => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    infoCat = btn.dataset.cat;
    subNavFeed.querySelectorAll("button[data-cat]").forEach(b => b.classList.toggle("active", b === btn));
    renderInfoFeed();
  };

  $("#refreshFeed").onclick = () => loadInfoFeed(true);

  addBtn.onclick = () => {
    const text = draft.value.trim();
    if (!text) return;
    if (activeTab === "ai") {
      draft.value = "";
      sendAiQuery(text);
    } else {
      const id = Date.now();
      notes.push({ id, text, created: id, alarm: null, baseAt: null, repeat: "none", pinned: false, deleted: false });
      saveNotes();
      draft.value = "";
      if (activeTab === "notes") renderNotes();
    }
  };

  search.oninput = () => {
    if (activeTab === "notes") renderNotes();
    else if (activeTab === "info") renderInfoFeed();
  };

  $("#settings").onclick = () => {
    apiKeyInput.value = localStorage.getItem("gemini_api_key") || "";
    settingsDialog.showModal();
  };
  $("#saveSettings").onclick = () => {
    localStorage.setItem("gemini_api_key", apiKeyInput.value.trim());
    settingsDialog.close();
  };
  $("#cancelSettings").onclick = () => settingsDialog.close();

  loadNotes();
  renderNotes();
})();
