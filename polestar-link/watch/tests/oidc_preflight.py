"""Non-authenticated OIDC capability probe; no credentials, cookies or tokens logged.
A best-effort diagnostic only; CI failure here must not mask local app test results.
"""
from __future__ import annotations
import json
import urllib.request
import urllib.error
import urllib.parse
import secrets
import base64
import hashlib

BASE="https://polestarid.eu.polestar.com"
OIDC=BASE+"/.well-known/openid-configuration"
CLIENTS=[
    ("polestar-mobile","lp8dyrd_10","polestar-explore://explore.polestar.com"),
    ("polestar-web","l3oopkc_10","https://www.polestar.com/sign-in-callback"),
    ("zepp-settings","lp8dyrd_10","http://zepp-os-staging.zepp.com/app-settings/v1.0.0/index.html?appId=1098347"),
]
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener=urllib.request.build_opener(NoRedirect())
def probe(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 Zepp OAuth compatibility probe","Accept":"text/html,application/json"})
    try:
        res=opener.open(req,timeout=15)
    except urllib.error.HTTPError as e:
        res=e
    except Exception as e:
        return {"network_error":type(e).__name__}
    try:
        data=res.read(256000).decode("utf-8","replace").lower()
    except Exception:
        data=""
    return {
        "status":res.status,
        "invalid_session":"invalid session" in data or "invalidsession" in data,
        "password_input":"pf.username" in data or "type=\"password\"" in data,
        "has_resume":"resume/as/authorization" in data or "resumepath=" in data,
        "redirect_scheme":urllib.parse.urlparse(res.headers.get("Location","")).scheme,
        # Never emit the Location URL because it may carry a session identifier.
    }

discovery=probe(OIDC)
try:
    req=urllib.request.Request(OIDC,headers={"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=15) as response:
        config=json.load(response)
    print("OIDC discovery:",{"ok":True,
        "device_authorization_endpoint":bool(config.get("device_authorization_endpoint")),
        "device_grant_supported":any("device_code" in g for g in config.get("grant_types_supported",[])),
        "authorization_host":urllib.parse.urlparse(config.get("authorization_endpoint","")).hostname,
        "token_host":urllib.parse.urlparse(config.get("token_endpoint","")).hostname,
        "grant_types":config.get("grant_types_supported",[])})
    authorize=config.get("authorization_endpoint") or BASE+"/as/authorization.oauth2"
except Exception as e:
    print("OIDC discovery:",{"ok":False,"reason":type(e).__name__,"http":discovery.get("status")})
    authorize=BASE+"/as/authorization.oauth2"

verifier=base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
for name,client,redirect in CLIENTS:
    query=urllib.parse.urlencode({
        "response_type":"code",
        "client_id":client,
        "redirect_uri":redirect,
        "scope":"openid profile email customer:attributes",
        "state":"test-state-not-valid",
        "code_challenge":challenge,
        "code_challenge_method":"S256",
    })
    result=probe(authorize+"?"+query)
    print("Authorization preflight",name,result)

# Check *client* support for the device grant, not just discovery metadata.
# Never print the user/device codes or approval URLs from the response.
for name,client,_ in CLIENTS[:2]:
    request=urllib.request.Request(
        BASE+"/as/device_authz.oauth2",
        data=urllib.parse.urlencode({
            "client_id":client,
            "scope":"openid profile email customer:attributes",
        }).encode(),
        headers={
            "Accept":"application/json",
            "Content-Type":"application/x-www-form-urlencoded",
            "User-Agent":"Polestar Link device-flow compatibility probe"
        },
        method="POST",
    )
    try:
        response=urllib.request.urlopen(request,timeout=15)
    except urllib.error.HTTPError as e:
        response=e
    except Exception as e:
        print("Device grant preflight",name,{"network_error":type(e).__name__})
        continue
    try:
        info=json.loads(response.read(32000))
    except Exception:
        info={}
    print("Device grant preflight",name,{
        "http":response.status,
        "supports_device_code":bool(info.get("device_code")),
        "supports_user_code":bool(info.get("user_code")),
        "verification_host":urllib.parse.urlparse(info.get("verification_uri","")).hostname,
        "error":str(info.get("error",""))[:80],
        # Do not print error_description; it may include request details.
    })
