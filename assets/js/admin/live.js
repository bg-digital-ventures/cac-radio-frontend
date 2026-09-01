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
    // BROADCAST DETAILS
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
    // PREPARE BACKEND SESSION
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // CREATE FIRESTORE BROADCAST BEFORE WEBSOCKET
    // -----------------------------------------------------
    //
    // IMPORTANT:
    // We create the Firestore document FIRST.
    //
    // Then we pass broadcastId to the backend through
    // the WebSocket URL.
    //
    // This means the backend always knows which
    // Firestore broadcast belongs to this live session.
    //

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


    // -----------------------------------------------------
    // WEBSOCKET URL
    // -----------------------------------------------------

    const wsBase =
      API_BASE.replace(/^http/, "ws");


    const wsUrl =
      `${wsBase}/ws/live/` +
      `${encodeURIComponent(branchId)}` +
      `?token=${encodeURIComponent(result.sessionToken)}` +
      `&broadcastId=${encodeURIComponent(broadcastId)}`;


    console.log(
      "Connecting live WebSocket..."
    );


    // -----------------------------------------------------
    // CONNECT WEBSOCKET
    // -----------------------------------------------------

    socket =
      new WebSocket(wsUrl);


    await new Promise(
      (resolve, reject) => {

        const timeout =
          setTimeout(() => {

            reject(
              new Error(
                "WebSocket connection timed out."
              )
            );

          }, 15000);


        socket.onopen = () => {

          clearTimeout(timeout);

          console.log(
            "Live WebSocket connected."
          );

          resolve();

        };


        socket.onerror = () => {

          clearTimeout(timeout);

          reject(
            new Error(
              "WebSocket connection failed."
            )
          );

        };


        socket.onclose = event => {

          console.warn(
            "Live WebSocket closed:",
            event.code,
            event.reason
          );

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


    recorder =
      new MediaRecorder(
        stream,
        {
          mimeType: mime
        }
      );


    recorder.ondataavailable = event => {

      if (
        event.data.size &&
        socket &&
        socket.readyState === WebSocket.OPEN
      ) {

        socket.send(
          event.data
        );

      }

    };


    recorder.onerror = event => {

      console.error(
        "MediaRecorder error:",
        event
      );

    };


    // -----------------------------------------------------
    // HANDLE WEBSOCKET CLOSE
    // -----------------------------------------------------

    socket.onclose = async event => {

      console.warn(
        "Live connection closed.",
        event.code,
        event.reason
      );


      // If recorder is still running,
      // stop it.

      try {

        if (
          recorder &&
          recorder.state !== "inactive"
        ) {

          recorder.stop();

        }

      } catch (_) {}


      // Only update Firestore if this was
      // an unexpected disconnect.

      if (broadcastId) {

        try {

          await update(
            COLLECTIONS.BROADCASTS,
            broadcastId,
            {
              status: "ended",
              updatedAt: new Date()
            }
          );

          console.log(
            "Broadcast marked ended after WebSocket close."
          );

        } catch (error) {

          console.error(
            "Unable to update broadcast after disconnect:",
            error
          );

        }

      }


      // Reset UI

      document.getElementById(
        "liveState"
      ).textContent = "OFFLINE";

      document
        .getElementById("liveState")
        .classList.remove("live");

      document.getElementById(
        "startLive"
      ).disabled = false;

      document.getElementById(
        "stopLive"
      ).disabled = true;

    };


    // -----------------------------------------------------
    // START RECORDING
    // -----------------------------------------------------

    recorder.start(
      1000
    );


    // -----------------------------------------------------
    // UI
    // -----------------------------------------------------

    document.getElementById(
      "liveState"
    ).textContent = "LIVE";

    document
      .getElementById("liveState")
      .classList.add("live");

    document.getElementById(
      "startLive"
    ).disabled = true;

    document.getElementById(
      "stopLive"
    ).disabled = false;


    console.log(
      "CAC Radio live session:",
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


    // -----------------------------------------------------
    // STOP RECORDER
    // -----------------------------------------------------

    try {

      if (
        recorder &&
        recorder.state !== "inactive"
      ) {

        recorder.stop();

      }

    } catch (_) {}


    // -----------------------------------------------------
    // CLOSE SOCKET
    // -----------------------------------------------------

    try {

      if (socket) {

        socket.close();

      }

    } catch (_) {}


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
        "Backend cleanup failed:",
        cleanupError
      );

    }


    // -----------------------------------------------------
    // CLEAN FIRESTORE BROADCAST
    // -----------------------------------------------------

    if (broadcastId) {

      try {

        await update(
          COLLECTIONS.BROADCASTS,
          broadcastId,
          {
            status: "ended",
            updatedAt: new Date()
          }
        );

      } catch (firestoreError) {

        console.error(
          "Firestore cleanup failed:",
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

      recorder.stop();

    }


    // -----------------------------------------------------
    // CLOSE WEBSOCKET
    // -----------------------------------------------------

    if (socket) {

      try {

        socket.close();

      } catch (_) {}

      socket = null;
    }


    // -----------------------------------------------------
    // STOP BACKEND SESSION
    // -----------------------------------------------------

    await liveApi.stop({
      branchId,
      broadcastId
    });


    // -----------------------------------------------------
    // UPDATE FIRESTORE
    // -----------------------------------------------------

    if (broadcastId) {

      await update(
        COLLECTIONS.BROADCASTS,
        broadcastId,
        {
          status: "ended",
          updatedAt: new Date()
        }
      );

    }


    // -----------------------------------------------------
    // STOP MICROPHONE
    // -----------------------------------------------------

    if (stream) {

      stream
        .getTracks()
        .forEach(
          track => track.stop()
        );

      stream = null;

    }


    // -----------------------------------------------------
    // RESET STATE
    // -----------------------------------------------------

    broadcastId = null;

    liveSession = null;

    recorder = null;


    document.getElementById(
      "liveState"
    ).textContent = "OFFLINE";

    document
      .getElementById("liveState")
      .classList.remove("live");

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
