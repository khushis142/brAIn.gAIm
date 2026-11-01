{
  description = "brAIn.gAIn backend dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        python = pkgs.python313;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            python
            pkgs.uv
            pkgs.ruff
            pkgs.postgresql # psql client + local server for tests
          ];

          env = {
            UV_PYTHON = "${python}/bin/python";
            UV_PYTHON_DOWNLOADS = "never";
            # PyPI manylinux wheels (e.g. greenlet) link against libstdc++.
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ];
          };

          shellHook = ''
            uv sync --quiet
            source .venv/bin/activate
            export PATH="${pkgs.ruff}/bin:$PATH"
          '';
        };
      }
    );
}
