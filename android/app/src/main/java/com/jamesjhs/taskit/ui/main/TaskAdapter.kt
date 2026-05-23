package com.jamesjhs.taskit.ui.main

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.taskit.R
import com.jamesjhs.taskit.models.Task
import java.text.SimpleDateFormat
import java.util.*

class TaskAdapter(
    private val tasks: List<Task>,
    private val onTaskClick: (Task) -> Unit,
    private val onStatusChange: (Task) -> Unit
) : RecyclerView.Adapter<TaskAdapter.TaskViewHolder>() {

    class TaskViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.taskTitle)
        val details: TextView = view.findViewById(R.id.taskDetails)
        val type: TextView = view.findViewById(R.id.taskType)
        val group: TextView = view.findViewById(R.id.taskGroup)
        val dueDate: TextView = view.findViewById(R.id.taskDueDate)
        val btnStatus: ImageButton = view.findViewById(R.id.btnChangeStatus)
        val iconRecurring: ImageView = view.findViewById(R.id.iconRecurring)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TaskViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_task, parent, false)
        return TaskViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskViewHolder, position: Int) {
        val task = tasks[position]
        holder.title.text = task.title
        
        if (!task.details.isNullOrBlank()) {
            holder.details.text = task.details
            holder.details.visibility = View.VISIBLE
        } else {
            holder.details.visibility = View.GONE
        }

        holder.type.text = task.typeName ?: "Task"
        
        if (!task.groupName.isNullOrBlank()) {
            holder.group.text = task.groupName
            holder.group.visibility = View.VISIBLE
        } else {
            holder.group.visibility = View.GONE
        }

        if (task.dueDate != null) {
            val sdf = SimpleDateFormat("MMM d, HH:mm", Locale.getDefault())
            holder.dueDate.text = sdf.format(Date(task.dueDate))
            holder.dueDate.visibility = View.VISIBLE
            
            // Color due date if overdue
            if (task.dueDate < System.currentTimeMillis() && task.status != "complete") {
                holder.dueDate.setTextColor(Color.RED)
            } else {
                holder.dueDate.setTextColor(Color.GRAY)
            }
        } else {
            holder.dueDate.visibility = View.GONE
        }

        // Status Icon
        val iconRes = when (task.status) {
            "complete" -> R.drawable.ic_task_complete
            "started" -> R.drawable.ic_task_started
            else -> R.drawable.ic_task_not_started
        }
        holder.btnStatus.setImageResource(iconRes)
        
        val iconTint = when (task.status) {
            "complete" -> Color.parseColor("#10B981") // Green-500
            "started" -> Color.parseColor("#1A56DB") // TaskIt Blue
            else -> Color.parseColor("#9CA3AF") // Gray-400
        }
        holder.btnStatus.setColorFilter(iconTint)

        holder.btnStatus.setOnClickListener { onStatusChange(task) }
        holder.itemView.setOnClickListener { onTaskClick(task) }

        // Recurring icon
        if (task.recurInterval != null && task.recurUnit != null) {
            holder.iconRecurring.visibility = View.VISIBLE
        } else {
            holder.iconRecurring.visibility = View.GONE
        }
    }

    override fun getItemCount() = tasks.size
}
