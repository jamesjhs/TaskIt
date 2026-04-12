package com.jamesjhs.jobber.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.models.Task
import com.jamesjhs.jobber.ui.auth.AuthActivity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var tokenManager: TokenManager
    private var tasks: List<Task> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        tokenManager = TokenManager(this)
        loadTasks()
    }

    private fun loadTasks() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: run {
                logout()
                return@launch
            }
            try {
                val response = ApiClient.apiService.getTasks("Bearer $token")
                if (response.isSuccessful) {
                    tasks = response.body() ?: emptyList()
                    updateTaskList()
                } else if (response.code() == 401) {
                    logout()
                }
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Error loading tasks: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateTaskList() {
        val recycler = findViewById<RecyclerView>(R.id.recyclerTasks)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = TaskAdapter(tasks) { task ->
            Toast.makeText(this, "Task: ${task.title}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_logout -> {
                logout()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun logout() {
        lifecycleScope.launch {
            tokenManager.clearToken()
            startActivity(Intent(this@MainActivity, AuthActivity::class.java))
            finish()
        }
    }
}
