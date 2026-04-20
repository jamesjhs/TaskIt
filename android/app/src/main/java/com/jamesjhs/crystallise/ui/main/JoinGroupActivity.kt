package com.jamesjhs.crystallise.ui.main

import android.os.Bundle
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.jamesjhs.crystallise.api.ApiClient
import com.jamesjhs.crystallise.data.TokenManager
import com.jamesjhs.crystallise.databinding.ActivityJoinGroupBinding
import com.jamesjhs.crystallise.databinding.DialogCreateGroupBinding
import com.jamesjhs.crystallise.models.CreateGroupRequest
import com.jamesjhs.crystallise.models.JoinGroupRequest
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class JoinGroupActivity : AppCompatActivity() {
    private lateinit var binding: ActivityJoinGroupBinding
    private lateinit var tokenManager: TokenManager

    private val barcodeLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            handleQrCode(result.contents)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityJoinGroupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        tokenManager = TokenManager.getInstance(this)

        binding.btnJoin.setOnClickListener {
            joinGroup()
        }

        binding.textCreateInstead.setOnClickListener {
            showCreateGroupDialog()
        }

        binding.btnScanQr.setOnClickListener {
            val options = ScanOptions()
            options.setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            options.setPrompt("Scan a group invite QR code")
            options.setBeepEnabled(false)
            options.setBarcodeImageEnabled(true)
            barcodeLauncher.launch(options)
        }
    }

    private fun handleQrCode(contents: String) {
        // Expected format: crystallise://join?invite_name=...&shared_key=...
        try {
            val uri = android.net.Uri.parse(contents)
            if (uri.scheme == "crystallise" && uri.host == "join") {
                val inviteName = uri.getQueryParameter("invite_name")
                val sharedKey = uri.getQueryParameter("shared_key")
                if (inviteName != null && sharedKey != null) {
                    binding.editInviteName.setText(inviteName)
                    binding.editSharedKey.setText(sharedKey)
                    joinGroup()
                } else {
                    Toast.makeText(this, getString(com.jamesjhs.crystallise.R.string.qr_error), Toast.LENGTH_SHORT).show()
                }
            } else {
                Toast.makeText(this, getString(com.jamesjhs.crystallise.R.string.qr_error), Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(this, getString(com.jamesjhs.crystallise.R.string.qr_error), Toast.LENGTH_SHORT).show()
        }
    }

    private fun joinGroup() {
        val inviteName = binding.editInviteName.text.toString().trim()
        val sharedKey = binding.editSharedKey.text.toString().trim()

        if (inviteName.isEmpty() || sharedKey.isEmpty()) {
            Toast.makeText(this, "Please enter both name and key", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnJoin.isEnabled = false
        binding.progressBar.visibility = android.view.View.VISIBLE

        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.joinGroup(
                    "Bearer $token",
                    JoinGroupRequest(inviteName, sharedKey)
                )
                if (response.isSuccessful) {
                    Toast.makeText(this@JoinGroupActivity, "Joined group successfully!", Toast.LENGTH_SHORT).show()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    val error = response.errorBody()?.string() ?: "Failed to join group"
                    Toast.makeText(this@JoinGroupActivity, error, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@JoinGroupActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.btnJoin.isEnabled = true
                binding.progressBar.visibility = android.view.View.GONE
            }
        }
    }

    private fun showCreateGroupDialog() {
        val dialogBinding = DialogCreateGroupBinding.inflate(layoutInflater)
        val dialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .create()

        dialogBinding.btnCreate.setOnClickListener {
            val groupName = dialogBinding.editGroupName.text.toString().trim()
            createGroup(groupName, dialog)
        }

        dialogBinding.btnCancel.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun createGroup(name: String, dialog: AlertDialog) {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.createGroup(
                    "Bearer $token",
                    CreateGroupRequest(if (name.isEmpty()) null else name)
                )
                if (response.isSuccessful) {
                    Toast.makeText(this@JoinGroupActivity, "Group created!", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    setResult(RESULT_OK)
                    finish()
                } else {
                    Toast.makeText(this@JoinGroupActivity, "Failed to create group", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@JoinGroupActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
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
