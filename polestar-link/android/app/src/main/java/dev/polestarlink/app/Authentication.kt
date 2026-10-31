package dev.polestarlink.app

import android.app.Application
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val AUTH_BASE = "https://polestarid.eu.polestar.com"
private const val CLIENT_ID = "lp8dyrd_10"
private const val REDIRECT_URI = "polestar-explore://explore.polestar.com"
private const val SCOPE = "openid profile email customer:attributes customer:attributes:write"

/** Device-bound AES-GCM secret storage. Tokens, VIN, pairing material are never logged. */
class SecretStore(context: Context) {
    private val prefs = context.getSharedPreferences("polestar_secure", Context.MODE_PRIVATE)
    private val name = "polestar_link_aes_v1"
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(name, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(name,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build()
        )
        return gen.generateKey()
    }
    fun get(key: String): String? {
        return try {
            val stored = prefs.getString(key, null) ?: return null
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, 12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
        } catch (_: Exception) { null }
    }

    fun put(key: String, value: String?) {
        if (value == null) { prefs.edit().remove(key).apply(); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(key, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }
    fun clearLogin() {
        listOf("access", "refresh", "expires", "vin", "c3_host", "pair_token")
            .forEach { put(it, null) }
    }
}

data class AuthChallenge(val url: String, val state: String)

/** Real Polestar mobile OIDC/PKCE, with an in-app web login that can display email challenges. */
class PolestarAuthentication(private val secrets: SecretStore) {
    private val http = OkHttpClient.Builder().followRedirects(false).build()
    private val random = SecureRandom()
    private var verifier: String? = null
    private var challengeState: String? = null
    private var tokenEndpoint: String? = null

    fun isSignedIn(): Boolean = !secrets.get("access").isNullOrBlank()

    private fun randomUrlSafe(bytes: Int): String {
        val a = ByteArray(bytes); random.nextBytes(a)
        return Base64.encodeToString(a, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }
    private fun sha256(value: String): String = Base64.encodeToString(
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.US_ASCII)),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
    )
    private fun getDiscovery(): JSONObject {
        val req = Request.Builder().url("$AUTH_BASE/.well-known/openid-configuration").build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) error("Polestar login discovery HTTP ${r.code}")
            return JSONObject(r.body?.string() ?: error("Empty Polestar discovery"))
        }
    }
    suspend fun begin(): AuthChallenge = withContext(Dispatchers.IO) {
        val config = getDiscovery()
        val authUrl = config.getString("authorization_endpoint")
        val tokenUrl = config.getString("token_endpoint")
        require(authUrl.startsWith("$AUTH_BASE/") && tokenUrl.startsWith("$AUTH_BASE/")) {
            "Unexpected login server"
        }
        tokenEndpoint = tokenUrl
        verifier = randomUrlSafe(32)
        challengeState = randomUrlSafe(24)
        val link = authUrl.toHttpUrl().newBuilder()
            .addQueryParameter("response_type", "code")
            .addQueryParameter("client_id", CLIENT_ID)
            .addQueryParameter("redirect_uri", REDIRECT_URI)
            .addQueryParameter("scope", SCOPE)
            .addQueryParameter("state", challengeState!!)
            .addQueryParameter("code_challenge", sha256(verifier!!))
            .addQueryParameter("code_challenge_method", "S256")
            .addQueryParameter("response_mode", "query")
            .build()
        AuthChallenge(link.toString(), challengeState!!)
    }
    suspend fun finish(callback: String) = withContext(Dispatchers.IO) {
        require(callback.startsWith(REDIRECT_URI)) { "Unexpected login callback" }
        val uri = android.net.Uri.parse(callback)
        require(uri.getQueryParameter("state") == challengeState) { "Login state mismatch" }
        val code = uri.getQueryParameter("code") ?: error(
            uri.getQueryParameter("error_description") ?: "Authorization code missing"
        )
        val verifierValue = verifier ?: error("Login session expired")
        val endpoint = tokenEndpoint ?: error("Token endpoint missing")
        val data = FormBody.Builder().add("grant_type", "authorization_code")
            .add("client_id", CLIENT_ID).add("code", code)
            .add("redirect_uri", REDIRECT_URI).add("code_verifier", verifierValue).build()
        val response = http.newCall(Request.Builder().url(endpoint).post(data).build()).execute()
        response.use { r ->
            if (!r.isSuccessful) error("Polestar token exchange HTTP ${r.code}")
            saveTokens(JSONObject(r.body?.string() ?: error("Empty token response")))
        }
        verifier = null; challengeState = null; tokenEndpoint = null
    }
    private fun saveTokens(data: JSONObject) {
        secrets.put("access", data.getString("access_token"))
        if (data.has("refresh_token")) secrets.put("refresh", data.getString("refresh_token"))
        val expires = System.currentTimeMillis() + data.optLong("expires_in", 3600) * 1000 - 60_000
        secrets.put("expires", expires.toString())
    }
    suspend fun validToken(): String = withContext(Dispatchers.IO) {
        val token = secrets.get("access") ?: error("Please connect your Polestar ID")
        val expiry = secrets.get("expires")?.toLongOrNull() ?: 0L
        if (System.currentTimeMillis() < expiry) return@withContext token
        val refresh = secrets.get("refresh") ?: error("Your Polestar login expired. Sign in again.")
        val endpoint = getDiscovery().getString("token_endpoint")
        require(endpoint.startsWith("$AUTH_BASE/")) { "Invalid token server" }
        val form = FormBody.Builder().add("grant_type", "refresh_token")
            .add("refresh_token", refresh).add("client_id", CLIENT_ID).build()
        http.newCall(Request.Builder().url(endpoint).post(form).build()).execute().use { r ->
            if (!r.isSuccessful) error("Polestar session expired. Sign in again.")
            saveTokens(JSONObject(r.body?.string() ?: error("Empty token response")))
            secrets.get("access") ?: error("Token not returned")
        }
    }
    fun signOut() { secrets.clearLogin() }
}

/** Process-wide state allows the phone screen and the optional local bridge to share a client. */
class PolestarApplication : Application() {
    lateinit var secrets: SecretStore
        private set
    lateinit var auth: PolestarAuthentication
        private set
    lateinit var repository: PolestarRepository
        private set
    lateinit var bridge: LocalBridge
        private set
    override fun onCreate() {
        super.onCreate()
        secrets = SecretStore(this)
        auth = PolestarAuthentication(secrets)
        repository = PolestarRepository(auth, secrets)
        bridge = LocalBridge(repository, secrets)
    }
}
