package cz.nezapomen.app

import android.app.NotificationManager
import android.graphics.Color
import android.media.*
import android.os.Bundle
import android.os.VibrationEffect
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

class RingActivity:AppCompatActivity(){
 private var player:MediaPlayer?=null; private var id=""; private var text=""
 override fun onCreate(b:Bundle?){super.onCreate(b);setShowWhenLocked(true);setTurnScreenOn(true);window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);id=intent.getStringExtra("id")?:"";text=intent.getStringExtra("text")?:"Upomínka";startSound();setContentView(ui())}
 private fun ui()=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(32,48,32,48);setBackgroundColor(Color.rgb(231,240,236));addView(TextView(context).apply{this.text="⏰";textSize=64f;gravity=Gravity.CENTER});addView(TextView(context).apply{this.text=this@RingActivity.text;textSize=26f;gravity=Gravity.CENTER;setPadding(0,24,0,32)});addView(Button(context).apply{this.text="Vypnout";setOnClickListener{stopAndFinish()}});addView(TextView(context).apply{this.text="Odložit";textSize=18f;setPadding(0,24,0,8)});val row=LinearLayout(context);listOf(5,10,30,60,120,180).forEach{m->row.addView(Button(context).apply{text=if(m<60)"$m min" else "${m/60} h";setOnClickListener{AlarmScheduler.schedule(this@RingActivity,id,this@RingActivity.text,System.currentTimeMillis()+m*60000L);stopAndFinish()}})};addView(row)}
 private fun startSound(){val uri=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);player=MediaPlayer.create(this,uri)?.apply{isLooping=true;start()};if(android.os.Build.VERSION.SDK_INT>=31)getSystemService(VibratorManager::class.java).defaultVibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0,700,300),0))}
 private fun stopAndFinish(){player?.stop();getSystemService(NotificationManager::class.java).cancel(id.hashCode());finishAndRemoveTask()}
 override fun onDestroy(){player?.release();super.onDestroy()}
}
