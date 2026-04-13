package com.jamesjhs.jobber.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class TokenManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "auth_secure",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _token = MutableStateFlow(sharedPrefs.getString(TOKEN_KEY, null))
    val token: Flow<String?> = _token.asStateFlow()

    companion object {
        private const val TOKEN_KEY = "jwt_token"
        private const val USER_ID_KEY = "user_id"
        private const val USERNAME_KEY = "username"

        @Volatile
        private var INSTANCE: TokenManager? = null

        fun getInstance(context: Context): TokenManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TokenManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    suspend fun saveToken(token: String, userId: String, username: String) {
        sharedPrefs.edit().apply {
            putString(TOKEN_KEY, token)
            putString(USER_ID_KEY, userId)
            putString(USERNAME_KEY, username)
            apply()
        }
        _token.emit(token)
    }

    suspend fun clearToken() {
        sharedPrefs.edit().clear().apply()
        _token.emit(null)
    }

    fun getAuthHeader(token: String) = "Bearer $token"
}
