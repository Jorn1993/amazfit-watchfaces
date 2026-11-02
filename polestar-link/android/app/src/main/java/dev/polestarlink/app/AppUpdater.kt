package dev.polestarlink.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class AppUpdate(
    val versionCode: Long,
    val versionName: String,
    val downloadUrl: String,
    val sha256: String
)

/**
 * Owner-initiated Android updater for the project's signed APKs. The remote
 * GitHub JSON cannot authorize arbitrary APKs: package name, version, pinned
 * signing certificate and SHA256 are checked before Android's installer opens.
 */
class AppUpdater(private val context: Context) {
    companion object {
        const val SIGNER_SHA256 =
            "81923ecae0f2f7cf847b51dd84cf7f6564f99d43224663ff4442677523801db0"
        const val MANIFEST_URL =
            "https://raw.githubusercontent.com/Jorn1993/amazfit-watchfaces/feature/polestar-link/polestar-link/public/latest-android.json"
        private const val RELEASE_PREFIX =
            "https://raw.githubusercontent.com/Jorn1993/amazfit-watchfaces/feature/polestar-link/polestar-link/public/"
        private val versionPattern = Regex("[0-9]+\\.[0-9]+\\.[0-9]+")
        private val shaPattern = Regex("[0-9a-f]{64}")
        private const val MAX_APK_BYTES = 120L * 1024 * 1024
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(65, TimeUnit.SECONDS)
        .followRedirects(false)
        .build()

    @Suppress("DEPRECATION")
    fun currentVersionCode(): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    }

    @Suppress("DEPRECATION")
    fun currentVersionName(): String =
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "Unknown"

    fun isNewer(update: AppUpdate): Boolean = update.versionCode > currentVersionCode()

    suspend fun check(): AppUpdate? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(MANIFEST_URL + "?ts=" + System.currentTimeMillis())
            .header("Cache-Control", "no-cache").build()
        client.newCall(request).execute().use { response ->
            if (response.code != 200) error("Cannot check for updates (HTTP ${response.code})")
            val raw = response.body?.string() ?: error("Empty update information")
            require(raw.length < 16_384) { "Invalid update information" }
            val data = JSONObject(raw)
            val version = data.getString("versionName")
            val code = data.getLong("versionCode")
            val url = data.getString("apkUrl")
            val hash = data.getString("sha256").lowercase()
            require(versionPattern.matches(version) && code in 1..999999 &&
                url == RELEASE_PREFIX + "polestar-link-android-v$version-debug.apk" &&
                shaPattern.matches(hash)) { "Untrusted update information" }
            AppUpdate(code, version, url, hash).takeIf { isNewer(it) }
        }
    }

    /** Save under private cache. Never store the APK in external storage. */
    suspend fun download(update: AppUpdate): File = withContext(Dispatchers.IO) {
        require(isNewer(update)) { "You already have this version" }
        require(versionPattern.matches(update.versionName) &&
            update.downloadUrl == RELEASE_PREFIX +
            "polestar-link-android-v${update.versionName}-debug.apk" &&
            shaPattern.matches(update.sha256)) { "Untrusted APK URL" }
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        val temporary = File(directory, "incoming.apk.part")
        val verifiedFile = File(directory, "polestar-update.apk")
        temporary.delete()
        verifiedFile.delete()
        try {
            val request = Request.Builder().url(update.downloadUrl).build()
            client.newCall(request).execute().use { response ->
                require(response.code == 200) { "APK download failed (HTTP ${response.code})" }
                if (response.body?.contentLength()?.let { it > MAX_APK_BYTES } == true)
                    error("APK exceeds maximum download size")
                val input = response.body?.byteStream() ?: error("Empty APK response")
                val checksum = MessageDigest.getInstance("SHA-256")
                var size = 0L
                temporary.outputStream().buffered().use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        size += count
                        require(size <= MAX_APK_BYTES) { "APK too large" }
                        checksum.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                    }
                }
                require(size > 100_000) { "Incomplete APK download" }
                val actual = checksum.digest().joinToString("") { "%02x".format(it) }
                require(actual.equals(update.sha256, ignoreCase = true)) {
                    "APK checksum does not match the published release"
                }
            }
            verifyPackage(temporary, update.versionCode)
            require(temporary.renameTo(verifiedFile)) { "Could not prepare APK installer" }
            verifiedFile
        } catch (e: Exception) {
            temporary.delete()
            verifiedFile.delete()
            throw e
        }
    }

    @Suppress("DEPRECATION")
    private fun verifyPackage(apk: File, expectedVersionCode: Long) {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28)
            PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val info = pm.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: error("Invalid downloaded APK")
        require(info.packageName == context.packageName) { "APK package does not match Polestar Link" }
        val foundCode = if (Build.VERSION.SDK_INT >= 28)
            info.longVersionCode else info.versionCode.toLong()
        require(foundCode == expectedVersionCode && foundCode > currentVersionCode()) {
            "APK version is not newer than the installed version"
        }
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            val signing = info.signingInfo ?: error("APK signing information unavailable")
            signing.apkContentsSigners
        } else info.signatures
        require(signatures != null && signatures.size == 1) {
            "APK must have one valid signing certificate"
        }
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(signatures[0].toByteArray())
            .joinToString("") { "%02x".format(it) }
        require(digest == SIGNER_SHA256) { "APK signature does not match trusted Polestar Link key" }
    }

    fun startInstaller(apk: File): Boolean {
        require(apk.exists() && apk.parentFile?.name == "updates") { "APK missing" }
        if (Build.VERSION.SDK_INT >= 26 &&
            !context.packageManager.canRequestPackageInstalls()) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return false // user enables permission, then taps Install again
        }
        val uri = FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return true // opens Android's approval screen; not silent installation
    }
}
