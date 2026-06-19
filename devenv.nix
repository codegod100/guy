{ pkgs, ... }:

{
  # Packages available in the dev shell
  packages = [
    pkgs.steam-run     # needed by microsandbox's glibc-linked msb binary on NixOS
  ];

  # The microsandbox msb binary is glibc-linked and needs steam-run on NixOS.
  # Our wrapper at .local/bin/msb handles this transparently.
  env.MSB_PATH = toString ./.local/bin/msb;

  # Bun is used as the package manager
  languages.javascript.enable = true;

  enterShell = ''
    echo "guy dev environment (devenv)"
  '';
}
