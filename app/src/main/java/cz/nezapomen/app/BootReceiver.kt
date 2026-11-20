package cz.nezapomen.app
import android.content.*
import org.json.JSONArray
class BootReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){if(i.action!=Intent.ACTION_BOOT_COMPLETED)return;val raw=c.getSharedPreferences("alarms",Context.MODE_PRIVATE).getString("index","[]")?:"[]";val a=JSONArray(raw);for(x in 0 until a.length()){val o=a.getJSONObject(x);val at=o.getLong("at");if(at>System.currentTimeMillis())AlarmScheduler.schedule(c,o.getString("id"),o.getString("text"),at)}}}
