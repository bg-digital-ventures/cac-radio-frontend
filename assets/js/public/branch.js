import { COLLECTIONS } from "../config/collections.js";
import { getOne, listen } from "../services/firestore.js";
import { getSettings } from "../services/settings.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";

initializeTheme();

const branchId = new URLSearchParams(location.search).get("id");

const q = id => document.getElementById(id);

const branchYear = q("branchYear");
if (branchYear) {
  branchYear.textContent = new Date().getFullYear();
}

const audio = q("branchAudio");
const playButton = q("branchPlayButton");
const playIcon = q("branchPlayIcon");

let currentLive = null;
let publicStreamUrl = "";


/* =========================================================
   HELPERS
========================================================= */

function setOfflineUI(message = "This branch is currently offline") {
  q("branchLiveIndicator").textContent = "OFFLINE";
  q("branchLiveIndicator").classList.remove("on");

  q("branchLiveTitle").textContent = message;

  q("branchPresenter").textContent =
    "Check back when the branch starts a live programme.";

  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  if (playButton) {
    playButton.disabled = true;
  }

  if (playIcon) {
    playIcon.className = "fa-solid fa-play";
  }
}


function setLiveUI(broadcast) {
  currentLive = broadcast;

  q("branchLiveIndicator").textContent = "LIVE NOW";
  q("branchLiveIndicator").classList.add("on");

  q("branchLiveTitle").textContent =
    broadcast.title || "Live Broadcast";

  q("branchPresenter").textContent =
    broadcast.presenter
      ? `With ${broadcast.presenter}`
      : "Live from this branch";

  /*
   * IMPORTANT:
   *
   * broadcast.streamUrl may contain only:
   *
   *     /vnFKR
   *
   * That is NOT a complete public URL.
   *
   * We therefore use radio.publicStreamUrl from Settings.
   */

  if (publicStreamUrl && audio) {
    audio.src = publicStreamUrl;
    audio.load();

    if (playButton) {
      playButton.disabled = false;
    }
  } else {
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }

    if (playButton) {
      playButton.disabled = true;
    }

    console.warn(
      "Branch is live, but no publicStreamUrl is configured."
    );
  }
}


/* =========================================================
   LOAD SETTINGS
========================================================= */

try {
  const settings = await getSettings();

  publicStreamUrl =
    settings?.radio?.publicStreamUrl?.trim() || "";

  console.log(
    "Public radio stream URL:",
    publicStreamUrl || "(not configured)"
  );

} catch (error) {

  console.error(
    "Unable to load radio settings:",
    error
  );
}


/* =========================================================
   LOAD BRANCH
========================================================= */

if (!branchId) {

  q("branchName").textContent = "Branch not found";

  q("branchStatus").textContent =
    "No branch ID was provided.";

  if (playButton) {
    playButton.disabled = true;
  }

} else {

  try {

    const branch =
      await getOne(
        COLLECTIONS.BRANCHES,
        branchId
      );

    if (!branch) {

      q("branchName").textContent =
        "Branch not found";

      q("branchStatus").textContent =
        "This branch does not exist.";

      if (playButton) {
        playButton.disabled = true;
      }

    } else {

      document.title =
        `${branch.branchName || "Branch"} | CAC Radio`;

      q("branchName").textContent =
        branch.branchName || "CAC Branch";

      q("branchLocation").textContent =
        [
          branch.address,
          branch.state,
          branch.country
        ]
          .filter(Boolean)
          .join(", ");

      q("branchStatus").textContent =
        branch.status === "active"
          ? "Connected to CAC Radio Network"
          : "Branch currently inactive";
    }

  } catch (error) {

    console.error(
      "Unable to load branch:",
      error
    );

    q("branchName").textContent =
      "Unable to load branch";

    q("branchStatus").textContent =
      "Please refresh the page.";

    if (playButton) {
      playButton.disabled = true;
    }
  }
}


/* =========================================================
   WATCH BROADCASTS
========================================================= */

listen(
  COLLECTIONS.BROADCASTS,
  items => {

    const live =
      items.find(item =>
        item.branchId === branchId &&
        item.status === "live" &&
        item.isPublic !== false
      ) || null;

    if (live) {

      setLiveUI(live);

    } else {

      currentLive = null;

      setOfflineUI();
    }
  }
);


/* =========================================================
   PLAY / PAUSE
========================================================= */

playButton?.addEventListener(
  "click",
  async () => {

    if (!currentLive) {

      toast(
        "This branch is not live right now.",
        "error"
      );

      return;
    }

    if (!publicStreamUrl) {

      toast(
        "The public radio stream is not configured yet.",
        "error"
      );

      console.error(
        "settings.radio.publicStreamUrl is empty."
      );

      return;
    }

    try {

      if (audio.paused) {

        await audio.play();

        playIcon.className =
          "fa-solid fa-pause";

      } else {

        audio.pause();

        playIcon.className =
          "fa-solid fa-play";
      }

    } catch (error) {

      console.error(
        "Branch audio playback failed:",
        error
      );

      toast(
        "Unable to play this branch broadcast.",
        "error"
      );
    }
  }
);


/* =========================================================
   VOLUME
========================================================= */

q("branchVolume")?.addEventListener(
  "input",
  event => {

    if (audio) {
      audio.volume =
        Number(event.target.value);
    }
  }
);


/* =========================================================
   AUDIO EVENTS
========================================================= */

audio?.addEventListener(
  "play",
  () => {

    if (playIcon) {
      playIcon.className =
        "fa-solid fa-pause";
    }
  }
);


audio?.addEventListener(
  "pause",
  () => {

    if (playIcon) {
      playIcon.className =
        "fa-solid fa-play";
    }
  }
);


audio?.addEventListener(
  "error",
  event => {

    console.error(
      "Branch audio error:",
      event
    );

    if (currentLive) {

      toast(
        "The branch is live, but the audio stream could not be played.",
        "error"
      );
    }
  }
);
