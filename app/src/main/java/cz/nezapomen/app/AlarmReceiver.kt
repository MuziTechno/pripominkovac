package cz.nezapomen.app

import android.app.*
import android.content.*
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class AlarmReceiver: BroadcastReceiver() {
 override fun onReceive(c:Context,i:Intent) {
   val id=i.getStringExtra("id")?:return; val text=i.getStringExtra("text")?:"Upomínka"
   val channel="alarm"
   if(Build.VERSION.SDK_INT>=26) c.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(channel,"Budíky",NotificationManager.IMPORTANCE_HIGH).apply{lockscreenVisibility=Notification.VISIBILITY_PUBLIC;setSound(null,null)})
   val full=PendingIntent.getActivity(c,id.hashCode(),Intent(c,RingActivity::class.java).putExtra("id",id).putExtra("text",text).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   val n=NotificationCompat.Builder(c,channel).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Budík").setContentText(text).setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_ALARM).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(true).setFullScreenIntent(full,true).build()
   try{NotificationManagerCompat.from(c).notify(id.hashCode(),n)}catch(_:SecurityException){}
 }
}
