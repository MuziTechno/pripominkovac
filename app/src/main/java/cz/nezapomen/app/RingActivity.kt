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
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class RingActivity : AppCompatActivity() {

    private var mediaPlayer: MediaPlayer? = null
    private var alarmId: String = ""
    private var alarmText: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        alarmId = intent.getStringExtra("id") ?: ""
        alarmText = intent.getStringExtra("text") ?: "Upomínka"

        setShowWhenLocked(true)
        setTurnScreenOn(true)

        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )

        startAlarmSound()
        startVibration()
        setContentView(createAlarmScreen())
    }

    private fun createAlarmScreen(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(32, 48, 32, 48)
            setBackgroundColor(Color.rgb(231, 240, 236))
        }

        val alarmIcon = TextView(this).apply {
            text = "⏰"
            textSize = 64f
            gravity = Gravity.CENTER
        }

        val message = TextView(this).apply {
            text = alarmText
            textSize = 26f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(52, 65, 63))
            setPadding(0, 24, 0, 32)
        }

        val stopButton = Button(this).apply {
            text = "Vypnout"
            setOnClickListener {
                stopAlarmAndClose()
            }
        }

        val snoozeHeading = TextView(this).apply {
            text = "Odložit"
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(52, 65, 63))
            setPadding(0, 24, 0, 8)
        }

        val snoozeButtons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        val snoozeOptions = listOf(
            5 to "5 min",
            10 to "10 min",
            30 to "30 min",
            60 to "1 hod",
            120 to "2 hod",
            180 to "3 hod"
        )

        snoozeOptions.forEach { option ->
            val delayMinutes: Int = option.first
            val buttonLabel: String = option.second

            val snoozeButton = Button(this).apply {
                text = buttonLabel

                setOnClickListener {
                    val nextAlarmTime =
                        System.currentTimeMillis() + delayMinutes.toLong() * 60_000L

                    AlarmScheduler.schedule(
                        context = this@RingActivity,
                        id = alarmId,
                        text = alarmText,
                        at = nextAlarmTime
                    )

                    stopAlarmAndClose()
                }
            }

            snoozeButtons.addView(snoozeButton)
        }

        root.addView(alarmIcon)
        root.addView(message)
        root.addView(stopButton)
        root.addView(snoozeHeading)
        root.addView(snoozeButtons)

        return root
    }

    private fun startAlarmSound() {
        val alarmUri =
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
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
        val vibrationPattern = longArrayOf(
            0L,
            700L,
            300L,
            700L,
            300L
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager =
                getSystemService(VibratorManager::class.java)

            vibratorManager.defaultVibrator.vibrate(
                VibrationEffect.createWaveform(
                    vibrationPattern,
                    1
                )
            )
        } else {
            @Suppress("DEPRECATION")
            val vibrator =
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator

            vibrator.vibrate(
                VibrationEffect.createWaveform(
                    vibrationPattern,
                    1
                )
            )
        }
    }

    private fun stopVibration() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager =
                getSystemService(VibratorManager::class.java)

            vibratorManager.defaultVibrator.cancel()
        } else {
            @Suppress("DEPRECATION")
            val vibrator =
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator

            vibrator.cancel()
        }
    }

    private fun stopAlarmAndClose() {
        mediaPlayer?.run {
            if (isPlaying) {
                stop()
            }
            release()
        }

        mediaPlayer = null
        stopVibration()

        getSystemService(NotificationManager::class.java)
            .cancel(alarmId.hashCode())

        finishAndRemoveTask()
    }

    override fun onDestroy() {
        mediaPlayer?.release()
        mediaPlayer = null
        stopVibration()

        super.onDestroy()
    }
}
