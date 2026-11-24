package cz.nezapomen.app

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val requestNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Nepoužívat edge-to-edge. Android sám vyhradí skutečný prostor
        // pro stavovou a navigační lištu, takže systémové vrstvy nepřekryjí
        // hledání ani tlačítka Budík/Přidat a nebudou zachytávat jejich dotyky.
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.rgb(231, 240, 236)
        window.navigationBarColor = Color.rgb(246, 243, 238)
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

        setContentView(webView)
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
