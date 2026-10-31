package dev.polestarlink.app

import com.google.protobuf.CodedInputStream
import com.google.protobuf.CodedOutputStream
import com.google.protobuf.WireFormat
import io.grpc.CallOptions
import io.grpc.Channel
import io.grpc.ClientInterceptors
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.okhttp.OkHttpChannelBuilder
import io.grpc.stub.ClientCalls
import io.grpc.stub.MetadataUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.TimeUnit

data class VehicleStatus(
    val battery: Int,
    val rangeKm: Int,
    val charging: Boolean,
    val lockState: String,
    val fetchedAt: Long = System.currentTimeMillis()
)
data class CommandResult(val acknowledged: Boolean, val verified: Boolean, val text: String)

/** Reference: kildahldev/unofficial-polestar-api; native HTTP/2 gRPC, never Zepp Fetch. */
class PolestarRepository(
    private val auth: PolestarAuthentication,
    private val secrets: SecretStore
) {
    private val http = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
    private val mutableStatus = MutableStateFlow<VehicleStatus?>(null)
    private val mutableError = MutableStateFlow<String?>(null)
    val status: StateFlow<VehicleStatus?> = mutableStatus
    val error: StateFlow<String?> = mutableError
    val vin: String? get() = secrets.get("vin")

    fun setVin(input: String) {
        val clean = input.trim().uppercase()
        require(Regex("^[A-HJ-NPR-Z0-9]{17}$").matches(clean)) {
            "Enter a valid 17-character VIN"
        }
        secrets.put("vin", clean)
        mutableStatus.value = null
        mutableError.value = null
    }
    fun clear() {
        mutableStatus.value = null
        mutableError.value = null
        auth.signOut()
    }
    private fun discover(token: String): String {
        val request = Request.Builder().url("https://cnepmob.volvocars.com/")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/volvo.cloud.cnepmob.v1+json").build()
        val response = http.newCall(request).execute()
        response.use { r ->
            if (!r.isSuccessful) error("C3 discovery HTTP ${r.code}")
            val host = JSONObject(r.body?.string() ?: error("No C3 discovery data"))
                .getJSONObject("c3").getString("grpcHost")
            require(Regex("^[a-zA-Z0-9.-]+$").matches(host)) { "Invalid C3 hostname" }
            secrets.put("c3_host", host)
            return host
        }
    }
    private object RawMarshaller : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = ByteArrayInputStream(value)
        override fun parse(stream: InputStream): ByteArray = stream.readBytes()
    }
    private fun method(name: String, streaming: Boolean = false): MethodDescriptor<ByteArray, ByteArray> =
        MethodDescriptor.newBuilder<ByteArray, ByteArray>()
            .setType(if (streaming) MethodDescriptor.MethodType.SERVER_STREAMING
                else MethodDescriptor.MethodType.UNARY)
            .setFullMethodName(name.removePrefix("/"))
            .setRequestMarshaller(RawMarshaller).setResponseMarshaller(RawMarshaller).build()

    private fun connected(host: String, token: String, vin: String): Pair<ManagedChannel, Channel> {
        val ch = OkHttpChannelBuilder.forAddress(host, 443)
            .useTransportSecurity().userAgent("grpc-java-okhttp/1.68.2").build()
        val md = Metadata()
        md.put(Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER), "Bearer $token")
        md.put(Metadata.Key.of("vin", Metadata.ASCII_STRING_MARSHALLER), vin)
        return ch to ClientInterceptors.intercept(ch, MetadataUtils.newAttachHeadersInterceptor(md))
    }
    private fun unary(channel: Channel, name: String, payload: ByteArray): ByteArray =
        ClientCalls.blockingUnaryCall(channel, method(name),
            CallOptions.DEFAULT.withDeadlineAfter(18, TimeUnit.SECONDS), payload)

    suspend fun refresh(): VehicleStatus = withContext(Dispatchers.IO) {
        try {
            val vin = vin ?: error("Set your vehicle VIN first")
            val token = auth.validToken()
            val host = discover(token)
            val (connection, channel) = connected(host, token, vin)
            try {
                val battery = decodeBattery(unary(channel,
                    "/services.vehiclestates.battery.BatteryService/GetLatestBattery",
                    vehicleRequest(vin)))
                // Exterior is independent: never invent a lock state if unavailable.
                val exterior = try {
                    decodeExterior(unary(channel,
                        "/services.vehiclestates.exterior.ExteriorService/GetLatestExterior",
                        vehicleRequest(vin)))
                } catch (_: Exception) { "unknown" }
                val state = VehicleStatus(battery.first, battery.second, battery.third, exterior)
                mutableStatus.value = state
                mutableError.value = null
                state
            } finally { connection.shutdownNow() }
        } catch (e: Exception) {
            mutableStatus.value = null
            mutableError.value = safeError(e)
            throw IllegalStateException(safeError(e))
        }
    }
    private fun safeError(e: Exception): String {
        val msg = e.message.orEmpty()
        // Do not leak bearer tokens, vehicle identifiers or full URLs through UI.
        return when {
            msg.contains("UNAUTHENTICATED", true) -> "Polestar session expired. Sign in again."
            msg.contains("PERMISSION_DENIED", true) -> "Polestar account is not authorized for this car."
            msg.contains("UNAVAILABLE", true) -> "Polestar vehicle service unavailable. Retry later."
            msg.contains("DEADLINE_EXCEEDED", true) -> "Polestar cloud did not respond."
            msg.contains("VIN", true) -> "Please configure your vehicle VIN."
            else -> "Unable to read live C3 data. Check your connection."
        }
    }

    /** Command results are never marked successful without the terminal C3 status. */
    suspend fun command(action: String): CommandResult = withContext(Dispatchers.IO) {
        val snapshot = mutableStatus.value ?: error("Refresh real vehicle status before controls")
        require(System.currentTimeMillis() - snapshot.fetchedAt < 15 * 60_000) {
            "Vehicle status is stale. Refresh before sending a command."
        }
        val id = vin ?: error("No vehicle configured")
        val token = auth.validToken()
        val host = discover(token)
        val actions = mapOf(
            "lock" to Pair("Lock", 0),
            "unlock" to Pair("Unlock", 0),
            "trunk" to Pair("Unlock", 1),
            "flash" to Pair("HonkFlash", 2),
            "honk" to Pair("HonkFlash", 1),
            "honk_flash" to Pair("HonkFlash", 0),
            "windows_open" to Pair("WindowControl", 1),
            "windows_close" to Pair("WindowControl", 2),
            "climate_start" to Pair("ClimatizationStart", 0),
            "climate_stop" to Pair("ClimatizationStop", 0)
        )
        val spec = actions[action] ?: error("Unknown vehicle control")
        val (connection, channel) = connected(host, token, id)
        try {
            val input = invocationRequest(id, action, spec.second)
            val iterator = ClientCalls.blockingServerStreamingCall(
                channel, method("/invocation.InvocationService/${spec.first}", true),
                CallOptions.DEFAULT.withDeadlineAfter(45, TimeUnit.SECONDS), input
            )
            var terminal = 0
            while (iterator.hasNext()) {
                terminal = decodeInvocation(iterator.next())
                if (terminal == 6) break
                if (terminal in setOf(2, 5, 7, 8, 9, 10, 11, 12))
                    break
            }
            if (terminal != 6) {
                return@withContext CommandResult(false, false,
                    "C3 did not confirm the command (status $terminal)")
            }
            if (action == "lock" || action == "unlock") {
                val after = try {
                    decodeExterior(unary(channel,
                        "/services.vehiclestates.exterior.ExteriorService/GetLatestExterior",
                        vehicleRequest(id)))
                } catch (_: Exception) { "unknown" }
                val verified = after == if (action == "lock") "locked" else "unlocked"
                mutableStatus.value = snapshot.copy(lockState = after, fetchedAt = System.currentTimeMillis())
                return@withContext CommandResult(true, verified, if (verified)
                    "Vehicle lock state verified" else
                    "Polestar acknowledged the command; lock state not yet confirmed")
            }
            return@withContext CommandResult(true, false,
                "Command acknowledged by C3. Physical result not independently confirmed.")
        } finally { connection.shutdownNow() }
    }

    companion object {
        private fun packet(block: (CodedOutputStream) -> Unit): ByteArray {
            val output = ByteArrayOutputStream()
            val coded = CodedOutputStream.newInstance(output)
            block(coded); coded.flush(); return output.toByteArray()
        }
        fun vehicleRequest(vin: String): ByteArray = packet {
            it.writeString(1, UUID.randomUUID().toString()); it.writeString(2, vin)
        }
        fun invocationRequest(vin: String, action: String, enum: Int): ByteArray {
            val nested = packet { it.writeString(1, vin) }
            return packet {
                it.writeByteArray(1, nested)
                if (action == "climate_start") it.writeBool(2, true)
                else if (enum != 0) it.writeEnum(2, enum)
            }
        }
        private data class Value(val number: Double? = null, val bytes: ByteArray? = null)
        private fun fields(data: ByteArray): Map<Int, Value> {
            val input = CodedInputStream.newInstance(data)
            val result = mutableMapOf<Int, Value>()
            while (!input.isAtEnd) {
                val tag = input.readTag()
                if (tag == 0) break
                val id = WireFormat.getTagFieldNumber(tag)
                val value = when (WireFormat.getTagWireType(tag)) {
                    WireFormat.WIRETYPE_VARINT -> Value(number = input.readInt64().toDouble())
                    WireFormat.WIRETYPE_FIXED64 -> Value(number = java.lang.Double.longBitsToDouble(input.readFixed64()))
                    WireFormat.WIRETYPE_LENGTH_DELIMITED -> Value(bytes = input.readByteArray())
                    WireFormat.WIRETYPE_FIXED32 -> Value(number = java.lang.Float.intBitsToFloat(input.readFixed32()).toDouble())
                    else -> error("Unexpected C3 protobuf wire type")
                }
                result[id] = value
            }
            return result
        }
        private fun nested(data: ByteArray, number: Int): Map<Int, Value> =
            fields(fields(data)[number]?.bytes ?: error("Missing C3 payload"))
        fun decodeBattery(data: ByteArray): Triple<Int, Int, Boolean> {
            val b = nested(data, 3)
            val charge = b[2]?.number ?: error("Battery level missing")
            val range = b[4]?.number ?: error("Range missing")
            require(charge.isFinite() && charge in 0.0..100.0 &&
                range.isFinite() && range in 0.0..2000.0) { "Invalid live battery data" }
            return Triple(charge.toInt(), range.toInt(), b[7]?.number == 1.0)
        }
        fun decodeExterior(data: ByteArray): String {
            val ext = nested(data, 3)
            val flat = ext[2]
            val code = flat?.number ?: flat?.bytes?.let { fields(it)[1]?.number }
            return when (code?.toInt()) { 2 -> "locked"; 1 -> "unlocked"; else -> "unknown" }
        }
        fun decodeInvocation(data: ByteArray): Int =
            nested(data, 1)[3]?.number?.toInt() ?: 0
    }
}
