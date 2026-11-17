"use strict";
let player = null;
let replayObjectUrl = null;
let stopToken = "";
let loading = false;
const status = document.getElementById("status");
const select = document.getElementById("replays");
const openButton = document.getElementById("open");

function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle("error", error);
}

function playbackError(error) {
    loading = false;
    openButton.disabled = !select.options.length;
    message("Could not load playback: " + (error?.message || error), true);
}

async function refresh() {
    const previous = select.value;
    const response = await fetch("/api/replays");
    if (!response.ok) throw new Error("Could not read recorded games.");
    const { replays } = await response.json();
    select.replaceChildren(...replays.map(replay => {
        const option = document.createElement("option");
        option.value = replay.id;
        option.textContent = replay.name;
        return option;
    }));
    if (replays.some(replay => replay.id === previous)) select.value = previous;
    openButton.disabled = !replays.length;
    message(replays.length ? `${replays.length} recorded games · newest first` : "No HDT recordings found. You can open an HSReplay XML file instead.");
}

function showReplay(xml, name, friendly) {
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.tagName !== "HSReplay") {
        throw new Error("Choose an HSReplay XML file. HDT recordings can be opened from the game list.");
    }
    if (player) {
        player.pause();
        Joust.destroy(document.getElementById("joust-container"));
    }
    if (replayObjectUrl) URL.revokeObjectURL(replayObjectUrl);
    replayObjectUrl = URL.createObjectURL(new Blob([xml], {type: "application/xml"}));
    document.getElementById("empty").style.display = "none";
    document.getElementById("current-game").textContent = name;
    message("Loading the replay and card data…");
    player = Joust.launcher("joust-container")
        .setOptions({ width: "100%", height: "100%" })
        .assets("/joust/assets/")
        .startPaused()
        .startRevealed(false)
        .startSwapped(friendly === 2)
        .onReady(() => {
            loading = false;
            openButton.disabled = !select.options.length;
            message("Ready · use Play, the timeline, or the turn arrows to review the game.");
        })
        .logger(playbackError)
        .fromUrl(replayObjectUrl);
}

document.getElementById("open-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!select.value || loading) return;
    loading = true;
    openButton.disabled = true;
    message("Preparing the recorded game…");
    try {
        const response = await fetch("/api/replay/" + encodeURIComponent(select.value));
        if (!response.ok) {
            const detail = await response.json();
            throw new Error(detail.error || "Unable to prepare this replay.");
        }
        showReplay(await response.text(), select.selectedOptions[0].textContent,
            Number(response.headers.get("X-Friendly-Player")));
    } catch (error) {
        loading = false;
        openButton.disabled = false;
        message(error.message, true);
    }
});
document.getElementById("refresh").addEventListener("click", () => refresh().catch(error => message(error.message, true)));
document.getElementById("xml-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try { showReplay(await file.text(), file.name, 1); }
    catch (error) { message(error.message, true); }
    event.target.value = "";
});
document.getElementById("stop").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/stop", {method: "POST", headers: {"X-Viewer-Token": stopToken}});
        if (!response.ok) throw new Error("Could not stop the viewer.");
        if (player) player.pause();
        document.querySelectorAll("button, select, input").forEach(control => control.disabled = true);
        message("Viewer stopped. You can close this tab. Use the desktop shortcut to start it again.");
    } catch (error) { message(error.message, true); }
});
window.addEventListener("unhandledrejection", event => {
    playbackError(event.reason);
});
(async () => {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("The local viewer is not running.");
    const health = await response.json();
    stopToken = health.stop_token;
    document.getElementById("version").textContent = "Patched Joust · " + health.version;
    await refresh();
})().catch(error => message(error.message, true));
