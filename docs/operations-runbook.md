# BambooClaw Core Operations Runbook

This runbook is for operators who maintain availability, security posture, and incident response.

Last verified: **February 18, 2026**.

## Scope

Use this document for day-2 operations:

- starting and supervising runtime
- health checks and diagnostics
- safe rollout and rollback
- incident triage and recovery

For first-time installation, start from [one-click-bootstrap.md](one-click-bootstrap.md).

## Runtime Modes

| Mode | Command | When to use |
|---|---|---|
| Foreground runtime | `BambooClaw Core daemon` | local debugging, short-lived sessions |
| Foreground gateway only | `BambooClaw Core gateway` | webhook endpoint testing |
| User service | `BambooClaw Core service install && BambooClaw Core service start` | persistent operator-managed runtime |

## Baseline Operator Checklist

1. Validate configuration:

```bash
BambooClaw Core status
```

2. Verify diagnostics:

```bash
BambooClaw Core doctor
BambooClaw Core channel doctor
```

3. Start runtime:

```bash
BambooClaw Core daemon
```

4. For persistent user session service:

```bash
BambooClaw Core service install
BambooClaw Core service start
BambooClaw Core service status
```

## Health and State Signals

| Signal | Command / File | Expected |
|---|---|---|
| Config validity | `BambooClaw Core doctor` | no critical errors |
| Channel connectivity | `BambooClaw Core channel doctor` | configured channels healthy |
| Runtime summary | `BambooClaw Core status` | expected provider/model/channels |
| Daemon heartbeat/state | `~/.BambooClaw Core/daemon_state.json` | file updates periodically |

## Logs and Diagnostics

### macOS / Windows (service wrapper logs)

- `~/.BambooClaw Core/logs/daemon.stdout.log`
- `~/.BambooClaw Core/logs/daemon.stderr.log`

### Linux (systemd user service)

```bash
journalctl --user -u BambooClaw Core.service -f
```

## Incident Triage Flow (Fast Path)

1. Snapshot system state:

```bash
BambooClaw Core status
BambooClaw Core doctor
BambooClaw Core channel doctor
```

2. Check service state:

```bash
BambooClaw Core service status
```

3. If service is unhealthy, restart cleanly:

```bash
BambooClaw Core service stop
BambooClaw Core service start
```

4. If channels still fail, verify allowlists and credentials in `~/.BambooClaw Core/config.toml`.

5. If gateway is involved, verify bind/auth settings (`[gateway]`) and local reachability.

## Safe Change Procedure

Before applying config changes:

1. backup `~/.BambooClaw Core/config.toml`
2. apply one logical change at a time
3. run `BambooClaw Core doctor`
4. restart daemon/service
5. verify with `status` + `channel doctor`

## Rollback Procedure

If a rollout regresses behavior:

1. restore previous `config.toml`
2. restart runtime (`daemon` or `service`)
3. confirm recovery via `doctor` and channel health checks
4. document incident root cause and mitigation

## Related Docs

- [one-click-bootstrap.md](one-click-bootstrap.md)
- [troubleshooting.md](troubleshooting.md)
- [config-reference.md](config-reference.md)
- [commands-reference.md](commands-reference.md)
