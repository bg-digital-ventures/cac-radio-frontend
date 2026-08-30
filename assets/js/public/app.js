import { COLLECTIONS } from "../config/collections.js";
import { add, listen } from "../services/firestore.js";
import { getSettings } from "../services/settings.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";

initializeTheme();

document.getElementById("currentYear").textContent =
  new Date().getFullYear();

document.getElementById("menuToggle")?.addEventListener("click", () => {
  document.getElementById("mainNav")?.classList.toggle("open");
});

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[c]
  );


// =========================================================
// SETTINGS
// =========================================================

const settings = await getSettings();

for (const [id, val] of [
  ["contactPhone", settings.general?.contactPhone],
  ["contactEmail", settings.general?.contactEmail],
  ["contactAddress", settings.general?.address]
]) {
  const el = document.getElementById(id);

  if (el) {
    el.textContent = val || "—";
  }
}


// =========================================================
// BRANCHES + BROADCASTS
// =========================================================

let branches = [];
let broadcasts = [];

function renderBranches() {
  const branchGrid = document.getElementById("branchGrid");
  const prayerBranch = document.getElementById("prayerBranch");

  if (!branchGrid || !prayerBranch) return;

  const active = branches.filter(
    (x) => !x.status || x.status === "active"
  );

  branchGrid.innerHTML = active.length
    ? active
        .map((x) => {
          const live = broadcasts.find(
            (b) =>
              b.branchId === x.id &&
              b.status === "live" &&
              b.isPublic !== false
          );

          return `
            <article class="card branch-card">

              <div class="branch-card-top">

                <span class="tag">
                  ${
                    x.type === "headquarters"
                      ? "Headquarters"
                      : "Branch"
                  }
                </span>

                ${
                  live
                    ? '<span class="branch-live-badge">LIVE</span>'
                    : '<span class="branch-offline-badge">OFFLINE</span>'
                }

              </div>

              <h3>${esc(x.branchName)}</h3>

              <p>${esc(x.address || "")}</p>

              <small>
                ${esc(x.state || "")}
                ${esc(x.country || "")}
              </small>

              ${
                live
                  ? `
                    <div class="branch-live-summary">

                      <strong>
                        ${esc(live.title || "Live Broadcast")}
                      </strong>

                      <span>
                        ${esc(live.presenter || "")}
                      </span>

                    </div>

                    <a
                      class="btn primary branch-join-btn"
                      href="branch.html?id=${encodeURIComponent(x.id)}"
                    >
                      <i class="fa-solid fa-headphones"></i>
                      Join Live
                    </a>
                  `
                  : `
                    <a
                      class="btn ghost branch-join-btn"
                      href="branch.html?id=${encodeURIComponent(x.id)}"
                    >
                      View Branch
                    </a>
                  `
              }

            </article>
          `;
        })
        .join("")
    : `<div class="empty">No branches added yet.</div>`;

  prayerBranch.innerHTML =
    '<option value="">Select branch</option>' +
    active
      .map(
        (x) =>
          `<option value="${esc(x.id)}">${esc(
            x.branchName
          )}</option>`
      )
      .join("");
}


// =========================================================
// BRANCH LISTENER
// =========================================================

listen(
  COLLECTIONS.BRANCHES,
  (items) => {
    branches = items;
    renderBranches();
  },
  "branchName",
  "asc"
);


// =========================================================
// BROADCAST LISTENER
// =========================================================

listen(COLLECTIONS.BROADCASTS, (items) => {
  broadcasts = items;

  renderBranches();

  const live = items.find(
    (x) =>
      x.status === "live" &&
      x.isPublic !== false &&
      (x.isMain === true || x.branchId === "hq")
  );

  const badge = document.getElementById("liveBadge");
  const nowPlaying = document.getElementById("nowPlaying");
  const liveBranch = document.getElementById("liveBranch");
  const playerStatus = document.getElementById("playerStatus");
  const playerTitle = document.getElementById("playerTitle");

  if (live) {
    if (badge) {
      badge.textContent =
        `LIVE • ${live.branchName || "Headquarters"}`;

      badge.classList.add("on");
    }

    if (nowPlaying) {
      nowPlaying.textContent =
        live.title || "Live Broadcast";
    }

    if (liveBranch) {
      liveBranch.textContent =
        live.branchName || "Headquarters";
    }

    if (playerStatus) {
      playerStatus.textContent = "LIVE";
    }

    if (playerTitle) {
      playerTitle.textContent =
        live.title || "Live Broadcast";
    }

  } else {

    if (badge) {
      badge.textContent = "OFFLINE";
      badge.classList.remove("on");
    }

    if (nowPlaying) {
      nowPlaying.textContent =
        "CAC Agbara Aanu Sioni Radio";
    }

    if (liveBranch) {
      liveBranch.textContent =
        "Waiting for live broadcast";
    }

    if (playerStatus) {
      playerStatus.textContent = "Waiting for live broadcast";
    }

    if (playerTitle) {
      playerTitle.textContent =
        "CAC Agbara Aanu Sioni Radio";
    }
  }
});


// =========================================================
// PROGRAMMES
// =========================================================

listen(COLLECTIONS.PROGRAMMES, (items) => {
  const programmeGrid =
    document.getElementById("programmeGrid");

  if (!programmeGrid) return;

  const active = items
    .filter((x) => !x.status || x.status === "active")
    .slice(0, 6);

  programmeGrid.innerHTML = active.length
    ? active
        .map(
          (x) => `
            <article class="card">

              <span class="tag">
                ${esc(x.day || "Programme")}
              </span>

              <h3>
                ${esc(x.title || "Programme")}
              </h3>

              <p>
                ${esc(x.description || "")}
              </p>

              <strong>
                ${esc(x.startTime || "")}
                ${
                  x.endTime
                    ? ` – ${esc(x.endTime)}`
                    : ""
                }
              </strong>

            </article>
          `
        )
        .join("")
    : `<div class="empty">No programmes yet.</div>`;
});


// =========================================================
// ANNOUNCEMENTS
// =========================================================

listen(COLLECTIONS.ANNOUNCEMENTS, (items) => {
  const announcementGrid =
    document.getElementById("announcementGrid");

  if (!announcementGrid) return;

  const data = items
    .filter(
      (x) =>
        x.status === "published" ||
        !x.status
    )
    .slice(0, 6);

  announcementGrid.innerHTML = data.length
    ? data
        .map(
          (x) => `
            <article class="card">

              <span class="tag">
                ${esc(x.category || "Announcement")}
              </span>

              <h3>
                ${esc(x.title || "Announcement")}
              </h3>

              <p>
                ${esc(x.message || "")}
              </p>

            </article>
          `
        )
        .join("")
    : `<div class="empty">No announcements yet.</div>`;
});


// =========================================================
// FORMS
// =========================================================

const forms = [
  [
    "prayerForm",
    COLLECTIONS.PRAYER_REQUESTS,

    (f) => ({
      fullName: f.fullName.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),

      branchId: f.branchId.value,

      branchName:
        f.branchId.selectedOptions[0]?.textContent || "",

      prayerRequest:
        f.prayerRequest.value.trim(),

      isAnonymous:
        f.isAnonymous.checked,

      isPrivate:
        f.isPrivate.checked,

      status: "pending"
    }),

    "Prayer request submitted."
  ],

  [
    "commentForm",
    COLLECTIONS.COMMENTS,

    (f) => ({
      fullName: f.fullName.value.trim(),
      email: f.email.value.trim(),
      message: f.message.value.trim(),
      status: "pending"
    }),

    "Comment submitted for approval."
  ],

  [
    "contactForm",
    COLLECTIONS.MESSAGES,

    (f) => ({
      fullName: f.fullName.value.trim(),
      email: f.email.value.trim(),
      phone: f.phone.value.trim(),
      subject: f.subject.value.trim(),
      message: f.message.value.trim(),
      status: "unread"
    }),

    "Message sent successfully."
  ],

  [
    "subscribeForm",
    COLLECTIONS.SUBSCRIBERS,

    (f) => ({
      email: f.email.value.trim(),
      status: "active",
      source: "website"
    }),

    "Subscription successful."
  ]
];


// =========================================================
// FORM SUBMISSION
// =========================================================

for (const [id, collection, make, message] of forms) {
  document
    .getElementById(id)
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        await add(
          collection,
          make(e.currentTarget)
        );

        e.currentTarget.reset();

        toast(message, "success");

      } catch (err) {

        console.error(err);

        toast(
          "Unable to submit. Please try again.",
          "error"
        );
      }
    });
}
