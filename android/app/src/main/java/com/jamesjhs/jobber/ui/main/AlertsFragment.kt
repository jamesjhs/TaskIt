package com.jamesjhs.jobber.ui.main

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.databinding.FragmentAlertsBinding
import com.jamesjhs.jobber.models.Alert
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class AlertsFragment : Fragment() {
    private var _binding: FragmentAlertsBinding? = null
    private val binding get() = _binding!!

    private lateinit var tokenManager: TokenManager
    private lateinit var adapter: AlertAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAlertsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        tokenManager = TokenManager.getInstance(requireContext())

        setupRecyclerView()
        setupSwipeRefresh()
        loadAlerts()
    }

    private fun setupRecyclerView() {
        adapter = AlertAdapter { alert ->
            if (alert.readAt == null) {
                markAsRead(alert)
            }
        }
        binding.rvAlerts.layoutManager = LinearLayoutManager(requireContext())
        binding.rvAlerts.adapter = adapter
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            loadAlerts()
        }
    }

    private fun loadAlerts() {
        binding.progressBar.visibility = if (binding.swipeRefresh.isRefreshing) View.GONE else View.VISIBLE
        binding.emptyState.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val token = tokenManager.token.first() ?: return@launch
                val response = ApiClient.apiService.getAlerts("Bearer $token")
                
                binding.progressBar.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false

                if (response.isSuccessful) {
                    val alerts = response.body() ?: emptyList()
                    adapter.submitList(alerts)
                    binding.emptyState.visibility = if (alerts.isEmpty()) View.VISIBLE else View.GONE
                    
                    // Update last seen alert for the worker to sync
                    if (alerts.isNotEmpty()) {
                        requireContext().getSharedPreferences("alert_prefs", Context.MODE_PRIVATE)
                            .edit().putString("last_alert_id", alerts[0].id).apply()
                    }
                } else {
                    Toast.makeText(requireContext(), "Failed to load alerts", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.swipeRefresh.isRefreshing = false
                Toast.makeText(requireContext(), "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun markAsRead(alert: Alert) {
        lifecycleScope.launch {
            try {
                val token = tokenManager.token.first() ?: return@launch
                val response = ApiClient.apiService.markAlertRead("Bearer $token", alert.id)
                if (response.isSuccessful) {
                    // Update the list locally
                    val currentList = adapter.currentList.toMutableList()
                    val index = currentList.indexOfFirst { it.id == alert.id }
                    if (index != -1) {
                        currentList[index] = alert.copy(readAt = System.currentTimeMillis())
                        adapter.submitList(currentList)
                    }
                }
            } catch (e: Exception) {
                // Ignore error for marking as read
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
