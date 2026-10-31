package dev.polestarlink.app

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.ElectricCar
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Window
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

private val Night = Color(0xFF0B0D0E)
private val Surface = Color(0xFF191D1E)
private val SurfaceLight = Color(0xFF24292A)
private val Ivory = Color(0xFFF4F5F1)
private val Muted = Color(0xFF9DA6A3)
private val Mint = Color(0xFFB5DCCC)
private val ErrorTone = Color(0xFFEAABA5)
private val UnlockedAccent = Color(0xFFFFC77D)
private val UnlockedSurface = Color(0xFF362A21)
private val LockedSurface = Color(0xFF20302C)
private val ActiveTile = Color(0xFF365E50)
private val ActiveForeground = Color(0xFFDDF8E9)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(11, 13, 14)
        window.navigationBarColor = android.graphics.Color.rgb(11, 13, 14)
        setContent {
            val app = application as PolestarApplication
            MaterialTheme(colorScheme = darkColorScheme(
                background = Night, surface = Surface, primary = Mint,
                onPrimary = Night, onSurface = Ivory, onBackground = Ivory,
                error = ErrorTone
            )) {
                CompanionScreen(app, onEnableBridge = {
                    ContextCompat.startForegroundService(this,
                        Intent(this, BridgeService::class.java))
                }, onStopBridge = {
                    stopService(Intent(this, BridgeService::class.java))
                })
            }
        }
    }
}

private data class ActionItem(val key: String, val name: String, val icon: ImageVector,
    val summary: String)
private val mainActions = listOf(
    ActionItem("trunk", "Trunk", Icons.Filled.DirectionsCar, "Release the trunk"),
    ActionItem("flash", "Flash lights", Icons.Filled.FlashOn, "Locate your car")
)
private val extraActions = listOf(
    ActionItem("climate_start", "Start climate", Icons.Filled.Thermostat, "Precondition the cabin"),
    ActionItem("climate_stop", "Stop climate", Icons.Filled.Thermostat, "End preconditioning"),
    ActionItem("honk", "Honk", Icons.Filled.Bluetooth, "Sound the horn"),
    ActionItem("honk_flash", "Honk + flash", Icons.Filled.FlashOn, "Horn and lights"),
    ActionItem("windows_open", "Open windows", Icons.Filled.MoreHoriz, "Open all windows"),
    ActionItem("windows_close", "Close windows", Icons.Filled.Lock, "Close all windows")
)

@Composable
private fun CompanionScreen(
    app: PolestarApplication, onEnableBridge: () -> Unit, onStopBridge: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val state by app.repository.status.collectAsState()
    val repoError by app.repository.error.collectAsState()
    val details by app.repository.details.collectAsState()
    var signedIn by remember { mutableStateOf(app.auth.isSignedIn()) }
    val pager = rememberPagerState(initialPage = 0, pageCount = { 4 })
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var url by remember { mutableStateOf<String?>(null) }
    var confirming by remember { mutableStateOf<ActionItem?>(null) }
    var vinInput by remember { mutableStateOf(app.repository.vin.orEmpty()) }
    var pairingCode by remember { mutableStateOf<String?>(null) }
    var discovering by remember { mutableStateOf(false) }
    var discoveredCars by remember { mutableStateOf<List<String>>(emptyList()) }
    var vehicleLookupMessage by remember { mutableStateOf<String?>(null) }
    var checkingVehicle by remember { mutableStateOf(false) }

    fun findCars() {
        if (discovering || !signedIn) return
        scope.launch {
            discovering = true
            vehicleLookupMessage = null
            try {
                discoveredCars = app.repository.findMyCars()
                if (discoveredCars.size == 1) {
                    app.repository.setVin(discoveredCars.single())
                    vinInput = discoveredCars.single()
                    checkingVehicle = true
                    try {
                        app.repository.refresh()
                        vehicleLookupMessage = "Polestar 4 verified through C3."
                    } catch (e: Exception) {
                        vehicleLookupMessage = "Vehicle found, but C3 verification was not successful."
                    } finally { checkingVehicle = false }
                } else if (discoveredCars.isEmpty()) {
                    vehicleLookupMessage = "No cars are listed for this Polestar ID. Guest and secondary accounts can use the VIN from the official Polestar app."
                } else {
                    vehicleLookupMessage = "Choose one of the cars linked to your Polestar ID."
                }
            } catch (e: Exception) {
                vehicleLookupMessage = "Automatic vehicle discovery unavailable. You can enter the VIN manually."
            } finally { discovering = false }
        }
    }

    fun navigate(page: Int) {
        scope.launch { pager.animateScrollToPage(page.coerceIn(0, 3)) }
    }
    fun refresh() {
        if (busy || !signedIn || app.repository.vin == null) return
        scope.launch {
            busy = true
            try {
                app.repository.refresh()
                message = null
                // Optional detailed C3 reads update window and climate toggle
                // cards without delaying the basic battery/range dashboard.
                scope.launch {
                    try { app.repository.refreshDetails() }
                    catch (_: Exception) { /* optional service unavailable */ }
                }
            }
            catch (e: Exception) { message = e.message }
            finally { busy = false }
        }
    }
    LaunchedEffect(signedIn) {
        if (signedIn && app.repository.vin == null) findCars()
    }
    LaunchedEffect(pager.currentPage, signedIn, state?.fetchedAt) {
        if (signedIn && pager.currentPage == 1 && state != null && details?.odometerKm == null) {
            try { app.repository.refreshDetails() } catch (_: Exception) { }
        }
    }
    LaunchedEffect(signedIn, app.repository.vin) {
        if (signedIn && app.repository.vin != null && state == null) refresh()
    }
    if (url != null) {
        LoginWebView(url!!, onCancel = { url = null }, onCallback = { callback ->
            url = null
            scope.launch {
                busy = true
                try {
                    app.auth.finish(callback)
                    signedIn = true
                    pager.scrollToPage(0)
                    message = "Polestar ID connected."
                    if (app.repository.vin != null) app.repository.refresh()
                } catch (e: Exception) {
                    message = "Polestar sign-in could not be completed."
                } finally { busy = false }
            }
        })
        return
    }
    if (confirming != null) {
        val action = confirming!!
        AlertDialog(
            onDismissRequest = { confirming = null },
            icon = { Icon(action.icon, null, tint = Mint) },
            title = { Text(action.name, color = Ivory) },
            text = { Text(
                "Send ${action.name.lowercase()} to your Polestar 4?\n\n" +
                "If the connection times out, check the car's actual state before trying again.",
                color = Muted
            ) },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    confirming = null
                    if (!busy) scope.launch {
                        busy = true
                        try {
                            val result = if (action.key == "charge_start" ||
                                action.key == "charge_stop") {
                                app.repository.chargeOverride(action.key == "charge_start")
                            } else app.repository.command(action.key)
                            message = result.text
                        } catch (e: Exception) {
                            message = "Command outcome could not be verified. Refresh car status before retrying."
                        } finally { busy = false }
                    }
                }) { Text("CONFIRM", color = Mint, fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = null }) { Text("CANCEL", color = Muted) }
            },
            containerColor = SurfaceLight, titleContentColor = Ivory
        )
    }
    Scaffold(
        containerColor = Night,
        bottomBar = {
            if (signedIn) {
                NavigationBar(containerColor = Night, tonalElevation = 0.dp) {
                    listOf(
                        Triple("Home", Icons.Filled.Home, 0),
                        Triple("Status", Icons.Filled.Info, 1),
                        Triple("Controls", Icons.Filled.Key, 2),
                        Triple("Settings", Icons.Filled.Settings, 3)
                    ).forEach { (name, icon, index) ->
                        NavigationBarItem(
                            selected = pager.currentPage == index,
                            onClick = { navigate(index) },
                            icon = { Icon(icon, contentDescription = name) },
                            label = { Text(name, fontSize = 11.sp) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Mint, selectedTextColor = Ivory,
                                indicatorColor = SurfaceLight,
                                unselectedIconColor = Muted, unselectedTextColor = Muted
                            )
                        )
                    }
                }
            }
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().padding(horizontal = 22.dp)) {
                BrandHeader(
                    statusText = when {
                        !signedIn -> "NOT CONNECTED"
                        state != null -> "C3 CONNECTED"
                        else -> "C3 OFFLINE"
                    },
                    live = state != null,
                    onRefresh = { refresh() }
                )
            }
            if (busy) {
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().height(2.dp),
                    color = Mint, trackColor = SurfaceLight
                )
            }
            if (signedIn && app.repository.vin == null) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                        .padding(horizontal = 22.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    Spacer(Modifier.height(24.dp))
                    CarSetupScreen(
                        busy = discovering || checkingVehicle || busy,
                        cars = discoveredCars,
                        message = vehicleLookupMessage,
                        vinInput = vinInput,
                        onVinChange = { vinInput = it },
                        onFind = { findCars() },
                        onChoose = { chosen ->
                            scope.launch {
                                checkingVehicle = true
                                try {
                                    app.repository.setVin(chosen)
                                    vinInput = chosen
                                    app.repository.refresh()
                                    message = "Polestar 4 verified through C3."
                                } catch (e: Exception) {
                                    message = "Vehicle saved, but C3 verification failed. Try refreshing."
                                } finally { checkingVehicle = false }
                            }
                        }
                    )
                    if (!message.isNullOrBlank()) NoticeCard(message!!)
                }
            } else if (signedIn) {
                // Pager consumes horizontal swipes; each page scrolls vertically.
                // Bottom navigation and swipe state always remain synchronized.
                HorizontalPager(
                    state = pager,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    beyondViewportPageCount = 1
                ) { page ->
                    Column(
                        modifier = Modifier.fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 22.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp)
                    ) {
                        Spacer(Modifier.height(10.dp))
                        when (page) {
                            0 -> HomeScreen(
                                state, details, app.repository.vin, busy,
                                onRefresh = { refresh() },
                                onControl = { if (!busy) confirming = it },
                                onSettings = { navigate(2) }
                            )
                            1 -> DetailedStatusScreen(
                                state, details, busy,
                                onRefresh = {
                                    scope.launch {
                                        busy = true
                                        try {
                                            app.repository.refresh()
                                            app.repository.refreshDetails()
                                            message = null
                                        } catch (e: Exception) {
                                            message = "C3 detail refresh incomplete."
                                        } finally { busy = false }
                                    }
                                }
                            )
                            2 -> ControlsScreen(state, details, busy,
                                onControl = { if (!busy) confirming = it })
                            3 -> SettingsScreen(
                                vinInput = vinInput, onVinChange = { vinInput = it },
                                onSaveVin = {
                                    try {
                                        app.repository.setVin(vinInput)
                                        message = "VIN saved. Checking live C3 data…"
                                        refresh()
                                    } catch (e: Exception) { message = e.message }
                                },
                                pairCode = pairingCode,
                                onPair = {
                                    onEnableBridge()
                                    pairingCode = app.bridge.newPairCode()
                                },
                                onStopBridge = {
                                    onStopBridge()
                                    app.bridge.revoke()
                                    pairingCode = null
                                },
                                onSignOut = {
                                    onStopBridge()
                                    app.bridge.revoke()
                                    app.repository.clear()
                                    signedIn = false
                                    navigate(0)
                                    message = null
                                }
                            )
                        }
                        val notice = message ?: repoError
                        if (!notice.isNullOrBlank()) NoticeCard(notice)
                        Spacer(Modifier.height(26.dp))
                    }
                }
            } else {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                        .padding(horizontal = 22.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    Spacer(Modifier.height(18.dp))
                    IntroScreen(busy) {
                        scope.launch {
                            busy = true
                            try { url = app.auth.begin().url; message = null }
                            catch (e: Exception) {
                                message = "Unable to open Polestar sign-in"
                            } finally { busy = false }
                        }
                    }
                    val notice = message ?: repoError
                    if (!notice.isNullOrBlank()) NoticeCard(notice)
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun NoticeCard(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(SurfaceLight).padding(15.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(Icons.Filled.WarningAmber, null, tint = Mint)
        Text(text, color = Ivory, fontSize = 13.sp, lineHeight = 19.sp)
    }
}

@Composable
private fun BrandHeader(statusText: String, live: Boolean, onRefresh: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(R.drawable.polestar_mark), "Polestar symbol",
            modifier = Modifier.size(34.dp), tint = Ivory)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text("P O L E S T A R", fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp, color = Ivory)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).background(if (live) Mint else Muted, CircleShape))
                Spacer(Modifier.width(7.dp))
                Text(statusText, fontSize = 10.sp, letterSpacing = 1.sp, color = Muted)
            }
        }
        IconButton(onClick = onRefresh, modifier = Modifier
            .background(SurfaceLight, CircleShape).size(40.dp)) {
            Icon(Icons.Filled.Refresh, "Refresh live status", tint = Ivory)
        }
    }
}

@Composable
private fun IntroScreen(busy: Boolean, onLogin: () -> Unit) {
    Spacer(Modifier.height(36.dp))
    Text("Your Polestar,\nwithin reach.", fontSize = 41.sp,
        color = Ivory, fontWeight = FontWeight.Light, lineHeight = 48.sp)
    Text("A personal companion for your Polestar 4. Live vehicle information and remote controls, powered by the native Polestar C3 connection.",
        color = Muted, lineHeight = 23.sp, fontSize = 15.sp)
    CarArtwork()
    SolidButton("CONNECT POLESTAR ID", !busy, onLogin)
    Text("Sign in through Polestar's own account page, including email verification when requested. No credentials are sent to a third-party server.",
        color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
}

@Composable
private fun CarArtwork() {
    // Real model photograph; no third-party relay and no personal VIN sent.
    Box(
        Modifier.fillMaxWidth().height(194.dp)
            .clip(RoundedCornerShape(25.dp)).background(SurfaceLight),
        contentAlignment = Alignment.Center
    ) {
        AsyncImage(
            model = "https://tvk.nl/app/uploads/sites/4/2025/10/Polestar-230908-3535_MY26_AeroWheel_v02.jpg",
            contentDescription = "Polestar 4 exterior side profile",
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize()
        )
    }
}

@Composable
private fun HomeScreen(
    status: VehicleStatus?, details: VehicleDetails?, vin: String?, busy: Boolean,
    onRefresh: () -> Unit, onControl: (ActionItem) -> Unit,
    onSettings: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Polestar 4", fontSize = 34.sp, fontWeight = FontWeight.Light, color = Ivory)
        Text(if (vin == null) "Vehicle not configured"
            else "CONNECTED ACCOUNT  ·  VIN ENDING ${vin.takeLast(4)}",
            fontSize = 11.sp, letterSpacing = .8.sp, color = Muted)
    }
    CarArtwork()
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
            .background(Surface).padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(15.dp)
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("BATTERY", letterSpacing = 2.sp, fontSize = 11.sp, color = Muted)
                Text(status?.battery?.let { "$it%" } ?: "—",
                    fontSize = 49.sp, fontWeight = FontWeight.Light, color = Ivory)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("RANGE", letterSpacing = 2.sp, fontSize = 11.sp, color = Muted)
                Text(status?.rangeKm?.let { "$it km" } ?: "—",
                    fontSize = 26.sp, fontWeight = FontWeight.Medium, color = Ivory)
            }
        }
        LinearProgressIndicator(
            progress = { (status?.battery ?: 0).toFloat() / 100f },
            modifier = Modifier.fillMaxWidth().height(5.dp).clip(CircleShape),
            color = Mint, trackColor = SurfaceLight
        )
        Text(if (status == null) "Live data unavailable · tap refresh"
            else "Updated from Polestar C3",
            color = Muted, fontSize = 12.sp)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        InfoTile("CHARGING", status?.let { if (it.charging) "CHARGING" else "NOT CHARGING" }
            ?: "UNKNOWN", Icons.Filled.ElectricCar, Modifier.weight(1f))
        InfoTile("C3 STATUS", if (status != null) "CONNECTED" else "OFFLINE",
            Icons.Filled.Check, Modifier.weight(1f))
    }
    SectionHeader("Quick actions", if (status == null) "REQUIRES LIVE C3" else "READY")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallToggleCard("Lock", status?.lockState, "unlocked",
            "lock", "unlock", Icons.Filled.Lock,
            status != null && !busy, Modifier.weight(1f), onControl)
        SmallToggleCard("Windows", details?.exterior?.windowState, "open",
            "windows_close", "windows_open", Icons.Filled.Window,
            status != null && !busy, Modifier.weight(1f), onControl)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallToggleCard("Climate", details?.climate?.state, "active",
            "climate_stop", "climate_start", Icons.Filled.Thermostat,
            status != null && !busy, Modifier.weight(1f), onControl)
        mainActions.take(1).forEach {
            ActionTile(it, status != null && !busy, Modifier.weight(1f)) { onControl(it) }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallToggleCard("Charge now", details?.battery?.chargingState, "charging",
            "charge_stop", "charge_start", Icons.Filled.ElectricCar,
            status != null && !busy, Modifier.weight(1f), onControl)
        mainActions.drop(1).forEach {
            ActionTile(it, status != null && !busy, Modifier.weight(1f)) { onControl(it) }
        }
    }
    if (vin == null) SolidButton("ADD YOUR VEHICLE VIN", true, onSettings)
    else OutlinedButton(
        onClick = onRefresh, enabled = !busy, modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(15.dp)
    ) { Icon(Icons.Filled.Refresh, null); Spacer(Modifier.width(9.dp)); Text("REFRESH VEHICLE") }
}

@Composable
private fun SectionHeader(name: String, trailing: String = "") {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(name, fontSize = 22.sp, fontWeight = FontWeight.Medium,
            color = Ivory, modifier = Modifier.weight(1f))
        if (trailing.isNotBlank()) Text(trailing, fontSize = 10.sp,
            letterSpacing = 1.sp, color = Muted)
    }
}

@Composable
private fun InfoTile(title: String, value: String, icon: ImageVector, modifier: Modifier) {
    Row(modifier.clip(RoundedCornerShape(18.dp)).background(Surface)
        .padding(vertical = 19.dp, horizontal = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = Mint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(9.dp))
        Column {
            Text(title, fontSize = 9.sp, letterSpacing = .9.sp, color = Muted)
            Spacer(Modifier.height(7.dp))
            Text(value, color = Ivory, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun ActionTile(
    action: ActionItem, enabled: Boolean, modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Column(modifier.clip(RoundedCornerShape(19.dp))
        .background(if (enabled) SurfaceLight else Surface)
        .clickable(enabled = enabled, onClick = onClick)
        .padding(18.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Icon(action.icon, null, modifier = Modifier.size(26.dp),
            tint = if (enabled) Mint else Muted)
        Column {
            Text(action.name, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                color = if (enabled) Ivory else Muted)
            Text(action.summary, fontSize = 11.sp, color = Muted,
                lineHeight = 16.sp)
        }
    }
}

@Composable
private fun ControlsScreen(
    status: VehicleStatus?, details: VehicleDetails?, busy: Boolean,
    onControl: (ActionItem) -> Unit
) {
    SectionHeader("Vehicle controls", if (status != null) "C3 LIVE" else "OFFLINE")
    Text("Active states are highlighted. Confirm each remote action before sending.",
        color = Muted, fontSize = 13.sp, lineHeight = 19.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallToggleCard("Lock", status?.lockState, "unlocked",
            "lock", "unlock", Icons.Filled.Lock,
            status != null && !busy, Modifier.weight(1f), onControl)
        SmallToggleCard("Windows", details?.exterior?.windowState, "open",
            "windows_close", "windows_open", Icons.Filled.Window,
            status != null && !busy, Modifier.weight(1f), onControl)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallToggleCard("Climate", details?.climate?.state, "active",
            "climate_stop", "climate_start", Icons.Filled.Thermostat,
            status != null && !busy, Modifier.weight(1f), onControl)
        ActionTile(mainActions.first(), status != null && !busy,
            Modifier.weight(1f)) { onControl(mainActions.first()) }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallToggleCard("Charge now", details?.battery?.chargingState, "charging",
            "charge_stop", "charge_start", Icons.Filled.ElectricCar,
            status != null && !busy, Modifier.weight(1f), onControl)
        ActionTile(mainActions.last(), status != null && !busy, Modifier.weight(1f)) {
            onControl(mainActions.last())
        }
    }
    val rest = extraActions.filter { it.key !in setOf(
            "climate_start", "climate_stop", "windows_open", "windows_close"
        ) }
    rest.chunked(2).forEach { pair ->
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            pair.forEach { action ->
                ActionTile(action, status != null && !busy, Modifier.weight(1f)) {
                    onControl(action)
                }
            }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
    Text("Always verify the car's actual state before retrying a remote action.",
        color = Muted, fontSize = 12.sp, lineHeight = 18.sp)
}

@Composable
private fun SmallToggleCard(
    title: String, state: String?, activeState: String,
    turnOff: String, turnOn: String,
    icon: ImageVector, available: Boolean, modifier: Modifier = Modifier,
    onControl: (ActionItem) -> Unit
) {
    val known = state != null && state != "unknown"
    val active = known && state == activeState
    val action = if (active) turnOff else turnOn
    val color = if (active) ActiveTile else SurfaceLight
    val foreground = if (active) ActiveForeground else Ivory
    Column(
        modifier.clip(RoundedCornerShape(19.dp)).background(color)
            .clickable(enabled = available && known) {
                onControl(ActionItem(action, title, icon, "Confirm $action"))
            }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(15.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, modifier = Modifier.size(24.dp),
                tint = if (known) foreground else Muted)
            Spacer(Modifier.weight(1f))
            Box(Modifier.size(9.dp).background(
                if (active) ActiveForeground else Muted.copy(alpha = .4f), CircleShape))
        }
        Column {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                color = if (known) foreground else Muted)
            Text(
                if (known) state.replaceFirstChar { it.uppercase() } else "Status unavailable",
                fontSize = 11.sp, color = if (active) ActiveForeground else Muted,
                lineHeight = 16.sp
            )
        }
    }
}

@Composable
private fun CarSetupScreen(
    busy: Boolean, cars: List<String>, message: String?,
    vinInput: String, onVinChange: (String) -> Unit,
    onFind: () -> Unit, onChoose: (String) -> Unit
) {
    SectionHeader("Connect your Polestar 4")
    Text("Your account is signed in. First we'll look for vehicles linked to it.",
        color = Muted, fontSize = 14.sp, lineHeight = 22.sp)
    SolidButton(if (busy) "CHECKING POLESTAR…" else "FIND MY CAR", !busy, onFind)
    if (!message.isNullOrBlank()) NoticeCard(message)
    cars.forEach { car ->
        OutlinedButton(onClick = { onChoose(car) }, enabled = !busy,
            modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
            Text("POLESTAR 4 · VIN ending ${car.takeLast(4)}")
        }
    }
    SectionHeader("Guest or secondary driver?")
    Text(
        "Some Polestar accounts can access a car but are not listed as its owner. " +
        "If automatic discovery doesn't find it, enter the 17-character VIN from " +
        "your Polestar app or vehicle documents. We'll verify it against live C3 data.",
        color = Muted, fontSize = 13.sp, lineHeight = 20.sp
    )
    OutlinedTextField(
        value = vinInput, onValueChange = onVinChange,
        label = { Text("Vehicle VIN") }, singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        supportingText = { Text("No VIN is sent to anyone except Polestar's own services.") }
    )
    SolidButton("VERIFY THIS VEHICLE", !busy &&
        Regex("^[A-HJ-NPR-Z0-9]{17}$").matches(vinInput.trim().uppercase())
    ) { onChoose(vinInput.trim().uppercase()) }
}

@Composable
private fun DetailedStatusScreen(
    status: VehicleStatus?, details: VehicleDetails?, busy: Boolean,
    onRefresh: () -> Unit
) {
    SectionHeader("Vehicle status", if (status == null) "OFFLINE" else "C3 LIVE")
    Text("Read-only data reported by Polestar. Unknown values are not assumed to be closed or inactive.",
        color = Muted, fontSize = 13.sp, lineHeight = 20.sp)
    SolidButton(if (busy) "REFRESHING…" else "REFRESH ALL DATA", !busy, onRefresh)
    DetailSection("Battery & charging", listOf(
        "Charge" to status?.battery?.let { "$it %" },
        "Estimated range" to status?.rangeKm?.let { "$it km" },
        "Charging state" to details?.battery?.chargingState,
        "Cable" to details?.battery?.chargerConnection,
        "Charging type" to details?.battery?.chargingType,
        "Power" to details?.battery?.powerWatts?.let { "$it W" },
        "Current" to details?.battery?.currentAmps?.let { "$it A" },
        "Voltage" to details?.battery?.voltageVolts?.let { "$it V" },
        "Time to full" to details?.battery?.timeToFullMinutes?.let { "$it minutes" },
        "Average consumption" to details?.battery?.averageConsumption?.let { "$it" }
    ))
    val e = details?.exterior
    DetailSection("Doors & security", listOf(
        "Central lock" to status?.lockState,
        "Front left door" to e?.frontLeftDoor,
        "Front right door" to e?.frontRightDoor,
        "Rear left door" to e?.rearLeftDoor,
        "Rear right door" to e?.rearRightDoor,
        "Hood" to e?.hood, "Trunk" to e?.trunk
    ))
    DetailSection("Windows & exterior", listOf(
        "Front left window" to e?.frontLeftWindow,
        "Front right window" to e?.frontRightWindow,
        "Rear left window" to e?.rearLeftWindow,
        "Rear right window" to e?.rearRightWindow,
        "Sunroof" to e?.sunroof, "Charge flap" to e?.chargeFlap
    ))
    DetailSection("Cabin & driving", listOf(
        "Climate" to details?.climate?.state,
        "Climate remaining" to details?.climate?.minutesRemaining?.let { "$it minutes" },
        "Odometer" to details?.odometerKm?.let { "%.1f km".format(it) }
    ))
}

@Composable
private fun DetailSection(title: String, entries: List<Pair<String, String?>>) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
        .background(Surface).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp)) {
        Text(title, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ivory)
        entries.forEach { (key, value) ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(key, Modifier.weight(1f), color = Muted, fontSize = 13.sp)
                Text(value?.takeUnless { it.isBlank() || it == "unknown" } ?: "—",
                    color = Ivory, fontSize = 13.sp, textAlign = TextAlign.End)
            }
            HorizontalDivider(color = SurfaceLight)
        }
    }
}

@Composable
private fun SettingsScreen(
    vinInput: String,
    onVinChange: (String) -> Unit, onSaveVin: () -> Unit,
    pairCode: String?, onPair: () -> Unit,
    onStopBridge: () -> Unit, onSignOut: () -> Unit
) {
    SectionHeader("Settings")
    Text("ACCOUNT", fontSize = 11.sp, letterSpacing = 1.8.sp, color = Muted)
    SettingCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Check, null, tint = Mint, modifier = Modifier.size(21.dp))
            Spacer(Modifier.width(10.dp))
            Column {
                Text("Polestar ID connected", color = Ivory, fontWeight = FontWeight.Medium)
                Text("Secured on this Android device", fontSize = 12.sp, color = Muted)
            }
        }
    }
    Text("MY VEHICLE", fontSize = 11.sp, letterSpacing = 1.8.sp, color = Muted)
    SettingCard {
        OutlinedTextField(
            value = vinInput, onValueChange = onVinChange,
            label = { Text("Polestar 4 VIN") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            supportingText = { Text("17 characters · stored encrypted on this device") }
        )
        SolidButton("SAVE VEHICLE", true, onSaveVin)
    }
    Text("AMAZFIT WATCH", fontSize = 11.sp, letterSpacing = 1.8.sp, color = Muted)
    SettingCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Bluetooth, null, tint = Mint)
            Spacer(Modifier.width(10.dp))
            Text("Optional local watch connection", color = Ivory)
        }
        Text("Enable the on-phone bridge and enter the code in Zepp. Only apps on your phone can reach it; no cloud relay is used.",
            color = Muted, fontSize = 13.sp, lineHeight = 20.sp)
        SolidButton("PAIR AMAZFIT WATCH", true, onPair)
        if (pairCode != null) {
            Text(pairCode, fontSize = 36.sp, letterSpacing = 5.sp,
                color = Mint, fontWeight = FontWeight.SemiBold)
            Text("Code expires in 2 minutes. Enter it in Zepp Polestar Link settings.",
                fontSize = 12.sp, color = Muted)
            TextButton(onClick = onStopBridge) { Text("STOP WATCH CONNECTION", color = Muted) }
        }
    }
    Text("PRIVACY & SAFETY", fontSize = 11.sp, letterSpacing = 1.8.sp, color = Muted)
    SettingCard {
        Text("Tokens and the vehicle VIN are encrypted using Android Keystore. No third-party relay or analytics.",
            color = Muted, fontSize = 13.sp, lineHeight = 20.sp)
        TextButton(onClick = onSignOut) { Text("Sign out and remove credentials", color = ErrorTone) }
    }
    Text("Unofficial companion. Not affiliated with Polestar. Vehicle features require cloud access and may change.",
        color = Muted, fontSize = 11.sp, lineHeight = 17.sp)
}

@Composable
private fun SettingCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .background(Surface).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp), content = content
    )
}

@Composable
private fun SolidButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(54.dp),
        shape = RoundedCornerShape(15.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Ivory, contentColor = Night,
            disabledContainerColor = SurfaceLight, disabledContentColor = Muted)
    ) { Text(label, letterSpacing = 1.sp, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun LoginWebView(url: String, onCancel: () -> Unit, onCallback: (String) -> Unit) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().background(Night)) {
        Row(Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onCancel) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Cancel sign-in", tint = Ivory)
            }
            Text("SECURE POLESTAR SIGN-IN", letterSpacing = 2.sp,
                fontSize = 13.sp, color = Ivory)
        }
        AndroidView(factory = {
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                CookieManager.getInstance().setAcceptCookie(true)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val callback = request?.url?.toString() ?: return false
                        if (callback.startsWith("polestar-explore://explore.polestar.com")) {
                            onCallback(callback)
                            return true
                        }
                        return false
                    }
                    @Deprecated("For pre-Nougat WebViews")
                    override fun shouldOverrideUrlLoading(view: WebView?, address: String?): Boolean {
                        if (address?.startsWith("polestar-explore://explore.polestar.com") == true) {
                            onCallback(address)
                            return true
                        }
                        return false
                    }
                }
                loadUrl(url)
            }
        }, modifier = Modifier.fillMaxSize())
    }
}
