package com.jamesjhs.jobber.ui.main

import android.os.Bundle
import android.view.LayoutInflater
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.databinding.ActivityGroupDetailBinding
import com.jamesjhs.jobber.models.Group
import com.jamesjhs.jobber.models.User
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class GroupDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityGroupDetailBinding
    private lateinit var tokenManager: TokenManager
    private var group: Group? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityGroupDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager.getInstance(this)
        group = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            intent.getSerializableExtra("GROUP", Group::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getSerializableExtra("GROUP") as? Group
        }

        if (group == null) {
            finish()
            return
        }

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = group?.name

        binding.txtInviteName.text = getString(R.string.invite_name_format, group?.inviteName)
        binding.txtSharedKey.text = group?.sharedKey ?: "Hidden"

        loadMembers()
    }

    private fun loadMembers() {
        val g = group ?: return
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.getGroupMembers("Bearer $token", g.id)
                if (response.isSuccessful) {
                    val members = response.body() ?: emptyList()
                    binding.recyclerMembers.layoutManager = LinearLayoutManager(this@GroupDetailActivity)
                    binding.recyclerMembers.adapter = MemberAdapter(members)
                } else {
                    Toast.makeText(this@GroupDetailActivity, "Failed to load members", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@GroupDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun showUserActions(user: User) {
        val actions = arrayOf(
            getString(com.jamesjhs.jobber.R.string.promote),
            getString(com.jamesjhs.jobber.R.string.demote),
            getString(com.jamesjhs.jobber.R.string.report),
            getString(com.jamesjhs.jobber.R.string.block)
        )

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(getString(com.jamesjhs.jobber.R.string.user_actions))
            .setItems(actions) { _, which ->
                when (which) {
                    0 -> promoteMember(user)
                    1 -> demoteMember(user)
                    2 -> showReportDialog(user)
                    3 -> blockUser(user)
                }
            }
            .show()
    }

    private fun promoteMember(user: User) {
        val groupId = group?.id ?: return
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.promoteMember("Bearer $token", groupId, user.id)
                if (response.isSuccessful) {
                    Toast.makeText(this@GroupDetailActivity, getString(com.jamesjhs.jobber.R.string.member_promoted), Toast.LENGTH_SHORT).show()
                    loadMembers()
                }
            } catch (e: Exception) {
                Toast.makeText(this@GroupDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun demoteMember(user: User) {
        val groupId = group?.id ?: return
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            val token = tokenManager.token.first()
            if (token == null) {
                binding.progressBar.visibility = View.GONE
                return@launch
            }
            try {
                val response = ApiClient.apiService.demoteMember("Bearer $token", groupId, user.id)
                if (response.isSuccessful) {
                    Toast.makeText(this@GroupDetailActivity, getString(com.jamesjhs.jobber.R.string.member_demoted), Toast.LENGTH_SHORT).show()
                    loadMembers()
                }
            } catch (e: Exception) {
                Toast.makeText(this@GroupDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progressBar.visibility = View.GONE
            }
        }
    }

    private fun showReportDialog(user: User) {
        val input = EditText(this)
        val padding = (16 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this)
        val params = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT)
        params.marginStart = padding
        params.marginEnd = padding
        params.topMargin = padding / 2
        input.layoutParams = params
        input.hint = getString(com.jamesjhs.jobber.R.string.report_reason_hint)
        container.addView(input)

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(getString(com.jamesjhs.jobber.R.string.report_user_title))
            .setView(container)
            .setPositiveButton(getString(com.jamesjhs.jobber.R.string.report)) { _, _ ->
                val reason = input.text.toString().trim()
                if (reason.isNotEmpty()) {
                    reportUser(user, reason)
                }
            }
            .setNegativeButton(getString(com.jamesjhs.jobber.R.string.cancel), null)
            .show()
    }

    private fun reportUser(user: User, reason: String) {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.reportUser("Bearer $token", user.id, mapOf("reason" to reason))
                if (response.isSuccessful) {
                    Toast.makeText(this@GroupDetailActivity, getString(com.jamesjhs.jobber.R.string.user_reported), Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@GroupDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun blockUser(user: User) {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.blockUser("Bearer $token", user.id)
                if (response.isSuccessful) {
                    Toast.makeText(this@GroupDetailActivity, getString(com.jamesjhs.jobber.R.string.user_blocked), Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@GroupDetailActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
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

    inner class MemberAdapter(private val members: List<User>) : RecyclerView.Adapter<MemberAdapter.MemberViewHolder>() {
        inner class MemberViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val name: TextView = view.findViewById(R.id.txtMemberName)
            val email: TextView = view.findViewById(R.id.txtMemberEmail)
            val role: TextView = view.findViewById(R.id.txtMemberRole)

            init {
                view.setOnLongClickListener {
                    showUserActions(members[adapterPosition])
                    true
                }
            }
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MemberViewHolder {
            val view = LayoutInflater.from(parent.context).inflate(R.layout.item_member, parent, false)
            return MemberViewHolder(view)
        }

        override fun onBindViewHolder(holder: MemberViewHolder, position: Int) {
            val member = members[position]
            holder.name.text = member.username
            holder.email.text = member.email
            // Role logic could be added here if the API provides it
        }

        override fun getItemCount() = members.size
    }
}
