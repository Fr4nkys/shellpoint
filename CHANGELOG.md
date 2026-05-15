# Changelog

All notable changes to ShellPoint are documented here.

---

## [1.0.8] — 2025-05-15

### Added
- **Right-click context menu on terminal** — Copy, Paste, Reconnect, Duplicate session, Clear screen
- **Right-click context menu on hosts** — Connect, Open Gaia Portal, Edit, Delete
- **2FA / RADIUS authentication support** — Push 2FA (Duo, Okta) and OTP/Token modes per host
- **Web UI Port field** — configurable per host, used for the Gaia Portal quick-open shortcut
- **Reconnect** — reconnect to a session without closing the tab
- **Duplicate session** — open a second tab to the same host

### Fixed
- Duplicate session now correctly retrieves password from keychain using the original host ID
- Reconnect now waits for the SSH channel to fully close before re-opening (400ms grace period)
- `keyboard-interactive` event listener now correctly attached before `connect()` call (ssh2 API fix)
- Removed invalid `authHandler` property that was breaking all connections

### Changed
- `readyTimeout` increased from 10s to 20s for slower RADIUS/2FA flows

---

## [1.0.7] — 2025-05-14

### Added
- **SFTP side panel** — integrated file manager takes 1/3 of the screen alongside the SSH terminal
- **SFTP keepalive** — prevents session timeout during file browsing and transfers
- **Welcome screen action cards** — interactive cards with descriptions for Add Host, Connect, Commands
- **About modal** — developer credits with LinkedIn and franksec.com links
- **First-launch welcome modal**

### Changed
- SFTP panel positioned on the right (SSH terminal on the left)
- All UI strings fully translated to English
- Icon backgrounds unified to dark theme with accent highlights

### Fixed
- `formatBytes` utility restored after accidental deletion
- Host grouping card styling applied correctly to customer and cluster levels

---

## [1.0.6] — 2025-05-12

### Added
- **Custom host images** — upload a logo/icon per host (resized to 256px, stored as base64)
- **ClusterXL commands** — `cphaprob` variants, cluster state management
- **Split view** — side-by-side terminals for HA cluster node pairs

### Fixed
- Terminal input duplication (double-paste bug resolved by removing manual paste interception)

---

## [1.0.5] — 2025-05-12

### Changed
- Icon library replaced with consistent SVG icon set (removed emoji-based icons)
- Quick Connect bar moved to title bar area
- Navigation layout restructured

---

## [1.0.3] — Initial public release

### Features
- Multi-tab SSH sessions
- Host management with Customer/Cluster grouping
- Built-in Check Point command library
- tcpdump and fw monitor flag builders
- Check Point SK article links
- Secure credential storage (Windows Credential Manager)
- Portable build — no installation required
