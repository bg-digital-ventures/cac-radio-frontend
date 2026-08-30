import { COLLECTIONS } from "../config/collections.js";
import { add, listen } from "../services/firestore.js";
import { getSettings } from "../services/settings.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";


// ============================================================
// INITIAL SETUP
// ============================================================

initializeTheme();

const currentYear = document.getElementById("currentYear");

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

document
  .getElementById("menuToggle")
  ?.addEventListener("click", () => {
    document
      .getElementById("mainNav")
      ?.classList.toggle("open");
  });


// ============================================================
// HTML ESCAPE HELPER
// ============================================================

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


// ============================================================
// SETTINGS
// ============================================================

try {
  const settings = await getSettings();

  const contactFields = [
    ["contactPhone", settings.general?.contactPhone],
    ["contactEmail", settings.general?.contactEmail],
    ["contactAddress", settings.general?.address]
  ];

  for (const [id, value] of contactFields) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value || "—";
    }
  }

} catch (error) {
  console.error("Unable to load settings:", error);
}


// ============================================================
// LIVE BROADCAST DATA
// ============================================================

let branches = [];
let broadcasts = [];


// Find the currently public live broadcast.
//
// IMPORTANT:
// We deliberately do NOT require:
//     isMain === true
//
// A branch broadcast with:
//     status: "live"
//     isPublic: true
//
// is therefore allowed to appear as LIVE on the public website.

function getCurrentLiveBroadcast() {
  return broadcasts.find(
    (broadcast) =>
      broadcast.status === "live" &&
      broadcast.isPublic !== false
  ) || null;
}


// ============================================================
// UPDATE MAIN LIVE STATUS
// ============================================================

function updateLiveDisplay() {
  const liveBadge = document.getElementById("liveBadge");
  const nowPlaying = document.getElementById("nowPlaying");
  const liveBranch = document.getElementById("liveBranch");
  const playerTitle = document.getElementById("playerTitle");
  const playerStatus = document.getElementById("playerStatus");

  const live = getCurrentLiveBroadcast();


  // ----------------------------------------------------------
  // LIVE
  // ----------------------------------------------------------

  if (live) {

    const branchName =
      live.branchName ||
      "CAC Agbara Aanu Sioni Radio";

    const title =
      live.title ||
      "Live Broadcast";


    if (liveBadge) {
      liveBadge.textContent =
        `LIVE • ${branchName}`;

      liveBadge.classList.add("on");
    }


    if (nowPlaying) {
      nowPlaying.textContent = title;
    }


    if (liveBranch) {
      liveBranch.textContent = branchName;
    }


    if (playerTitle) {
      playerTitle.textContent = title;
    }


    if (playerStatus) {
      playerStatus.textContent = "LIVE";
    }


    return;
  }


  // ----------------------------------------------------------
  // OFFLINE
  // ----------------------------------------------------------

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
}


// ============================================================
// RENDER BRANCHES
// ============================================================

function renderBranches() {
  const branchGrid =
    document.getElementById("branchGrid");

  const prayerBranch =
    document.getElementById("prayerBranch");


  if (!branchGrid) {
    return;
  }


  const activeBranches = branches.filter(
    (branch) =>
      !branch.status ||
      branch.status === "active"
  );


  // ----------------------------------------------------------
  // BRANCH CARDS
  // ----------------------------------------------------------

  branchGrid.innerHTML = activeBranches.length
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
                    ? `
                      <span class="branch-live-badge">
                        LIVE
                      </span>
                    `
                    : `
                      <span class="branch-offline-badge">
                        OFFLINE
                      </span>
                    `
                }

              </div>


              <h3>
                ${esc(branch.branchName)}
              </h3>


              <p>
                ${esc(branch.address || "")}
              </p>


              <small>
                ${esc(branch.state || "")}
                ${branch.state && branch.country ? " " : ""}
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
                          ? `
                            <span>
                              ${esc(
                                live.presenter
                              )}
                            </span>
                          `
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
    : `
      <div class="empty">
        No branches added yet.
      </div>
    `;


  // ----------------------------------------------------------
  // PRAYER BRANCH SELECT
  // ----------------------------------------------------------

  if (prayerBranch) {

    prayerBranch.innerHTML =
      `<option value="">Select branch</option>` +
      activeBranches
        .map(
          (branch) => `
            <option value="${esc(branch.id)}">
              ${esc(branch.branchName)}
            </option>
          `
        )
        .join("");
  }
}


// ============================================================
// FIRESTORE: BRANCHES
// ============================================================

listen(
  COLLECTIONS.BRANCHES,
  (items) => {

    branches = items || [];

    renderBranches();
  },
  "branchName",
  "asc"
);


// ============================================================
// FIRESTORE: BROADCASTS
// ============================================================

listen(
  COLLECTIONS.BROADCASTS,
  (items) => {

    broadcasts = items || [];

    renderBranches();

    updateLiveDisplay();
  }
);


// ============================================================
// PROGRAMMES
// ============================================================

listen(
  COLLECTIONS.PROGRAMMES,
  (items) => {

    const programmeGrid =
      document.getElementById(
        "programmeGrid"
      );

    if (!programmeGrid) {
      return;
    }


    const activeProgrammes = (items || [])
      .filter(
        (item) =>
          !item.status ||
          item.status === "active"
      )
      .slice(0, 6);


    programmeGrid.innerHTML =
      activeProgrammes.length
        ? activeProgrammes
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
                        ? `
                          – ${esc(
                            programme.endTime
                          )}
                        `
                        : ""
                    }
                  </strong>

                </article>
              `
            )
            .join("")
        : `
          <div class="empty">
            No programmes yet.
          </div>
        `;
  }
);


// ============================================================
// ANNOUNCEMENTS
// ============================================================

listen(
  COLLECTIONS.ANNOUNCEMENTS,
  (items) => {

    const announcementGrid =
      document.getElementById(
        "announcementGrid"
      );

    if (!announcementGrid) {
      return;
    }


    const announcements = (items || [])
      .filter(
        (item) =>
          item.status === "published" ||
          !item.status
      )
      .slice(0, 6);


    announcementGrid.innerHTML =
      announcements.length
        ? announcements
            .map(
              (announcement) => `
                <article class="card">

                  <span class="tag">
                    ${esc(
                      announcement.category ||
                      "Announcement"
                    )}
                  </span>

                  <h3>
                    ${esc(
                      announcement.title ||
                      "Announcement"
                    )}
                  </h3>

                  <p>
                    ${esc(
                      announcement.message ||
                      ""
                    )}
                  </p>

                </article>
              `
            )
            .join("")
        : `
          <div class="empty">
            No announcements yet.
          </div>
        `;
  }
);


// ============================================================
// PUBLIC FORMS
// ============================================================

const forms = [

  [
    "prayerForm",
    COLLECTIONS.PRAYER_REQUESTS,

    (form) => ({
      fullName:
        form.fullName.value.trim(),

      phone:
        form.phone.value.trim(),

      email:
        form.email.value.trim(),

      branchId:
        form.branchId.value,

      branchName:
        form.branchId
          .selectedOptions[0]
          ?.textContent
          ?.trim() || "",

      prayerRequest:
        form.prayerRequest.value.trim(),

      isAnonymous:
        form.isAnonymous.checked,

      isPrivate:
        form.isPrivate.checked,

      status: "pending"
    }),

    "Prayer request submitted."
  ],


  [
    "commentForm",
    COLLECTIONS.COMMENTS,

    (form) => ({
      fullName:
        form.fullName.value.trim(),

      email:
        form.email.value.trim(),

      message:
        form.message.value.trim(),

      status: "pending"
    }),

    "Comment submitted for approval."
  ],


  [
    "contactForm",
    COLLECTIONS.MESSAGES,

    (form) => ({
      fullName:
        form.fullName.value.trim(),

      email:
        form.email.value.trim(),

      phone:
        form.phone.value.trim(),

      subject:
        form.subject.value.trim(),

      message:
        form.message.value.trim(),

      status: "unread"
    }),

    "Message sent successfully."
  ],


  [
    "subscribeForm",
    COLLECTIONS.SUBSCRIBERS,

    (form) => ({
      email:
        form.email.value.trim(),

      status: "active",

      source: "website"
    }),

    "Subscription successful."
  ]
];


// ============================================================
// FORM SUBMISSION
// ============================================================

for (
  const [id, collection, makeData, successMessage]
  of forms
) {

  document
    .getElementById(id)
    ?.addEventListener(
      "submit",
      async (event) => {

        event.preventDefault();

        const form =
          event.currentTarget;


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
      }
    );
}
