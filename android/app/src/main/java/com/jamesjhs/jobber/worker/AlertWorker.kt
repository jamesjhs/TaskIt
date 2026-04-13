package com.jamesjhs.jobber.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.ui.main.MainActivity
import kotlinx.coroutines.flow.first

class AlertWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val tokenManager = TokenManager.getInstance(context)
    private val sharedPrefs = context.getSharedPreferences("alert_prefs", Context.MODE_PRIVATE)

    override suspend fun doWork(): Result {
        val token = tokenManager.token.first() ?: return Result.success()

        try {
            val response = ApiClient.apiService.getAlerts("Bearer $token")
            if (response.isSuccessful) {
                val alerts = response.body() ?: emptyList()
                val lastAlertId = sharedPrefs.getString("last_alert_id", null)
                
                if (alerts.isNotEmpty()) {
                    val latestAlert = alerts[0]
                    if (latestAlert.id != lastAlertId) {
                        val newAlerts = if (lastAlertId == null) {
                            alerts.take(1)
                        } else {
                            alerts.takeWhile { it.id != lastAlertId }
                        }

                        for (alert in newAlerts) {
                            showNotification(alert.message)
                        }

                        sharedPrefs.edit().putString("last_alert_id", latestAlert.id).apply()
                    }
                }
            }
        } catch (e: Exception) {
            return Result.retry()
        }

        return Result.success()
    }

    private fun showNotification(message: String) {
        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "jobber_alerts"

        val channel = NotificationChannel(channelId, "Jobber Alerts", NotificationManager.IMPORTANCE_DEFAULT)
        notificationManager.createNotificationChannel(channel)

        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(applicationContext, 0, intent, PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_nav_alerts)
            .setContentTitle("New Jobber Alert")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
