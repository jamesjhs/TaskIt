package com.jamesjhs.taskit.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.jamesjhs.taskit.api.ApiClient
import com.jamesjhs.taskit.data.TokenManager
import com.jamesjhs.taskit.databinding.FragmentTasksBinding
import com.jamesjhs.taskit.models.Group
import com.jamesjhs.taskit.models.Task
import com.jamesjhs.taskit.models.TaskType
import com.jamesjhs.taskit.models.UpdateStatusRequest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class TasksFragment : Fragment() {
    private var _binding: FragmentTasksBinding? = null
    private val binding get() = _binding!!
    private lateinit var tokenManager: TokenManager
    private var tasks: List<Task> = emptyList()
    private var groups: List<Group> = emptyList()
    private var taskTypes: List<TaskType> = emptyList()

    private var selectedGroupId: String? = null
    private var selectedTypeId: String? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentTasksBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, position: Bundle?) {
        super.onViewCreated(view, position)
        tokenManager = TokenManager.getInstance(requireContext())
        
        binding.fabAddTask.setOnClickListener {
            val intent = Intent(requireContext(), CreateTaskActivity::class.java)
            startActivityForResult(intent, 100)
        }

        setupFilters()
        loadTasks()
        fetchMetadata()
    }

    private fun setupFilters() {
        binding.chipAll.setOnClickListener {
            selectedGroupId = null
            selectedTypeId = null
            updateTaskList()
        }
    }

    private fun fetchMetadata() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val groupResponse = ApiClient.apiService.getGroups("Bearer $token")
                if (groupResponse.isSuccessful) {
                    groups = groupResponse.body() ?: emptyList()
                }

                val typeResponse = ApiClient.apiService.getTaskTypes("Bearer $token")
                if (typeResponse.isSuccessful) {
                    taskTypes = typeResponse.body() ?: emptyList()
                }

                populateFilterChips()
            } catch (e: Exception) {
                // Silently fail metadata fetch
            }
        }
    }

    private fun populateFilterChips() {
        val chipGroup = binding.chipGroupFilters
        // Clear all except the "All" chip
        for (i in chipGroup.childCount - 1 downTo 1) {
            chipGroup.removeViewAt(i)
        }

        // Add Group chips
        groups.forEach { group ->
            val chip = com.google.android.material.chip.Chip(requireContext(), null, com.google.android.material.R.attr.chipStyle)
            chip.text = group.name
            chip.isCheckable = true
            chip.setOnClickListener {
                selectedGroupId = group.id
                selectedTypeId = null
                updateTaskList()
            }
            chipGroup.addView(chip)
        }

        // Add Type chips
        taskTypes.forEach { type ->
            val chip = com.google.android.material.chip.Chip(requireContext(), null, com.google.android.material.R.attr.chipStyle)
            chip.text = type.name
            chip.isCheckable = true
            chip.setOnClickListener {
                selectedGroupId = null
                selectedTypeId = type.id
                updateTaskList()
            }
            chipGroup.addView(chip)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 100 && resultCode == android.app.Activity.RESULT_OK) {
            loadTasks()
        }
    }

    private fun loadTasks() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.getTasks("Bearer $token")
                if (response.isSuccessful) {
                    tasks = response.body() ?: emptyList()
                    updateTaskList()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateTaskList() {
        var filteredTasks = tasks
        if (selectedGroupId != null) {
            filteredTasks = tasks.filter { it.groupId == selectedGroupId }
        } else if (selectedTypeId != null) {
            filteredTasks = tasks.filter { it.typeId == selectedTypeId }
        }

        // Sort: incomplete urgent first, then incomplete others, complete tasks always last
        val sortedTasks = filteredTasks.sortedWith(
            compareBy(
                { if (it.status == "complete") 1 else 0 },
                { if ("urgent".equals(it.typeName, ignoreCase = true)) 0 else 1 }
            )
        )

        binding.recyclerTasks.layoutManager = LinearLayoutManager(context)
        binding.recyclerTasks.adapter = TaskAdapter(sortedTasks,
            onTaskClick = { task ->
                val intent = Intent(requireContext(), TaskDetailActivity::class.java)
                intent.putExtra("TASK", task)
                startActivity(intent)
            },
            onStatusChange = { task ->
                toggleTaskStatus(task)
            }
        )
    }

    private fun toggleTaskStatus(task: Task) {
        val nextStatus = when (task.status) {
            "not_started" -> "started"
            "started" -> "complete"
            "complete" -> "not_started"
            else -> "not_started"
        }
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.updateTaskStatus("Bearer $token", task.id, UpdateStatusRequest(nextStatus))
                if (response.isSuccessful) loadTasks()
            } catch (e: Exception) {
                Toast.makeText(context, "Update failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
