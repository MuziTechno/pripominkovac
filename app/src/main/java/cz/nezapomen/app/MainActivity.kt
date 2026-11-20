package cz.nezapomen.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (android.os.Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true; settings.domStorageEnabled = true
            webViewClient = WebViewClient(); webChromeClient = WebChromeClient()
            addJavascriptInterface(Bridge(), "Android")
            loadUrl("file:///android_asset/index.html")
        }
        setContentView(web)
    }
    inner class Bridge {
        @JavascriptInterface fun scheduleAlarm(id: String, text: String, epochMs: Long) = runOnUiThread { AlarmScheduler.schedule(this@MainActivity, id, text, epochMs) }
        @JavascriptInterface fun cancelAlarm(id: String) = runOnUiThread { AlarmScheduler.cancel(this@MainActivity, id) }
        @JavascriptInterface fun share(text: String) { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type="text/plain"; putExtra(Intent.EXTRA_TEXT,text) }, "Sdílet zápisek")) }
        @JavascriptInterface fun email(text: String) { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type="message/rfc822"; putExtra(Intent.EXTRA_SUBJECT,"Poznámka"); putExtra(Intent.EXTRA_TEXT,text) }, "Poslat e-mailem")) }
        @JavascriptInterface fun saveAlarmIndex(json: String) { getSharedPreferences("alarms", MODE_PRIVATE).edit().putString("index", json).apply() }
    }
}
