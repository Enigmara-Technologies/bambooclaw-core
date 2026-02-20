# BambooClaw Core Commands Reference

This reference is derived from the current CLI surface (`BambooClaw Core --help`).

Last verified: **February 19, 2026**.

## Top-Level Commands

| Command | Purpose |
|---|---|
| `onboard` | Initialize workspace/config quickly or interactively |
| `agent` | Run interactive chat or single-message mode |
| `gateway` | Start webhook and WhatsApp HTTP gateway |
| `daemon` | Start supervised runtime (gateway + channels + optional heartbeat/scheduler) |
| `service` | Manage user-level OS service lifecycle |
| `doctor` | Run diagnostics and freshness checks |
| `status` | Print current configuration and system summary |
| `cron` | Manage scheduled tasks |
| `models` | Refresh provider model catalogs |
| `providers` | List provider IDs, aliases, and active provider |
| `channel` | Manage channels and channel health checks |
| `integrations` | Inspect integration details |
| `skills` | List/install/remove skills |
| `migrate` | Import from external runtimes (currently OpenClaw) |
| `config` | Export machine-readable config schema |
| `hardware` | Discover and introspect USB hardware |
| `peripheral` | Configure and flash peripherals |

## Command Groups

### `onboard`

- `BambooClaw Core onboard`
- `BambooClaw Core onboard --interactive`
- `BambooClaw Core onboard --channels-only`
- `BambooClaw Core onboard --api-key <KEY> --provider <ID> --memory <sqlite|lucid|markdown|none>`

### `agent`

- `BambooClaw Core agent`
- `BambooClaw Core agent -m "Hello"`
- `BambooClaw Core agent --provider <ID> --model <MODEL> --temperature <0.0-2.0>`
- `BambooClaw Core agent --peripheral <board:path>`

### `gateway` / `daemon`

- `BambooClaw Core gateway [--host <HOST>] [--port <PORT>]`
- `BambooClaw Core daemon [--host <HOST>] [--port <PORT>]`

### `service`

- `BambooClaw Core service install`
- `BambooClaw Core service start`
- `BambooClaw Core service stop`
- `BambooClaw Core service status`
- `BambooClaw Core service uninstall`

### `cron`

- `BambooClaw Core cron list`
- `BambooClaw Core cron add <expr> [--tz <IANA_TZ>] <command>`
- `BambooClaw Core cron add-at <rfc3339_timestamp> <command>`
- `BambooClaw Core cron add-every <every_ms> <command>`
- `BambooClaw Core cron once <delay> <command>`
- `BambooClaw Core cron remove <id>`
- `BambooClaw Core cron pause <id>`
- `BambooClaw Core cron resume <id>`

### `models`

- `BambooClaw Core models refresh`
- `BambooClaw Core models refresh --provider <ID>`
- `BambooClaw Core models refresh --force`

`models refresh` currently supports live catalog refresh for provider IDs: `openrouter`, `openai`, `anthropic`, `groq`, `mistral`, `deepseek`, `xai`, `together-ai`, `gemini`, `ollama`, `astrai`, `venice`, `fireworks`, `cohere`, `moonshot`, `glm`, `zai`, `qwen`, and `nvidia`.

### `channel`

- `BambooClaw Core channel list`
- `BambooClaw Core channel start`
- `BambooClaw Core channel doctor`
- `BambooClaw Core channel bind-telegram <IDENTITY>`
- `BambooClaw Core channel add <type> <json>`
- `BambooClaw Core channel remove <name>`

Runtime in-chat commands (Telegram/Discord while channel server is running):

- `/models`
- `/models <provider>`
- `/model`
- `/model <model-id>`

`add/remove` currently route you back to managed setup/manual config paths (not full declarative mutators yet).

### `integrations`

- `BambooClaw Core integrations info <name>`

### `skills`

- `BambooClaw Core skills list`
- `BambooClaw Core skills install <source>`
- `BambooClaw Core skills remove <name>`

Skill manifests (`SKILL.toml`) support `prompts` and `[[tools]]`; both are injected into the agent system prompt at runtime, so the model can follow skill instructions without manually reading skill files.

### `migrate`

- `BambooClaw Core migrate openclaw [--source <path>] [--dry-run]`

### `config`

- `BambooClaw Core config schema`

`config schema` prints a JSON Schema (draft 2020-12) for the full `config.toml` contract to stdout.

### `hardware`

- `BambooClaw Core hardware discover`
- `BambooClaw Core hardware introspect <path>`
- `BambooClaw Core hardware info [--chip <chip_name>]`

### `peripheral`

- `BambooClaw Core peripheral list`
- `BambooClaw Core peripheral add <board> <path>`
- `BambooClaw Core peripheral flash [--port <serial_port>]`
- `BambooClaw Core peripheral setup-uno-q [--host <ip_or_host>]`
- `BambooClaw Core peripheral flash-nucleo`

## Validation Tip

To verify docs against your current binary quickly:

```bash
BambooClaw Core --help
BambooClaw Core <command> --help
```
