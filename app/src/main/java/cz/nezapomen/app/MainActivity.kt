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
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    private val requestNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

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
            isVerticalScrollBarEnabled = false
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    syncUpdatesToWeb()
                }
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(AndroidBridge(), "Android")
            loadUrl("file:///android_asset/index.html")
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(246, 243, 238))
            addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars: Insets = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or
                WindowInsetsCompat.Type.navigationBars() or
                WindowInsetsCompat.Type.displayCutout()
            )
            val p = webView.layoutParams as FrameLayout.LayoutParams
            p.setMargins(bars.left, bars.top, bars.right, bars.bottom)
            webView.layoutParams = p
            insets
        }
        setContentView(root)
        ViewCompat.requestApplyInsets(root)
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            syncUpdatesToWeb()
        }
    }

    private fun syncUpdatesToWeb() {
        val prefs = getSharedPreferences("alarms", MODE_PRIVATE)
        val updates = prefs.getString("updates", "[]") ?: "[]"
        if (updates != "[]") {
            val escaped = JSONObject.quote(updates)
            webView.evaluateJavascript("if(window.applyAlarmUpdates) window.applyAlarmUpdates($escaped);", null)
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun scheduleAlarm(id: String, text: String, epochMs: Long, repeat: String, baseAt: Long): String {
            return if (AlarmScheduler.schedule(this@MainActivity, id, text, epochMs, repeat, baseAt)) "ok" else "exact_alarm_permission_required"
        }

        @JavascriptInterface
        fun cancelAlarm(id: String) = runOnUiThread {
            AlarmScheduler.cancel(this@MainActivity, id)
        }

        @JavascriptInterface
        fun openAlarmPermissions() = runOnUiThread {
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                val m = getSystemService(AlarmManager::class.java)
                if (!m.canScheduleExactAlarms()) {
                    startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                        data = Uri.parse("package:$packageName")
                    })
                    return@runOnUiThread
                }
            }
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                val n = getSystemService(NotificationManager::class.java)
                if (!n.canUseFullScreenIntent()) {
                    startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                        data = Uri.parse("package:$packageName")
                    })
                }
            }
        }

        @JavascriptInterface
        fun openUrl(url: String) = runOnUiThread {
            try {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun share(text: String) = runOnUiThread {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }, "Sdílet zápisek"))
        }

        @JavascriptInterface
        fun email(text: String) = runOnUiThread {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "message/rfc822"
                putExtra(Intent.EXTRA_SUBJECT, "Poznámka")
                putExtra(Intent.EXTRA_TEXT, text)
            }, "Poslat e-mailem"))
        }

        @JavascriptInterface
        fun saveAlarmIndex(json: String) {
            getSharedPreferences("alarms", MODE_PRIVATE).edit().putString("index", json).apply()
        }

        @JavascriptInterface
        fun clearAlarmUpdates() {
            getSharedPreferences("alarms", MODE_PRIVATE).edit().putString("updates", "[]").apply()
        }

        @JavascriptInterface
        fun fetchUrl(requestId: String, urlString: String) {
            thread {
                try {
                    val conn = (URL(urlString).openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 8000
                        readTimeout = 8000
                        setRequestProperty("User-Agent", "Mozilla/5.0 PripominkovacApp")
                    }
                    val body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                    val escaped = JSONObject.quote(body)
                    runOnUiThread {
                        webView.evaluateJavascript("if(window.onNativeFetchResult) window.onNativeFetchResult('$requestId', true, $escaped);", null)
                    }
                } catch (e: Exception) {
                    val err = JSONObject.quote(e.message ?: "Chyba sítě")
                    runOnUiThread {
                        webView.evaluateJavascript("if(window.onNativeFetchResult) window.onNativeFetchResult('$requestId', false, $err);", null)
                    }
                }
            }
        }

           @JavascriptInterface
    fun askGemini(requestId: String, apiKey: String, payloadJson: String) {
        thread {
            val models = listOf("gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite")
            var lastCode = 0
            var lastBody = "Chyba spojeni s Gemini"

            for (model in models) {
                try {
                    val baseUrl = "https://" + "generativelanguage." + "googleapis." + "com/v1beta/models/"
                    val url = URL("$baseUrl$model:generateContent?key=$apiKey")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        doOutput = true
                        connectTimeout = 15000
                        readTimeout = 20000
                        setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                    }
                    conn.outputStream.use { it.write(payloadJson.toByteArray(Charsets.UTF_8)) }
                    lastCode = conn.responseCode
                    val stream = if (lastCode in 200..299) conn.inputStream else conn.errorStream
                    lastBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""

                    if (lastCode in 200..299) {
                        val escaped = JSONObject.quote(lastBody)
                        runOnUiThread {
                            webView.evaluateJavascript("if(window.onGeminiResult) window.onGeminiResult('$requestId', true, $escaped);", null)
                        }
                        return@thread
                    }
                    if (lastCode == 400 || lastCode == 401 || lastCode == 403) {
                        break
                    }
                } catch (e: Exception) {
                    lastBody = e.message ?: "Chyba spojeni s Gemini"
                }
            }

            val escapedErr = JSONObject.quote(lastBody)
            runOnUiThread {
                webView.evaluateJavascript("if(window.onGeminiResult) window.onGeminiResult('$requestId', false, $escapedErr);", null)
            }
        }
    }
}
