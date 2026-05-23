package com.jamesjhs.taskit.ui.main

import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.taskit.databinding.ItemAlertBinding
import com.jamesjhs.taskit.models.Alert
import java.text.SimpleDateFormat
import java.util.*

class AlertAdapter(
    private val onAlertClick: (Alert) -> Unit
) : ListAdapter<Alert, AlertAdapter.AlertViewHolder>(AlertDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AlertViewHolder {
        val binding = ItemAlertBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return AlertViewHolder(binding)
    }

    override fun onBindViewHolder(holder: AlertViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class AlertViewHolder(private val binding: ItemAlertBinding) :
        RecyclerView.ViewHolder(binding.root) {

        private val dateFormat = SimpleDateFormat("MMM d, HH:mm", Locale.getDefault())

        fun bind(alert: Alert) {
            binding.alertMessage.text = alert.message
            binding.alertDate.text = dateFormat.format(Date(alert.createdAt))

            if (alert.readAt == null) {
                binding.alertContainer.setBackgroundColor(Color.parseColor("#EFF6FF")) // Light blue
                binding.alertMessage.alpha = 1.0f
            } else {
                binding.alertContainer.setBackgroundColor(Color.WHITE)
                binding.alertMessage.alpha = 0.6f
            }

            binding.root.setOnClickListener {
                onAlertClick(alert)
            }
        }
    }

    class AlertDiffCallback : DiffUtil.ItemCallback<Alert>() {
        override fun areItemsTheSame(oldItem: Alert, newItem: Alert) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Alert, newItem: Alert) = oldItem == newItem
    }
}
