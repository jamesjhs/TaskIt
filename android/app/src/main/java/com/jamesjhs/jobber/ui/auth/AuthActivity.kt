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

import com.jamesjhs.jobber.models.VerifyOtpRequest

class AuthActivity : AppCompatActivity() {
    private lateinit var tokenManager: TokenManager
    private var currentSessionId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tokenManager = TokenManager.getInstance(this)

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
        setupOtpForm()
    }

    private fun setupTabs() {
        val tabLogin = findViewById<Button>(R.id.tabLogin)
        val tabRegister = findViewById<Button>(R.id.tabRegister)
        val loginForm = findViewById<View>(R.id.loginForm)
        val registerForm = findViewById<View>(R.id.registerForm)
        val otpForm = findViewById<View>(R.id.otpForm)

        tabLogin.setOnClickListener {
            loginForm.visibility = View.VISIBLE
            registerForm.visibility = View.GONE
            otpForm.visibility = View.GONE
        }

        tabRegister.setOnClickListener {
            loginForm.visibility = View.GONE
            registerForm.visibility = View.VISIBLE
            otpForm.visibility = View.GONE
        }

        // Login submit
        findViewById<Button>(R.id.btnLogin).setOnClickListener {
            val email = findViewById<EditText>(R.id.loginEmail).text.toString()
            val password = findViewById<EditText>(R.id.loginPassword).text.toString()
            if (email.isNotEmpty() && password.isNotEmpty()) {
                performLogin(email, password)
            }
        }

        // Register submit
        findViewById<Button>(R.id.btnRegister).setOnClickListener {
            val username = findViewById<EditText>(R.id.registerUsername).text.toString()
            val email = findViewById<EditText>(R.id.registerEmail).text.toString()
            val password = findViewById<EditText>(R.id.registerPassword).text.toString()
            if (username.isNotEmpty() && email.isNotEmpty() && password.isNotEmpty()) {
                performRegister(username, email, password)
            }
        }
    }

    private fun setupOtpForm() {
        val otpForm = findViewById<View>(R.id.otpForm)
        val loginForm = findViewById<View>(R.id.loginForm)
        
        findViewById<Button>(R.id.btnVerifyOtp).setOnClickListener {
            val code = findViewById<EditText>(R.id.otpCode).text.toString()
            val sessionId = currentSessionId
            if (sessionId != null && code.length == 6) {
                performVerifyOtp(sessionId, code)
            }
        }

        findViewById<Button>(R.id.btnBackToLogin).setOnClickListener {
            otpForm.visibility = View.GONE
            loginForm.visibility = View.VISIBLE
        }
    }

    private fun performLogin(email: String, password: String) {
        val loginButton = findViewById<Button>(R.id.btnLogin)
        val progressBar = findViewById<ProgressBar>(R.id.progressLogin)

        loginButton.isEnabled = false
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val response = ApiClient.apiService.login(LoginRequest(email, password))
                if (response.isSuccessful) {
                    val auth = response.body()!!
                    if (auth.status == "otp_required") {
                        currentSessionId = auth.sessionId
                        showOtpForm()
                    } else if (auth.token != null && auth.user != null) {
                        tokenManager.saveToken(auth.token, auth.user.id, auth.user.username)
                        navigateToMain()
                    }
                } else {
                    val errorMsg = response.errorBody()?.string() ?: "Login failed"
                    Toast.makeText(this@AuthActivity, errorMsg, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@AuthActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                loginButton.isEnabled = true
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun performVerifyOtp(sessionId: String, code: String) {
        val verifyButton = findViewById<Button>(R.id.btnVerifyOtp)
        val progressBar = findViewById<ProgressBar>(R.id.progressOtp)

        verifyButton.isEnabled = false
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val response = ApiClient.apiService.verifyOtp(VerifyOtpRequest(sessionId, code))
                if (response.isSuccessful) {
                    val auth = response.body()!!
                    if (auth.token != null && auth.user != null) {
                        tokenManager.saveToken(auth.token, auth.user.id, auth.user.username)
                        navigateToMain()
                    }
                } else {
                    Toast.makeText(this@AuthActivity, "Invalid code", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@AuthActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                verifyButton.isEnabled = true
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun showOtpForm() {
        findViewById<View>(R.id.loginForm).visibility = View.GONE
        findViewById<View>(R.id.registerForm).visibility = View.GONE
        findViewById<View>(R.id.otpForm).visibility = View.VISIBLE
    }

    private fun performRegister(username: String, email: String, password: String) {
        val registerButton = findViewById<Button>(R.id.btnRegister)
        val progressBar = findViewById<ProgressBar>(R.id.progressRegister)

        registerButton.isEnabled = false
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val response = ApiClient.apiService.register(RegisterRequest(username, email, password))
                if (response.isSuccessful) {
                    Toast.makeText(this@AuthActivity, "Registration successful! Please verify your email.", Toast.LENGTH_LONG).show()
                    // Stay on login screen so they can log in after verifying email
                    findViewById<View>(R.id.tabLogin).performClick()
                } else {
                    Toast.makeText(this@AuthActivity, "Register failed: ${response.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@AuthActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                registerButton.isEnabled = true
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
