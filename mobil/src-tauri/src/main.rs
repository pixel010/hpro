// Only for `cargo check` on the build host; the apps start through the mobile entry point in lib.rs.
fn main() {
    hpro_mobil_lib::run();
}
