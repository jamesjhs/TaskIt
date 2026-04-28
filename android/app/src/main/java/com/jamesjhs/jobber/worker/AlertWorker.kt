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
import com.jamesjhs.jobber.models.Task
import com.jamesjhs.jobber.ui.main.MainActivity
import com.jamesjhs.jobber.ui.main.TaskDetailActivity
import kotlinx.coroutines.flow.first
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlertWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val tokenManager = TokenManager.getInstance(context)
    private val sharedPrefs = context.getSharedPreferences("alert_prefs", Context.MODE_PRIVATE)

    // Reminder windows (in milliseconds) matching the server scheduler.
    private data class ReminderWindow(val key: String, val minMs: Long, val maxMs: Long, val label: String)
    private val reminderWindows = listOf(
        ReminderWindow("7d",  6L * 24 * 60 * 60 * 1000,  8L * 24 * 60 * 60 * 1000,  "7 days"),
        ReminderWindow("1d",  22L * 60 * 60 * 1000,       50L * 60 * 60 * 1000,       "1 day"),
        ReminderWindow("0d",  0L,                          25L * 60 * 60 * 1000,       "today"),
    )

    override suspend fun doWork(): Result {
        val token = tokenManager.token.first() ?: return Result.success()

        try {
            // ── 1. User alerts (existing behaviour) ────────────────────────────
            val alertResponse = ApiClient.apiService.getAlerts("Bearer $token")
            if (alertResponse.isSuccessful) {
                val alerts = alertResponse.body() ?: emptyList()
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
                            showAlertNotification(alert.message)
                        }
                        sharedPrefs.edit().putString("last_alert_id", latestAlert.id).apply()
                    }
                }
            }

            // ── 2. Task due-date reminders ──────────────────────────────────────
            val taskResponse = ApiClient.apiService.getTasks("Bearer $token", archived = false)
            if (taskResponse.isSuccessful) {
                val tasks = taskResponse.body() ?: emptyList()
                val now = System.currentTimeMillis()
                val today = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date())

                // Load previously-fired reminder keys for today.
                val firedKey = "task_reminders_$today"
                val firedSet = sharedPrefs.getStringSet(firedKey, emptySet())!!.toMutableSet()

                for (task in tasks) {
                    val dueDate = task.dueDate ?: continue
                    if (task.status == "complete" || task.archived) continue

                    val msUntilDue = dueDate - now

                    for (window in reminderWindows) {
                        if (msUntilDue < window.minMs || msUntilDue > window.maxMs) continue
                        val compositeKey = "${task.id}:${window.key}"
                        if (firedSet.contains(compositeKey)) continue

                        showTaskReminderNotification(task, window.label)
                        firedSet.add(compositeKey)
                    }
                }

                // Persist today's fired set and prune any keys from previous days.
                sharedPrefs.edit().apply {
                    putStringSet(firedKey, firedSet)
                    sharedPrefs.all.keys
                        .filter { it.startsWith("task_reminders_") && it != firedKey }
                        .forEach { remove(it) }
                }.apply()
            }
        } catch (e: Exception) {
            return Result.retry()
        }

        return Result.success()
    }

    private fun showAlertNotification(message: String) {
        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "jobber_alerts"

        val channel = NotificationChannel(channelId, "TaskIt! Alerts", NotificationManager.IMPORTANCE_DEFAULT)
        notificationManager.createNotificationChannel(channel)

        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(applicationContext, 0, intent, PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_nav_alerts)
            .setContentTitle("New TaskIt! Alert")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun showTaskReminderNotification(task: Task, windowLabel: String) {
        val notificationManager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "taskit_task_reminders"

        val channel = NotificationChannel(channelId, "TaskIt! Task Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Due-date reminders for your tasks"
        }
        notificationManager.createNotificationChannel(channel)

        val intent = Intent(applicationContext, TaskDetailActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("TASK", task)
        }
        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            task.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val dueDateStr = task.dueDate?.let {
            SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(Date(it))
        } ?: "soon"

        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_nav_alerts)
            .setContentTitle("TaskIt! Reminder")
            .setContentText("\"${task.title}\" is due in $windowLabel ($dueDateStr).")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("\"${task.title}\" is due in $windowLabel ($dueDateStr)."))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        // Use a stable notification ID per task so repeated runs update rather than stack.
        notificationManager.notify("${task.id}:reminder".hashCode(), notification)
    }
}
