package dev.polestarlink.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** A foreground service is opt-in. Android may still enforce data-sync time limits. */
class BridgeService : Service() {
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            "polestar_watch", "Polestar Link watch connection", NotificationManager.IMPORTANCE_LOW
        ))
        val notification = Notification.Builder(this, "polestar_watch")
            .setContentTitle("Polestar Link")
            .setContentText("Local watch connection enabled")
            .setSmallIcon(R.drawable.polestar_mark)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(7, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else startForeground(7, notification)
        (application as PolestarApplication).bridge.start()
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int =
        START_STICKY
    override fun onDestroy() {
        (application as PolestarApplication).bridge.stop()
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null
}
