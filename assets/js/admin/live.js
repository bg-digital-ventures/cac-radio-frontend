import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { add, update, getAll } from "../services/firestore.js";
import { liveApi } from "../services/api.js";
import { toast } from "../components/toast.js";

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
    // Request microphone permission
    // -----------------------------------------------------

    if (!stream) {

      stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      document.getElementById(
        "micState"
      ).textContent =
        "Microphone ready";
    }


    // -----------------------------------------------------
    // Get broadcast information
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
    // Ask backend to prepare live session
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
    // Create Firestore broadcast
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


    // -----------------------------------------------------
    // Tell backend which Firestore broadcast
    // belongs to this session.
    //
    // The backend session already exists.
    // -----------------------------------------------------

    liveSession.broadcastId =
      broadcastId;


    // -----------------------------------------------------
    // Update interface
    // -----------------------------------------------------

    document.getElementById(
      "liveState"
    ).textContent = "LIVE";

    document.getElementById(
      "liveState"
    ).classList.add("live");

    document.getElementById(
      "startLive"
    ).disabled = true;

    document.getElementById(
      "stopLive"
    ).disabled = false;


    // -----------------------------------------------------
    // Show Caster.fm connection information
    // -----------------------------------------------------

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
      "Live session started.",
      "success"
    );


    // -----------------------------------------------------
    // IMPORTANT
    //
    // The browser microphone is NOT sent to Render anymore.
    //
    // Caster.fm broadcasting must be handled by the
    // broadcaster/source application.
    // -----------------------------------------------------

  } catch (error) {

    console.error(
      "Start live error:",
      error
    );

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
    // Stop microphone
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
    // Tell backend to stop session
    // -----------------------------------------------------

    await liveApi.stop({
      branchId,
      broadcastId
    });


    // -----------------------------------------------------
    // Mark Firestore broadcast ended
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
    // Reset state
    // -----------------------------------------------------

    broadcastId = null;
    liveSession = null;


    document.getElementById(
      "liveState"
    ).textContent = "OFFLINE";

    document.getElementById(
      "liveState"
    ).classList.remove("live");

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
      "Stop live error:",
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
