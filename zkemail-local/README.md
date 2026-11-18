# zkEmail local investigation

This directory is reserved for isolated circuit experiments. Do not place a real VNU `.eml`, witness, proof, private key or generated proving key in source control. `.gitignore` excludes `.eml`, `.wtns`, `.zkey` and the local artifacts/proofs folders.

## Environment check (18 November 2026)

- Host reports Apple Silicon project context, but `rustc`, `cargo` and `circom` are not on PATH. Version checks therefore cannot run.
- Node is `v24.18.0`; npm is `11.16.0`.
- No circuit compilation or proof attempt was made. We do not install global toolchains without the owner choosing a setup method.
- The official Rust installation page recommends rustup on macOS and lists `~/.cargo/bin` as the tool directory. Circom's installation page returned HTTP 502 through the available web reader. The zkEmail docs homepage returned no readable content in that reader.

## Next isolated step

After Rust and Circom 2 are installed through an owner-approved local toolchain, capture `rustc --version`, `cargo --version`, `circom --version`, then compile and test the smallest official Circom example. Only after that passes should we check current `@zk-email` circuit/input-helper packages and build a synthetic DKIM fixture. No proof or verifier is available today.

The target input is the original DKIM-signed `.eml` from an eligible VNU mailbox. Any eventual circuit must validate DKIM and the signed From header, constrain the eligible sender policy and required claims, bind event plus wallet and enforce a circuit-constrained nullifier. Email contents and identity must not become public signals. Domain-only matching is not student verification.
