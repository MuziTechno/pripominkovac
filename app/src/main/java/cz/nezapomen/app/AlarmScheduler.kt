package cz.nezapomen.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object AlarmScheduler {

    fun schedule(context: Context, id: String, text: String, at: Long): Boolean {
        val manager = context.getSystemService(AlarmManager::class.java)
        val receiverIntent = Intent(context, AlarmReceiver::class.java).apply {
            action = "cz.muzitechno.pripominkovac.ALARM"
            putExtra("id", id)
            putExtra("text", text)
        }
        val alarmPendingIntent = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            receiverIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
                false
            } else {
                val showIntent = PendingIntent.getActivity(
                    context,
                    id.hashCode(),
                    Intent(context, MainActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                manager.setAlarmClock(
                    AlarmManager.AlarmClockInfo(at, showIntent),
                    alarmPendingIntent
                )
                true
            }
        } catch (_: SecurityException) {
            false
        }
    }

    fun cancel(context: Context, id: String) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "cz.muzitechno.pripominkovac.ALARM"
        }
        val pi = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pi != null) {
            context.getSystemService(AlarmManager::class.java).cancel(pi)
            pi.cancel()
        }
    }
}
