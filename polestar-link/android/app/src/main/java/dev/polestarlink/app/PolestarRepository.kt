package dev.polestarlink.app

import com.google.protobuf.CodedInputStream
import com.google.protobuf.CodedOutputStream
import com.google.protobuf.WireFormat
import io.grpc.CallOptions
import io.grpc.Channel
import io.grpc.ClientInterceptors
import io.grpc.ManagedChannel
import io.grpc.Metadata
import io.grpc.Status
import io.grpc.StatusRuntimeException
import io.grpc.MethodDescriptor
import io.grpc.okhttp.OkHttpChannelBuilder
import io.grpc.stub.ClientCalls
import io.grpc.stub.MetadataUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
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
    private val mutableDetails = MutableStateFlow<VehicleDetails?>(null)
    val details: StateFlow<VehicleDetails?> = mutableDetails
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
        mutableDetails.value = null
        mutableError.value = null
    }
    fun clear() {
        mutableDetails.value = null
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
    private fun unary(
        channel: Channel, name: String, payload: ByteArray, timeoutSeconds: Long = 18
    ): ByteArray = ClientCalls.blockingUnaryCall(
        channel, method(name),
        CallOptions.DEFAULT.withDeadlineAfter(timeoutSeconds, TimeUnit.SECONDS), payload
    )

    suspend fun refresh(): VehicleStatus = withContext(Dispatchers.IO) {
        try {
            val vin = vin ?: error("Set your vehicle VIN first")
            val token = auth.validToken()
            val host = discover(token)
            val (connection, channel) = connected(host, token, vin)
            try {
                val batteryResponse = unary(channel,
                    "/services.vehiclestates.battery.BatteryService/GetLatestBattery",
                    vehicleRequest(vin))
                val battery = decodeBattery(batteryResponse)
                val exterior = try {
                    parseC3Exterior(unary(channel,
                        "/services.vehiclestates.exterior.ExteriorService/GetLatestExterior",
                        vehicleRequest(vin)))
                } catch (_: Exception) { ExteriorDetails() }
                val state = VehicleStatus(battery.first, battery.second, battery.third, exterior.lockState)
                mutableDetails.value = VehicleDetails(
                    exterior = exterior, battery = parseC3Battery(batteryResponse)
                )
                mutableStatus.value = state
                mutableError.value = null
                state
            } finally { connection.shutdownNow() }
        } catch (e: Exception) {
            mutableStatus.value = null
            mutableDetails.value = null
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

    /** Optional extra C3 status reads do not block the basic dashboard. */
    suspend fun refreshDetails(): VehicleDetails = withContext(Dispatchers.IO) {
        val id = vin ?: error("Set your vehicle VIN first")
        val token = auth.validToken()
        val host = discover(token)
        val (connection, channel) = connected(host, token, id)
        val previous = mutableDetails.value ?: VehicleDetails()
        try {
            val exterior = try {
                parseC3Exterior(unary(channel,
                    "/services.vehiclestates.exterior.ExteriorService/GetLatestExterior",
                    vehicleRequest(id), 8))
            } catch (_: Exception) { previous.exterior }
            val climate = try {
                parseC3Climate(unary(channel,
                    "/services.vehiclestates.parkingclimatization.ParkingClimatizationService/GetLatestParkingClimatization",
                    vehicleRequest(id), 6))
            } catch (_: Exception) { ClimateDetails() }
            val odometer = try {
                val stream = ClientCalls.blockingServerStreamingCall(
                    channel, method(
                        "/services.vehiclestates.odometer.OdometerService/GetOdometer", true),
                    CallOptions.DEFAULT.withDeadlineAfter(5, TimeUnit.SECONDS),
                    packet { it.writeString(2, id) }
                )
                if (stream.hasNext()) parseC3Odometer(stream.next()) else null
            } catch (_: Exception) { null }
            val result = previous.copy(
                exterior = exterior, climate = climate, odometerKm = odometer,
                fetchedAt = System.currentTimeMillis()
            )
            mutableDetails.value = result
            mutableStatus.value?.let {
                mutableStatus.value = it.copy(lockState = exterior.lockState)
            }
            result
        } finally { connection.shutdownNow() }
    }

    /** Mobile GraphQL vehicle discovery, with guest-mode manual VIN fallback. */
    suspend fun findMyCars(): List<String> = withContext(Dispatchers.IO) {
        val token = auth.validToken()
        val query = """query GetVDMSCars {
            vdms { getVehiclesInformation {
                vin internalVehicleIdentifier registrationNo modelYear
                content { model { name } }
            } }
        }"""
        val body = JSONObject().put("operationName", "GetVDMSCars")
            .put("variables", JSONObject()).put("query", query)
            .put("extensions", JSONObject().put("clientLibrary",
                JSONObject().put("name", "apollo-kotlin").put("version", "4.4.1")))
        val request = Request.Builder().url(
                "https://pc-api.polestar.com/eu-north-1/app-backend/api/graphql"
            )
            .header("X-PolestarId-Authorization", "Bearer $token")
            .header("X-Polestar-Force-Update-Version", "5.11.0")
            .header("X-Polestar-Locale", "SE")
            .header("X-APOLLO-OPERATION-NAME", "GetVDMSCars")
            .header("X-APOLLO-REQUEST-UUID", UUID.randomUUID().toString())
            .header("User-Agent", "PolestarApp/5.11.0b1111 Android/14")
            .header("Accept", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext emptyList()
            val root = JSONObject(response.body?.string().orEmpty())
            val entries = root.optJSONObject("data")?.optJSONObject("vdms")
                ?.optJSONArray("getVehiclesInformation") ?: return@withContext emptyList()
            val cars = mutableListOf<String>()
            for (i in 0 until entries.length()) {
                val candidate = entries.optJSONObject(i)?.optString("vin").orEmpty().uppercase()
                if (Regex("^[A-HJ-NPR-Z0-9]{17}$").matches(candidate)) cars.add(candidate)
            }
            cars.distinct()
        }
    }

    /** Chronos charge-timer override from the Python C3 reference.
     * This is a one-shot actuation; no retry even when the server times out.
     */
    suspend fun chargeOverride(start: Boolean): CommandResult = withContext(Dispatchers.IO) {
        val latest = mutableStatus.value ?: error("Refresh live C3 status first")
        require(System.currentTimeMillis() - latest.fetchedAt < 15 * 60_000) {
            "Vehicle state too old. Refresh before changing charging."
        }
        val id = vin ?: error("Vehicle not configured")
        val host = discover(auth.validToken())
        val (connection, channel) = connected(host, auth.validToken(), id)
        try {
            val request = chronosEnvelope(id)
            val action = if (start) "StartOverrideChargeTimer" else "StopOverrideChargeTimer"
            val response = unary(
                channel, "/chronos.services.v1.ChargeNowService/$action", request, 18
            )
            val status = C3Message.read(response).child(3)?.integer(1)
            CommandResult(status == 1, false,
                "Polestar responded to charge override. " +
                "Charging state must be refreshed to verify the physical result.")
        } catch (e: Exception) {
            CommandResult(false, false,
                "Charging request could not be confirmed. Refresh before retrying.")
        } finally { connection.shutdownNow() }
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
            var terminal = 0
            var connectionTimedOut = false
            try {
                val iterator = ClientCalls.blockingServerStreamingCall(
                    channel, method("/invocation.InvocationService/${spec.first}", true),
                    // The previous 45-second wait produced DEADLINE_EXCEEDED on the
                    // real vehicle. A shorter bounded wait plus *read-only* status
                    // reconciliation avoids blindly repeating actuation.
                    CallOptions.DEFAULT.withDeadlineAfter(25, TimeUnit.SECONDS), input
                )
                while (iterator.hasNext()) {
                    terminal = decodeInvocation(iterator.next())
                    if (terminal == 6 || terminal in setOf(2, 5, 7, 8, 9, 10, 11, 12))
                        break
                }
            } catch (e: StatusRuntimeException) {
                if (e.status.code == Status.Code.DEADLINE_EXCEEDED ||
                    e.status.code == Status.Code.UNAVAILABLE) {
                    // The cloud may have received the command before the stream
                    // timed out. Never send it again automatically.
                    connectionTimedOut = true
                } else {
                    return@withContext CommandResult(false, false, safeError(e))
                }
            }
            if (action == "lock" || action == "unlock") {
                val target = desiredLockState(action) ?: "unknown"
                var observed = "unknown"
                // Read status only. Do not repeat a lock/unlock command on timeout.
                for (attempt in 0 until 2) {
                    try {
                        observed = parseC3Exterior(unary(channel,
                            "/services.vehiclestates.exterior.ExteriorService/GetLatestExterior",
                            vehicleRequest(id), 7)).lockState
                    } catch (_: Exception) { observed = "unknown" }
                    if (observed == target) {
                        mutableStatus.value = snapshot.copy(
                            lockState = observed, fetchedAt = System.currentTimeMillis()
                        )
                        mutableDetails.value = mutableDetails.value?.let {
                            it.copy(exterior = it.exterior.copy(lockState = observed))
                        }
                        return@withContext CommandResult(
                            terminal in setOf(1, 4, 6), true,
                            "Vehicle is ${target.uppercase()} · confirmed from C3."
                        )
                    }
                    if (attempt == 0) Thread.sleep(1200)
                }
                // No trustworthy current lock state: remove the actionable state
                // until an explicit read-only refresh succeeds.
                mutableStatus.value = snapshot.copy(lockState = "unknown")
                mutableDetails.value = mutableDetails.value?.let {
                    it.copy(exterior = it.exterior.copy(lockState = "unknown"))
                }
                return@withContext CommandResult(
                    terminal in setOf(1, 4, 6), false,
                    if (connectionTimedOut)
                        "Polestar response timed out. The command may have reached the car. " +
                        "Lock state is unverified—refresh before trying again."
                    else if (terminal == 6)
                        "Command acknowledged, but the actual lock state is not yet confirmed. Refresh."
                    else
                        "Lock change was not confirmed by C3. Refresh vehicle status before retrying."
                )
            }
            if (connectionTimedOut) {
                return@withContext CommandResult(
                    terminal in setOf(1, 4), false,
                    "Polestar response timed out. The action may have reached the car. " +
                    "Check the vehicle before trying again."
                )
            }
            if (terminal != 6) {
                return@withContext CommandResult(
                    terminal in setOf(1, 4), false,
                    "C3 did not confirm the action (status $terminal). Check the vehicle."
                )
            }
            return@withContext CommandResult(
                true, false, "Polestar acknowledged the command. " +
                    "The physical result is not independently confirmed."
            )
        } finally { connection.shutdownNow() }
    }

    companion object {
        fun chronosEnvelope(vin: String): ByteArray {
            val timezoneMinutes = java.util.TimeZone.getDefault().getOffset(
                System.currentTimeMillis()
            ) / 60_000
            val tz = packet { it.writeInt32(1, timezoneMinutes) }
            val id = packet {
                it.writeString(1, UUID.randomUUID().toString())
                it.writeString(2, vin)
                it.writeString(3, "RCS")
                it.writeByteArray(4, tz)
            }
            return packet { it.writeByteArray(1, id) }
        }
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
