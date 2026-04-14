package com.jamesjhs.jobber.ui.main

import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.api.TaskNote
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.databinding.ActivityTaskDetailBinding
import com.jamesjhs.jobber.models.Task
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.Date
import java.util.*

class TaskDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityTaskDetailBinding
    private lateinit var tokenManager: TokenManager
    private var task: Task? = null
    private var notes: MutableList<TaskNote> = mutableListOf()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTaskDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Task Details"

        tokenManager = TokenManager.getInstance(this)
        task = intent.getSerializableExtra("TASK") as? Task

        if (task == null) {
            finish()
            return
        }

        setupUI()
        loadNotes()

        binding.btnSendNote.setOnClickListener {
            sendNote()
        }
    }

    private fun setupUI() {
        task?.let {
            binding.detailTitle.text = it.title
            binding.detailDescription.text = it.details ?: "No details provided."
            binding.detailStatus.text = it.status.uppercase().replace("_", " ")
            binding.detailType.text = it.typeName ?: "General"
            
            if (it.dueDate != null) {
                val sdf = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())
                binding.detailDueDate.text = sdf.format(Date(it.dueDate))
            } else {
                binding.detailDueDate.text = "None"
            }

            if (it.recurInterval != null && it.recurUnit != null) {
                binding.detailRecurrence.text = "Every ${it.recurInterval} ${it.recurUnit}"
            } else {
                binding.detailRecurrence.text = "None"
            }
        }
    }

    private fun loadNotes() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.getTaskNotes("Bearer $token", task!!.id)
                if (response.isSuccessful) {
                    notes = response.body()?.toMutableList() ?: mutableListOf()
                    updateNotesList()
                }
            } catch (e: Exception) {
                Toast.makeText(this@TaskDetailActivity, "Error loading notes", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateNotesList() {
        binding.recyclerNotes.layoutManager = LinearLayoutManager(this)
        binding.recyclerNotes.adapter = NoteAdapter(notes)
    }

    private fun sendNote() {
        val noteText = binding.editNote.text.toString().trim()
        if (noteText.isEmpty()) return

        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.addTaskNote(
                    "Bearer $token",
                    task!!.id,
                    mapOf("note" to noteText)
                )
                if (response.isSuccessful) {
                    binding.editNote.setText("")
                    loadNotes() // Refresh
                }
            } catch (e: Exception) {
                Toast.makeText(this@TaskDetailActivity, "Failed to add note", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.menu_task_detail, menu)
        // Only show Fast forward for recurring tasks
        menu?.findItem(R.id.action_fast_forward)?.isVisible =
            task?.recurInterval != null && task?.recurUnit != null
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            android.R.id.home -> {
                finish()
                return true
            }
            R.id.action_edit -> {
                // Edit logic
                val intent = Intent(this, CreateTaskActivity::class.java)
                intent.putExtra("EDIT_TASK", task)
                @Suppress("DEPRECATION")
                startActivityForResult(intent, 102)
                return true
            }
            R.id.action_delete -> {
                showDeleteConfirmation()
                return true
            }
            R.id.action_archive -> {
                archiveTask()
                return true
            }
            R.id.action_fast_forward -> {
                fastForwardTask()
                return true
            }
            R.id.action_defer -> {
                showDeferPicker()
                return true
            }
        }
        return super.onOptionsItemSelected(item)
    }

    private fun showDeleteConfirmation() {
        AlertDialog.Builder(this)
            .setTitle("Delete Task")
            .setMessage("Are you sure you want to delete this task? This action cannot be undone.")
            .setPositiveButton("Delete") { _, _ -> deleteTask() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun deleteTask() {
        binding.progressBar.visibility = android.view.View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = android.view.View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.deleteTask("Bearer $token", task!!.id)
                if (response.isSuccessful) {
                    Toast.makeText(this@TaskDetailActivity, "Task deleted", Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(this@TaskDetailActivity, "Failed to delete task", Toast.LENGTH_SHORT).show()
                    binding.progressBar.visibility = android.view.View.GONE
                }
            } catch (e: Exception) {
                Toast.makeText(this@TaskDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    private fun archiveTask() {
        binding.progressBar.visibility = android.view.View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = android.view.View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.archiveTask("Bearer $token", task!!.id)
                if (response.isSuccessful) {
                    Toast.makeText(this@TaskDetailActivity, "Task archived", Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(this@TaskDetailActivity, "Failed to archive task", Toast.LENGTH_SHORT).show()
                    binding.progressBar.visibility = android.view.View.GONE
                }
            } catch (e: Exception) {
                Toast.makeText(this@TaskDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    private fun showDeferPicker() {
        val calendar = Calendar.getInstance()
        DatePickerDialog(this, { _, year, month, dayOfMonth ->
            calendar.set(year, month, dayOfMonth)
            TimePickerDialog(this, { _, hourOfDay, minute ->
                calendar.set(Calendar.HOUR_OF_DAY, hourOfDay)
                calendar.set(Calendar.MINUTE, minute)
                deferTask(calendar.timeInMillis)
            }, calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), true).show()
        }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun deferTask(until: Long) {
        binding.progressBar.visibility = android.view.View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = android.view.View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.deferTask("Bearer $token", task!!.id, mapOf("dueDate" to until))
                if (response.isSuccessful) {
                    Toast.makeText(this@TaskDetailActivity, "Task deferred", Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(this@TaskDetailActivity, "Failed to defer task", Toast.LENGTH_SHORT).show()
                    binding.progressBar.visibility = android.view.View.GONE
                }
            } catch (e: Exception) {
                Toast.makeText(this@TaskDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    private fun fastForwardTask() {
        binding.progressBar.visibility = android.view.View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = android.view.View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.fastForwardTask("Bearer $token", task!!.id)
                if (response.isSuccessful) {
                    Toast.makeText(this@TaskDetailActivity, "Due date advanced to next recurrence", Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(this@TaskDetailActivity, "Failed to fast forward task", Toast.LENGTH_SHORT).show()
                    binding.progressBar.visibility = android.view.View.GONE
                }
            } catch (e: Exception) {
                Toast.makeText(this@TaskDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 102 && resultCode == RESULT_OK) {
            // Refresh logic - task might have been updated
            setResult(RESULT_OK)
            finish() // Simplify by going back to list for now
        }
    }
}
