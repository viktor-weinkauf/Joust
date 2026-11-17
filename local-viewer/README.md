# Local Replay Viewer

On the ArenaHelpers workstation, double-click **Local Replay Viewer** on the
Desktop, choose a recorded game, and click **Open replay**. The latest recording
is selected automatically. The page uses this fork's current `dist/` build.

The launcher starts a small hidden server at `http://127.0.0.1:8879`, then opens
the page in your default browser. Opening the shortcut again reuses the server.
**Stop viewer** shuts down the server; closing the browser tab alone does not.
After an update, stop the viewer and reopen the shortcut to load new server code.

You can also start it from PowerShell:

```powershell
& 'D:\Hearthstone\ArenaHelpers\Forks\Joust\local-viewer\Start-LocalViewer.ps1'
```

`-NoBrowser` starts/reuses the server without opening a tab.

## Replay inputs

The game list reads `%APPDATA%/HearthstoneDeckTracker/Replays/*.hdtreplay` and
converts the selected file's `output_log.txt` in memory using HearthSim's
[hslog](https://github.com/HearthSim/python-hslog) and
[hsreplay](https://github.com/HearthSim/python-hsreplay) libraries. Original replay
files are never changed or uploaded. Conversion retains the recorded packet
order, including hidden transformations and Rewind events. Player perspective
is inferred from which player's hand was revealed in the recording.

The **Open XML file** button also accepts existing HSReplay XML files directly
in the browser. It does not accept an HSReplay webpage URL. Local HDT recordings
are opened from the game list rather than this file button.

Card metadata and artwork still require internet access to HearthstoneJSON.
HDT recordings do not include the original game build number, so local
conversions use current card metadata. Very old recordings may therefore show
current card text. An imported XML replay uses its recorded build when present.

This is the patched local viewer. It does not replace the player on HSReplay.net
or change HDT's existing website links.

## Setup on this workstation layout

Requires Python 3.10+ and a completed Joust production build. From ArenaHelpers:

```powershell
python -m venv Runtime/LocalReplayViewer
./Runtime/LocalReplayViewer/Scripts/python.exe -m pip install -r Forks/Joust/local-viewer/requirements.txt
./Forks/Joust/local-viewer/Start-LocalViewer.ps1
```

The compatibility pin for setuptools is needed by the upstream hsreplay library.
Logs are at `ArenaHelpers/Cache/LocalReplayViewer/server.log`. The listener binds
only to 127.0.0.1, checks request origins, and serves only viewer assets and the
configured replay directory. No account sign-in or credentials are required.
