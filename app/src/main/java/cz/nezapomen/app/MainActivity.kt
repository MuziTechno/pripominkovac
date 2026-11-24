package cz.nezapomen.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 15/16 vykresluje aplikace edge-to-edge. Obsah proto musí
        // respektovat stavovou a navigační lištu pomocí WindowInsets.
        WindowCompat.setDecorFitsSystemWindows(window, false)
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

        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
            val systemBars: Insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                    WindowInsetsCompat.Type.navigationBars() or
                    WindowInsetsCompat.Type.displayCutout()
            )

            // Horní padding chrání vyhledávání před stavovou lištou.
            // Spodní padding chrání Budík/Přidat před systémovou navigací.
            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                systemBars.bottom
            )

            windowInsets
        }

        setContentView(webView)
        ViewCompat.requestApplyInsets(webView)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun scheduleAlarm(id: String, text: String, epochMs: Long) =
            runOnUiThread {
                AlarmScheduler.schedule(
                    context = this@MainActivity,
                    id = id,
                    text = text,
                    at = epochMs
                )
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
