"""Private Polestar Link bridge: never expose directly without HTTPS proxy."""
import asyncio
import hmac
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from polestar_api import PolestarApi

app = FastAPI(title="Polestar Link", docs_url=None, redoc_url=None, openapi_url=None)
mutex = asyncio.Lock()

class Command(BaseModel):
    vin: str
    action: str
    confirmed: bool = False

def auth(authorization: str | None):
    token = os.environ.get("POLESTAR_GATEWAY_TOKEN")
    if not token or not authorization or not hmac.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(401, "Unauthorized")
    email, password = os.environ.get("POLESTAR_EMAIL"), os.environ.get("POLESTAR_PASSWORD")
    if not email or not password:
        raise HTTPException(503, "Polestar account not configured on private gateway")
    return email, password

def fields(vehicle):
    return {"vin":vehicle.vin,"name":getattr(vehicle,"model_name",None) or "Polestar"}

async def selected(api, vin):
    cars = await asyncio.wait_for(api.get_vehicles(), timeout=45)
    return next((car for car in cars if car.vin.upper() == vin.upper()), None)

@app.get("/api/vehicles")
async def vehicles(authorization: str | None = Header(default=None)):
    email,password=auth(authorization)
    async with mutex:
        try:
            async with PolestarApi(email=email,password=password) as api:
                cars=await asyncio.wait_for(api.get_vehicles(),timeout=45)
                return {"vehicles":[fields(car) for car in cars]}
        except Exception as exc:
            raise HTTPException(502, "Polestar login/discovery failed") from exc

@app.get("/api/status/{vin}")
async def status(vin: str, authorization: str | None = Header(default=None)):
    email,password=auth(authorization)
    async with mutex:
        try:
            async with PolestarApi(email=email,password=password) as api:
                car=await selected(api,vin)
                if car is None: raise HTTPException(404,"No such vehicle on account")
                battery=await asyncio.wait_for(car.get_battery(),timeout=30)
                exterior=await asyncio.wait_for(car.get_exterior(),timeout=30)
                availability=await asyncio.wait_for(car.get_availability(),timeout=30)
                return {
                    "vin":car.vin,
                    "battery_percent":getattr(battery,"charge_level",None),
                    "range_km":getattr(battery,"range_km",None),
                    "vehicle_online":str(getattr(availability,"status","unknown")),
                    "exterior_available":exterior is not None,
                    "lock_state":str(getattr(exterior,"central_lock_status","unknown"))
                }
        except HTTPException: raise
        except Exception as exc:
            raise HTTPException(502,"Failed to obtain vehicle status") from exc

@app.post("/api/command")
async def command(cmd: Command, authorization: str | None = Header(default=None)):
    email,password=auth(authorization)
    if cmd.action not in ("lock","unlock") or cmd.confirmed is not True or len(cmd.vin)!=17 or not cmd.vin.isalnum():
        raise HTTPException(400,"Valid vehicle, allowed action and confirmation required")
    if cmd.action=="unlock" and os.environ.get("POLESTAR_ENABLE_UNLOCK")!="1":
        raise HTTPException(403,"Unlock disabled on gateway")
    async with mutex:
        try:
            async with PolestarApi(email=email,password=password) as api:
                car=await selected(api,cmd.vin)
                if car is None:raise HTTPException(404,"Vehicle not present in account")
                response=await asyncio.wait_for(car.lock() if cmd.action=="lock" else car.unlock(),timeout=45)
                return {"accepted":True,"action":cmd.action,"response_type":type(response).__name__,
                        "note":"Command submitted. Check fresh vehicle state to verify."}
        except HTTPException: raise
        except Exception as exc:raise HTTPException(502,"Vehicle command failed or timed out") from exc
