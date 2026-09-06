import { COLLECTIONS } from "../config/collections.js";
import { add, listen } from "../services/firestore.js";
import { getSettings } from "../services/settings.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";
import { liveApi } from "../services/api.js";

initializeTheme();

const currentYear = document.getElementById("currentYear");
if (currentYear) currentYear.textContent = new Date().getFullYear();

document.getElementById("menuToggle")?.addEventListener("click", () => {
  document.getElementById("mainNav")?.classList.toggle("open");
});

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );

let branches = [];
let broadcasts = [];
let currentPublicStream = null;

function getCurrentLiveBroadcast() {
  const live = broadcasts
    .filter(
      (broadcast) =>
        broadcast.status === "live" &&
        broadcast.isPublic !== false
    )
    .sort((a, b) => {
      const aTime =
        a.updatedAt?.toMillis?.() ||
        a.createdAt?.toMillis?.() ||
        0;

      const bTime =
        b.updatedAt?.toMillis?.() ||
        b.createdAt?.toMillis?.() ||
        0;

      return bTime - aTime;
    });

  return live[0] || null;
}

function updateLiveDisplay() {
  const liveBadge = document.getElementById("liveBadge");
  const nowPlaying = document.getElementById("nowPlaying");
  const liveBranch = document.getElementById("liveBranch");
  const playerTitle = document.getElementById("playerTitle");
  const playerStatus = document.getElementById("playerStatus");
  const playerSource = document.getElementById("playerSource");

  const live = getCurrentLiveBroadcast();

  if (live) {
    const branchName =
      live.branchName ||
      "CAC Agbara Aanu Sioni Radio";

    const title =
      live.title ||
      "Live Broadcast";

    currentPublicStream = live;

    if (liveBadge) {
      liveBadge.textContent = `LIVE • ${branchName}`;
      liveBadge.classList.add("on");
    }

    if (nowPlaying) nowPlaying.textContent = title;
    if (liveBranch) liveBranch.textContent = branchName;
    if (playerTitle) playerTitle.textContent = title;
    if (playerStatus) playerStatus.textContent = "LIVE";

    if (playerSource) {
      playerSource.textContent =
        live.isMain
          ? "Headquarters feed"
          : "Live branch feed";
    }

    updatePlayerMount();
    return;
  }

  currentPublicStream = null;

  if (liveBadge) {
    liveBadge.textContent = "OFFLINE";
    liveBadge.classList.remove("on");
  }

  if (nowPlaying) {
    nowPlaying.textContent =
      "CAC Agbara Aanu Sioni Radio";
  }

  if (liveBranch) {
    liveBranch.textContent =
      "Waiting for live broadcast";
  }

  if (playerTitle) {
    playerTitle.textContent =
      "CAC Agbara Aanu Sioni Radio";
  }

  if (playerStatus) {
    playerStatus.textContent =
      "Waiting for live broadcast";
  }

  if (playerSource) {
    playerSource.textContent = "Radio offline";
  }

  updatePlayerMount();
}

function updatePlayerMount() {
  const mount =
    currentPublicStream?.streamUrl ||
    "";

  const playerFrame =
    document.getElementById("customRadioPlayer");

  if (!playerFrame) return;

  /*
   * Caster Free may require its official embedded player rather
   * than a raw stream URL. We therefore keep the official Caster
   * widget in the HTML as the authoritative public player.
   *
   * This element is only informational/debug UI.
   */
  playerFrame.dataset.streamUrl = mount;
}

function renderBranches() {
  const branchGrid =
    document.getElementById("branchGrid");

  const prayerBranch =
    document.getElementById("prayerBranch");

  const activeBranches = branches.filter(
    (branch) =>
      !branch.status ||
      branch.status === "active"
  );

  if (branchGrid) {
    branchGrid.innerHTML =
      activeBranches.length
        ? activeBranches
            .map((branch) => {
              const live = broadcasts.find(
                (broadcast) =>
                  broadcast.branchId === branch.id &&
                  broadcast.status === "live" &&
                  broadcast.isPublic !== false
              );

              return `
                <article class="card branch-card">
                  <div class="branch-card-top">
                    <span class="tag">
                      ${
                        branch.type === "headquarters"
                          ? "Headquarters"
                          : "Branch"
                      }
                    </span>

                    ${
                      live
                        ? `<span class="branch-live-badge">LIVE</span>`
                        : `<span class="branch-offline-badge">OFFLINE</span>`
                    }
                  </div>

                  <h3>${esc(branch.branchName)}</h3>

                  <p>${esc(branch.address || "")}</p>

                  <small>
                    ${esc(branch.state || "")}
                    ${
                      branch.state && branch.country
                        ? " "
                        : ""
                    }
                    ${esc(branch.country || "")}
                  </small>

                  ${
                    live
                      ? `
                        <div class="branch-live-summary">
                          <strong>
                            ${esc(
                              live.title ||
                              "Live Broadcast"
                            )}
                          </strong>

                          ${
                            live.presenter
                              ? `<span>${esc(
                                  live.presenter
                                )}</span>`
                              : ""
                          }
                        </div>

                        <a
                          class="btn primary branch-join-btn"
                          href="branch.html?id=${encodeURIComponent(
                            branch.id
                          )}"
                        >
                          <i class="fa-solid fa-headphones"></i>
                          Join Live
                        </a>
                      `
                      : `
                        <a
                          class="btn ghost branch-join-btn"
                          href="branch.html?id=${encodeURIComponent(
                            branch.id
                          )}"
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
  }

  if (prayerBranch) {
    prayerBranch.innerHTML =
      `<option value="">Select branch</option>` +
      activeBranches
        .map(
          (branch) =>
            `<option value="${esc(branch.id)}">${esc(
              branch.branchName
            )}</option>`
        )
        .join("");
  }
}

listen(
  COLLECTIONS.BRANCHES,
  (items) => {
    branches = items || [];
    renderBranches();
  },
  "branchName",
  "asc"
);

listen(
  COLLECTIONS.BROADCASTS,
  (items) => {
    broadcasts = items || [];
    renderBranches();
    updateLiveDisplay();
  }
);

listen(
  COLLECTIONS.PROGRAMMES,
  (items) => {
    const programmeGrid =
      document.getElementById("programmeGrid");

    if (!programmeGrid) return;

    const active = (items || [])
      .filter(
        (item) =>
          !item.status ||
          item.status === "active"
      )
      .slice(0, 6);

    programmeGrid.innerHTML =
      active.length
        ? active
            .map(
              (programme) => `
                <article class="card">
                  <span class="tag">
                    ${esc(
                      programme.day ||
                      "Programme"
                    )}
                  </span>

                  <h3>
                    ${esc(
                      programme.title ||
                      "Programme"
                    )}
                  </h3>

                  <p>
                    ${esc(
                      programme.description ||
                      ""
                    )}
                  </p>

                  <strong>
                    ${esc(
                      programme.startTime ||
                      ""
                    )}
                    ${
                      programme.endTime
                        ? ` – ${esc(
                            programme.endTime
                          )}`
                        : ""
                    }
                  </strong>
                </article>
              `
            )
            .join("")
        : `<div class="empty">No programmes yet.</div>`;
  }
);

listen(
  COLLECTIONS.ANNOUNCEMENTS,
  (items) => {
    const grid =
      document.getElementById(
        "announcementGrid"
      );

    if (!grid) return;

    const announcements = (items || [])
      .filter(
        (item) =>
          item.status === "published" ||
          !item.status
      )
      .slice(0, 6);

    grid.innerHTML =
      announcements.length
        ? announcements
            .map(
              (item) => `
                <article class="card">
                  <span class="tag">
                    ${esc(
                      item.category ||
                      "Announcement"
                    )}
                  </span>

                  <h3>
                    ${esc(
                      item.title ||
                      "Announcement"
                    )}
                  </h3>

                  <p>
                    ${esc(
                      item.message ||
                      ""
                    )}
                  </p>
                </article>
              `
            )
            .join("")
        : `<div class="empty">No announcements yet.</div>`;
  }
);

try {
  const settings = await getSettings();

  const fields = [
    ["contactPhone", settings.general?.contactPhone],
    ["contactEmail", settings.general?.contactEmail],
    ["contactAddress", settings.general?.address]
  ];

  for (const [id, value] of fields) {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        value || "—";
    }
  }
} catch (error) {
  console.error(
    "Unable to load settings:",
    error
  );
}

const forms = [
  [
    "prayerForm",
    COLLECTIONS.PRAYER_REQUESTS,
    (form) => ({
      fullName: form.fullName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      branchId: form.branchId.value,
      branchName:
        form.branchId.selectedOptions[0]
          ?.textContent?.trim() || "",
      prayerRequest:
        form.prayerRequest.value.trim(),
      isAnonymous: form.isAnonymous.checked,
      isPrivate: form.isPrivate.checked,
      status: "pending"
    }),
    "Prayer request submitted."
  ],

  [
    "commentForm",
    COLLECTIONS.COMMENTS,
    (form) => ({
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      status: "pending"
    }),
    "Comment submitted for approval."
  ],

  [
    "contactForm",
    COLLECTIONS.MESSAGES,
    (form) => ({
      fullName: form.fullName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim(),
      status: "unread"
    }),
    "Message sent successfully."
  ],

  [
    "subscribeForm",
    COLLECTIONS.SUBSCRIBERS,
    (form) => ({
      email: form.email.value.trim(),
      status: "active",
      source: "website"
    }),
    "Subscription successful."
  ]
];

for (const [
  id,
  collection,
  makeData,
  successMessage
] of forms) {
  document
    .getElementById(id)
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const form = event.currentTarget;

      try {
        await add(
          collection,
          makeData(form)
        );

        form.reset();

        toast(
          successMessage,
          "success"
        );
      } catch (error) {
        console.error(
          "Form submission error:",
          error
        );

        toast(
          "Unable to submit. Please try again.",
          "error"
        );
      }
    });
}

setInterval(async () => {
  try {
    await liveApi.health();
  } catch {}
}, 30000);
