package cz.nezapomen.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var root: FrameLayout

    private val requestNotifications =
        registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)

        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            requestNotifications.launch(
                Manifest.permission.POST_NOTIFICATIONS
            )
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true

            isVerticalScrollBarEnabled = false

            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()

            addJavascriptInterface(
                AndroidBridge(),
                "Android"
            )

            loadUrl(
                "file:///android_asset/index.html"
            )
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(
                Color.rgb(
                    246,
                    243,
                    238
                )
            )

            addView(
                webView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
        }

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val systemBars: Insets = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.navigationBars() or
                    WindowInsetsCompat.Type.displayCutout()
            )

            /*
             * Používáme layout margins samotného WebView.
             * Vykreslení i dotykové souřadnice se tím posunou společně.
             *
             * Výšku klávesnice sem nepřičítáme.
             * Klávesnici řeší SOFT_INPUT_ADJUST_RESIZE.
             */
            val layoutParams =
                webView.layoutParams as FrameLayout.LayoutParams

            val marginsChanged =
                layoutParams.leftMargin != systemBars.left ||
                    layoutParams.topMargin != systemBars.top ||
                    layoutParams.rightMargin != systemBars.right ||
                    layoutParams.bottomMargin != systemBars.bottom

            if (marginsChanged) {
                layoutParams.setMargins(
                    systemBars.left,
                    systemBars.top,
                    systemBars.right,
                    systemBars.bottom
                )

                webView.layoutParams = layoutParams
            }

            insets
        }

        setContentView(root)
        ViewCompat.requestApplyInsets(root)
    }

    inner class AndroidBridge {

        @JavascriptInterface
        fun scheduleAlarm(
            id: String,
            text: String,
            epochMs: Long
        ): String {
            val scheduled = AlarmScheduler.schedule(
                context = this@MainActivity,
                id = id,
                text = text,
                at = epochMs
            )

            return if (scheduled) {
                "ok"
            } else {
                "exact_alarm_permission_required"
            }
        }

        @JavascriptInterface
        fun cancelAlarm(id: String) {
            runOnUiThread {
                AlarmScheduler.cancel(
                    context = this@MainActivity,
                    id = id
                )
            }
        }

        @JavascriptInterface
        fun openAlarmPermissions() {
            runOnUiThread {
                if (android.os.Build.VERSION.SDK_INT >= 31) {
                    val alarmManager =
                        getSystemService(AlarmManager::class.java)

                    if (!alarmManager.canScheduleExactAlarms()) {
                        val exactAlarmSettings =
                            Intent(
                                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM
                            ).apply {
                                data = Uri.parse(
                                    "package:$packageName"
                                )
                            }

                        startActivity(exactAlarmSettings)
                        return@runOnUiThread
                    }
                }

                if (android.os.Build.VERSION.SDK_INT >= 34) {
                    val notificationManager =
                        getSystemService(
                            NotificationManager::class.java
                        )

                    if (!notificationManager.canUseFullScreenIntent()) {
                        val fullScreenSettings =
                            Intent(
                                Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
                            ).apply {
                                data = Uri.parse(
                                    "package:$packageName"
                                )
                            }

                        startActivity(fullScreenSettings)
                    }
                }
            }
        }

        @JavascriptInterface
        fun share(text: String) {
            runOnUiThread {
                val shareIntent =
                    Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(
                            Intent.EXTRA_TEXT,
                            text
                        )
                    }

                startActivity(
                    Intent.createChooser(
                        shareIntent,
                        "Sdílet zápisek"
                    )
                )
            }
        }

        @JavascriptInterface
        fun email(text: String) {
            runOnUiThread {
                val emailIntent =
                    Intent(Intent.ACTION_SEND).apply {
                        type = "message/rfc822"

                        putExtra(
                            Intent.EXTRA_SUBJECT,
                            "Poznámka"
                        )

                        putExtra(
                            Intent.EXTRA_TEXT,
                            text
                        )
                    }

                startActivity(
                    Intent.createChooser(
                        emailIntent,
                        "Poslat e-mailem"
                    )
                )
            }
        }

        @JavascriptInterface
        fun saveAlarmIndex(json: String) {
            getSharedPreferences(
                "alarms",
                MODE_PRIVATE
            )
                .edit()
                .putString(
                    "index",
                    json
                )
                .apply()
        }
    }
}
