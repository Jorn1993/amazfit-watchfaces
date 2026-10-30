# Private Polestar gateway (experimental)

This is a **self-hosted** Python/gRPC bridge for the Zepp app. The unofficial Polestar API is not affiliated with Polestar and could break. Do **not** expose plain HTTP to the internet.

Provide `POLESTAR_EMAIL`, `POLESTAR_PASSWORD` and a long random `POLESTAR_GATEWAY_TOKEN` only as server environment variables (not in GitHub, Zepp or a URL). Configure HTTPS on a trusted reverse proxy, restrict requests and rate-limit commands.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8879
```

The gateway checks a bearer token for every request and validates vehicle ownership before issuing commands. It has GET /api/vehicles and POST /api/command endpoints. No public deployment, credentials or working vehicle connection are supplied by this repository. Test with lock first, with the car stationary and keys available. Unlock must require watch confirmation.
