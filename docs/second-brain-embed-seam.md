# Second Brain — Embed Seam Spec

For **orchestra-builder-v2** to place the live 3D second brain as an OrchestraOS **V2** page (Sunday 2026-07-26 launch). Do not modify the brain's internals — consume it as an iframe via the contract below.

## Service
- **Standalone Node service**, own process, own port: **7373**. Isolated from ops — a crash here never touches dashboard/combo-proxy/custom-llm.
- Serves the 3D client **and** a WebSocket from the same port (WS auto-upgrades on `/`).
- Endpoints: `/` (client), `/api/graph` (full snapshot JSON), `/healthz` (liveness).

## URL / iframe usage
Tailnet URL (Shaw runs `sudo tailscale serve` — see below):
`https://srv1397016.tail8be541.ts.net:7373/?embed=1`

```html
<iframe src="https://srv1397016.tail8be541.ts.net:7373/?embed=1"
        style="border:0;width:100%;height:100%" allow="fullscreen"></iframe>
```

## `?embed=1` contract
When `embed=1` is present the client:
- Hides standalone chrome (topbar, subtitle, hints, loader).
- Disables auto-rotate (host drives focus).
- Keeps search, legend/isolate, detail panel, ticker, and all live deltas.
- Emits + accepts `postMessage` (below).

## postMessage API
The brain uses `window.parent.postMessage({type, payload}, '*')`. Host → brain messages are received on `window.message`.

### Outgoing (brain → host)
| type | payload | when |
|------|---------|------|
| `brain:hover` | `{id,name,cluster}` | node hovered |
| `brain:select` | `{id,name,cluster,status,meta}` | node clicked |
| `brain:isolate` | `{cluster}` (or `{cluster:null}`) | pillar isolated / cleared |

### Incoming (host → brain)
| type | payload | effect |
|------|---------|--------|
| `brain:focus` | `{id}` | fly camera to node + open its detail panel |
| `brain:search` | `{q}` | run fuzzy search for `q` |
| `brain:isolate` | `{cluster}` | isolate a pillar (`null` to reset) |
| `brain:reset` | — | clear isolation + zoom-to-fit |

Node `id` format: `agent:<name>` · `repo:<name>` · `client:<slug>` · `service:<name>` · `prompt:<file>` · `state:<rel>` · `queue:bridged` · `hub:<cluster>`.

## Live WS protocol (for reference — host does not need to consume it; the iframe does)
Server → client messages: `init` (full graph) · `node.add` · `node.remove` · `node.update` (status/val patch) · `node.flash` (`kind`: commit|spawn|message) · `link.pulse` (message particle) · `ticker` (event text).

## Notes for v2
- Do not proxy 443/8891 (shared infra). The brain has its own port + its own `tailscale serve` mount.
- If OrchestraOS needs the graph server-side, hit `GET /api/graph` (read-only snapshot).
- Send integration questions to `second-brain-dev` via `msg_store.py`.
