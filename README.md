# Claude Code on iPhone

> Run **Claude Code** on your home PC — from your phone. Free stack. ~10 min setup.

Companion repo for the [ChenLab](https://chenlab789.pages.dev) video. Includes setup scripts, troubleshooting commands, and the full step-by-step.

- Video: _coming soon_ — `youtube.com/@chenlab789`
- Slides: <https://chenlab789.pages.dev/claude-mobile/>
- Channel: <https://chenlab789.pages.dev>

---

## What you get

Run Claude Code on your home PC, controlled from your phone — fully agentic, with access to:

- Local files / network shares / DBs
- MCP tools and credentials you've already configured
- Project state, history, slash commands, skills

All free. The only cost is your existing Claude Code subscription.

## Why not cloud Claude / Claude iOS app?

Cloud-only Claude can't reach:

- Files on your machine
- Network shares (`\\server\...`)
- Local scripts, DBs, or DBF files
- MCP tools you've installed
- Project state and credentials

The only path to a fully-capable AI agent on your phone is **SSH into your own PC**.

## The stack

| Tool          | Role                       | Cost      |
|---------------|----------------------------|-----------|
| Tailscale     | Private network (VPN)      | Free      |
| OpenSSH       | Terminal access            | Built-in  |
| Termius       | SSH client on phone        | Free tier |
| Claude Code   | The agent                  | Existing  |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  iPhone     │     │  Tailscale   │     │  Windows PC │
│             │ ←→  │  (private    │ ←→  │             │
│  Termius    │     │   network)   │     │  OpenSSH    │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │  PowerShell │
                                         └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │ claude code │
                                         └─────────────┘
```

---

## Quick setup

### 1. Tailscale (both devices)

- Install on PC: <https://tailscale.com/download>
- Install on iPhone: App Store → "Tailscale"
- Login with the **same** Google/Apple account on both
- Note your PC's Tailscale IP (`100.x.x.x`)

### 2. OpenSSH on PC

Open PowerShell **as Administrator** and run:

```powershell
.\scripts\install-openssh.ps1
```

This will:
- Install OpenSSH Server feature
- Start the `sshd` service (set to auto-start)
- Open firewall port 22

### 3. Generate SSH key in Termius

On your phone:
1. Termius → `Keychain` → `+` → **Generate Key**
2. Type: **ED25519**
3. Set a passphrase (enable "Save passphrase" for FaceID unlock)
4. Tap the key → **Copy public key**

### 4. Install your public key on PC

Open PowerShell **as Administrator** and run:

```powershell
.\scripts\install-authkey.ps1 -PublicKey "ssh-ed25519 AAAA... your-key-here"
```

This handles three things people get wrong:

- Writes to `C:\ProgramData\ssh\administrators_authorized_keys` (the correct path for admin users — **not** `~/.ssh/authorized_keys`)
- Saves with UTF-8 **no BOM** encoding (BOM breaks sshd)
- Locks ACL to `SYSTEM` + `Administrators` only (strict mode requirement)

### 5. Connect from Termius

- `Hosts` → `+` → New Host
- **Hostname:** your Tailscale IP (`100.x.x.x`)
- **Port:** `22`
- **Username:** your Windows username
- **Key:** select the ED25519 key you generated
- Save → tap host → **Connect**

You should land in PowerShell. Type `claude` and you're in.

---

## Verify / debug

```powershell
.\scripts\verify-setup.ps1
```

Prints status of `sshd`, port 22, Tailscale connectivity, recent auth events, and the `authorized_keys` ACL.

## Common errors

### `Permission denied (publickey)`

- Public key in the wrong file → re-run `install-authkey.ps1`
- ACL too permissive → script handles this automatically
- File saved with BOM → script uses no-BOM encoding

### `Connection refused`

- `sshd` service not running → `Get-Service sshd`, then `Start-Service sshd`
- Firewall blocking port 22 → check `Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP'`

### `Connection timed out`

- Tailscale disconnected on one side → check tray icon (PC) and app toggle (phone)
- Wrong IP → run `tailscale ip -4` on PC to confirm

---

## Files

```
.
├── README.md                       ← you are here
├── LICENSE
├── scripts/
│   ├── install-openssh.ps1         ← enable OpenSSH + sshd + firewall
│   ├── install-authkey.ps1         ← install pubkey + lock ACL
│   └── verify-setup.ps1            ← debug / status checks
└── assets/
    └── architecture.txt
```

## License

MIT — do whatever, just don't blame me if your fridge starts trading crypto.

## About

By **Chen** — [@chenlab789](https://chenlab789.pages.dev)
_Building things that build themselves._
