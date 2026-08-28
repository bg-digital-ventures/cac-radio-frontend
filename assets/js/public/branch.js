import { COLLECTIONS } from "../config/collections.js";
import { getOne, listen } from "../services/firestore.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";

initializeTheme();

const branchId = new URLSearchParams(location.search).get("id");
const q = id => document.getElementById(id);
q("branchYear").textContent = new Date().getFullYear();

if (!branchId) {
  q("branchName").textContent = "Branch not found";
  q("branchStatus").textContent = "No branch ID was provided.";
  q("branchPlayButton").disabled = true;
} else {
  const branch = await getOne(COLLECTIONS.BRANCHES, branchId);

  if (!branch) {
    q("branchName").textContent = "Branch not found";
    q("branchStatus").textContent = "This branch does not exist.";
    q("branchPlayButton").disabled = true;
  } else {
    document.title = `${branch.branchName || "Branch"} | CAC Radio`;
    q("branchName").textContent = branch.branchName || "CAC Branch";
    q("branchLocation").textContent = [branch.address, branch.state, branch.country].filter(Boolean).join(", ");
    q("branchStatus").textContent = branch.status === "active" ? "Connected to CAC Radio Network" : "Branch currently inactive";
  }
}

let currentLive = null;
const audio = q("branchAudio");

listen(COLLECTIONS.BROADCASTS, items => {
  currentLive = items.find(item =>
    item.branchId === branchId &&
    item.status === "live" &&
    item.isPublic !== false
  ) || null;

  if (currentLive) {
    q("branchLiveIndicator").textContent = "LIVE NOW";
    q("branchLiveIndicator").classList.add("on");
    q("branchLiveTitle").textContent = currentLive.title || "Live Broadcast";
    q("branchPresenter").textContent = currentLive.presenter ? `With ${currentLive.presenter}` : "Live from this branch";

    if (currentLive.streamUrl) {
      audio.src = currentLive.streamUrl;
      q("branchPlayButton").disabled = false;
    } else {
      audio.removeAttribute("src");
      q("branchPlayButton").disabled = true;
    }
  } else {
    q("branchLiveIndicator").textContent = "OFFLINE";
    q("branchLiveIndicator").classList.remove("on");
    q("branchLiveTitle").textContent = "This branch is currently offline";
    q("branchPresenter").textContent = "Check back when the branch starts a live programme.";
    audio.pause();
    audio.removeAttribute("src");
    q("branchPlayButton").disabled = true;
    q("branchPlayIcon").className = "fa-solid fa-play";
  }
});

q("branchPlayButton").addEventListener("click", async () => {
  if (!currentLive || !audio.src) {
    toast("This branch is not live right now.", "error");
    return;
  }

  try {
    if (audio.paused) {
      await audio.play();
      q("branchPlayIcon").className = "fa-solid fa-pause";
    } else {
      audio.pause();
      q("branchPlayIcon").className = "fa-solid fa-play";
    }
  } catch (error) {
    console.error(error);
    toast("Unable to play this branch broadcast.", "error");
  }
});

q("branchVolume").addEventListener("input", event => {
  audio.volume = Number(event.target.value);
});
