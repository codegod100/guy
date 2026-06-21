{ pkgs, ... }:

let
  vercel-cli = pkgs.writeShellApplication {
    name = "vercel";
    runtimeInputs = [ pkgs.nodejs ];
    text = ''
      exec npx vercel "$@"
    '';
  };
in
{
  # Packages available in the dev shell
  packages = [
    pkgs.steam-run # needed by microsandbox's glibc-linked msb binary on NixOS
    vercel-cli     # required by `eve dev`'s /vc integration
  ];

  # The microsandbox msb binary is glibc-linked and needs steam-run on NixOS.
  # Our wrapper at .local/bin/msb handles this transparently.
  env.MSB_PATH = toString ./.local/bin/msb;

  # Bun is used as the package manager
  languages.javascript.enable = true;

  scripts.deploy = {
    exec = "vercel deploy --prod --yes";
    description = "Deploy to Vercel production";
  };

  scripts.dev = {
    exec = ''
      pidfile=.eve/dev-process.pid
      metafile=.eve/dev-server.json

      if [ -f "$pidfile" ]; then
        pid=$(tr -d '[:space:]' < "$pidfile")
        proc_dir="/proc/$pid"
        proc_cwd=$(readlink "$proc_dir/cwd" 2>/dev/null || true)
        proc_cmdline=$(tr '\000' ' ' < "$proc_dir/cmdline" 2>/dev/null || true)

        if [ ! -d "$proc_dir" ] || [ -z "$proc_cmdline" ] || [ "$proc_cwd" != "$PWD" ]; then
          rm -f "$pidfile" "$metafile"
        fi
      fi

      npm run dev
    '';
    description = "Run the local dev server";
  };

  scripts.dev-webpack = {
    exec = ''
      pidfile=.eve/dev-process.pid
      metafile=.eve/dev-server.json

      if [ -f "$pidfile" ]; then
        pid=$(tr -d '[:space:]' < "$pidfile")
        proc_dir="/proc/$pid"
        proc_cwd=$(readlink "$proc_dir/cwd" 2>/dev/null || true)
        proc_cmdline=$(tr '\000' ' ' < "$proc_dir/cmdline" 2>/dev/null || true)

        if [ ! -d "$proc_dir" ] || [ -z "$proc_cmdline" ] || [ "$proc_cwd" != "$PWD" ]; then
          rm -f "$pidfile" "$metafile"
        fi
      fi

      npm run dev:webpack
    '';
    description = "Run local dev server with webpack";
  };

  tasks."guy:clean-runtime" = {
    exec = ''
      set -euo pipefail
      echo "🧹 Cleaning eve runtime artifacts…"

      # ── Prune .workflow-data (local workflow engine state, 40k+ files) ──
      if [ -d .workflow-data ]; then
        rm -rf .workflow-data
        echo "   ✓ removed .workflow-data"
      fi

      # ── Prune stale dev-runtime snapshots ──
      SNAPSHOT_DIR=".eve/dev-runtime/snapshots"
      CURRENT_FILE=".eve/dev-runtime/current.json"

      if [ -d "$SNAPSHOT_DIR" ]; then
        ACTIVE=""
        if [ -f "$CURRENT_FILE" ]; then
          # Extract the active snapshot directory from current.json
          ACTIVE=$(grep -o '"snapshotRoot"[[:space:]]*:[[:space:]]*"[^"]*"' "$CURRENT_FILE" \
            | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
        fi

        KEPT=0
        REMOVED=0
        for dir in "$SNAPSHOT_DIR"/*/; do
          [ -d "$dir" ] || continue
          dir="''${dir%/}"
          if [ -n "$ACTIVE" ] && [ "$(realpath "$dir" 2>/dev/null || echo "$dir")" = "$(realpath "$ACTIVE" 2>/dev/null || echo "$ACTIVE")" ]; then
            KEPT=$((KEPT + 1))
            continue
          fi
          rm -rf "$dir"
          REMOVED=$((REMOVED + 1))
        done

        if [ "$REMOVED" -gt 0 ]; then
          echo "   ✓ removed $REMOVED stale snapshot(s)"
        fi
        if [ "$KEPT" -gt 0 ]; then
          echo "   ✓ kept $KEPT active snapshot(s)"
        fi
      fi

      # ── Prune sandbox cache older than 7 days ──
      if [ -d .eve/sandbox-cache ]; then
        find .eve/sandbox-cache -type f -mtime +7 -delete 2>/dev/null || true
        find .eve/sandbox-cache -type d -empty -delete 2>/dev/null || true
      fi

      echo "   done."
    '';
    after = [ "devenv:enterShell" ];
  };

  enterShell = ''
    echo "guy dev environment (devenv)"
  '';
}
