"""Private HTTPS gateway for Polestar Link; deploy behind TLS and authentication."""
import asyncio
import hmac
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from polestar_api.client import PolestarApi

app = FastAPI(title="Polestar Link Gateway", docs_url=None, redoc_url=None)
LOCK = asyncio.Lock()

class Command(BaseModel):
    vin: str
    action: str
    confirmed: bool = False

def auth(authorization: str | None):
    secret = os.environ.get("POLESTAR_GATEWAY_TOKEN")
    if not secret or not authorization or not hmac.compare_digest(authorization, "Bearer " + secret):
        raise HTTPException(401, "Unauthorized")
    email, password = os.environ.get("POLESTAR_EMAIL"), os.environ.get("POLESTAR_PASSWORD")
    if not email or not password:
        raise HTTPException(503, "Polestar credentials not configured")
    return email, password

@app.get("/api/vehicles")
async def vehicles(authorization: str | None = Header(default=None)):
    email, password = auth(authorization)
    async with LOCK:
        try:
            async with PolestarApi(email=email, password=password) as api:
                cars = await asyncio.wait_for(api.get_vehicles(), timeout=45)
                return {"vehicles": [{"vin":v.vin, "name":str(getattr(v,"name","Polestar"))} for v in cars]}
        except Exception as exc:
            raise HTTPException(502, "Polestar authentication or discovery failed") from exc

@app.post("/api/command")
async def command(cmd: Command, authorization: str | None = Header(default=None)):
    email, password = auth(authorization)
    if cmd.action not in ("lock", "unlock") or not cmd.confirmed or len(cmd.vin) != 17 or not cmd.vin.isalnum():
        raise HTTPException(400, "Explicit confirmed lock/unlock request and valid VIN required")
    async with LOCK:
        try:
            async with PolestarApi(email=email, password=password) as api:
                cars = await asyncio.wait_for(api.get_vehicles(), timeout=45)
                selected = next((v for v in cars if v.vin.upper() == cmd.vin.upper()), None)
                if not selected:
                    raise HTTPException(404, "Vehicle not found on this Polestar account")
                response = await asyncio.wait_for(selected.lock() if cmd.action=="lock" else selected.unlock(), timeout=45)
                return {"accepted":True,"action":cmd.action,"result":str(response)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(502, "Polestar did not confirm the vehicle command") from exc
