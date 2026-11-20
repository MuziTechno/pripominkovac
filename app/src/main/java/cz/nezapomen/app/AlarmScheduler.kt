package cz.nezapomen.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object AlarmScheduler {
    fun schedule(context: Context, id: String, text: String, at: Long) {
        val manager=context.getSystemService(AlarmManager::class.java)
        val pi=pending(context,id,text)
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(at,pi),pi)
    }
    fun cancel(context: Context,id:String) { context.getSystemService(AlarmManager::class.java).cancel(pending(context,id,"")) }
    private fun pending(c:Context,id:String,text:String)=PendingIntent.getBroadcast(c,id.hashCode(),Intent(c,AlarmReceiver::class.java).putExtra("id",id).putExtra("text",text),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}
