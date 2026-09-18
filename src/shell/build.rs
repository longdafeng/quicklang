use std::{env, path::PathBuf, process::Command};

/// Build the macOS accessibility bridge into the app so permission belongs to QuickLang.
fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=native/voice_download.m");
        let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
        let object = out.join("voice_download.o");
        assert!(
            Command::new("clang")
                .args(["-fobjc-arc", "-c", "native/voice_download.m", "-o"])
                .arg(&object)
                .status()
                .unwrap()
                .success(),
            "Compile voice download bridge"
        );
        assert!(
            Command::new("ar")
                .arg("crs")
                .arg(out.join("libvoice_download.a"))
                .arg(&object)
                .status()
                .unwrap()
                .success(),
            "Archive voice download bridge"
        );
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=voice_download");
        for framework in ["AppKit", "ApplicationServices"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
    tauri_build::build()
}
