package cz.nezapomen.app

import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.Year
import java.time.ZoneId
import java.time.ZonedDateTime

class RingActivity : AppCompatActivity() {

    private var mediaPlayer: MediaPlayer? = null
    private var alarmId: String = ""
    private var alarmText: String = ""
    private var repeatRule: String = "none"
    private var baseAt: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        alarmId = intent.getStringExtra("id") ?: ""
        alarmText = intent.getStringExtra("text") ?: "Upomínka"
        repeatRule = intent.getStringExtra("repeat") ?: "none"
        baseAt = intent.getLongExtra("baseAt", System.currentTimeMillis())

        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        startAlarmSound()
        startVibration()
        setContentView(createAlarmScreen())
    }

    private fun createAlarmScreen(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(24, 40, 24, 40)
            setBackgroundColor(Color.rgb(231, 240, 236))
        }

        root.addView(TextView(this).apply {
            text = "⏰"
            textSize = 56f
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = alarmText
            textSize = 26f
            gravity = Gravity.CENTER
            setPadding(0, 20, 0, 24)
        })

        root.addView(Button(this).apply {
            text = "Vypnout"
            setOnClickListener {
                if (repeatRule == "none") {
                    recordAlarmUpdate(alarmId, 0L, 0L, true)
                } else {
                    val nextAt = calculateNextOccurrence(baseAt, repeatRule)
                    AlarmScheduler.schedule(
                        context = this@RingActivity,
                        id = alarmId,
                        text = alarmText,
                        at = nextAt,
                        repeat = repeatRule,
                        baseAt = nextAt
                    )
                    recordAlarmUpdate(alarmId, nextAt, nextAt, false)
                }
                stopAlarmAndClose()
            }
        })

        root.addView(TextView(this).apply {
            text = "Odložit"
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, 20, 0, 6)
        })

        val snoozeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        listOf(5, 10, 30, 60, 120, 180).forEach { minutes ->
            snoozeRow.addView(Button(this).apply {
                text = if (minutes < 60) "$minutes min" else "${minutes / 60} h"
                setOnClickListener {
                    val snoozeAt = System.currentTimeMillis() + minutes.toLong() * 60_000L
                    AlarmScheduler.schedule(
                        context = this@RingActivity,
                        id = alarmId,
                        text = alarmText,
                        at = snoozeAt,
                        repeat = repeatRule,
                        baseAt = baseAt
                    )
                    recordAlarmUpdate(alarmId, snoozeAt, baseAt, false)
                    stopAlarmAndClose()
                }
            })
        }

        root.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(snoozeRow)
        })

        return root
    }

    private fun recordAlarmUpdate(id: String, newAt: Long, newBaseAt: Long, dismissed: Boolean) {
        val prefs = getSharedPreferences("alarms", Context.MODE_PRIVATE)
        val updatesRaw = prefs.getString("updates", "[]") ?: "[]"
        val updates = JSONArray(updatesRaw)
        updates.put(JSONObject().apply {
            put("id", id)
            put("at", newAt)
            put("baseAt", newBaseAt)
            put("dismissed", dismissed)
        })

        val indexRaw = prefs.getString("index", "[]") ?: "[]"
        val oldIndex = JSONArray(indexRaw)
        val newIndex = JSONArray()
        for (i in 0 until oldIndex.length()) {
            val item = oldIndex.getJSONObject(i)
            if (item.getString("id") == id) {
                if (!dismissed && newAt > 0L) {
                    item.put("at", newAt)
                    item.put("baseAt", newBaseAt)
                    newIndex.put(item)
                }
            } else {
                newIndex.put(item)
            }
        }

        prefs.edit()
            .putString("updates", updates.toString())
            .putString("index", newIndex.toString())
            .apply()
    }

    private fun calculateNextOccurrence(from: Long, rule: String): Long {
        val current = Instant.ofEpochMilli(from).atZone(ZoneId.systemDefault())
        val next: ZonedDateTime = when (rule) {
            "daily" -> current.plusDays(1)
            "weekly" -> current.plusWeeks(1)
            "monthly" -> {
                val candidate = current.plusMonths(1)
                val day = minOf(current.dayOfMonth, candidate.toLocalDate().lengthOfMonth())
                candidate.withDayOfMonth(day)
            }
            "yearly" -> {
                val nextYear = current.year + 1
                val day = if (
                    current.monthValue == 2 &&
                    current.dayOfMonth == 29 &&
                    !Year.isLeap(nextYear.toLong())
                ) 28 else current.dayOfMonth
                current.withYear(nextYear).withDayOfMonth(day)
            }
            else -> current
        }
        return next.toInstant().toEpochMilli()
    }

    private fun startAlarmSound() {
        val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        mediaPlayer = MediaPlayer().apply {
            setDataSource(this@RingActivity, alarmUri)
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            isLooping = true
            prepare()
            start()
        }
    }

    private fun startVibration() {
        val pattern = longArrayOf(0L, 700L, 300L)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java)
                .defaultVibrator
                .vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
        }
    }

    private fun stopVibration() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java).defaultVibrator.cancel()
        } else {
            @Suppress("DEPRECATION")
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            vibrator.cancel()
        }
    }

    private fun stopAlarmAndClose() {
        mediaPlayer?.run {
            if (isPlaying) stop()
            release()
        }
        mediaPlayer = null
        stopVibration()
        getSystemService(NotificationManager::class.java).cancel(alarmId.hashCode())
        finishAndRemoveTask()
    }

    override fun onDestroy() {
        mediaPlayer?.release()
        mediaPlayer = null
        stopVibration()
        super.onDestroy()
    }
}
