# shellcheck shell=bash
# Build and run environment of the desktop shell on this host (P11). Source it:
#   . huelle/scripts/umgebung.sh
# Rust lives in huelle/.werkzeug (rustup with RUSTUP_HOME/CARGO_HOME there). WebKitGTK, GTK 3
# and the test tools (Thunar, xdotool, SoftHSM, ImageMagick) are not installed on the host and
# there is no root access, so their Debian 13 packages are unpacked into huelle/.werkzeug/sysroot
# (huelle/scripts/sysroot.sh). On a normal Linux desktop none of this is needed: the .deb package
# declares libwebkit2gtk-4.1-0 and libgtk-3-0 as dependencies.
HUELLE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="$HUELLE/.werkzeug"
S="$W/sysroot"
L="$S/usr/lib/x86_64-linux-gnu"
export HUELLE W S
export RUSTUP_HOME="$W/rustup" CARGO_HOME="$W/cargo"
export PATH="$CARGO_HOME/bin:$PATH:$S/usr/bin"
export PKG_CONFIG_PATH="$L/pkgconfig:$S/usr/share/pkgconfig"
# Transitive libraries of WebKitGTK are found at link time through rpath-link.
export RUSTFLAGS="-C link-arg=-Wl,-rpath-link,$L"
# Runtime (only for running on this host, not part of the package).
hpro_laufzeit() {
  export LD_LIBRARY_PATH="$L${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export GSETTINGS_SCHEMA_DIR="$S/usr/share/glib-2.0/schemas"
  export XDG_DATA_DIRS="$S/usr/share:/usr/share"
  hpro_laufzeit_extra
  export GTK_PATH="$L/gtk-3.0"
  export MAGICK_CONFIGURE_PATH="$S/etc/ImageMagick-7"
  # /usr/bin/bwrap (WebKit's process sandbox) is compiled into WebKitGTK and missing on this
  # host; a regular installation pulls it in as a dependency of libwebkit2gtk-4.1-0.
  export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
}
hpro_laufzeit_extra() {
  # EGL vendor files of Mesa (software rendering under Xvfb), ImageMagick coders, no gvfs.
  export __EGL_VENDOR_LIBRARY_DIRS="$S/usr/share/glvnd/egl_vendor.d"
  export GIO_USE_VFS=local
  local c; c=$(find "$L" -type d -path '*modules-Q16/coders' | head -1)
  export MAGICK_CODER_MODULE_PATH="$c" MAGICK_CODER_FILTER_PATH="$(dirname "$c")/filters"
}
