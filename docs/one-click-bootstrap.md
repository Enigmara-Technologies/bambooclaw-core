# One-Click Bootstrap

This page defines the fastest supported path to install and initialize BambooClaw Core.

Last verified: **February 18, 2026**.

## Option 0: Homebrew (macOS/Linuxbrew)

```bash
brew install BambooClaw Core
```

## Option A (Recommended): Clone + local script

```bash
git clone https://github.com/BambooClaw Core-labs/BambooClaw Core.git
cd BambooClaw Core
./bootstrap.sh
```

What it does by default:

1. `cargo build --release --locked`
2. `cargo install --path . --force --locked`

## Dual-mode bootstrap

Default behavior is **app-only** (build/install BambooClaw Core) and expects existing Rust toolchain.

For fresh machines, enable environment bootstrap explicitly:

```bash
./bootstrap.sh --install-system-deps --install-rust
```

Notes:

- `--install-system-deps` installs compiler/build prerequisites (may require `sudo`).
- `--install-rust` installs Rust via `rustup` when missing.

## Option B: Remote one-liner

```bash
curl -fsSL https://raw.githubusercontent.com/BambooClaw Core-labs/BambooClaw Core/main/scripts/bootstrap.sh | bash
```

For high-security environments, prefer Option A so you can review the script before execution.

Legacy compatibility:

```bash
curl -fsSL https://raw.githubusercontent.com/BambooClaw Core-labs/BambooClaw Core/main/scripts/install.sh | bash
```

This legacy endpoint prefers forwarding to `scripts/bootstrap.sh` and falls back to legacy source install if unavailable in that revision.

If you run Option B outside a repository checkout, the bootstrap script automatically clones a temporary workspace, builds, installs, and then cleans it up.

## Optional onboarding modes

### Quick onboarding (non-interactive)

```bash
./bootstrap.sh --onboard --api-key "sk-..." --provider openrouter
```

Or with environment variables:

```bash
BambooClaw Core_API_KEY="sk-..." BambooClaw Core_PROVIDER="openrouter" ./bootstrap.sh --onboard
```

### Interactive onboarding

```bash
./bootstrap.sh --interactive-onboard
```

## Useful flags

- `--install-system-deps`
- `--install-rust`
- `--skip-build`
- `--skip-install`
- `--provider <id>`

See all options:

```bash
./bootstrap.sh --help
```

## Related docs

- [README.md](../README.md)
- [commands-reference.md](commands-reference.md)
- [providers-reference.md](providers-reference.md)
- [channels-reference.md](channels-reference.md)
