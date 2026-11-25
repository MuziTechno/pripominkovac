package cz.nezapomen.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Nezapomen:AlarmWakeLock")
        wakeLock.acquire(10_000L)

        try {
            val id = intent.getStringExtra("id") ?: return
            val text = intent.getStringExtra("text") ?: "Upomínka"
            val repeat = intent.getStringExtra("repeat") ?: "none"
            val baseAt = intent.getLongExtra("baseAt", System.currentTimeMillis())
            val channelId = "alarm_silent_v3"

            if (Build.VERSION.SDK_INT >= 26) {
                val channel = NotificationChannel(
                    channelId,
                    "Budíky",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setSound(null, null)
                    enableVibration(false)
                    setBypassDnd(true)
                }
                context.getSystemService(NotificationManager::class.java)
                    .createNotificationChannel(channel)
            }

            val ringIntent = Intent(context, RingActivity::class.java).apply {
                putExtra("id", id)
                putExtra("text", text)
                putExtra("repeat", repeat)
                putExtra("baseAt", baseAt)
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
            }

            val fullScreenPendingIntent = PendingIntent.getActivity(
                context,
                id.hashCode(),
                ringIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Budík")
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(fullScreenPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .build()

            try {
                NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
            } catch (_: SecurityException) {
            }
        } finally {
            if (wakeLock.isHeld) {
                wakeLock.release()
            }
        }
    }
}
