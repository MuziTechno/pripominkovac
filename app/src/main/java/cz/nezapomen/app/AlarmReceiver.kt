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
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat

object AlarmSoundPlayer {
    private var ringtone: Ringtone? = null

    fun start(context: Context) {
        stop()
        try {
            val prefs = context.getSharedPreferences("alarms", Context.MODE_PRIVATE)
            val savedUriStr = prefs.getString("alarm_sound_uri", null)
            val uri = if (!savedUriStr.isNullOrBlank()) {
                Uri.parse(savedUriStr)
            } else {
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            }
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
        @Suppress("DEPRECATION")
        val screenWakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK or
            PowerManager.ACQUIRE_CAUSES_WAKEUP or
            PowerManager.ON_AFTER_RELEASE,
            "Nezapomen:ScreenWakeLock"
        )
        screenWakeLock.acquire(15_000L)

        try {
            val id = intent.getStringExtra("id") ?: return
            val text = intent.getStringExtra("text") ?: "Upomínka"
            val repeat = intent.getStringExtra("repeat") ?: "none"
            val baseAt = intent.getLongExtra("baseAt", System.currentTimeMillis())
            val channelId = "alarm_samsung_v8"
            val nm = context.getSystemService(NotificationManager::class.java)

            if (Build.VERSION.SDK_INT >= 26) {
                val channel = NotificationChannel(
                    channelId,
                    "Budíky",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setSound(null, null)
                    enableVibration(true)
                    setBypassDnd(true)
                }
                nm.createNotificationChannel(channel)
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
                .setContentTitle("Připomínkovač")
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(false)
                .setContentIntent(fullScreenPendingIntent)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .build()

            nm.notify(id.hashCode(), notification)

            try {
                context.startActivity(ringIntent)
            } catch (_: Exception) {
            }
        } finally {
            if (screenWakeLock.isHeld) {
                screenWakeLock.release()
            }
        }
    }
}
