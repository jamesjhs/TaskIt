package com.jamesjhs.jobber.ui.main

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.models.Task

class TaskAdapter(
    private val tasks: List<Task>,
    private val onTaskClick: (Task) -> Unit
) : RecyclerView.Adapter<TaskAdapter.TaskViewHolder>() {

    class TaskViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.taskTitle)
        val status: TextView = view.findViewById(R.id.taskStatus)
        val type: TextView = view.findViewById(R.id.taskType)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TaskViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_task, parent, false)
        return TaskViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskViewHolder, position: Int) {
        val task = tasks[position]
        holder.title.text = task.title
        holder.status.text = when (task.status) {
            "not_started" -> "Not Started"
            "started" -> "Started"
            "complete" -> "Complete"
            else -> task.status
        }
        holder.status.setTextColor(when (task.status) {
            "not_started" -> Color.GRAY
            "started" -> Color.BLUE
            "complete" -> Color.parseColor("#4CAF50")
            else -> Color.BLACK
        })
        holder.type.text = task.typeName ?: ""
        holder.itemView.setOnClickListener { onTaskClick(task) }
    }

    override fun getItemCount() = tasks.size
}
