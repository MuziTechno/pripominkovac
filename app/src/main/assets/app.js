(function () {
  "use strict";

  function $(selector) {
    return document.querySelector(selector);
  }

  const feed = $("#feed");
  const draft = $("#draft");
  const search = $("#search");
  const alarmDialog = $("#alarmDialog");
  const menuDialog = $("#menuDialog");
  const addButton = $("#add");
  const alarmButton = $("#alarm");

  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem("notes") || "[]");
    if (!Array.isArray(notes)) notes = [];
  } catch (_) {
    notes = [];
  }

  let view = "all";
  let draftAlarm = null;
  let target = null;

  function androidCall(method, ...args) {
    if (window.Android && typeof window.Android[method] === "function") {
      window.Android[method](...args);
    }
  }

  function syncAlarms() {
    const alarms = notes
      .filter((note) => !note.deleted && note.alarm && note.alarm > Date.now())
      .map((note) => ({ id: String(note.id), text: note.text, at: note.alarm }));
    androidCall("saveAlarmIndex", JSON.stringify(alarms));
  }

  function save() {
    localStorage.setItem("notes", JSON.stringify(notes));
    syncAlarms();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function render(scrollToBottom) {
    const query = search.value.trim().toLocaleLowerCase("cs");
    const now = Date.now();
    const visible = notes.filter((note) => {
      if (view === "trash" ? !note.deleted : note.deleted) return false;
      if (view === "pinned" && !note.pinned) return false;
      return !query || note.text.toLocaleLowerCase("cs").includes(query);
    });

    feed.innerHTML = visible.length
      ? visible.map((note) => `
          <article class="note" data-id="${note.id}">
            <div class="top">
              <div class="text">${escapeHtml(note.text)}</div>
              <div class="tools">
                <button type="button" data-action="share" aria-label="Sdílet">↗</button>
                <button type="button" data-action="menu" aria-label="Možnosti">⋮</button>
              </div>
            </div>
            ${note.alarm ? `
              <button type="button" data-action="alarm" class="alarm ${note.alarm < now ? "overdue" : ""}">
                ${note.alarm < now ? "⚠ Po termínu: " : "⏰ "}${formatDate(note.alarm)}
              </button>` : ""}
            <div class="meta">
              <span>${formatDate(note.created)}</span>
              <span>${note.pinned ? "📌 Připnuto" : ""}</span>
            </div>
          </article>`).join("")
      : "<p>Žádné zápisky.</p>";

    if (scrollToBottom) feed.scrollTop = feed.scrollHeight;
  }

  function openAlarm(note) {
    target = note || null;
    const value = target && target.alarm
      ? new Date(target.alarm - new Date().getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16)
      : "";
    $("#datetime").value = value;
    alarmDialog.showModal();
  }

  function setAlarm(timestamp) {
    if (target) {
      target.alarm = timestamp;
      androidCall("scheduleAlarm", String(target.id), target.text, timestamp);
    } else {
      draftAlarm = timestamp;
    }
    save();
    alarmDialog.close();
    render(false);
  }

  [
    [5, "5 minut"], [10, "10 minut"], [30, "30 minut"],
    [60, "1 hodina"], [120, "2 hodiny"], [180, "3 hodiny"]
  ].forEach(([minutes, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => setAlarm(Date.now() + minutes * 60000));
    $("#quick").appendChild(button);
  });

  $("#saveAlarm").addEventListener("click", () => {
    const timestamp = new Date($("#datetime").value).getTime();
    if (Number.isFinite(timestamp) && timestamp > Date.now()) setAlarm(timestamp);
  });

  $("#cancelAlarm").addEventListener("click", () => alarmDialog.close());
  alarmButton.addEventListener("click", () => openAlarm(null));

  addButton.addEventListener("click", () => {
    const text = draft.value.trim();
    if (!text) return;

    const note = {
      id: Date.now(),
      text,
      created: Date.now(),
      alarm: draftAlarm,
      pinned: false,
      deleted: false
    };

    notes.push(note);
    if (note.alarm) {
      androidCall("scheduleAlarm", String(note.id), note.text, note.alarm);
    }

    draft.value = "";
    localStorage.removeItem("draft");
    draftAlarm = null;
    save();
    render(true);
    draft.blur();
  });

  draft.value = localStorage.getItem("draft") || "";
  draft.addEventListener("input", () => localStorage.setItem("draft", draft.value));
  search.addEventListener("input", () => render(false));

  document.querySelectorAll("nav [data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view;
      document.querySelectorAll("nav [data-view]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      render(false);
    });
  });

  feed.addEventListener("click", (event) => {
    const card = event.target.closest(".note");
    if (!card) return;
    target = notes.find((note) => String(note.id) === card.dataset.id);
    if (!target) return;

    const action = event.target.closest("button")?.dataset.action;
    if (action === "alarm") openAlarm(target);
    if (action === "share") androidCall("share", target.text);
    if (action === "menu") openMenu();
  });

  function openMenu() {
    const box = $("#menuItems");
    box.innerHTML = "";
    const items = target.deleted
      ? [["Obnovit", "restore"], ["Smazat natrvalo", "permanentDelete"]]
      : [
          ["Upravit text", "edit"],
          ["Změnit upomínku", "alarm"],
          [target.pinned ? "Odepnout" : "Připnout", "pin"],
          ["Poslat e-mailem", "email"],
          ["Přesunout do koše", "delete"]
        ];

    items.forEach(([label, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.textContent = label;
      button.addEventListener("click", () => menuAction(action));
      box.appendChild(button);
    });
    menuDialog.showModal();
  }

  function menuAction(action) {
    if (action === "edit") {
      const value = prompt("Upravit text", target.text);
      if (value && value.trim()) target.text = value.trim();
    }
    if (action === "alarm") {
      menuDialog.close();
      openAlarm(target);
      return;
    }
    if (action === "pin") target.pinned = !target.pinned;
    if (action === "email") androidCall("email", target.text);
    if (action === "delete") {
      target.deleted = true;
      androidCall("cancelAlarm", String(target.id));
    }
    if (action === "restore") target.deleted = false;
    if (action === "permanentDelete") notes = notes.filter((note) => note !== target);

    save();
    menuDialog.close();
    render(false);
  }

  $("#closeMenu").addEventListener("click", () => menuDialog.close());
  $("#settings").addEventListener("click", () => {
    alert("Nastavení doplníme v další verzi.");
  });

  render(true);
})();
