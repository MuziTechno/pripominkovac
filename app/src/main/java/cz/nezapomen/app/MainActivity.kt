package cz.nezapomen.app

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
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
import kotlin.math.max

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var safeContainer: FrameLayout

    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            addJavascriptInterface(AndroidBridge(), "Android")
            loadUrl("file:///android_asset/index.html")
        }

        safeContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(246, 243, 238))
            addView(
                webView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
        }

        ViewCompat.setOnApplyWindowInsetsListener(safeContainer) { view, insets ->
            val bars: Insets = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.navigationBars() or
                    WindowInsetsCompat.Type.displayCutout()
            )
            val ime: Insets = insets.getInsets(WindowInsetsCompat.Type.ime())

            // Při otevřené klávesnici použijeme její výšku místo navigační lišty.
            val safeBottom = max(bars.bottom, ime.bottom)

            view.setPadding(
                bars.left,
                bars.top,
                bars.right,
                safeBottom
            )

            WindowInsetsCompat.CONSUMED
        }

        setContentView(safeContainer)
        ViewCompat.requestApplyInsets(safeContainer)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun scheduleAlarm(id: String, text: String, epochMs: Long) =
            runOnUiThread {
                AlarmScheduler.schedule(this@MainActivity, id, text, epochMs)
            }

        @JavascriptInterface
        fun cancelAlarm(id: String) =
            runOnUiThread {
                AlarmScheduler.cancel(this@MainActivity, id)
            }

        @JavascriptInterface
        fun share(text: String) {
            startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, text)
                    },
                    "Sdílet zápisek"
                )
            )
        }

        @JavascriptInterface
        fun email(text: String) {
            startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).apply {
                        type = "message/rfc822"
                        putExtra(Intent.EXTRA_SUBJECT, "Poznámka")
                        putExtra(Intent.EXTRA_TEXT, text)
                    },
                    "Poslat e-mailem"
                )
            )
        }

        @JavascriptInterface
        fun saveAlarmIndex(json: String) {
            getSharedPreferences("alarms", MODE_PRIVATE)
                .edit()
                .putString("index", json)
                .apply()
        }
    }
}
