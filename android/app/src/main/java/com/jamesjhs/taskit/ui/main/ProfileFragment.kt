package com.jamesjhs.taskit.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.jamesjhs.taskit.data.TokenManager
import com.jamesjhs.taskit.databinding.FragmentProfileBinding
import com.jamesjhs.taskit.ui.auth.AuthActivity
import kotlinx.coroutines.launch

class ProfileFragment : Fragment() {
    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!
    private lateinit var tokenManager: TokenManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, position: Bundle?) {
        super.onViewCreated(view, position)
        tokenManager = TokenManager.getInstance(requireContext())
        
        // TODO: Load user profile from API/DataStore
        
        binding.btnLogout.setOnClickListener {
            logout()
        }
    }

    private fun logout() {
        lifecycleScope.launch {
            tokenManager.clearToken()
            startActivity(Intent(requireContext(), AuthActivity::class.java))
            requireActivity().finish()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
