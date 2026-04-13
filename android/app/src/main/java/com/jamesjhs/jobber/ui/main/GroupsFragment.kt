package com.jamesjhs.jobber.ui.main

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.jamesjhs.jobber.R
import com.jamesjhs.jobber.api.ApiClient
import com.jamesjhs.jobber.data.TokenManager
import com.jamesjhs.jobber.databinding.FragmentGroupsBinding
import com.jamesjhs.jobber.models.Group
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class GroupsFragment : Fragment() {
    private var _binding: FragmentGroupsBinding? = null
    private val binding get() = _binding!!
    private lateinit var tokenManager: TokenManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentGroupsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, position: Bundle?) {
        super.onViewCreated(view, position)
        tokenManager = TokenManager.getInstance(requireContext())
        loadGroups()

        binding.fabAddGroup.setOnClickListener {
            val intent = android.content.Intent(requireContext(), JoinGroupActivity::class.java)
            startActivityForResult(intent, 101)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 101 && resultCode == android.app.Activity.RESULT_OK) {
            loadGroups()
        }
    }

    private fun loadGroups() {
        lifecycleScope.launch {
            val token = tokenManager.token.first() ?: return@launch
            try {
                val response = ApiClient.apiService.getGroups("Bearer $token")
                if (response.isSuccessful) {
                    val groups = response.body() ?: emptyList()
                    binding.recyclerGroups.layoutManager = LinearLayoutManager(context)
                    binding.recyclerGroups.adapter = GroupAdapter(groups)
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    class GroupAdapter(private val groups: List<Group>) : RecyclerView.Adapter<GroupAdapter.GroupViewHolder>() {
        class GroupViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val name: TextView = view.findViewById(R.id.groupName)
            val members: TextView = view.findViewById(R.id.groupMembers)
            val inviteName: TextView = view.findViewById(R.id.groupInviteName)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): GroupViewHolder {
            val view = LayoutInflater.from(parent.context).inflate(R.layout.item_group, parent, false)
            return GroupViewHolder(view)
        }

        override fun onBindViewHolder(holder: GroupViewHolder, position: Int) {
            val group = groups[position]
            holder.name.text = group.name
            holder.members.text = "${group.memberCount ?: 0} members"
            holder.inviteName.text = "@${group.inviteName}"
            
            holder.itemView.setOnClickListener {
                val intent = android.content.Intent(holder.itemView.context, GroupDetailActivity::class.java)
                intent.putExtra("GROUP", group)
                holder.itemView.context.startActivity(intent)
            }
        }

        override fun getItemCount() = groups.size
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
