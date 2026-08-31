import { COLLECTIONS } from "../config/collections.js";
import { getOne, listen } from "../services/firestore.js";
import { initializeTheme } from "../components/theme.js";

initializeTheme();

const q = id => document.getElementById(id);

const branchId =
  new URLSearchParams(location.search).get("id");


// =========================================================
// YEAR
// =========================================================

if (q("branchYear")) {
  q("branchYear").textContent =
    new Date().getFullYear();
}


// =========================================================
// ELEMENTS
// =========================================================

const branchName = q("branchName");
const branchLocation = q("branchLocation");
const branchStatus = q("branchStatus");

const liveIndicator = q("branchLiveIndicator");
const liveTitle = q("branchLiveTitle");
const presenter = q("branchPresenter");

const casterPlayer = q("casterPlayer");
const offlineMessage = q("branchOfflineMessage");


// =========================================================
// INITIAL STATE
// =========================================================

function showOffline() {

  liveIndicator.textContent = "OFFLINE";
  liveIndicator.classList.remove("on");

  liveTitle.textContent =
    "This branch is currently offline";

  presenter.textContent =
    "Check back when the branch starts a live programme.";

  casterPlayer.style.display = "none";

  offlineMessage.style.display = "block";
}


function showLive(broadcast) {

  liveIndicator.textContent = "LIVE NOW";
  liveIndicator.classList.add("on");

  liveTitle.textContent =
    broadcast.title || "Live Broadcast";

  presenter.textContent =
    broadcast.presenter
      ? `With ${broadcast.presenter}`
      : "Live from this branch";

  casterPlayer.style.display = "block";

  offlineMessage.style.display = "none";
}


// =========================================================
// NO BRANCH ID
// =========================================================

if (!branchId) {

  branchName.textContent =
    "Branch not found";

  branchStatus.textContent =
    "No branch ID was provided.";

  showOffline();

} else {

  // =======================================================
  // LOAD BRANCH
  // =======================================================

  const branch =
    await getOne(
      COLLECTIONS.BRANCHES,
      branchId
    );

  if (!branch) {

    branchName.textContent =
      "Branch not found";

    branchStatus.textContent =
      "This branch does not exist.";

    showOffline();

  } else {

    document.title =
      `${branch.branchName || "Branch"} | CAC Radio`;

    branchName.textContent =
      branch.branchName || "CAC Branch";

    branchLocation.textContent =
      [
        branch.address,
        branch.state,
        branch.country
      ]
        .filter(Boolean)
        .join(", ");

    branchStatus.textContent =
      branch.status === "active"
        ? "Connected to CAC Radio Network"
        : "Branch currently inactive";

    // Start offline until a REAL broadcast document
    // says this branch is live.
    showOffline();
  }
}


// =========================================================
// WATCH FIRESTORE BROADCAST
// =========================================================

listen(
  COLLECTIONS.BROADCASTS,
  items => {

    const liveBroadcast =
      items.find(item =>

        item.branchId === branchId &&

        item.status === "live" &&

        item.isPublic !== false

      ) || null;


    // =====================================================
    // BRANCH IS LIVE
    // =====================================================

    if (liveBroadcast) {

      console.log(
        "Branch is LIVE:",
        liveBroadcast
      );

      showLive(liveBroadcast);

    }


    // =====================================================
    // BRANCH IS OFFLINE
    // =====================================================

    else {

      console.log(
        "Branch is OFFLINE:",
        branchId
      );

      showOffline();

    }

  },

  "createdAt",
  "desc"
);
