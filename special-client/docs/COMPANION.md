# SPECIAL Companion / Fabric Plus experimental layer

“Fabric Plus” here is a project nickname, not a different Fabric loader. Target
remains **Minecraft Java 1.20.1 / Fabric / Java 17 / matching Fabric API**.

## Optional BYOK chat

The first launcher GUI startup offers setup; Skip does not restrict Minecraft.
Settings > AI companion or the Companion sidebar opens configuration. Choose
OpenAI, Groq or a **public HTTPS OpenAI chat-completions-compatible** custom API
base; enter a valid model for your account, enter the key in the password field,
check Enable and Save. Model access, pricing, rate limits and tool support are
provider-dependent. The supplied model names are editable suggestions, not an
availability guarantee. There is no bundled paid account or free unlimited API.

No network call to an AI provider happens without opt-in and a typed chat request.
Only typed text plus recent in-memory chat history and narrow tool definitions
are sent. Screenshots, game state, microphone audio, Minecraft account tokens and
API keys in prompts are not sent. The provider receives your API key only in its
Authorization header. Messages may incur charges and be retained under that
provider's policies. A custom endpoint is a **trust decision**: it receives the
key you enter for it. Do not use untrusted hosts. This is a desktop BYOK client,
not a hardened multi-tenant URL-fetch proxy; DNS hosts are not an SSRF sandbox.

Keys are saved separately from settings/chat, endpoint-bound, DPAPI encrypted
for the current Windows user; on POSIX the key file is plaintext with mode 0600.
No plaintext fallback on Windows writes. Changing endpoint cannot silently reuse
the old endpoint's key. Use Delete saved key to remove it. Changing model for the
same endpoint can use the same key. Configuration/keys are launcher-home-specific;
move/reinstall does not imply the key migrates to another Windows account.

Chat history is memory-only, but the **local game mailbox may retain its last
request/response JSON until consumed or replaced**. Do not type secrets in chat.
Clear Chat discards history and invalidates pending model proposals; it cannot
retract data already sent to a provider. Logs must be redacted before sharing.

## In-game chat and speech

Right Shift > Companion > Open chat. Launcher must remain open with the same
game directory. This screen sends to the local launcher, **never server chat**.
A separate Open companion key can be assigned in Options > Controls. One request
at a time; a missing/disabled launcher/API reports timeout or setup instructions.

Read replies aloud is OFF by default. It uses optional installed OS/Qt speech
engines, not the chat provider's API and not an always-listening microphone.
Language/voice availability varies; if no engine works, text chat remains.
Speech input, voice cloning, cloud voice conversations and microphone capture
are **not implemented**. Quiet collection never invokes speech by itself.

## Explicit actions, no arbitrary model execution

Allowed proposals: `collect_emerald`, `collect_diamond`, `stop`. Model output is
parsed against that whitelist, never executed as code, shell, URLs or game chat.
Proposals need a launcher approval button + confirmation; they do not run just
because the model says “done”. Proposals are invalid across game directory/session
changes. Direct local action buttons are explicit user requests and need no API.

After confirming in the launcher, return focus to the game within 10 seconds.
The game rejects stale or wrong-session command envelopes. One pending command;
STOP overrides a pending task. F8 cancels tasks/queued requests and old click
bursts. Same-user local mailbox is not a security boundary against malicious
programs already running as your OS account. No remote control listener exists.

## Resource collection — deliberately bounded first implementation

This is **not a universal Bedwars bot or a screenshot-vision agent**. It examines
loaded ItemEntity data for *already dropped* emeralds or diamonds, requires initial
line-of-sight, and uses a bounded A* planner on one horizontal support layer.
It does not locate every generator, predict spawn timers, see the entire map,
read unloaded chunks, fight players, use shops/chests, jump stairs or navigate
arbitrary servers. Active tasks are **private integrated singleplayer only**;
remote servers and worlds published to LAN are rejected.

- Stand centered, on ground, not flying, in a separate safe practice world.
- Place dropped emerald/diamond items on full-cube floor at the same height.
- Start from the game Companion buttons or the launcher local action buttons.
- Scans at most 32 blocks, plans at most 64 steps / 2500 search expansions, visits
  up to 8 candidate targets, then attempts to return to the starting block.
- Pickup is ordinary walking/waiting; no item teleport/spawn/removal. Final count
  is the inventory difference, not a claim that every observed drop was collected.
- Headroom must be air; non-full cubes, fluid, known slippery/harmful blocks,
  unavailable chunks and world-border crossings are not traversed.
- By default, gaps are not allowed. Enable **Wool bridges** explicitly in the
  in-game Companion screen, with wool in the hotbar. At most 8 gap blocks per
  planned route; no automatic inventory restocking or arbitrary block spawning.
- Gap segments use the existing one-block-at-a-time straight sneak-bridge trainer:
  aim at a real reachable face, vanilla placement, wait for block confirmation,
  then walk onto it. Placement is not a custom packet/spoofing operation.
- A changed/blocked route, damage, fall/flight/water, timeout, lost focus, menus,
  world/dimension change or physical WASD/Space stops. F8 is the emergency stop.
- Return can fail if terrain changes or no verified route exists; it stops and
  reports that. There is **no guarantee against falling**. Test over a safe floor.

## Verification boundary

Python tests cover endpoint/key handling, sanitized HTTP failures/tool filtering,
private/fresh-session mailbox commands and replay/burst limits. Java unit tests
cover bounded grid planning and existing burst/practice rules. CI compiles and
packages both components and smoke-renders launcher Qt pages. **None of that
proves live paid-provider compatibility, Minecraft movement, pickup/return,
bridge behavior, in-game UI/mixin runtime or system speech.** Manual acceptance
must test those before calling this stable.
