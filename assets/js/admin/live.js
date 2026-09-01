import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { add, update, getAll } from "../services/firestore.js";
import { liveApi, API_BASE } from "../services/api.js";
import { toast } from "../components/toast.js";


// =========================================================
// AUTH / PROFILE
// =========================================================

const profile = await bootAdmin();

if (!profile) {
  throw new Error("Not authenticated");
}

const isHQ = profile.role === "hq_admin";

const branchId = isHQ
  ? "hq"
  : (profile.branchId || profile.id);

const branchName = isHQ
  ? "Headquarters"
  : (profile.branchName || "Branch");


// =========================================================
// DOM HELPERS
// =========================================================

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


// =========================================================
// INITIAL UI
// =========================================================

if (broadcastIdentity) {
  broadcastIdentity.textContent =
    `Broadcasting as ${branchName}`;
}

if (hqControls) {
  hqControls.hidden = !isHQ;
}


// =========================================================
// STATE
// =========================================================

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

let stoppingManually = false;
let startingLive = false;
let endingLive = false;

let visualizerBars = [];


// =========================================================
// CONNECTION UI
// =========================================================

function setConnection(element, textElement, state, text) {

  if (!element || !textElement) {
    return;
  }

  element.classList.remove(
    "connected",
    "error"
  );

  if (state === "connected") {
    element.classList.add("connected");
  }

  if (state === "error") {
    element.classList.add("error");
  }

  textElement.textContent = text;
}


function setMicrophoneConnection(
  state,
  text
) {

  setConnection(
    micConnection,
    micConnectionText,
    state,
    text
  );
}


function setBackendConnection(
  state,
  text
) {

  setConnection(
    backendConnection,
    backendConnectionText,
    state,
    text
  );
}


function setStreamConnection(
  state,
  text
) {

  setConnection(
    streamConnection,
    streamConnectionText,
    state,
    text
  );
}


// =========================================================
// MICROPHONE UI
// =========================================================

function setMicrophoneUI(
  connected,
  title,
  description
) {

  if (micStatusTitle) {
    micStatusTitle.textContent =
      title;
  }

  if (micStatusDescription) {
    micStatusDescription.textContent =
      description;
  }

  if (micState) {
    micState.textContent =
      connected
        ? "Microphone ready"
        : "Microphone not connected";
  }

  if (connected) {

    setMicrophoneConnection(
      "connected",
      "Connected"
    );

    if (previewMic) {
      previewMic.innerHTML =
        '<i class="fa-solid fa-microphone"></i> ' +
        "Microphone Ready";
    }

  } else {

    setMicrophoneConnection(
      null,
      "Not connected"
    );

    if (previewMic) {
      previewMic.innerHTML =
        '<i class="fa-solid fa-microphone"></i> ' +
        "Allow Microphone";
    }
  }
}


// =========================================================
// LIVE UI
// =========================================================

function setLiveUI(isLive) {

  if (liveState) {

    liveState.textContent =
      isLive
        ? "LIVE"
        : "OFFLINE";

    liveState.classList.toggle(
      "live",
      isLive
    );
  }

  if (startLive) {
    startLive.disabled = isLive;
  }

  if (stopLive) {
    stopLive.disabled = !isLive;
  }

  if (isLive) {

    setStreamConnection(
      "connected",
      "Live stream connected"
    );

    if (audioMonitorStatus) {
      audioMonitorStatus.textContent =
        "Live microphone monitoring";
    }

  } else {

    setStreamConnection(
      null,
      "Offline"
    );

    if (audioMonitorStatus) {
      audioMonitorStatus.textContent =
        "Waiting for microphone";
    }
  }
}


// =========================================================
// TIMER
// =========================================================

function startLiveTimer() {

  stopLiveTimer();

  liveStartedAt = Date.now();

  function updateTimer() {

    if (!liveStartedAt) {
      return;
    }

    const elapsed =
      Date.now() - liveStartedAt;

    const totalSeconds =
      Math.floor(
        elapsed / 1000
      );

    const hours =
      Math.floor(
        totalSeconds / 3600
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const seconds =
      totalSeconds % 60;

    if (liveTimer) {

      liveTimer.textContent =
        `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")}`;
    }
  }

  updateTimer();

  liveTimerInterval =
    setInterval(
      updateTimer,
      1000
    );
}


function stopLiveTimer() {

  if (liveTimerInterval) {

    clearInterval(
      liveTimerInterval
    );

    liveTimerInterval = null;
  }

  liveStartedAt = null;

  if (liveTimer) {
    liveTimer.textContent =
      "00:00:00";
  }
}


// =========================================================
// CREATE VISUALIZER
// =========================================================

function createVisualizerBars() {

  if (!audioVisualizer) {
    return;
  }

  audioVisualizer.innerHTML = "";

  visualizerBars = [];

  const count =
    window.innerWidth < 600
      ? 28
      : 55;

  for (let i = 0; i < count; i++) {

    const bar =
      document.createElement("span");

    bar.className =
      "audio-bar";

    bar.style.height =
      "6px";

    audioVisualizer.appendChild(
      bar
    );

    visualizerBars.push(bar);
  }
}


// =========================================================
// AUDIO MONITOR
// =========================================================

async function startAudioMonitor() {

  if (!stream) {
    return;
  }

  stopAudioMonitor();

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {

      throw new Error(
        "Audio monitoring is not supported by this browser."
      );
    }

    audioContext =
      new AudioContext();

    if (
      audioContext.state === "suspended"
    ) {

      await audioContext.resume();
    }

    analyser =
      audioContext.createAnalyser();

    analyser.fftSize = 256;

    analyser.smoothingTimeConstant =
      0.72;

    microphoneSource =
      audioContext.createMediaStreamSource(
        stream
      );

    microphoneSource.connect(
      analyser
    );

    createVisualizerBars();

    const timeData =
      new Uint8Array(
        analyser.fftSize
      );

    const frequencyData =
      new Uint8Array(
        analyser.frequencyBinCount
      );

    if (audioMonitorStatus) {

      audioMonitorStatus.textContent =
        "Microphone monitoring active";
    }


    function drawAudio() {

      if (!analyser) {
        return;
      }

      analyser.getByteTimeDomainData(
        timeData
      );

      analyser.getByteFrequencyData(
        frequencyData
      );


      // ===================================================
      // RMS LEVEL
      // ===================================================

      let sum = 0;

      for (
        let i = 0;
        i < timeData.length;
        i++
      ) {

        const value =
          (timeData[i] - 128) / 128;

        sum += value * value;
      }

      const rms =
        Math.sqrt(
          sum / timeData.length
        );


      let level =
        Math.round(
          rms * 300
        );

      level =
        Math.max(
          0,
          Math.min(
            100,
            level
          )
        );


      updateAudioMeter(
        level
      );


      // ===================================================
      // LEFT / RIGHT METERS
      // ===================================================

      if (leftMeter) {
        leftMeter.style.width =
          `${level}%`;
      }

      if (rightMeter) {
        rightMeter.style.width =
          `${level}%`;
      }


      // ===================================================
      // VISUALIZER
      // ===================================================

      if (visualizerBars.length) {

        const step =
          Math.floor(
            frequencyData.length /
            visualizerBars.length
          );

        visualizerBars.forEach(
          (bar, index) => {

            const position =
              index * step;

            const value =
              frequencyData[position] || 0;

            const height =
              Math.max(
                5,
                Math.min(
                  92,
                  value * 0.65
                )
              );

            bar.style.height =
              `${height}px`;
          }
        );
      }


      audioAnimationFrame =
        requestAnimationFrame(
          drawAudio
        );
    }


    drawAudio();

  } catch (error) {

    console.error(
      "Unable to start audio monitor:",
      error
    );

    if (audioMonitorStatus) {

      audioMonitorStatus.textContent =
        "Audio monitor unavailable";
    }
  }
}


// =========================================================
// AUDIO LEVEL UI
// =========================================================

function updateAudioMeter(level) {

  if (audioMeterFill) {

    audioMeterFill.style.width =
      `${level}%`;

    audioMeterFill.classList.remove(
      "audio-good",
      "audio-high",
      "audio-clipping"
    );

    if (level >= 90) {

      audioMeterFill.classList.add(
        "audio-clipping"
      );

    } else if (level >= 70) {

      audioMeterFill.classList.add(
        "audio-high"
      );

    } else {

      audioMeterFill.classList.add(
        "audio-good"
      );
    }
  }

  if (audioLevelText) {

    audioLevelText.textContent =
      `${level}%`;
  }
}


// =========================================================
// STOP AUDIO MONITOR
// =========================================================

function stopAudioMonitor() {

  if (audioAnimationFrame) {

    cancelAnimationFrame(
      audioAnimationFrame
    );

    audioAnimationFrame = null;
  }

  if (microphoneSource) {

    try {
      microphoneSource.disconnect();
    } catch (_) {}

    microphoneSource = null;
  }

  if (analyser) {

    try {
      analyser.disconnect();
    } catch (_) {}

    analyser = null;
  }

  if (audioContext) {

    try {
      audioContext.close();
    } catch (_) {}

    audioContext = null;
  }

  visualizerBars = [];

  if (audioVisualizer) {
    audioVisualizer.innerHTML = "";
  }

  if (leftMeter) {
    leftMeter.style.width = "0%";
  }

  if (rightMeter) {
    rightMeter.style.width = "0%";
  }

  updateAudioMeter(0);
}


// =========================================================
// FIRESTORE END BROADCAST
// =========================================================

async function endFirestoreBroadcast(id) {

  if (!id) {
    return;
  }

  try {

    await update(
      COLLECTIONS.BROADCASTS,
      id,
      {
        status: "ended",
        updatedAt: new Date()
      }
    );

  } catch (error) {

    console.error(
      "Unable to mark broadcast ended:",
      error
    );
  }
}


// =========================================================
// LOAD PROGRAMMES
// =========================================================

let programmes =
  await getAll(
    COLLECTIONS.PROGRAMMES
  );

if (!isHQ) {

  programmes =
    programmes.filter(
      x =>
        !x.branchId ||
        x.branchId === profile.branchId
    );
}

const programmeSelect =
  $("programmeSelect");

if (programmeSelect) {

  programmeSelect.innerHTML =
    '<option value="">Select programme</option>' +
    programmes
      .map(
        x =>
          `<option value="${x.id}">
            ${x.title || "Programme"}
          </option>`
      )
      .join("");
}


// =========================================================
// HQ BRANCHES
// =========================================================

if (isHQ && hqBranchSelect) {

  const branches =
    (
      await getAll(
        COLLECTIONS.BRANCHES
      )
    ).filter(
      x =>
        x.status === "active"
    );

  hqBranchSelect.innerHTML =
    '<option value="">Select branch live feed</option>' +
    branches
      .map(
        x =>
          `<option value="${x.id}">
            ${x.branchName}
          </option>`
      )
      .join("");
}


// =========================================================
// HEALTH CHECK
// =========================================================

async function checkBackendHealth() {

  try {

    const response =
      await fetch(
        `${API_BASE}/api/health`
      );

    if (!response.ok) {
      throw new Error(
        `Backend returned ${response.status}`
      );
    }

    const data =
      await response.json();

    setBackendConnection(
      "connected",
      "Connected"
    );

    return data;

  } catch (error) {

    console.error(
      "Backend health check failed:",
      error
    );

    setBackendConnection(
      "error",
      "Unavailable"
    );

    return null;
  }
}


// =========================================================
// LOAD CASTER INFORMATION
// =========================================================

async function loadCasterInfo() {

  try {

    const response =
      await fetch(
        `${API_BASE}/api/caster/config`
      );

    if (!response.ok) {
      throw new Error(
        `Caster config returned ${response.status}`
      );
    }

    const data =
      await response.json();

    if (
      data &&
      data.ok &&
      data.caster
    ) {

      if (casterHost) {

        casterHost.textContent =
          data.caster.host || "—";
      }

      if (casterMount) {

        casterMount.textContent =
          data.caster.mount || "—";
      }

      if (casterBitrate) {

        casterBitrate.textContent =
          data.caster.bitrate || "—";
      }
    }

    return data;

  } catch (error) {

    console.error(
      "Unable to load caster config:",
      error
    );

    if (casterHost) {
      casterHost.textContent = "Unavailable";
    }

    if (casterMount) {
      casterMount.textContent = "Unavailable";
    }

    if (casterBitrate) {
      casterBitrate.textContent = "Unavailable";
    }

    return null;
  }
}


// =========================================================
// INITIAL BACKEND SETUP
// =========================================================

await checkBackendHealth();
await loadCasterInfo();


// =========================================================
// MICROPHONE PREVIEW
// =========================================================

previewMic?.addEventListener(
  "click",
  async () => {

    try {

      if (stream) {

        toast(
          "Microphone is already ready.",
          "success"
        );

        return;
      }

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {

        throw new Error(
          "Your browser does not support microphone access."
        );
      }

      stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });


      setMicrophoneUI(
        true,
        "Microphone connected",
        "Microphone access has been granted."
      );


      await startAudioMonitor();


      toast(
        "Microphone access granted.",
        "success"
      );

    } catch (error) {

      console.error(
        "Microphone error:",
        error
      );

      setMicrophoneUI(
        false,
        "Microphone unavailable",
        error?.message ||
        "Allow microphone access to continue."
      );

      toast(
        error?.message ||
        "Microphone permission denied.",
        "error"
      );
    }
  }
);


// =========================================================
// START LIVE
// =========================================================

startLive?.addEventListener(
  "click",
  async () => {

    if (
      startingLive ||
      endingLive
    ) {
      return;
    }

    startingLive = true;
    stoppingManually = false;

    try {

      // ===================================================
      // MICROPHONE
      // ===================================================

      if (!stream) {

        stream =
          await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          });

        setMicrophoneUI(
          true,
          "Microphone connected",
          "Microphone ready for live broadcast."
        );
      }


      // ===================================================
      // AUDIO MONITOR
      // ===================================================

      await startAudioMonitor();


      // ===================================================
      // DETAILS
      // ===================================================

      const title =
        $("liveTitle")
          ?.value
          .trim() ||
        "Live Broadcast";

      const presenter =
        $("presenter")
          ?.value
          .trim() ||
        "";

      const programmeId =
        programmeSelect?.value ||
        "";


      // ===================================================
      // BACKEND
      // ===================================================

      setBackendConnection(
        "connected",
        "Connecting..."
      );

      const result =
        await liveApi.start({

          branchId,

          branchName,

          title,

          presenter,

          programmeId

        });


      if (
        !result ||
        !result.ok
      ) {

        throw new Error(
          result?.message ||
          "Unable to prepare live session."
        );
      }


      liveSession =
        result;


      setBackendConnection(
        "connected",
        "Session ready"
      );


      // ===================================================
      // CASTER INFORMATION
      // ===================================================

      if (result.caster) {

        if (casterHost) {
          casterHost.textContent =
            result.caster.host || "—";
        }

        if (casterMount) {
          casterMount.textContent =
            result.caster.mount || "—";
        }

        if (casterBitrate) {
          casterBitrate.textContent =
            result.caster.bitrate || "—";
        }
      }


      // ===================================================
      // FIRESTORE
      // ===================================================

      broadcastId =
        await add(
          COLLECTIONS.BROADCASTS,
          {
            branchId,
            branchName,
            title,
            presenter,
            programmeId,

            status: "live",

            isPublic: true,

            streamUrl:
              result.publicStreamUrl ||
              "",

            createdAt:
              new Date(),

            updatedAt:
              new Date()
          }
        );


      // ===================================================
      // WEBSOCKET URL
      // ===================================================

      const wsBase =
        API_BASE.replace(
          /^http/,
          "ws"
        );

      const wsUrl =
        `${wsBase}/ws/live/` +
        `${encodeURIComponent(branchId)}` +
        `?token=${encodeURIComponent(result.sessionToken)}` +
        `&broadcastId=${encodeURIComponent(broadcastId)}`;


      console.log(
        "Connecting WebSocket:",
        wsUrl
      );


      // ===================================================
      // WEBSOCKET
      // ===================================================

      socket =
        new WebSocket(wsUrl);


      await new Promise(
        (resolve, reject) => {

          let settled = false;

          const timeout =
            setTimeout(
              () => {

                if (settled) {
                  return;
                }

                settled = true;

                reject(
                  new Error(
                    "WebSocket connection timed out."
                  )
                );

              },
              15000
            );


          socket.onopen =
            () => {

              if (settled) {
                return;
              }

              settled = true;

              clearTimeout(
                timeout
              );

              console.log(
                "Live WebSocket connected."
              );

              setBackendConnection(
                "connected",
                "Connected"
              );

              setStreamConnection(
                "connected",
                "Connected"
              );

              resolve();
            };


          socket.onerror =
            () => {

              if (settled) {
                return;
              }

              settled = true;

              clearTimeout(
                timeout
              );

              reject(
                new Error(
                  "WebSocket connection failed."
                )
              );
            };


          socket.onclose =
            event => {

              console.warn(
                "WebSocket closed during connection:",
                event.code,
                event.reason
              );
            };
        }
      );


      // ===================================================
      // MEDIA RECORDER
      // ===================================================

      const mime =
        MediaRecorder.isTypeSupported(
          "audio/webm;codecs=opus"
        )
          ? "audio/webm;codecs=opus"
          : "audio/webm";


      recorder =
        new MediaRecorder(
          stream,
          {
            mimeType: mime
          }
        );


      // ===================================================
      // AUDIO DATA
      // ===================================================

      recorder.ondataavailable =
        event => {

          if (
            !event.data ||
            event.data.size === 0
          ) {
            return;
          }

          if (
            !socket ||
            socket.readyState !==
              WebSocket.OPEN
          ) {
            return;
          }

          try {

            socket.send(
              event.data
            );

          } catch (error) {

            console.error(
              "Unable to send audio:",
              error
            );
          }
        };


      // ===================================================
      // RECORDER ERROR
      // ===================================================

      recorder.onerror =
        event => {

          console.error(
            "MediaRecorder error:",
            event
          );

          toast(
            "Microphone recorder error.",
            "error"
          );
        };


      // ===================================================
      // SOCKET CLOSE AFTER CONNECTION
      // ===================================================

      socket.onclose =
        async event => {

          console.warn(
            "Live WebSocket closed:",
            event.code,
            event.reason
          );


          if (stoppingManually) {
            return;
          }

          if (endingLive) {
            return;
          }


          setStreamConnection(
            "error",
            "Disconnected"
          );


          setBackendConnection(
            "error",
            "Live session ended"
          );


          try {

            if (
              recorder &&
              recorder.state !==
                "inactive"
            ) {

              recorder.stop();
            }

          } catch (_) {}


          const endedId =
            broadcastId;


          if (endedId) {

            await endFirestoreBroadcast(
              endedId
            );
          }


          stopAudioMonitor();
          stopLiveTimer();


          if (stream) {

            try {

              stream
                .getTracks()
                .forEach(
                  track =>
                    track.stop()
                );

            } catch (_) {}

            stream = null;
          }


          broadcastId = null;
          liveSession = null;
          recorder = null;
          socket = null;


          setLiveUI(false);

          setMicrophoneUI(
            false,
            "Microphone not connected",
            "Allow microphone access to begin."
          );


          toast(
            "Live connection ended.",
            "error"
          );
        };


      // ===================================================
      // START RECORDING
      // ===================================================

      recorder.start(1000);


      // ===================================================
      // LIVE UI
      // ===================================================

      setLiveUI(true);

      startLiveTimer();

      if (audioMonitorStatus) {
        audioMonitorStatus.textContent =
          "Live microphone monitoring";
      }


      toast(
        "Live broadcast started.",
        "success"
      );


      console.log(
        "CAC Radio live session started:",
        result
      );

    } catch (error) {

      console.error(
        "LIVE START ERROR:",
        error
      );


      // ===================================================
      // RECORDER CLEANUP
      // ===================================================

      try {

        if (
          recorder &&
          recorder.state !==
            "inactive"
        ) {

          recorder.stop();
        }

      } catch (_) {}

      recorder = null;


      // ===================================================
      // SOCKET CLEANUP
      // ===================================================

      stoppingManually = true;

      try {

        if (socket) {
          socket.close();
        }

      } catch (_) {}

      socket = null;


      // ===================================================
      // BACKEND CLEANUP
      // ===================================================

      try {

        await liveApi.stop({
          branchId,
          broadcastId
        });

      } catch (cleanupError) {

        console.error(
          "Backend cleanup failed:",
          cleanupError
        );
      }


      // ===================================================
      // FIRESTORE CLEANUP
      // ===================================================

      if (broadcastId) {

        await endFirestoreBroadcast(
          broadcastId
        );
      }


      // ===================================================
      // AUDIO CLEANUP
      // ===================================================

      stopAudioMonitor();
      stopLiveTimer();


      // ===================================================
      // MICROPHONE CLEANUP
      // ===================================================

      if (stream) {

        try {

          stream
            .getTracks()
            .forEach(
              track =>
                track.stop()
            );

        } catch (_) {}

        stream = null;
      }


      broadcastId = null;
      liveSession = null;

      setLiveUI(false);

      setMicrophoneUI(
        false,
        "Microphone not connected",
        "Allow microphone access to begin."
      );


      toast(
        error?.message ||
        "Unable to start live.",
        "error"
      );

    } finally {

      startingLive = false;
      stoppingManually = false;
    }
  }
);


// =========================================================
// STOP LIVE
// =========================================================

stopLive?.addEventListener(
  "click",
  async () => {

    if (endingLive) {
      return;
    }

    endingLive = true;
    stoppingManually = true;

    const currentBroadcastId =
      broadcastId;

    try {

      // ===================================================
      // STOP RECORDER
      // ===================================================

      if (
        recorder &&
        recorder.state !==
          "inactive"
      ) {

        try {
          recorder.stop();
        } catch (_) {}
      }


      // ===================================================
      // BACKEND STOP
      // ===================================================

      try {

        await liveApi.stop({
          branchId,
          broadcastId:
            currentBroadcastId
        });

      } catch (error) {

        console.error(
          "Backend stop error:",
          error
        );
      }


      // ===================================================
      // FIRESTORE
      // ===================================================

      if (currentBroadcastId) {

        await endFirestoreBroadcast(
          currentBroadcastId
        );
      }


      // ===================================================
      // SOCKET
      // ===================================================

      if (socket) {

        try {
          socket.close();
        } catch (_) {}
      }

      socket = null;


      // ===================================================
      // AUDIO
      // ===================================================

      stopAudioMonitor();
      stopLiveTimer();


      // ===================================================
      // MICROPHONE
      // ===================================================

      if (stream) {

        try {

          stream
            .getTracks()
            .forEach(
              track =>
                track.stop()
            );

        } catch (_) {}

        stream = null;
      }


      // ===================================================
      // RESET
      // ===================================================

      broadcastId = null;
      liveSession = null;
      recorder = null;


      setLiveUI(false);

      setBackendConnection(
        null,
        "Not connected"
      );

      setMicrophoneUI(
        false,
        "Microphone not connected",
        "Allow microphone access to begin."
      );


      toast(
        "Broadcast stopped.",
        "success"
      );

    } catch (error) {

      console.error(
        "STOP LIVE ERROR:",
        error
      );

      setLiveUI(false);

      stopAudioMonitor();
      stopLiveTimer();

      toast(
        "Broadcast stopped locally. Some cleanup may have failed.",
        "error"
      );

    } finally {

      endingLive = false;
      stoppingManually = false;
    }
  }
);


// =========================================================
// CONNECT BRANCH TO HQ
// =========================================================

connectHQ?.addEventListener(
  "click",
  async () => {

    const target =
      hqBranchSelect?.value;

    if (!target) {

      toast(
        "Select a branch first.",
        "error"
      );

      return;
    }

    try {

      await liveApi.connectHQ({
        branchId: target
      });

      toast(
        "Branch connected to Headquarters output.",
        "success"
      );

    } catch (error) {

      console.error(
        "Connect HQ error:",
        error
      );

      toast(
        "Unable to connect branch to HQ.",
        "error"
      );
    }
  }
);


// =========================================================
// DISCONNECT HQ
// =========================================================

disconnectHQ?.addEventListener(
  "click",
  async () => {

    try {

      await liveApi.disconnectHQ();

      toast(
        "HQ relay disconnected.",
        "success"
      );

    } catch (error) {

      console.error(
        "Disconnect HQ error:",
        error
      );

      toast(
        "Unable to disconnect relay.",
        "error"
      );
    }
  }
);


// =========================================================
// CLEANUP ON PAGE EXIT
// =========================================================

window.addEventListener(
  "beforeunload",
  () => {

    try {

      if (recorder) {
        recorder.stop();
      }

    } catch (_) {}

    try {

      if (socket) {
        socket.close();
      }

    } catch (_) {}

    stopAudioMonitor();
    stopLiveTimer();
  }
);


// =========================================================
// INITIAL STATE
// =========================================================

setLiveUI(false);

setMicrophoneUI(
  false,
  "Microphone not connected",
  "Allow microphone access to begin."
);

setBackendConnection(
  null,
  "Checking..."
);

setStreamConnection(
  null,
  "Offline"
);

updateAudioMeter(0);
