package cz.nezapomen.app

import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
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
import java.util.Locale

class RingActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private val speechHandler = Handler(Looper.getMainLooper())
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )

        tts = TextToSpeech(this, this)
        startVibration()
        setContentView(createAlarmScreen())
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val res = tts?.setLanguage(Locale("cs", "CZ"))
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.setLanguage(Locale.getDefault())
            }
            tts?.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            tts?.setSpeechRate(0.95f)
            speakReminder()
            speechHandler.postDelayed({ speakReminder() }, 5000L)
        }
    }

    private fun speakReminder() {
        try {
            val cleanText = alarmText.trim().ifEmpty { "Upomínka" }
            val params = Bundle().apply {
                putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM)
                putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            }
            tts?.speak("Připomínka: $cleanText", TextToSpeech.QUEUE_FLUSH, params, "alarm_tts")
        } catch (_: Exception) {
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun pillDrawable(bgColor: Int, radiusDp: Int, strokeColor: Int = Color.TRANSPARENT): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(radiusDp).toFloat()
            setColor(bgColor)
            if (strokeColor != Color.TRANSPARENT) {
                setStroke(dp(1), strokeColor)
            }
        }
    }
    private fun createAlarmScreen(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(36), dp(24), dp(36))
            setBackgroundColor(Color.parseColor("#F6F3EE"))
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(32), dp(24), dp(28))
            background = pillDrawable(Color.WHITE, 28, Color.parseColor("#E3DFD7"))
            elevation = dp(6).toFloat()
        }

        val badge = TextView(this).apply {
            text = "⏰  PŘIPOMÍNKA"
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#3F6258"))
            background = pillDrawable(Color.parseColor("#E7F0EC"), 20)
            setPadding(dp(16), dp(7), dp(16), dp(7))
        }
        card.addView(badge)

        val titleView = TextView(this).apply {
            text = alarmText
            textSize = 26f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#1D2624"))
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(24), dp(8), dp(28))
        }
        card.addView(titleView)

        val stopBtn = Button(this).apply {
            text = "✓  Vypnout budík"
            textSize = 17f
            isAllCaps = false
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = pillDrawable(Color.parseColor("#3F6258"), 24)
            setPadding(dp(36), dp(14), dp(36), dp(14))
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
                stopAlarmAndClose(cancelNotification = false)
            }
        }
        card.addView(stopBtn)

        val snoozeLabel = TextView(this).apply {
            text = "Odložit o:"
            textSize = 14f
            setTextColor(Color.parseColor("#6D7875"))
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, dp(10))
        }
        card.addView(snoozeLabel)

        val snoozeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        listOf(5, 10, 30, 60, 120, 180).forEach { minutes ->
            val btn = Button(this).apply {
                text = if (minutes < 60) "$minutes min" else "${minutes / 60} h"
                textSize = 14f
                isAllCaps = false
                setTextColor(Color.parseColor("#2A3D38"))
                background = pillDrawable(Color.parseColor("#EFF4F2"), 20, Color.parseColor("#D5E2DD"))
                setPadding(dp(16), dp(10), dp(16), dp(10))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.setMargins(dp(4), 0, dp(4), 0)
                layoutParams = lp
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
                    stopAlarmAndClose(cancelNotification = true)
                }
            }
            snoozeRow.addView(btn)
        }

        val scroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(snoozeRow)
        }
        card.addView(scroll)

        root.addView(card, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

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

    private fun stopAlarmAndClose(cancelNotification: Boolean) {
        speechHandler.removeCallbacksAndMessages(null)
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Exception) {
        }
        tts = null

        AlarmSoundPlayer.stop()
        stopVibration()

        if (cancelNotification && alarmId.isNotEmpty()) {
            getSystemService(NotificationManager::class.java).cancel(alarmId.hashCode())
        }
        finish()
    }

    override fun onDestroy() {
        speechHandler.removeCallbacksAndMessages(null)
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Exception) {
        }
        AlarmSoundPlayer.stop()
        stopVibration()
        super.onDestroy()
    }
}
