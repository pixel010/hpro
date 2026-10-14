#!/bin/sh
# P13: launcher for Playwright's WebKit on the test host. Does what webkit-*/pw_run.sh and the
# bundled MiniBrowser wrapper do, but keeps the libraries of scripts/p13-sysroot.sh on
# LD_LIBRARY_PATH (the bundled wrapper overwrites it). Used via P13_WEBKIT_EXECUTABLE.
set -e
for d in "$PLAYWRIGHT_BROWSERS_PATH"/webkit-*; do WK="$d"; done
case " $* " in *" --headless "*) D="$WK/minibrowser-wpe" ;; *) D="$WK/minibrowser-gtk" ;; esac
export WEBKIT_EXEC_PATH="$D/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$D/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$D/share"
export LD_LIBRARY_PATH="$D/lib:$D/sys/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export WEBKIT_FORCE_COMPLEX_TEXT=1
exec "$D/bin/MiniBrowser" "$@"
