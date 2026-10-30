# Polestar Link — kildahldev C3 functional specification

**Reference implementation:** https://github.com/kildahldev/unofficial-polestar-api (source `src/polestar_api/`).
**Scope:** one personal Polestar 4, Amazfit Balance 2 (Zepp OS), Android Zepp companion **only**. No Home Assistant, external relay, additional Android APK, or self-hosted infrastructure.

The official mobile-client OAuth/PKCE login is retained from the reference (`lp8dyrd_10`, `polestar-explore://explore.polestar.com`). The user has demonstrated a successful OAuth token exchange on a real phone. Fresh sign-in involving email verification has not been tested end-to-end.

## Reference feature parity

| Area | Reference source | Target UX | Current Zepp hardware status |
| --- | --- | --- | --- |
| Account | `auth.py`, `discovery.py` | Connect Polestar ID in Zepp Settings | Authenticated; car account discovery may return 0 |
| Battery & range | `services/battery.py` | Battery %, range, charging power/status | **Blocked** — C3 native gRPC bytes corrupted |
| Exterior | `services/exterior.py` | Doors, windows, lock, trunk, alarm | **Blocked** |
| Location | `services/location.py` | Last-known/parked car location | **Blocked** |
| Availability | `services/availability.py` | Online/offline status | **Blocked** |
| Odometer & health | `services/odometer.py`, `services/health.py` | Trip, odometer, warnings | **Blocked** |
| Climate | `services/climate.py` | Cabin climate status | **Blocked** |
| Lock / unlock / trunk | `services/invocation.py`, `models/locks.py` | Arm, confirm, observe result | Wire model ported; **cannot execute reliably through Zepp Fetch** |
| Honk / flash | `models/honkflash.py` | Confirm an action | Wire model ported; transport blocked |
| Windows | `models/window.py` | Open/close all, explicit confirmation | Wire model ported; transport blocked |
| Start / stop climate | `models/climatization.py` | Start/stop, optional cabin temperature | Wire model ported; transport blocked |
| Charging controls | `services/target_soc.py`, `charge_now.py`, `amp_limit.py`, `charge_timer.py` | Set charge target, schedule and override | Requires separate Chronos protobufs, transport blocked |
| Charge locations, pre-cleaning, weather, OTA | Corresponding `services/*.py` | Secondary information/actions | Protocol mapping pending, transport blocked |

The reference library works because it uses Python's `grpclib` with an **HTTP/2** channel, real protobuf byte frames, trailers, streams, and a `grpc-java-okhttp/1.68.2` User-Agent. The Zepp Side Service documentation exposes `fetch({url,method,headers,body})` but no binary response mode, HTTP/2 stream API, or gRPC channel. The real owner's tests confirmed corrupted native C3 protobuf responses; gRPC-Web text on the standard battery path returned HTTP 404. These results **do not** justify saying the app can control the car.

## Implementation guardrails

1. No sample/mock battery or lock state presented as live values.
2. Separate identities: signed-in account, configured VIN, live-status-verified vehicle, command channel verified.
3. All vehicle exposure/actuation requires explicit confirmation on watch.
4. Command RPC acceptance is not proof of physical execution. Compare fresh state where available; otherwise report an unverified result.
5. Never send credentials, VIN, authorization codes or access tokens to third-party diagnostics, logs, screenshots, or an external relay.
6. Avoid aggressive background polling and keep read-only refresh user-initiated to limit potential 12V battery impact.
7. Do not add Home Assistant, cloud relay, or another Android app under the current product constraints.
8. Tests/mock transports validate encoder correctness but cannot establish real Zepp communication.

## Delivery gate

**Do not call the full C3 watch app functional or publish control buttons as ready until a real Balance 2 + Android Zepp test demonstrates:**

- a byte-perfect authenticated native gRPC response (and server trailers) via a supported Zepp API, or a trusted, officially supported equivalent in Zepp;
- a read-only battery and exterior status query with real vehicle state;
- a complete remote-command lifecycle, with user confirmation and independent vehicle-state verification.

Until then, a watch UI may show the planned controls as unavailable, but they must never claim a successful action.

## Reference attribution

The C3 message definitions and behavior referenced by this port are based on
[kildahldev/unofficial-polestar-api](https://github.com/kildahldev/unofficial-polestar-api),
MIT License, Copyright (c) 2025. The original MIT license and disclaimer are available in
[that project's LICENSE](https://github.com/kildahldev/unofficial-polestar-api/blob/main/LICENSE).
This project is not affiliated with or endorsed by Polestar.
