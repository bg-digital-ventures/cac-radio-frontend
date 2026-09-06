import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { add, update, getAll } from "../services/firestore.js";
import { liveApi, API_BASE } from "../services/api.js";
import { toast } from "../components/toast.js";

const profile = await bootAdmin();

if (!profile) {
  throw new Error("Not authenticated");
}

const isHQ = profile.role === "hq_admin";
const branchId = isHQ ? "hq" : (profile.branchId || profile.id);
const branchName = isHQ
  ? "Headquarters"
  : (profile.branchName || "Branch");

const $ = (id) => document.getElementById(id);

const broadcastIdentity = $("broadcastIdentity");
const liveState = $("liveState");
const liveTimer = $("liveTimer");
const micState = $("micState");

const previewMic = $("previewMic");
const startLive = $("startLive");
const stopLive = $("stopLive");

const micStatusTitle = $("micStatusTitle");
const micStatusDescription = $("micStatusDescription");

const micConnection = $("micConnection");
const micConnectionText = $("micConnectionText");

const backendConnection = $("backendConnection");
const backendConnectionText = $("backendConnectionText");

const streamConnection = $("streamConnection");
const streamConnectionText = $("streamConnectionText");

const audioMonitorStatus = $("audioMonitorStatus");
const leftMeter = $("leftMeter");
const rightMeter = $("rightMeter");
const audioMeterFill = $("audioMeterFill");
const audioLevelText = $("audioLevelText");
const audioVisualizer = $("audioVisualizer");

const casterHost = $("casterHost");
const casterMount = $("casterMount");
const casterBitrate = $("casterBitrate");

const hqControls = $("hqControls");
const hqBranchSelect = $("hqBranchSelect");
const connectHQ = $("connectHQ");
const disconnectHQ = $("disconnectHQ");
const hqRelayStatus = $("hqRelayStatus");

if (broadcastIdentity) {
  broadcastIdentity.textContent = `Broadcasting as ${branchName}`;
}

if (hqControls) {
  hqControls.hidden = !isHQ;
}

let stream = null;
let recorder = null;
let socket = null;
let broadcastId = null;
let liveSession = null;

let liveStartedAt = null;
let liveTimerInterval = null;

let audioContext = null;
let analyser = null;
let microphoneSource = null;
let audioAnimationFrame = null;

let startingLive = false;
let endingLive = false;
let stoppingManually = false;
let visualizerBars = [];

function setConnection(element, textElement, state, text) {
  if (!element || !textElement) return;

  element.classList.remove("connected", "error");

  if (state === "connected") element.classList.add("connected");
  if (state === "error") element.classList.add("error");

  textElement.textContent = text;
}

function setMicrophoneConnection(state, text) {
  setConnection(micConnection, micConnectionText, state, text);
}

function setBackendConnection(state, text) {
  setConnection(backendConnection, backendConnectionText, state, text);
}

function setStreamConnection(state, text) {
  setConnection(streamConnection, streamConnectionText, state, text);
}

function setMicrophoneUI(connected, title, description) {
  if (micStatusTitle) micStatusTitle.textContent = title;
  if (micStatusDescription) micStatusDescription.textContent = description;
  if (micState) {
    micState.textContent = connected
      ? "Microphone ready"
      : "Microphone not connected";
  }

  if (connected) {
    setMicrophoneConnection("connected", "Connected");
    if (previewMic) {
      previewMic.innerHTML =
        '<i class="fa-solid fa-microphone"></i> Microphone Ready';
    }
  } else {
    setMicrophoneConnection(null, "Not connected");
    if (previewMic) {
      previewMic.innerHTML =
        '<i class="fa-solid fa-microphone"></i> Allow Microphone';
    }
  }
}

function setLiveUI(isLive) {
  if (liveState) {
    liveState.textContent = isLive ? "LIVE" : "OFFLINE";
    liveState.classList.toggle("live", isLive);
  }

  if (startLive) startLive.disabled = isLive;
  if (stopLive) stopLive.disabled = !isLive;

  if (isLive) {
    setStreamConnection("connected", "Live stream connected");
    if (audioMonitorStatus) {
      audioMonitorStatus.textContent = "Live microphone monitoring";
    }
  } else {
    setStreamConnection(null, "Offline");
    if (audioMonitorStatus) {
      audioMonitorStatus.textContent = "Waiting for microphone";
    }
  }
}

function startLiveTimer(startTimestamp = Date.now()) {
  stopLiveTimer();
  liveStartedAt = startTimestamp;

  const draw = () => {
    if (!liveStartedAt || !liveTimer) return;

    const total = Math.max(
      0,
      Math.floor((Date.now() - liveStartedAt) / 1000)
    );

    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    liveTimer.textContent =
      `${String(h).padStart(2, "0")}:` +
      `${String(m).padStart(2, "0")}:` +
      `${String(s).padStart(2, "0")}`;
  };

  draw();
  liveTimerInterval = setInterval(draw, 1000);
}

function stopLiveTimer() {
  if (liveTimerInterval) clearInterval(liveTimerInterval);
  liveTimerInterval = null;
  liveStartedAt = null;
  if (liveTimer) liveTimer.textContent = "00:00:00";
}

function createVisualizerBars() {
  if (!audioVisualizer) return;

  audioVisualizer.innerHTML = "";
  visualizerBars = [];

  const count = window.innerWidth < 600 ? 28 : 55;

  for (let i = 0; i < count; i += 1) {
    const bar = document.createElement("span");
    bar.className = "audio-bar";
    bar.style.height = "6px";
    audioVisualizer.appendChild(bar);
    visualizerBars.push(bar);
  }
}

function updateAudioMeter(level) {
  if (audioMeterFill) {
    audioMeterFill.style.width = `${level}%`;
    audioMeterFill.classList.remove(
      "audio-good",
      "audio-high",
      "audio-clipping"
    );

    if (level >= 90) {
      audioMeterFill.classList.add("audio-clipping");
    } else if (level >= 70) {
      audioMeterFill.classList.add("audio-high");
    } else {
      audioMeterFill.classList.add("audio-good");
    }
  }

  if (audioLevelText) audioLevelText.textContent = `${level}%`;
}

async function startAudioMonitor() {
  if (!stream) return;

  stopAudioMonitor();

  try {
    const AudioContext =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      throw new Error("Audio monitoring is not supported.");
    }

    audioContext = new AudioContext();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;

    microphoneSource =
      audioContext.createMediaStreamSource(stream);

    microphoneSource.connect(analyser);
    createVisualizerBars();

    const timeData = new Uint8Array(analyser.fftSize);
    const frequencyData =
      new Uint8Array(analyser.frequencyBinCount);

    function drawAudio() {
      if (!analyser) return;

      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(frequencyData);

      let sum = 0;

      for (const sample of timeData) {
        const value = (sample - 128) / 128;
        sum += value * value;
      }

      const rms = Math.sqrt(sum / timeData.length);

      const level = Math.max(
        0,
        Math.min(100, Math.round(rms * 300))
      );

      updateAudioMeter(level);

      if (leftMeter) leftMeter.style.width = `${level}%`;
      if (rightMeter) rightMeter.style.width = `${level}%`;

      if (visualizerBars.length) {
        const step = Math.max(
          1,
          Math.floor(
            frequencyData.length / visualizerBars.length
          )
        );

        visualizerBars.forEach((bar, index) => {
          const value =
            frequencyData[index * step] || 0;

          bar.style.height =
            `${Math.max(5, Math.min(92, value * 0.65))}px`;
        });
      }

      audioAnimationFrame =
        requestAnimationFrame(drawAudio);
    }

    drawAudio();

    if (audioMonitorStatus) {
      audioMonitorStatus.textContent =
        "Microphone monitoring active";
    }
  } catch (error) {
    console.error("Audio monitor error:", error);

    if (audioMonitorStatus) {
      audioMonitorStatus.textContent =
        "Audio monitor unavailable";
    }
  }
}

function stopAudioMonitor() {
  if (audioAnimationFrame) {
    cancelAnimationFrame(audioAnimationFrame);
    audioAnimationFrame = null;
  }

  try {
    microphoneSource?.disconnect();
  } catch {}

  try {
    analyser?.disconnect();
  } catch {}

  microphoneSource = null;
  analyser = null;

  try {
    audioContext?.close();
  } catch {}

  audioContext = null;
  visualizerBars = [];

  if (audioVisualizer) audioVisualizer.innerHTML = "";
  if (leftMeter) leftMeter.style.width = "0%";
  if (rightMeter) rightMeter.style.width = "0%";

  updateAudioMeter(0);
}

async function endFirestoreBroadcast(id) {
  if (!id) return;

  try {
    await update(COLLECTIONS.BROADCASTS, id, {
      status: "ended",
      updatedAt: new Date()
    });
  } catch (error) {
    console.error("Firestore broadcast cleanup failed:", error);
  }
}

async function getMicrophone() {
  if (stream) return stream;

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "Your browser does not support microphone access."
    );
  }

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2
    }
  });

  stream.getAudioTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      if (!endingLive && liveSession) {
        handleUnexpectedDisconnect(
          new Error("Microphone was disconnected.")
        );
      }
    });
  });

  setMicrophoneUI(
    true,
    "Microphone connected",
    "Microphone access has been granted."
  );

  await startAudioMonitor();

  return stream;
}

function getRecorderMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus"
  ];

  return types.find((type) =>
    MediaRecorder.isTypeSupported(type)
  ) || "";
}

function closeSocket() {
  if (!socket) return;

  try {
    socket.close(1000, "Client closing");
  } catch {}

  socket = null;
}

function stopMicrophone() {
  if (!stream) return;

  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch {}

  stream = null;
}

async function cleanupLocalLive(markFirestore = true) {
  const id = broadcastId;

  try {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  } catch {}

  recorder = null;
  closeSocket();
  stopAudioMonitor();
  stopLiveTimer();
  stopMicrophone();

  if (markFirestore && id) {
    await endFirestoreBroadcast(id);
  }

  broadcastId = null;
  liveSession = null;

  setLiveUI(false);
  setMicrophoneUI(
    false,
    "Microphone not connected",
    "Allow microphone access to begin."
  );
}

async function handleUnexpectedDisconnect(error) {
  if (stoppingManually || endingLive) return;

  console.error("Unexpected live disconnect:", error);

  setStreamConnection(
    "error",
    "Live connection lost"
  );

  try {
    await liveApi.stop({
      branchId,
      broadcastId
    });
  } catch (stopError) {
    console.error("Remote cleanup failed:", stopError);
  }

  await cleanupLocalLive(true);

  toast(
    error?.message || "Live connection ended.",
    "error"
  );
}

function makeWebSocketUrl(sessionToken, id) {
  const base = API_BASE.replace(/^http/i, "ws");

  return (
    `${base}/ws/live/${encodeURIComponent(branchId)}` +
    `?token=${encodeURIComponent(sessionToken)}` +
    `&broadcastId=${encodeURIComponent(id)}`
  );
}

async function openLiveSocket(sessionToken, id) {
  const url = makeWebSocketUrl(sessionToken, id);

  socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  await new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;

      try {
        socket?.close();
      } catch {}

      reject(
        new Error("Live WebSocket connection timed out.")
      );
    }, 15000);

    socket.onopen = () => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      setBackendConnection("connected", "Connected");
      setStreamConnection(
        "connected",
        "Live stream connected"
      );

      resolve();
    };

    socket.onerror = () => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      reject(
        new Error("Live WebSocket connection failed.")
      );
    };

    socket.onclose = (event) => {
      if (!settled) return;

      console.warn(
        "Live socket closed:",
        event.code,
        event.reason
      );

      if (!stoppingManually && !endingLive) {
        handleUnexpectedDisconnect(
          new Error("Live WebSocket disconnected.")
        );
      }
    };
  });
}

async function loadProgrammes() {
  let programmes = await getAll(COLLECTIONS.PROGRAMMES);

  if (!isHQ) {
    programmes = programmes.filter(
      (item) =>
        !item.branchId ||
        item.branchId === profile.branchId
    );
  }

  const programmeSelect = $("programmeSelect");

  if (!programmeSelect) return;

  programmeSelect.innerHTML =
    '<option value="">Select programme</option>' +
    programmes
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${
            escapeHtml(item.title || "Programme")
          }</option>`
      )
      .join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
  );
}

async function refreshHQBranches() {
  if (!isHQ || !hqBranchSelect) return;

  try {
    const [branches, health] = await Promise.all([
      getAll(COLLECTIONS.BRANCHES),
      liveApi.health()
    ]);

    const liveIds = new Set(
      health?.liveBranches || []
    );

    const activeLiveBranches = branches.filter(
      (branch) =>
        (!branch.status || branch.status === "active") &&
        liveIds.has(branch.id)
    );

    hqBranchSelect.innerHTML =
      '<option value="">Select live branch feed</option>' +
      activeLiveBranches
        .map(
          (branch) =>
            `<option value="${escapeHtml(branch.id)}">${
              escapeHtml(branch.branchName)
            }</option>`
        )
        .join("");

    if (hqRelayStatus) {
      if (health?.hqRelay?.connected) {
        hqRelayStatus.textContent =
          `Connected: ${health.hqRelay.branchId}`;
      } else {
        hqRelayStatus.textContent =
          "Normal HQ feed";
      }
    }
  } catch (error) {
    console.error("HQ branch refresh failed:", error);

    if (hqRelayStatus) {
      hqRelayStatus.textContent = "HQ status unavailable";
    }
  }
}

async function checkBackendHealth() {
  try {
    const data = await liveApi.health();

    setBackendConnection("connected", "Connected");

    if (isHQ) {
      if (data?.hqRelay?.connected) {
        setStreamConnection(
          "connected",
          `HQ → ${data.hqRelay.branchId}`
        );
      } else {
        setStreamConnection(
          null,
          "HQ normal feed"
        );
      }
    }

    return data;
  } catch (error) {
    console.error("Backend health failed:", error);
    setBackendConnection("error", "Unavailable");
    return null;
  }
}

async function loadCasterInfo() {
  try {
    const data = await liveApi.casterConfig();

    const caster = data?.caster;

    if (casterHost) casterHost.textContent = caster?.host || "—";
    if (casterMount) casterMount.textContent = caster?.mount || "—";
    if (casterBitrate) casterBitrate.textContent = caster?.bitrate || "—";

    return data;
  } catch (error) {
    console.error("Caster config failed:", error);

    if (casterHost) casterHost.textContent = "Unavailable";
    if (casterMount) casterMount.textContent = "Unavailable";
    if (casterBitrate) casterBitrate.textContent = "Unavailable";

    return null;
  }
}

previewMic?.addEventListener("click", async () => {
  try {
    await getMicrophone();
    toast("Microphone access granted.", "success");
  } catch (error) {
    console.error("Microphone error:", error);

    setMicrophoneUI(
      false,
      "Microphone unavailable",
      error?.message || "Allow microphone access to continue."
    );

    toast(
      error?.message || "Microphone permission denied.",
      "error"
    );
  }
});

startLive?.addEventListener("click", async () => {
  if (startingLive || endingLive) return;

  startingLive = true;
  stoppingManually = false;

  try {
    await getMicrophone();
    await startAudioMonitor();

    const title =
      $("liveTitle")?.value?.trim() ||
      "Live Broadcast";

    const presenter =
      $("presenter")?.value?.trim() ||
      "";

    const programmeId =
      $("programmeSelect")?.value ||
      "";

    setBackendConnection("connected", "Connecting...");

    const result = await liveApi.start({
      branchId,
      branchName,
      title,
      presenter,
      programmeId
    });

    if (!result?.ok || !result.sessionToken) {
      throw new Error(
        result?.message ||
        "Unable to prepare live session."
      );
    }

    liveSession = result;

    if (result.caster) {
      if (casterHost) casterHost.textContent = result.caster.host || "—";
      if (casterMount) casterMount.textContent = result.mount || result.caster.mount || "—";
      if (casterBitrate) casterBitrate.textContent = result.caster.bitrate || "—";
    }

    broadcastId = await add(
      COLLECTIONS.BROADCASTS,
      {
        branchId,
        branchName,
        title,
        presenter,
        programmeId,
        status: "live",
        isPublic: true,
        isMain: isHQ,
        streamUrl: result.publicStreamUrl || "",
        mount: result.mount || "",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    );

    await openLiveSocket(
      result.sessionToken,
      broadcastId
    );

    const mimeType = getRecorderMimeType();

    if (!mimeType) {
      throw new Error(
        "This browser cannot encode audio for live broadcasting."
      );
    }

    recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 96000
    });

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;

      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      try {
        socket.send(event.data);
      } catch (error) {
        console.error("Audio send failed:", error);
      }
    };

    recorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);

      if (!endingLive) {
        handleUnexpectedDisconnect(
          new Error("Microphone recorder error.")
        );
      }
    };

    recorder.start(1000);

    setLiveUI(true);
    setBackendConnection("connected", "Connected");
    setStreamConnection("connected", "Live stream connected");
    startLiveTimer();

    toast("Live broadcast started.", "success");
  } catch (error) {
    console.error("LIVE START ERROR:", error);

    stoppingManually = true;

    try {
      await liveApi.stop({
        branchId,
        broadcastId
      });
    } catch {}

    await cleanupLocalLive(true);

    toast(
      error?.message || "Unable to start live.",
      "error"
    );
  } finally {
    startingLive = false;
    stoppingManually = false;
  }
});

stopLive?.addEventListener("click", async () => {
  if (endingLive) return;

  endingLive = true;
  stoppingManually = true;

  const id = broadcastId;

  try {
    try {
      await liveApi.stop({
        branchId,
        broadcastId: id
      });
    } catch (error) {
      console.error("Backend stop error:", error);
    }

    await cleanupLocalLive(true);

    setBackendConnection(null, "Not connected");

    toast("Broadcast stopped.", "success");
  } catch (error) {
    console.error("STOP LIVE ERROR:", error);

    await cleanupLocalLive(true);

    toast(
      "Broadcast stopped locally. Some cleanup may have failed.",
      "error"
    );
  } finally {
    endingLive = false;
    stoppingManually = false;
  }
});

connectHQ?.addEventListener("click", async () => {
  if (!isHQ) return;

  const target = hqBranchSelect?.value;

  if (!target) {
    toast("Select a live branch first.", "error");
    return;
  }

  try {
    connectHQ.disabled = true;

    const result = await liveApi.connectHQ({
      branchId: target
    });

    if (hqRelayStatus) {
      hqRelayStatus.textContent =
        `Connected: ${result.branchName || target}`;
    }

    setStreamConnection(
      "connected",
      `HQ → ${result.branchName || target}`
    );

    toast(
      result.message || "HQ feed switched.",
      "success"
    );
  } catch (error) {
    console.error("Connect HQ error:", error);

    toast(
      error?.message || "Unable to connect branch to HQ.",
      "error"
    );
  } finally {
    connectHQ.disabled = false;
  }
});

disconnectHQ?.addEventListener("click", async () => {
  if (!isHQ) return;

  try {
    disconnectHQ.disabled = true;

    const result = await liveApi.disconnectHQ();

    if (hqBranchSelect) hqBranchSelect.value = "";

    if (hqRelayStatus) {
      hqRelayStatus.textContent = "Normal HQ feed";
    }

    setStreamConnection(null, "HQ normal feed");

    toast(
      result.message || "HQ returned to normal feed.",
      "success"
    );
  } catch (error) {
    console.error("Disconnect HQ error:", error);

    toast(
      error?.message || "Unable to disconnect HQ relay.",
      "error"
    );
  } finally {
    disconnectHQ.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  stoppingManually = true;

  try {
    recorder?.stop();
  } catch {}

  try {
    socket?.close();
  } catch {}

  stopAudioMonitor();
  stopLiveTimer();
});

await checkBackendHealth();
await loadCasterInfo();
await loadProgrammes();
await refreshHQBranches();

setLiveUI(false);

setMicrophoneUI(
  false,
  "Microphone not connected",
  "Allow microphone access to begin."
);

setBackendConnection(null, "Checking...");
setStreamConnection(null, isHQ ? "HQ normal feed" : "Offline");
updateAudioMeter(0);

if (isHQ) {
  setInterval(refreshHQBranches, 5000);
}
