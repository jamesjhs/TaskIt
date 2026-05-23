package com.jamesjhs.taskit.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.taskit.R
import com.jamesjhs.taskit.api.ApiClient
import com.jamesjhs.taskit.data.TokenManager
import com.jamesjhs.taskit.models.Task
import com.jamesjhs.taskit.ui.auth.AuthActivity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

import androidx.fragment.app.Fragment
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.jamesjhs.taskit.databinding.ActivityMainBinding
import com.jamesjhs.taskit.worker.AlertWorker
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        tokenManager = TokenManager.getInstance(this)
        
        setupNavigation()
        setupAlertWorker()
        
        // Default fragment
        if (savedInstanceState == null) {
            binding.bottomNav.selectedItemId = R.id.nav_tasks
        }
    }

    private fun setupNavigation() {
        binding.bottomNav.setOnItemSelectedListener { item ->
            val fragment = when (item.itemId) {
                R.id.nav_tasks -> TasksFragment()
                R.id.nav_groups -> GroupsFragment()
                R.id.nav_alerts -> AlertsFragment()
                R.id.nav_profile -> ProfileFragment()
                else -> TasksFragment()
            }
            supportFragmentManager.beginTransaction()
                .replace(R.id.contentFrame, fragment)
                .commit()
            true
        }
    }

    private fun setupAlertWorker() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
        }

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val alertRequest = PeriodicWorkRequestBuilder<AlertWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "AlertWorker",
            androidx.work.ExistingPeriodicWorkPolicy.KEEP,
            alertRequest
        )
    }

    private fun logout() {
        lifecycleScope.launch {
            tokenManager.clearToken()
            startActivity(Intent(this@MainActivity, AuthActivity::class.java))
            finish()
        }
    }
}
