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


document.getElementById(
  "broadcastIdentity"
).textContent = `Broadcasting as ${branchName}`;

document.getElementById(
  "hqControls"
).hidden = !isHQ;


// =========================================================
// STATE
// =========================================================

let stream = null;
let recorder = null;
let socket = null;

let broadcastId = null;
let liveSession = null;


// =========================================================
// LIVE MONITORING
// =========================================================

let liveStartedAt = null;
let liveTimerInterval = null;

let audioContext = null;
let analyser = null;
let microphoneSource = null;
let audioAnimationFrame = null;

// =========================================================
// LIVE TIMER
// =========================================================

function startLiveTimer() {

  stopLiveTimer();

stopAudioMonitor();

  liveStartedAt = Date.now();

  const timerElement =
    document.getElementById("liveTimer");

  if (!timerElement) {
    return;
  }

  function updateTimer() {

    if (!liveStartedAt) {
      return;
    }

    const elapsed =
      Date.now() - liveStartedAt;

    const totalSeconds =
      Math.floor(elapsed / 1000);

    const hours =
      Math.floor(totalSeconds / 3600);

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const seconds =
      totalSeconds % 60;

    timerElement.textContent =
      `${String(hours).padStart(2, "0")}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}`;
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

  const timerElement =
    document.getElementById("liveTimer");

  if (timerElement) {

    timerElement.textContent =
      "00:00:00";
  }
}


// =========================================================
// MICROPHONE AUDIO VISUALIZER
// =========================================================

async function startAudioMonitor() {

  if (!stream) {
    return;
  }

  try {

    stopAudioMonitor();

    audioContext =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    if (
      audioContext.state === "suspended"
    ) {

      await audioContext.resume();
    }

    analyser =
      audioContext.createAnalyser();

    analyser.fftSize = 256;

    analyser.smoothingTimeConstant =
      0.75;

    microphoneSource =
      audioContext.createMediaStreamSource(
        stream
      );

    microphoneSource.connect(
      analyser
    );

    const data =
      new Uint8Array(
        analyser.fftSize
      );

    function drawAudioLevel() {

      if (!analyser) {
        return;
      }

      analyser.getByteTimeDomainData(
        data
      );

      let sum = 0;

      for (
        let i = 0;
        i < data.length;
        i++
      ) {

        const normalized =
          (data[i] - 128) / 128;

        sum +=
          normalized *
          normalized;
      }

      const rms =
        Math.sqrt(
          sum / data.length
        );

      let level =
        Math.min(
          100,
          Math.round(
            rms * 300
          )
        );

      updateAudioMeter(level);

      audioAnimationFrame =
        requestAnimationFrame(
          drawAudioLevel
        );
    }

    drawAudioLevel();

    console.log(
      "Audio monitor started."
    );

  } catch (error) {

    console.error(
      "Unable to start audio monitor:",
      error
    );
  }
}


function updateAudioMeter(level) {

  const fill =
    document.getElementById(
      "audioMeterFill"
    );

  const text =
    document.getElementById(
      "audioLevelText"
    );

  if (!fill || !text) {
    return;
  }

  fill.style.width =
    `${level}%`;

  text.textContent =
    `${level}%`;

  fill.classList.remove(
    "audio-good",
    "audio-high",
    "audio-clipping"
  );

  if (level >= 90) {

    fill.classList.add(
      "audio-clipping"
    );

  } else if (level >= 70) {

    fill.classList.add(
      "audio-high"
    );

  } else {

    fill.classList.add(
      "audio-good"
    );
  }
}


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

  updateAudioMeter(0);
}

// ---------------------------------------------------------
// IMPORTANT
// ---------------------------------------------------------
// These flags prevent WebSocket cleanup from accidentally
// ending a broadcast when we intentionally close the socket.
// ---------------------------------------------------------

let stoppingManually = false;
let startingLive = false;
let endingLive = false;


// =========================================================
// UI HELPERS
// =========================================================

function setLiveUI(isLive) {

  const liveState =
    document.getElementById("liveState");

  const startButton =
    document.getElementById("startLive");

  const stopButton =
    document.getElementById("stopLive");

  if (isLive) {

    liveState.textContent = "LIVE";

    liveState.classList.add("live");

    startButton.disabled = true;

    stopButton.disabled = false;

  } else {

    liveState.textContent = "OFFLINE";

    liveState.classList.remove("live");

    startButton.disabled = false;

    stopButton.disabled = true;

  }
}


function resetLiveState() {

  broadcastId = null;
  liveSession = null;
  recorder = null;
  socket = null;

  stoppingManually = false;
  startingLive = false;
  endingLive = false;

  setLiveUI(false);

  const micState =
    document.getElementById("micState");

  if (micState) {

    micState.textContent =
      "Microphone not connected";

  }
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

    console.log(
      "Broadcast marked ended:",
      id
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

let programmes = await getAll(
  COLLECTIONS.PROGRAMMES
);

if (!isHQ) {

  programmes = programmes.filter(
    x =>
      !x.branchId ||
      x.branchId === profile.branchId
  );

}

document.getElementById(
  "programmeSelect"
).innerHTML =
  '<option value="">Select programme</option>' +
  programmes
    .map(
      x =>
        `<option value="${x.id}">
          ${x.title || "Programme"}
        </option>`
    )
    .join("");


// =========================================================
// HQ BRANCHES
// =========================================================

if (isHQ) {

  const branches = (
    await getAll(
      COLLECTIONS.BRANCHES
    )
  ).filter(
    x => x.status === "active"
  );

  document.getElementById(
    "hqBranchSelect"
  ).innerHTML =
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
// MICROPHONE PREVIEW
// =========================================================

document.getElementById(
  "previewMic"
).onclick = async () => {

  try {

    if (stream) {

      toast(
        "Microphone is already ready.",
        "success"
      );

      return;
    }

    stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    document.getElementById(
      "micState"
    ).textContent = "Microphone ready";

    toast(
      "Microphone access granted.",
      "success"
    );

  } catch (error) {

    console.error(
      "Microphone error:",
      error
    );

    toast(
      "Microphone permission denied.",
      "error"
    );
  }
};


// =========================================================
// START LIVE
// =========================================================

document.getElementById(
  "startLive"
).onclick = async () => {

  if (startingLive || endingLive) {
    return;
  }

  startingLive = true;
  stoppingManually = false;

  try {

    // =====================================================
    // MICROPHONE
    // =====================================================

    if (!stream) {

      stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      document.getElementById(
        "micState"
      ).textContent = "Microphone ready";

    }


    // =====================================================
    // BROADCAST DETAILS
    // =====================================================

    const title =
      document
        .getElementById("liveTitle")
        .value
        .trim() ||
      "Live Broadcast";


    const presenter =
      document
        .getElementById("presenter")
        .value
        .trim();


    const programmeId =
      document
        .getElementById("programmeSelect")
        .value;


    // =====================================================
    // PREPARE BACKEND SESSION
    // =====================================================

    console.log(
      "Preparing backend live session..."
    );


    const result =
      await liveApi.start({

        branchId,

        branchName,

        title,

        presenter,

        programmeId

      });


    if (!result || !result.ok) {

      throw new Error(
        result?.message ||
        "Unable to prepare live session."
      );

    }


    liveSession = result;


    console.log(
      "Backend live session prepared:",
      result
    );


    // =====================================================
    // CREATE FIRESTORE BROADCAST
    // =====================================================

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


    console.log(
      "Created Firestore broadcast:",
      broadcastId
    );


    // =====================================================
    // WEBSOCKET URL
    // =====================================================

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
      "Connecting live WebSocket..."
    );


    // =====================================================
    // CREATE WEBSOCKET
    // =====================================================

    socket =
      new WebSocket(wsUrl);


    // -----------------------------------------------------
    // Wait for WebSocket connection
    // -----------------------------------------------------

    await new Promise(
      (resolve, reject) => {

        let settled = false;

        const timeout =
          setTimeout(() => {

            if (settled) {
              return;
            }

            settled = true;

            reject(
              new Error(
                "WebSocket connection timed out."
              )
            );

          }, 15000);


        socket.onopen = () => {

          if (settled) {
            return;
          }

          settled = true;

          clearTimeout(timeout);

          console.log(
            "Live WebSocket connected."
          );

          resolve();

        };


        socket.onerror = () => {

          if (settled) {
            return;
          }

          settled = true;

          clearTimeout(timeout);

          reject(
            new Error(
              "WebSocket connection failed."
            )
          );

        };


        socket.onclose = event => {

          console.warn(
            "WebSocket closed during connection:",
            event.code,
            event.reason
          );

        };

      }
    );


    // =====================================================
    // MEDIA RECORDER
    // =====================================================

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


    // =====================================================
    // SEND AUDIO TO BACKEND
    // =====================================================

    recorder.ondataavailable = event => {

      if (
        event.data &&
        event.data.size > 0 &&
        socket &&
        socket.readyState === WebSocket.OPEN
      ) {

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

      }

    };


    // =====================================================
    // MEDIA RECORDER ERROR
    // =====================================================

    recorder.onerror = event => {

      console.error(
        "MediaRecorder error:",
        event
      );

    };


    // =====================================================
    // WEBSOCKET CLOSE
    // =====================================================

    socket.onclose = async event => {

      console.warn(
        "Live WebSocket closed:",
        event.code,
        event.reason
      );


      // ---------------------------------------------------
      // IMPORTANT:
      //
      // A WebSocket close does NOT automatically mean that
      // the user pressed Stop.
      //
      // We only mark Firestore ended when the disconnect
      // really represents the end of the live session.
      // ---------------------------------------------------

      if (stoppingManually) {

        console.log(
          "WebSocket closed because live was stopped manually."
        );

        return;

      }


      if (endingLive) {

        console.log(
          "WebSocket closed while live session was ending."
        );

        return;

      }


      // ---------------------------------------------------
      // Stop recorder
      // ---------------------------------------------------

      try {

        if (
          recorder &&
          recorder.state !== "inactive"
        ) {

          recorder.stop();

        }

      } catch (error) {

        console.warn(
          "Unable to stop recorder after socket close:",
          error
        );

      }


      // ---------------------------------------------------
      // IMPORTANT:
      //
      // The backend is responsible for detecting the
      // FFmpeg failure and marking the broadcast ended.
      //
      // We also update Firestore here as a safety fallback.
      // ---------------------------------------------------

      const endedBroadcastId =
        broadcastId;


      await endFirestoreBroadcast(
        endedBroadcastId
      );


      // ---------------------------------------------------
      // Stop microphone
      // ---------------------------------------------------

      if (stream) {

        try {

          stream
            .getTracks()
            .forEach(
              track => track.stop()
            );

        } catch (_) {}

        stream = null;

      }


      // ---------------------------------------------------
      // Reset UI
      // ---------------------------------------------------

      broadcastId = null;

      liveSession = null;

      recorder = null;

      socket = null;

      setLiveUI(false);

      document.getElementById(
        "micState"
      ).textContent =
        "Microphone not connected";


      toast(
        "Live connection ended.",
        "error"
      );

    };


    // =====================================================
    // START RECORDING
    // =====================================================

    recorder.start(
      1000
    );


    // =====================================================
    // UI
    // =====================================================

   // =====================================================
// UI
// =====================================================

setLiveUI(true);


// =====================================================
// START LIVE MONITORING
// =====================================================

startLiveTimer();

await startAudioMonitor();


console.log(
  "CAC Radio live session started:",
  result
);

    if (result.caster) {

      console.log(
        "Caster.fm Host:",
        result.caster.host
      );

      console.log(
        "Caster.fm Port:",
        result.caster.port
      );

      console.log(
        "Caster.fm Mount:",
        result.caster.mount
      );

      console.log(
        "Caster.fm Username:",
        result.caster.username
      );

    }


    toast(
      "Live broadcast started.",
      "success"
    );


  } catch (error) {

    console.error(
      "LIVE START ERROR:",
      error
    );


    // =====================================================
    // CLEAN RECORDER
    // =====================================================

    try {

      if (
        recorder &&
        recorder.state !== "inactive"
      ) {

        recorder.stop();

      }

    } catch (_) {}


    recorder = null;


    // =====================================================
    // CLOSE SOCKET
    // =====================================================

    stoppingManually = true;

    try {

      if (socket) {

        socket.close();

      }

    } catch (_) {}


    socket = null;


    // =====================================================
    // CLEAN BACKEND SESSION
    // =====================================================

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


    // =====================================================
    // CLEAN FIRESTORE
    // =====================================================

    if (broadcastId) {

      await endFirestoreBroadcast(
        broadcastId
      );

    }


    // =====================================================
    // STOP MICROPHONE
    // =====================================================

    if (stream) {

      try {

        stream
          .getTracks()
          .forEach(
            track => track.stop()
          );

      } catch (_) {}

      stream = null;

    }


    // =====================================================
    // RESET
    // =====================================================

    resetLiveState();


    toast(
      error?.message ||
      "Unable to start live.",
      "error"
    );

  } finally {

    startingLive = false;

  }

};


// =========================================================
// STOP LIVE
// =========================================================

document.getElementById(
  "stopLive"
).onclick = async () => {

  if (endingLive) {
    return;
  }

  endingLive = true;
  stoppingManually = true;


  // -------------------------------------------------------
  // Save ID before clearing state
  // -------------------------------------------------------

  const currentBroadcastId =
    broadcastId;


  try {

    // =====================================================
    // STOP MEDIA RECORDER
    // =====================================================

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {

      try {

        recorder.stop();

      } catch (error) {

        console.warn(
          "Recorder stop error:",
          error
        );

      }

    }


    // =====================================================
    // STOP BACKEND FIRST
    // =====================================================

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


    // =====================================================
    // MARK FIRESTORE ENDED
    // =====================================================

    if (currentBroadcastId) {

      await endFirestoreBroadcast(
        currentBroadcastId
      );

    }


    // =====================================================
    // CLOSE WEBSOCKET
    // =====================================================

    if (socket) {

      try {

        socket.close();

      } catch (_) {}

    }

    socket = null;


    // =====================================================
    // STOP MICROPHONE
    // =====================================================

    if (stream) {

      try {

        stream
          .getTracks()
          .forEach(
            track => track.stop()
          );

      } catch (_) {}

      stream = null;

    }


    // =====================================================
    // RESET STATE
    // =====================================================

    broadcastId = null;

    liveSession = null;

    recorder = null;


    setLiveUI(false);


    document.getElementById(
      "micState"
    ).textContent =
      "Microphone not connected";


    toast(
      "Broadcast stopped.",
      "success"
    );


  } catch (error) {

    console.error(
      "STOP LIVE ERROR:",
      error
    );


    // -----------------------------------------------------
    // Even if something fails, make sure the UI does not
    // remain stuck in LIVE.
    // -----------------------------------------------------

    setLiveUI(false);


    toast(
      "Broadcast stopped locally. Some cleanup may have failed.",
      "error"
    );


  } finally {

    endingLive = false;
    stoppingManually = false;

  }

};


// =========================================================
// CONNECT BRANCH TO HQ
// =========================================================

document.getElementById(
  "connectHQ"
)?.addEventListener(
  "click",
  async () => {

    const target =
      document.getElementById(
        "hqBranchSelect"
      ).value;


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

document.getElementById(
  "disconnectHQ"
)?.addEventListener(
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
