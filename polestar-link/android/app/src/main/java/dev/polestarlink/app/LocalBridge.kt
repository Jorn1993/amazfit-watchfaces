package dev.polestarlink.app

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Optional watch bridge. Binds ONLY to 127.0.0.1:18764 on the owner's phone.
 * Never exposes C3 to the public internet. Pair code expires in 120 seconds.
 */
class LocalBridge(
    private val repository: PolestarRepository,
    private val secrets: SecretStore
) {
    private val running = AtomicBoolean(false)
    private var server: ServerSocket? = null
    private val random = SecureRandom()
    @Volatile private var code: String? = null
    @Volatile private var codeExpiry = 0L
    @Volatile private var failures = 0
    @Volatile var listening = false
        private set

    fun start() {
        if (!running.compareAndSet(false, true)) return
        Thread({
            try {
                ServerSocket(18764, 8, InetAddress.getByName("127.0.0.1")).use { bound ->
                    server = bound
                    listening = true
                    while (running.get()) {
                        val client = try { bound.accept() } catch (_: Exception) { break }
                        Thread({ handle(client) }, "polestar-local-request").start()
                    }
                }
            } catch (_: Exception) {
                // Port already bound or networking unavailable; no secret logging.
            } finally {
                listening = false
                running.set(false)
                server = null
            }
        }, "polestar-local-bridge").apply { isDaemon = true }.start()
    }
    fun stop() {
        running.set(false)
        server?.close()
        server = null
        listening = false
        code = null
    }
    fun newPairCode(): String {
        val next = (random.nextInt(900_000) + 100_000).toString()
        failures = 0
        code = next
        codeExpiry = System.currentTimeMillis() + 120_000
        return next
    }
    fun revoke() {
        secrets.put("pair_token", null)
        code = null
    }
    private fun newToken(): String {
        val bytes = ByteArray(32); random.nextBytes(bytes)
        return android.util.Base64.encodeToString(bytes,
            android.util.Base64.NO_WRAP or android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING)
    }
    private fun handle(socket: Socket) {
        socket.use { s ->
            try {
                s.soTimeout = 50_000
                val input = BufferedInputStream(s.getInputStream())
                fun line(): String {
                    val bytes = ByteArrayOutputStream()
                    while (bytes.size() < 4096) {
                        val byte = input.read()
                        if (byte == -1 || byte == 10) break
                        if (byte != 13) bytes.write(byte)
                    }
                    return bytes.toString("UTF-8")
                }
                val request = line().split(" ")
                if (request.size < 2) return@use
                val method = request[0]
                val path = request[1].substringBefore('?')
                val headers = mutableMapOf<String, String>()
                while (true) {
                    val item = line()
                    if (item.isBlank()) break
                    val i = item.indexOf(':')
                    if (i > 0) headers[item.substring(0, i).trim().lowercase()] =
                        item.substring(i + 1).trim()
                }
                val length = headers["content-length"]?.toIntOrNull() ?: 0
                if (length < 0 || length > 4096) { respond(s, 413, JSONObject()); return@use }
                val content = ByteArray(length)
                var read = 0
                while (read < length) {
                    val n = input.read(content, read, length - read)
                    if (n < 0) return@use
                    read += n
                }
                val body = try { JSONObject(String(content, Charsets.UTF_8)) }
                    catch (_: Exception) { JSONObject() }
                if (path == "/health" && method == "GET") {
                    respond(s, 200, JSONObject().put("ok", true)); return@use
                }
                if (path == "/pair" && method == "POST") {
                    val actual = code
                    if (actual == null || System.currentTimeMillis() > codeExpiry || failures >= 5) {
                        respond(s, 403, JSONObject().put("error", "pairing_closed")); return@use
                    }
                    if (body.optString("code") != actual) {
                        failures++
                        respond(s, 403, JSONObject().put("error", "wrong_code")); return@use
                    }
                    code = null
                    val token = newToken()
                    secrets.put("pair_token", token)
                    respond(s, 200, JSONObject().put("token", token))
                    return@use
                }
                val expected = secrets.get("pair_token")
                val supplied = headers["authorization"]?.removePrefix("Bearer ")
                if (expected.isNullOrBlank() || supplied.isNullOrBlank() ||
                    !java.security.MessageDigest.isEqual(
                        expected.toByteArray(), supplied.toByteArray()
                    )) {
                    respond(s, 401, JSONObject().put("error", "not_paired")); return@use
                }
                when (path) {
                    "/capabilities" -> {
                        val status = repository.status.value
                        respond(s, 200, JSONObject()
                            .put("ok", true).put("authenticated", true)
                            .put("vehicle_configured", repository.vin != null)
                            .put("native_verified", status != null &&
                                System.currentTimeMillis() - status.fetchedAt < 15 * 60_000))
                    }
                    "/status" -> {
                        try {
                            val state = runBlocking { repository.refresh() }
                            respond(s, 200, JSONObject().put("ok", true)
                                .put("battery_percent", state.battery)
                                .put("range_km", state.rangeKm)
                                .put("charging", state.charging)
                                .put("lock_state", state.lockState))
                        } catch (_: Exception) {
                            respond(s, 503, JSONObject().put("ok", false)
                                .put("error", "C3 status unavailable"))
                        }
                    }
                    "/command" -> {
                        if (method != "POST" || !body.optBoolean("confirmed", false)) {
                            respond(s, 400, JSONObject().put("error", "confirmation_required")); return@use
                        }
                        val action = body.optString("action")
                        if (action !in setOf("lock", "unlock", "trunk", "flash", "honk",
                            "honk_flash", "windows_open", "windows_close",
                            "climate_start", "climate_stop")) {
                            respond(s, 400, JSONObject().put("error", "invalid_action")); return@use
                        }
                        try {
                            val result = runBlocking { repository.command(action) }
                            respond(s, 200, JSONObject().put("ok", result.verified)
                                .put("acknowledged", result.acknowledged)
                                .put("verified", result.verified).put("error",
                                    if (result.verified) "" else result.text))
                        } catch (_: Exception) {
                            respond(s, 503, JSONObject().put("ok", false)
                                .put("error", "Command could not be verified"))
                        }
                    }
                    else -> respond(s, 404, JSONObject().put("error", "not_found"))
                }
            } catch (_: Exception) { /* client disconnected */ }
        }
    }
    private fun respond(socket: Socket, code: Int, data: JSONObject) {
        val body = data.toString().toByteArray(Charsets.UTF_8)
        val text = when (code) { 200 -> "OK"; 400 -> "Bad Request"; 401 -> "Unauthorized";
            403 -> "Forbidden"; 404 -> "Not Found"; else -> "Unavailable" }
        val head = "HTTP/1.1 $code $text\r\nContent-Type: application/json\r\n" +
            "Content-Length: ${body.size}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
        val out = socket.getOutputStream()
        out.write(head.toByteArray(Charsets.US_ASCII)); out.write(body); out.flush()
    }
}
