# Claude Code on iPhone

สั่ง **Claude Code** ที่รันอยู่บนคอมที่บ้านจากมือถือ ใช้ของฟรีทั้งหมด ตั้งค่าประมาณ 10 นาที

Run **Claude Code** on your home PC from your phone. Free stack, about 10 minutes to set up.

Companion repo for the [ChenLab](https://chenlab789.pages.dev) video · Slides: <https://chenlab789.pages.dev/claude-mobile/> · Channel: `youtube.com/@chenlab789`

[ภาษาไทย](#ภาษาไทย) · [English](#english)

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

## ภาษาไทย

### ได้อะไร
คุมคอมที่บ้านจากมือถือได้เต็มรูปแบบ Claude Code เข้าถึงได้ทุกอย่างเหมือนนั่งหน้าคอม:
- ไฟล์ในเครื่อง, ไดรฟ์แชร์ในเน็ตเวิร์ก, ฐานข้อมูล
- MCP tools และ credential ที่ตั้งไว้แล้ว
- โปรเจกต์ ประวัติ slash command และ skill ทั้งหมด

ฟรีทั้งหมด จ่ายแค่ค่า Claude Code ที่ใช้อยู่แล้ว

### ทำไมไม่ใช้ Claude บนเว็บหรือแอป iOS
Claude บนคลาวด์เข้าไม่ถึงไฟล์ในเครื่อง ไดรฟ์แชร์ (`\\server\...`) สคริปต์ ฐานข้อมูล MCP tools ที่ลงไว้ และ credential ของโปรเจกต์ ทางเดียวที่จะได้ AI agent ตัวเต็มบนมือถือคือ **SSH เข้าคอมตัวเอง**

### เครื่องมือที่ใช้
| ตัว | หน้าที่ | ราคา |
|---|---|---|
| Tailscale | เน็ตเวิร์กส่วนตัว (VPN) | ฟรี |
| OpenSSH | เข้า terminal ของคอม | มีใน Windows |
| Termius | แอป SSH บนมือถือ | ฟรี |
| Claude Code | ตัว agent | ที่ใช้อยู่แล้ว |

### ตั้งค่า
**1. Tailscale (ลงทั้งสองเครื่อง)**
- ลงบนคอม: <https://tailscale.com/download>
- ลงบนมือถือ: App Store → "Tailscale"
- login บัญชี Google/Apple **อันเดียวกัน** ทั้งสองเครื่อง
- จด IP ของคอมใน Tailscale ไว้ (`100.x.x.x`)

**2. เปิด OpenSSH บนคอม** — เปิด PowerShell แบบ **Run as Administrator** แล้วรัน:
```powershell
.\scripts\install-openssh.ps1
```
สคริปต์จะลง OpenSSH Server, เปิด service `sshd` ให้รันเองตอนเปิดเครื่อง และเปิด firewall port 22

**3. สร้าง SSH key ใน Termius** (บนมือถือ)
1. Termius → `Keychain` → `+` → **Generate Key**
2. Type: **ED25519**
3. ตั้ง passphrase (เปิด "Save passphrase" จะได้ปลดล็อกด้วย FaceID)
4. แตะที่ key → **Copy public key**

**4. ใส่ public key ลงคอม** — PowerShell แบบ Administrator:
```powershell
.\scripts\install-authkey.ps1 -PublicKey "ssh-ed25519 AAAA... your-key-here"
```
สคริปต์จัดการ 3 จุดที่คนพลาดบ่อยให้:
- เขียนลง `C:\ProgramData\ssh\administrators_authorized_keys` (ที่ถูกสำหรับ user ที่เป็น admin **ไม่ใช่** `~/.ssh/authorized_keys`)
- เซฟเป็น UTF-8 **ไม่มี BOM** (มี BOM แล้ว sshd อ่านไม่ได้)
- ล็อกสิทธิ์ไฟล์ให้แค่ `SYSTEM` + `Administrators`

**5. ต่อจาก Termius**
- `Hosts` → `+` → New Host
- **Hostname:** IP Tailscale ของคอม (`100.x.x.x`) · **Port:** `22`
- **Username:** ชื่อ user Windows · **Key:** key ED25519 ที่สร้างไว้
- Save → แตะ host → **Connect**

จะเข้ามาที่ PowerShell พิมพ์ `claude` ก็ใช้งานได้เลย

### เช็คปัญหา
```powershell
.\scripts\verify-setup.ps1
```
แสดงสถานะ `sshd`, port 22, การเชื่อมต่อ Tailscale, log การ login ล่าสุด และสิทธิ์ไฟล์ `authorized_keys`

**`Permission denied (publickey)`** — key อยู่ผิดไฟล์, สิทธิ์ไฟล์หลวมเกิน หรือไฟล์มี BOM → รัน `install-authkey.ps1` ใหม่
**`Connection refused`** — `sshd` ไม่ได้รัน (`Get-Service sshd` แล้ว `Start-Service sshd`) หรือ firewall บล็อก port 22
**`Connection timed out`** — Tailscale หลุดฝั่งใดฝั่งหนึ่ง หรือ IP ผิด (รัน `tailscale ip -4` บนคอมเพื่อเช็ค)

---

## English

### What you get
Run Claude Code on your home PC, controlled from your phone. It is fully agentic, with access to:
- Local files, network shares and databases
- MCP tools and credentials you've already configured
- Project state, history, slash commands and skills

All free. The only cost is your existing Claude Code subscription.

### Why not cloud Claude / the Claude iOS app?
Cloud-only Claude can't reach files on your machine, network shares (`\\server\...`), local scripts or databases, MCP tools you've installed, or project credentials. The only way to get a fully capable agent on your phone is to **SSH into your own PC**.

### The stack
| Tool | Role | Cost |
|---|---|---|
| Tailscale | Private network (VPN) | Free |
| OpenSSH | Terminal access | Built-in |
| Termius | SSH client on phone | Free tier |
| Claude Code | The agent | Existing |

### Setup
**1. Tailscale (both devices)**
- Install on PC: <https://tailscale.com/download>
- Install on iPhone: App Store → "Tailscale"
- Log in with the **same** Google/Apple account on both
- Note your PC's Tailscale IP (`100.x.x.x`)

**2. OpenSSH on PC** — open PowerShell **as Administrator** and run:
```powershell
.\scripts\install-openssh.ps1
```
This installs the OpenSSH Server feature, starts the `sshd` service (set to auto-start) and opens firewall port 22.

**3. Generate an SSH key in Termius** (on your phone)
1. Termius → `Keychain` → `+` → **Generate Key**
2. Type: **ED25519**
3. Set a passphrase (enable "Save passphrase" for FaceID unlock)
4. Tap the key → **Copy public key**

**4. Install your public key on PC** — PowerShell as Administrator:
```powershell
.\scripts\install-authkey.ps1 -PublicKey "ssh-ed25519 AAAA... your-key-here"
```
It handles the three things people get wrong:
- Writes to `C:\ProgramData\ssh\administrators_authorized_keys` (the correct path for admin users, **not** `~/.ssh/authorized_keys`)
- Saves as UTF-8 **without BOM** (a BOM breaks sshd)
- Locks the ACL to `SYSTEM` + `Administrators` only

**5. Connect from Termius**
- `Hosts` → `+` → New Host
- **Hostname:** your Tailscale IP (`100.x.x.x`) · **Port:** `22`
- **Username:** your Windows username · **Key:** the ED25519 key you generated
- Save → tap the host → **Connect**

You land in PowerShell. Type `claude` and you're in.

### Verify / debug
```powershell
.\scripts\verify-setup.ps1
```
Prints the status of `sshd`, port 22, Tailscale connectivity, recent auth events and the `authorized_keys` ACL.

**`Permission denied (publickey)`** — key in the wrong file, ACL too permissive, or file saved with a BOM → re-run `install-authkey.ps1`
**`Connection refused`** — `sshd` not running (`Get-Service sshd`, then `Start-Service sshd`) or firewall blocking port 22 (`Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP'`)
**`Connection timed out`** — Tailscale disconnected on one side, or wrong IP (run `tailscale ip -4` on the PC)

---

## Files
```
.
├── README.md
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

By **Chen** — [@chenlab789](https://chenlab789.pages.dev)
