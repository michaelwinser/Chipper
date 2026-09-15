# Base tools for working on Chipper. Everything else is pinned inside the repo.
#
#   brew bundle          # install these
#   make bootstrap       # this, then the pinned Node, then dependencies
#
# mise reads mise.toml and installs the exact Node version the project is pinned to,
# so nothing here pins a language runtime — the repo does that.
brew "mise"

# Optional. Only needed for the container path (make docker-dev / docker-test),
# which exists so a cold machine can build and test with no version manager at all.
# cask "docker"
