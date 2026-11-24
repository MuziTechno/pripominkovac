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
    notes = JSON.parse(
      localStorage.getItem("notes") || "[]"
    );

    if (!Array.isArray(notes)) {
      notes = [];
    }
  } catch (_) {
    notes = [];
  }

  let view = "all";
  let draftAlarm = null;
  let target = null;

  function androidCall(method, ...args) {
    if (
      window.Android &&
      typeof window.Android[method] === "function"
    ) {
      return window.Android...args;
    }

    return null;
  }

  function syncAlarms() {
    const alarms = notes
      .filter((note) => {
        return (
          !note.deleted &&
          note.alarm &&
          note.alarm > Date.now()
        );
      })
      .map((note) => {
        return {
          id: String(note.id),
          text: note.text,
          at: note.alarm
        };
      });

    androidCall(
      "saveAlarmIndex",
      JSON.stringify(alarms)
    );
  }

  function save() {
    localStorage.setItem(
      "notes",
      JSON.stringify(notes)
    );

    syncAlarms();
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      })[character]
    );
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString(
      "cs-CZ",
      {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  function render(scrollToBottom) {
    const query =
      search.value
        .trim()
        .toLocaleLowerCase("cs");

    const now = Date.now();

    const visibleNotes = notes.filter((note) => {
      if (
        view === "trash"
          ? !note.deleted
          : note.deleted
      ) {
        return false;
      }

      if (
        view === "pinned" &&
        !note.pinned
      ) {
        return false;
      }

      return (
        !query ||
        note.text
          .toLocaleLowerCase("cs")
          .includes(query)
      );
    });

    if (visibleNotes.length === 0) {
      feed.innerHTML =
        "<p>Žádné zápisky.</p>";
    } else {
      feed.innerHTML =
        visibleNotes
          .map((note) => {
            const alarmClass =
              note.alarm &&
              note.alarm < now
                ? "overdue"
                : "";

            const alarmLabel =
              note.alarm &&
              note.alarm < now
                ? "⚠ Po termínu: "
                : "⏰ ";

            return `
              <article
                class="note"
                data-id="${note.id}"
              >
                <div class="top">
                  <div class="text">
                    ${escapeHtml(note.text)}
                  </div>

                  <div class="tools">
                    <button
                      type="button"
                      data-action="share"
                      aria-label="Sdílet"
                    >
                      ↗
                    </button>

                    <button
                      type="button"
                      data-action="menu"
                      aria-label="Možnosti"
                    >
                      ⋮
                    </button>
                  </div>
                </div>

                ${
                  note.alarm
                    ? `
                      <button
                        type="button"
                        data-action="alarm"
                        class="alarm ${alarmClass}"
                      >
                        ${alarmLabel}${formatDate(note.alarm)}
                      </button>
                    `
                    : ""
                }

                <div class="meta">
                  <span>
                    ${formatDate(note.created)}
                  </span>

                  <span>
                    ${note.pinned ? "📌 Připnuto" : ""}
                  </span>
                </div>
              </article>
            `;
          })
          .join("");
    }

    if (scrollToBottom) {
      feed.scrollTop =
        feed.scrollHeight;
    }
  }

  function openAlarm(note) {
    target = note || null;

    let currentValue = "";

    if (
      target &&
      target.alarm
    ) {
      const timezoneOffset =
        new Date().getTimezoneOffset() *
        60_000;

      currentValue =
        new Date(
          target.alarm -
          timezoneOffset
        )
          .toISOString()
          .slice(0, 16);
    }

    $("#datetime").value =
      currentValue;

    alarmDialog.showModal();
  }

  function scheduleNativeAlarm(note) {
    if (!note.alarm) {
      return "no_alarm";
    }

    const result = androidCall(
      "scheduleAlarm",
      String(note.id),
      note.text,
      note.alarm
    );

    if (
      result ===
      "exact_alarm_permission_required"
    ) {
      androidCall(
        "openAlarmPermissions"
      );

      alert(
        "Budík potřebuje systémové povolení „Budíky a připomenutí“. " +
        "Po povolení nastav termín upomínky znovu."
      );
    }

    return result;
  }

  function setAlarm(timestamp) {
    if (target) {
      target.alarm = timestamp;

      scheduleNativeAlarm(target);
    } else {
      draftAlarm = timestamp;
    }

    save();
    alarmDialog.close();
    render(false);
  }

  const quickAlarmOptions = [
    {
      minutes: 5,
      label: "5 minut"
    },
    {
      minutes: 10,
      label: "10 minut"
    },
    {
      minutes: 30,
      label: "30 minut"
    },
    {
      minutes: 60,
      label: "1 hodina"
    },
    {
      minutes: 120,
      label: "2 hodiny"
    },
    {
      minutes: 180,
      label: "3 hodiny"
    }
  ];

  quickAlarmOptions.forEach((option) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.textContent =
      option.label;

    button.addEventListener(
      "click",
      () => {
        const timestamp =
          Date.now() +
          option.minutes *
          60_000;

        setAlarm(timestamp);
      }
    );

    $("#quick").appendChild(button);
  });

  $("#saveAlarm").addEventListener(
    "click",
    () => {
      const timestamp =
        new Date(
          $("#datetime").value
        ).getTime();

      if (
        Number.isFinite(timestamp) &&
        timestamp > Date.now()
      ) {
        setAlarm(timestamp);
      } else {
        alert(
          "Vyber budoucí datum a čas."
        );
      }
    }
  );

  $("#cancelAlarm").addEventListener(
    "click",
    () => {
      alarmDialog.close();
    }
  );

  alarmButton.addEventListener(
    "click",
    () => {
      openAlarm(null);
    }
  );

  addButton.addEventListener(
    "click",
    () => {
      const text =
        draft.value.trim();

      if (!text) {
        return;
      }

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
        scheduleNativeAlarm(note);
      }

      draft.value = "";
      localStorage.removeItem("draft");

      draftAlarm = null;

      save();
      render(true);

      draft.blur();
    }
  );

  draft.value =
    localStorage.getItem("draft") ||
    "";

  draft.addEventListener(
    "input",
    () => {
      localStorage.setItem(
        "draft",
        draft.value
      );
    }
  );

  search.addEventListener(
    "input",
    () => {
      render(false);
    }
  );

  document
    .querySelectorAll(
      "nav [data-view]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          view =
            button.dataset.view;

          document
            .querySelectorAll(
              "nav [data-view]"
            )
            .forEach((item) => {
              item.classList.toggle(
                "active",
                item === button
              );
            });

          render(false);
        }
      );
    });

  feed.addEventListener(
    "click",
    (event) => {
      const card =
        event.target.closest(".note");

      if (!card) {
        return;
      }

      target = notes.find(
        (note) => {
          return (
            String(note.id) ===
            card.dataset.id
          );
        }
      );

      if (!target) {
        return;
      }

      const selectedButton =
        event.target.closest("button");

      const action =
        selectedButton
          ? selectedButton.dataset.action
          : null;

      if (action === "alarm") {
        openAlarm(target);
      }

      if (action === "share") {
        androidCall(
          "share",
          target.text
        );
      }

      if (action === "menu") {
        openMenu();
      }
    }
  );

  function openMenu() {
    const menuItems =
      $("#menuItems");

    menuItems.innerHTML = "";

    const availableItems =
      target.deleted
        ? [
            [
              "Obnovit",
              "restore"
            ],
            [
              "Smazat natrvalo",
              "permanentDelete"
            ]
          ]
        : [
            [
              "Upravit text",
              "edit"
            ],
            [
              "Změnit upomínku",
              "alarm"
            ],
            [
              target.pinned
                ? "Odepnout"
                : "Připnout",
              "pin"
            ],
            [
              "Poslat e-mailem",
              "email"
            ],
            [
              "Přesunout do koše",
              "delete"
            ]
          ];

    availableItems.forEach(
      ([label, action]) => {
        const button =
          document.createElement(
            "button"
          );

        button.type = "button";
        button.className =
          "menu-item";

        button.textContent =
          label;

        button.addEventListener(
          "click",
          () => {
            menuAction(action);
          }
        );

        menuItems.appendChild(
          button
        );
      }
    );

    menuDialog.showModal();
  }

  function menuAction(action) {
    if (action === "edit") {
      const value = prompt(
        "Upravit text",
        target.text
      );

      if (
        value &&
        value.trim()
      ) {
        target.text =
          value.trim();

        if (target.alarm) {
          scheduleNativeAlarm(target);
        }
      }
    }

    if (action === "alarm") {
      menuDialog.close();
      openAlarm(target);
      return;
    }

    if (action === "pin") {
      target.pinned =
        !target.pinned;
    }

    if (action === "email") {
      androidCall(
        "email",
        target.text
      );
    }

    if (action === "delete") {
      target.deleted = true;

      androidCall(
        "cancelAlarm",
        String(target.id)
      );
    }

    if (action === "restore") {
      target.deleted = false;
    }

    if (
      action ===
      "permanentDelete"
    ) {
      androidCall(
        "cancelAlarm",
        String(target.id)
      );

      notes = notes.filter(
        (note) => {
          return note !== target;
        }
      );
    }

    save();
    menuDialog.close();
    render(false);
  }

  $("#closeMenu").addEventListener(
    "click",
    () => {
      menuDialog.close();
    }
  );

  $("#settings").addEventListener(
    "click",
    () => {
      alert(
        "Nastavení doplníme v další verzi."
      );
    }
  );

  render(true);
})();
