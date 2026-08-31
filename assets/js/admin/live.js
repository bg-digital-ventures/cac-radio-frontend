import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { add, update, getAll } from "../services/firestore.js";
import { liveApi, API_BASE } from "../services/api.js";
import { toast } from "../components/toast.js";


// =========================================================
// AUTHENTICATION
// =========================================================

const profile = await bootAdmin();

if (!profile) {
  throw new Error("Not authenticated");
}


// =========================================================
// BRANCH INFORMATION
// =========================================================

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
// LIVE STATE
// =========================================================

let stream = null;
let recorder = null;
let socket = null;
let broadcastId = null;
let liveSession = null;


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
// LOAD HQ BRANCHES
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

      document.getElementById(
        "micState"
      ).textContent = "Microphone ready";

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

  try {

    // -----------------------------------------------------
    // MICROPHONE
    // -----------------------------------------------------

    if (!stream) {

      stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });


      document.getElementById(
        "micState"
      ).textContent = "Microphone ready";
    }


    // -----------------------------------------------------
    // BROADCAST INFORMATION
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // PREPARE BACKEND LIVE SESSION
    // -----------------------------------------------------

    console.log(
      "Preparing live session..."
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


    // -----------------------------------------------------
    // CREATE FIRESTORE BROADCAST
    //
    // We do this BEFORE WebSocket connection so the
    // broadcast ID can be sent to the backend.
    // -----------------------------------------------------

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
      "Firestore broadcast created:",
      broadcastId
    );


    // -----------------------------------------------------
    // WEBSOCKET URL
    // -----------------------------------------------------

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


    console.log(
      "WebSocket URL:",
      wsUrl.replace(
        /token=[^&]+/,
        "token=HIDDEN"
      )
    );


    // -----------------------------------------------------
    // CONNECT WEBSOCKET
    // -----------------------------------------------------

    socket =
      new WebSocket(wsUrl);


    await new Promise(
      (resolve, reject) => {

        let settled = false;


        const timeout =
          setTimeout(() => {

            if (settled) return;

            settled = true;

            reject(
              new Error(
                "WebSocket connection timed out."
              )
            );

          }, 15000);


        socket.onopen = () => {

          if (settled) return;

          settled = true;

          clearTimeout(timeout);

          console.log(
            "Live WebSocket connected."
          );

          resolve();
        };


        socket.onerror = () => {

          if (settled) return;

          settled = true;

          clearTimeout(timeout);

          reject(
            new Error(
              "Live WebSocket connection failed."
            )
          );
        };


        socket.onclose = event => {

          console.warn(
            "Live WebSocket closed:",
            event.code,
            event.reason
          );


          if (!settled) {

            settled = true;

            clearTimeout(timeout);

            reject(
              new Error(
                `WebSocket rejected by backend (${event.code}).`
              )
            );
          }
        };
      }
    );


    // -----------------------------------------------------
    // MEDIA RECORDER
    // -----------------------------------------------------

    const mime =
      MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
        ? "audio/webm;codecs=opus"
        : "audio/webm";


    console.log(
      "Using recorder format:",
      mime
    );


    recorder =
      new MediaRecorder(
        stream,
        {
          mimeType: mime
        }
      );


    recorder.ondataavailable =
      event => {

        if (
          !event.data ||
          !event.data.size
        ) {
          return;
        }


        if (
          socket &&
          socket.readyState ===
            WebSocket.OPEN
        ) {

          socket.send(
            event.data
          );

        } else {

          console.warn(
            "Audio chunk not sent because WebSocket is not open."
          );
        }
      };


    recorder.onerror =
      event => {

        console.error(
          "MediaRecorder error:",
          event
        );
      };


    // -----------------------------------------------------
    // WEBSOCKET CLOSED
    // -----------------------------------------------------

    socket.onclose =
      event => {

        console.warn(
          "Live WebSocket closed:",
          event.code,
          event.reason
        );


        if (
          recorder &&
          recorder.state !== "inactive"
        ) {

          try {
            recorder.stop();
          } catch (_) {}

        }
      };


    // -----------------------------------------------------
    // START RECORDING
    // -----------------------------------------------------

    recorder.start(
      1000
    );


    console.log(
      "Microphone recording started."
    );


    // -----------------------------------------------------
    // UPDATE UI
    // -----------------------------------------------------

    document.getElementById(
      "liveState"
    ).textContent = "LIVE";


    document
      .getElementById(
        "liveState"
      )
      .classList.add(
        "live"
      );


    document.getElementById(
      "startLive"
    ).disabled = true;


    document.getElementById(
      "stopLive"
    ).disabled = false;


    toast(
      "Live broadcast started.",
      "success"
    );


  } catch (error) {

    console.error(
      "LIVE START ERROR:",
      error
    );


    // -----------------------------------------------------
    // STOP RECORDER IF START FAILED
    // -----------------------------------------------------

    try {

      if (
        recorder &&
        recorder.state !== "inactive"
      ) {

        recorder.stop();

      }

    } catch (_) {}


    recorder = null;


    // -----------------------------------------------------
    // CLOSE SOCKET
    // -----------------------------------------------------

    try {

      if (socket) {
        socket.close();
      }

    } catch (_) {}


    socket = null;


    // -----------------------------------------------------
    // CLEAN BACKEND SESSION
    // -----------------------------------------------------

    try {

      await liveApi.stop({
        branchId,
        broadcastId
      });

    } catch (cleanupError) {

      console.error(
        "Backend cleanup error:",
        cleanupError
      );
    }


    // -----------------------------------------------------
    // MARK FIRESTORE BROADCAST ENDED
    // -----------------------------------------------------

    if (broadcastId) {

      try {

        await update(
          COLLECTIONS.BROADCASTS,
          broadcastId,
          {

            status: "ended",

            updatedAt:
              new Date()

          }
        );

      } catch (firestoreError) {

        console.error(
          "Firestore cleanup error:",
          firestoreError
        );
      }
    }


    broadcastId = null;

    liveSession = null;


    toast(
      error?.message ||
      "Unable to start live.",
      "error"
    );
  }
};


// =========================================================
// STOP LIVE
// =========================================================

document.getElementById(
  "stopLive"
).onclick = async () => {

  try {

    // -----------------------------------------------------
    // STOP RECORDER
    // -----------------------------------------------------

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {

      try {
        recorder.stop();
      } catch (_) {}

    }


    recorder = null;


    // -----------------------------------------------------
    // CLOSE WEBSOCKET
    // -----------------------------------------------------

    if (socket) {

      try {
        socket.close();
      } catch (_) {}

    }


    socket = null;


    // -----------------------------------------------------
    // STOP BACKEND SESSION
    // -----------------------------------------------------

    await liveApi.stop({

      branchId,

      broadcastId

    });


    // -----------------------------------------------------
    // STOP MICROPHONE
    // -----------------------------------------------------

    if (stream) {

      stream
        .getTracks()
        .forEach(
          track =>
            track.stop()
        );

      stream = null;
    }


    // -----------------------------------------------------
    // MARK FIRESTORE BROADCAST ENDED
    // -----------------------------------------------------

    if (broadcastId) {

      await update(

        COLLECTIONS.BROADCASTS,

        broadcastId,

        {

          status: "ended",

          updatedAt:
            new Date()

        }

      );
    }


    // -----------------------------------------------------
    // RESET STATE
    // -----------------------------------------------------

    broadcastId = null;

    liveSession = null;


    document.getElementById(
      "liveState"
    ).textContent = "OFFLINE";


    document
      .getElementById(
        "liveState"
      )
      .classList.remove(
        "live"
      );


    document.getElementById(
      "startLive"
    ).disabled = false;


    document.getElementById(
      "stopLive"
    ).disabled = true;


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


    toast(
      error?.message ||
      "Unable to stop cleanly.",
      "error"
    );
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
