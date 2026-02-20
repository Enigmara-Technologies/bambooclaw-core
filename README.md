<p align="center">
  <img src="bamboo_claw_logo.webp" alt="BambooClaw Core" width="100%" />
</p>

# BambooClaw Core 🎋

**The autonomous, edge-AI runtime for Bamboo Synergy Technologies.**

⚡️ **Ultra-lightweight:** Runs autonomously on $10 edge hardware with <5MB RAM. 
🔒 **Industrial Grade:** Secure-by-default architecture, built for facility floors. 
🔗 **Seamless Integration:** The dedicated local agent for bridging hardware telemetry to the **BST Nexus**.

<p align="left">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

---

### 🌱 Open-Source Lineage & MIT Acknowledgement
**BambooClaw Core** is a specialized, proprietary-configured fork of the phenomenal open-source project, ZeroClaw. 

While the original project was built as a general-purpose, CLI-first AI daemon, we required a highly specialized version to act as the autonomous nervous system for our physical infrastructure—specifically for routing local hardware telemetry from the **BambooCore B500** pyrolysis facilities directly to the BST Nexus, and managing automated workflows for applications like **MedVeto**. 

By forking this under the terms of the MIT License, we have retained the bulletproof, sub-5MB Rust engine of the original project, while entirely replacing the complex command-line setup with a frictionless, zero-CLI graphical interface powered by our native Companion App. We extend our deepest gratitude to the original maintainers for building such an incredible foundation.

---

### ✨ Features
* **Lean Runtime by Default:** The core daemon operates in a <5MB memory envelope, making it 99% lighter than traditional desktop AI agents.
* **Cost-Efficient Deployment:** Designed specifically for low-cost RISC-V and ARM boards. Drop it right onto the facility floor without heavy cloud compute.
* **Secure by Design:** Strict execution sandboxing, local encrypted secrets, and explicit network allowlists ensure your local telemetry stays safe.
* **Fully Swappable:** Core systems (providers, channels, tools) are modular traits. Instantly swap between Google Gemini, OpenRouter, or local hardware models.

### Benchmark Snapshot (Reproducible)
Local machine quick benchmark normalized for 0.8GHz edge hardware.

| | OpenClaw | NanoBot | PicoClaw | BambooClaw Core 🦀 |
|---|---|---|---|---|
| **Language** | TypeScript | Python | Go | **Rust** |
| **RAM** | > 1GB | > 100MB | < 10MB | **< 5MB** |
| **Startup (0.8GHz)** | > 500s | > 30s | < 1s | **< 10ms** |
| **Binary Size** | ~28MB (dist) | N/A (Scripts) | ~8MB | **3.4 MB** |
| **Cost** | Mac Mini $599 | Linux SBC ~$50 | Linux Board $10 | **Any hardware $10** |

---

## 🚀 Installation (The Frictionless Way)

BambooClaw is designed to be completely zero-CLI for operators and users. You do not need to use a terminal to install, configure, or manage your AI agent.

1. **Download the Installer:** Visit the official portal at [bamboosynergytec.com/projects](https://www.bamboosynergytec.com) and download the BambooClaw Companion App for your operating system (Windows / macOS / Linux).
2. **Run the Setup:** Double-click the installer. Our native UI will guide you through a beautiful, automated setup process to connect your API keys and preferred messenger platforms (Telegram, Discord, WhatsApp, etc.).
3. **Background Daemon:** Once setup is complete, the BambooClaw Rust engine will automatically register as a background service. It runs silently, waiting for your commands or executing scheduled workflows.
4. **The Companion App:** Use the installed desktop dashboard to easily swap AI models, check live hardware telemetry, or generate new Webhook listeners on the fly. 

---

## 🧠 Architecture
Every subsystem in BambooClaw is a trait, meaning implementations can be swapped with a simple UI toggle in the Companion App—zero code changes required.

| Subsystem | Description | Extendability |
| :--- | :--- | :--- |
| **AI Models** | Connects to standard providers (Google Gemini, Anthropic, OpenRouter) or local endpoints (Ollama). | Fully OpenAI/Anthropic API compatible. |
| **Channels** | Interfaces with Telegram, Discord, Slack, WhatsApp, and custom Webhooks. Managed via Companion App. | Any messaging API. |
| **Memory** | SQLite hybrid search (FTS5 + Vector Embeddings) stored strictly locally. | Swappable to PostgreSQL or Markdown. |
| **Tools** | Shell execution, file reads, cron schedules, HTTP requests. | Opt-in community skill packs. |
| **Security** | Gateway pairing, filesystem scoping, explicit allowlists. | "Deny-by-default" architecture. |
| **Identity** | Supports OpenClaw (Markdown files) or AIEOS v1.1 (JSON) for persona configuration. | Any identity format. |

---

## 🛡️ Security
BambooClaw Core enforces security at **every layer** — not just the sandbox.

| Item | Status | How |
|------|--------|-----|
| **Gateway not publicly exposed** | ✅ | Binds `127.0.0.1` by default. Refuses `0.0.0.0` without explicit `allow_public_bind = true`. |
| **Pairing required** | ✅ | Exchange via `POST /pair` for bearer token. All `/webhook` requests require `Authorization: Bearer <token>`. |
| **Filesystem scoped** | ✅ | `workspace_only = true` by default. Sensitive dotfiles blocked. Symlink escape detection via canonicalization. |

*Note: Channel allowlisting and messenger setup (Telegram, WhatsApp, etc.) is handled securely via the Connections Hub in the BambooClaw Companion App.*

---

## ⚙️ Engineering & Hardware Deployment
Are you a BST engineer deploying headless monitoring nodes to the facility floor? 
👉 **See [`DEVELOPER.md`](DEVELOPER.md) for source build instructions and CLI telemetry routing.**

---

## ⚖️ License
This project is licensed under the **MIT License**. 

A copy of the license is included in the `LICENSE` file. This software is provided "as is", without warranty of any kind. All original upstream architecture copyright belongs to its respective creators, while BambooClaw specific tooling, GUIs, and routing logic are maintained by Bamboo Synergy Technologies Inc.

### Trademark
The **BambooClaw** and **BambooCore** names are trademarks of Bamboo Synergy Technologies Inc.