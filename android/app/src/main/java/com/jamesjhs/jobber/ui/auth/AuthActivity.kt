package com.jamesjhs.jobber.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.models.LoginRequest
import com.jamesjhs.jobber.models.RegisterRequest
import com.jamesjhs.jobber.ui.main.MainActivity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class AuthActivity : AppCompatActivity() {
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenManager = TokenManager(this)

        // Check if already logged in
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (!token.isNullOrEmpty()) {
                navigateToMain()
                return@launch
            }
        }

        setContentView(R.layout.activity_auth)
        setupTabs()
    }

    private fun setupTabs() {
        val tabLogin = findViewById<Button>(R.id.tabLogin)
        val tabRegister = findViewById<Button>(R.id.tabRegister)
        val loginForm = findViewById<View>(R.id.loginForm)
        val registerForm = findViewById<View>(R.id.registerForm)

        tabLogin.setOnClickListener {
            loginForm.visibility = View.VISIBLE
            registerForm.visibility = View.GONE
        }

        tabRegister.setOnClickListener {
            loginForm.visibility = View.GONE
            registerForm.visibility = View.VISIBLE
        }

        // Login submit
        findViewById<Button>(R.id.btnLogin).setOnClickListener {
            val email = findViewById<EditText>(R.id.loginEmail).text.toString()
            val password = findViewById<EditText>(R.id.loginPassword).text.toString()
            performLogin(email, password)
        }

        // Register submit
        findViewById<Button>(R.id.btnRegister).setOnClickListener {
            val username = findViewById<EditText>(R.id.registerUsername).text.toString()
            val email = findViewById<EditText>(R.id.registerEmail).text.toString()
            val password = findViewById<EditText>(R.id.registerPassword).text.toString()
            performRegister(username, email, password)
        }
    }

    private fun performLogin(email: String, password: String) {
        lifecycleScope.launch {
            try {
                val response = ApiClient.apiService.login(LoginRequest(email, password))
                if (response.isSuccessful) {
                    val auth = response.body()!!
                    tokenManager.saveToken(auth.token, auth.user.id, auth.user.username)
                    navigateToMain()
                } else {
                    Toast.makeText(this@AuthActivity, "Login failed: ${response.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@AuthActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun performRegister(username: String, email: String, password: String) {
        lifecycleScope.launch {
            try {
                val response = ApiClient.apiService.register(RegisterRequest(username, email, password))
                if (response.isSuccessful) {
                    val auth = response.body()!!
                    tokenManager.saveToken(auth.token, auth.user.id, auth.user.username)
                    navigateToMain()
                } else {
                    Toast.makeText(this@AuthActivity, "Register failed: ${response.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@AuthActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
