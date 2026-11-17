#!/usr/bin/env bash
# Exécute une commande (capture Playwright) en exclusivité : un seul navigateur headless à la fois
# pour ne pas saturer la mémoire quand plusieurs agents travaillent en parallèle.
exec flock /tmp/capy-chromium.lock "$@"
