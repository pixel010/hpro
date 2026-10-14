# P13: environment for running Playwright's Firefox and WebKit on the test host (source it).
# Uses the libraries unpacked by scripts/p13-sysroot.sh; harmless where the sysroot is missing.
_p13_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_p13_s="$_p13_root/app/.engine-sysroot/root"
export PLAYWRIGHT_BROWSERS_PATH="$_p13_root/app/.browsers"
if [ -d "$_p13_s/usr/lib/x86_64-linux-gnu" ]; then
  export LD_LIBRARY_PATH="$_p13_s/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export GSETTINGS_SCHEMA_DIR="$_p13_s/usr/share/glib-2.0/schemas"
  export GST_PLUGIN_SYSTEM_PATH_1_0="$_p13_s/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
  export GST_PLUGIN_SCANNER_1_0="$_p13_s/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
  export GST_REGISTRY_1_0="$_p13_root/app/.engine-sysroot/gst-registry.bin"
  # The host check only looks at system paths; the libraries are found via LD_LIBRARY_PATH.
  export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
  export P13_WEBKIT_EXECUTABLE="$_p13_root/scripts/p13-webkit-run.sh"
  # WPE's web process aborts with "Could not create EGL display" without Mesa's EGL vendor file.
  export __EGL_VENDOR_LIBRARY_DIRS="$_p13_s/usr/share/glvnd/egl_vendor.d"
fi
unset _p13_root _p13_s
