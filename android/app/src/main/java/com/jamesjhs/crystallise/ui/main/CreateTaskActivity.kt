package com.jamesjhs.crystallise.ui.main

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.MenuItem
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.jamesjhs.crystallise.api.ApiClient
import com.jamesjhs.crystallise.data.TokenManager
import com.jamesjhs.crystallise.databinding.ActivityCreateTaskBinding
import com.jamesjhs.crystallise.models.CreateTaskRequest
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.crystallise.models.Group
import com.jamesjhs.crystallise.models.Task
import com.jamesjhs.crystallise.models.TaskType
import com.jamesjhs.crystallise.models.User
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class CreateTaskActivity : AppCompatActivity() {
    private lateinit var binding: ActivityCreateTaskBinding
    private lateinit var tokenManager: TokenManager
    private var taskTypes: List<TaskType> = emptyList()
    private var groups: List<Group> = emptyList()
    private var groupMembers: List<User> = emptyList()
    private val selectedAssigneeIds = mutableSetOf<String>()
    
    private var selectedCalendar = Calendar.getInstance()
    private var isDateSet = false
    private var editingTask: Task? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCreateTaskBinding.inflate(layoutInflater)
        setContentView(binding.root)

        editingTask = intent.getSerializableExtra("EDIT_TASK") as? Task

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        if (editingTask != null) {
            supportActionBar?.title = getString(com.jamesjhs.crystallise.R.string.edit_task)
            binding.btnSave.text = getString(com.jamesjhs.crystallise.R.string.update_task)
        } else {
            supportActionBar?.title = getString(com.jamesjhs.crystallise.R.string.create_task)
        }

        tokenManager = TokenManager.getInstance(this)

        setupSpinners()
        fetchTaskTypes()
        fetchGroups()

        binding.btnPickDate.setOnClickListener {
            showDatePicker()
        }

        binding.btnSave.setOnClickListener {
            saveTask()
        }

        binding.btnAddType.setOnClickListener {
            showCreateTypeDialog()
        }

        binding.spinnerGroup.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (position == 0) { // "None" selected
                    binding.layoutAssignees.visibility = View.GONE
                    groupMembers = emptyList()
                    selectedAssigneeIds.clear()
                } else {
                    val selectedGroup = groups[position - 1]
                    fetchGroupMembers(selectedGroup.id)
                }
            }
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        }
    }

    private fun setupSpinners() {
        val recurUnits = resources.getStringArray(com.jamesjhs.crystallise.R.array.recur_units)
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, recurUnits)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spinnerRecurUnit.adapter = adapter
    }

    private fun fetchTaskTypes() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.getTaskTypes("Bearer $token")
                if (response.isSuccessful) {
                    taskTypes = response.body() ?: emptyList()
                    val typeNames = taskTypes.map { it.name }
                    val adapter = ArrayAdapter(this@CreateTaskActivity, android.R.layout.simple_spinner_item, typeNames)
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                    binding.spinnerType.adapter = adapter
                    
                    if (editingTask != null) {
                        populateTaskData()
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(this@CreateTaskActivity, "Failed to load task types", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun fetchGroups() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.getGroups("Bearer $token")
                if (response.isSuccessful) {
                    groups = response.body() ?: emptyList()
                    val groupNames = mutableListOf("None (Personal)")
                    groupNames.addAll(groups.map { it.name })
                    val adapter = ArrayAdapter(this@CreateTaskActivity, android.R.layout.simple_spinner_item, groupNames)
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                    binding.spinnerGroup.adapter = adapter

                    // If editing, select the correct group
                    editingTask?.groupId?.let { gid ->
                        val index = groups.indexOfFirst { it.id == gid }
                        if (index != -1) {
                            binding.spinnerGroup.setSelection(index + 1)
                        }
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(this@CreateTaskActivity, "Failed to load groups", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun fetchGroupMembers(groupId: String) {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.getGroupMembers("Bearer $token", groupId)
                if (response.isSuccessful) {
                    groupMembers = response.body() ?: emptyList()
                    binding.layoutAssignees.visibility = View.VISIBLE
                    setupAssigneesList()
                }
            } catch (e: Exception) {
                Toast.makeText(this@CreateTaskActivity, "Failed to load group members", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupAssigneesList() {
        binding.recyclerAssignees.layoutManager = LinearLayoutManager(this)
        binding.recyclerAssignees.adapter = object : RecyclerView.Adapter<AssigneeViewHolder>() {
            override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AssigneeViewHolder {
                val view = LayoutInflater.from(parent.context).inflate(com.jamesjhs.crystallise.R.layout.item_assignee_checkbox, parent, false)
                return AssigneeViewHolder(view)
            }

            override fun onBindViewHolder(holder: AssigneeViewHolder, position: Int) {
                val user = groupMembers[position]
                holder.checkbox.text = user.username
                holder.checkbox.isChecked = selectedAssigneeIds.contains(user.id)
                holder.checkbox.setOnCheckedChangeListener { _, isChecked ->
                    if (isChecked) selectedAssigneeIds.add(user.id)
                    else selectedAssigneeIds.remove(user.id)
                }
            }

            override fun getItemCount() = groupMembers.size
        }
    }

    class AssigneeViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val checkbox: CheckBox = view.findViewById(com.jamesjhs.crystallise.R.id.checkAssignee)
    }

    private fun populateTaskData() {
        editingTask?.let { task ->
            binding.editTitle.setText(task.title)
            binding.editDetails.setText(task.details)
            
            val typeIndex = taskTypes.indexOfFirst { it.id == task.typeId }
            if (typeIndex != -1) {
                binding.spinnerType.setSelection(typeIndex)
            }

            if (task.dueDate != null) {
                selectedCalendar.timeInMillis = task.dueDate
                isDateSet = true
                val sdf = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())
                binding.btnPickDate.text = sdf.format(selectedCalendar.time)
            }

            if (task.recurInterval != null) {
                binding.editRecurInterval.setText(task.recurInterval.toString())
                val unitArray = resources.getStringArray(com.jamesjhs.crystallise.R.array.recur_units)
                val unitIndex = unitArray.indexOf(task.recurUnit)
                if (unitIndex != -1) {
                    binding.spinnerRecurUnit.setSelection(unitIndex)
                }
            }

            // Group selection is handled in fetchGroups()
            // Assignees
            task.assignees?.forEach { selectedAssigneeIds.add(it.id) }
        }
    }

    private fun showDatePicker() {
        val calendar = Calendar.getInstance()
        DatePickerDialog(
            this,
            { _, year, month, dayOfMonth ->
                selectedCalendar.set(Calendar.YEAR, year)
                selectedCalendar.set(Calendar.MONTH, month)
                selectedCalendar.set(Calendar.DAY_OF_MONTH, dayOfMonth)
                showTimePicker()
            },
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH),
            calendar.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    private fun showTimePicker() {
        val calendar = Calendar.getInstance()
        TimePickerDialog(
            this,
            { _, hourOfDay, minute ->
                selectedCalendar.set(Calendar.HOUR_OF_DAY, hourOfDay)
                selectedCalendar.set(Calendar.MINUTE, minute)
                isDateSet = true
                val sdf = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())
                binding.btnPickDate.text = sdf.format(selectedCalendar.time)
            },
            calendar.get(Calendar.HOUR_OF_DAY),
            calendar.get(Calendar.MINUTE),
            true
        ).show()
    }

    private fun saveTask() {
        val title = binding.editTitle.text.toString().trim()
        val details = binding.editDetails.text.toString().trim()
        
        if (title.isEmpty()) {
            binding.editTitle.error = "Title is required"
            return
        }

        val selectedTypeIndex = binding.spinnerType.selectedItemPosition
        if (selectedTypeIndex < 0 || selectedTypeIndex >= taskTypes.size) {
            Toast.makeText(this, "Please select a task type", Toast.LENGTH_SHORT).show()
            return
        }
        val typeId = taskTypes[selectedTypeIndex].id

        val recurIntervalStr = binding.editRecurInterval.text.toString().trim()
        val recurInterval = recurIntervalStr.toIntOrNull()
        val recurUnit = if (recurInterval != null) binding.spinnerRecurUnit.selectedItem.toString() else null

        val dueDate = if (isDateSet) selectedCalendar.timeInMillis else null

        // Group selection
        val selectedGroupIndex = binding.spinnerGroup.selectedItemPosition
        val groupId = if (selectedGroupIndex > 0) groups[selectedGroupIndex - 1].id else null

        binding.btnSave.isEnabled = false
        binding.progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.btnSave.isEnabled = true
                binding.progressBar.visibility = View.GONE
                return@launch
            }
            try {
                val request = CreateTaskRequest(
                    title = title,
                    details = details.ifEmpty { null },
                    typeId = typeId,
                    groupId = groupId,
                    assigneeIds = selectedAssigneeIds.toList(),
                    dueDate = dueDate,
                    recurInterval = recurInterval,
                    recurUnit = recurUnit
                )
                
                val response = if (editingTask != null) {
                    ApiClient.apiService.updateTask("Bearer $token", editingTask!!.id, request)
                } else {
                    ApiClient.apiService.createTask("Bearer $token", request)
                }

                if (response.isSuccessful) {
                    val message = if (editingTask != null) "Task updated" else "Task created"
                    Toast.makeText(this@CreateTaskActivity, message, Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    val message = if (editingTask != null) "Update failed" else "Creation failed"
                    Toast.makeText(this@CreateTaskActivity, message, Toast.LENGTH_SHORT).show()
                    binding.btnSave.isEnabled = true
                    binding.progressBar.visibility = View.GONE
                }
            } catch (e: Exception) {
                Toast.makeText(this@CreateTaskActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                binding.btnSave.isEnabled = true
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun showCreateTypeDialog() {
        val input = EditText(this)
        val padding = (16 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this)
        val params = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT)
        params.marginStart = padding
        params.marginEnd = padding
        params.topMargin = padding / 2
        input.layoutParams = params
        input.hint = getString(com.jamesjhs.crystallise.R.string.task_type_hint)
        container.addView(input)

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(getString(com.jamesjhs.crystallise.R.string.new_task_type))
            .setMessage(getString(com.jamesjhs.crystallise.R.string.create_task_type_message))
            .setView(container)
            .setPositiveButton(getString(com.jamesjhs.crystallise.R.string.create)) { _, _ ->
                val name = input.text.toString().trim()
                if (name.isNotEmpty()) {
                    createNewTaskType(name)
                }
            }
            .setNegativeButton(getString(com.jamesjhs.crystallise.R.string.cancel), null)
            .show()
    }

    private fun createNewTaskType(name: String) {
        binding.btnSave.isEnabled = false
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.btnSave.isEnabled = true
                binding.progressBar.visibility = View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.createTaskType("Bearer $token", mapOf("name" to name))
                if (response.isSuccessful) {
                    val newType = response.body()
                    if (newType != null) {
                        Toast.makeText(this@CreateTaskActivity, getString(com.jamesjhs.crystallise.R.string.task_type_created), Toast.LENGTH_SHORT).show()
                        fetchTaskTypes()
                    }
                } else {
                    Toast.makeText(this@CreateTaskActivity, getString(com.jamesjhs.crystallise.R.string.failed_create_task_type), Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@CreateTaskActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.btnSave.isEnabled = true
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
