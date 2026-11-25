package cz.nezapomen.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object AlarmSoundPlayer {
    private var ringtone: Ringtone? = null

    fun start(context: Context) {
        stop()
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val r = RingtoneManager.getRingtone(context.applicationContext, uri)
            if (Build.VERSION.SDK_INT >= 28) {
                r.isLooping = true
            }
            r.audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            r.play()
            ringtone = r
        } catch (_: Exception) {
        }
    }

    fun stop() {
        try {
            ringtone?.stop()
        } catch (_: Exception) {
        }
        ringtone = null
    }
}

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
            val channelId = "alarm_ring_v4"

            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            if (Build.VERSION.SDK_INT >= 26) {
                val audioAttrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()

                val channel = NotificationChannel(
                    channelId,
                    "Budíky a připomínky",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setSound(alarmUri, audioAttrs)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 300, 500)
                    setBypassDnd(true)
                }
                context.getSystemService(NotificationManager::class.java)
                    .createNotificationChannel(channel)
            }

            AlarmSoundPlayer.start(context)

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
                .setSound(alarmUri)
                .setVibrate(longArrayOf(0, 500, 300, 500))
                .setOngoing(true)
                .setContentIntent(fullScreenPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .build()

            try {
                NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
            } catch (_: SecurityException) {
            }

            try {
                context.startActivity(ringIntent)
            } catch (_: Exception) {
            }
        } finally {
            if (wakeLock.isHeld) {
                wakeLock.release()
            }
        }
    }
}
