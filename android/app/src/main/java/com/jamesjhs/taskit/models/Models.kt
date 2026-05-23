package com.jamesjhs.taskit.models

import com.google.gson.annotations.SerializedName
import java.io.Serializable

data class User(
    val id: String,
    val username: String,
    val email: String
) : Serializable

data class AuthResponse(
    val token: String?,
    val user: User?,
    val status: String?,
    val sessionId: String?,
    val error: String?
)

data class VerifyOtpRequest(
    val sessionId: String,
    val code: String
)

data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class TaskType(
    val id: String,
    val name: String,
    @SerializedName("group_id") val groupId: String?
)

data class Task(
    val id: String,
    val title: String,
    val details: String?,
    @SerializedName("type_id") val typeId: String,
    @SerializedName("type_name") val typeName: String?,
    val status: String,
    @SerializedName("created_by") val createdBy: String,
    @SerializedName("group_id") val groupId: String?,
    @SerializedName("group_name") val groupName: String?,
    val archived: Boolean,
    val assignees: List<User>?,
    @SerializedName("due_date") val dueDate: Long?,
    @SerializedName("recur_interval") val recurInterval: Int?,
    @SerializedName("recur_unit") val recurUnit: String?,
    @SerializedName("created_at") val createdAt: Long,
    @SerializedName("updated_at") val updatedAt: Long
) : Serializable

data class CreateTaskRequest(
    val title: String,
    val details: String?,
    val typeId: String,
    val groupId: String?,
    val assigneeIds: List<String>?,
    val dueDate: Long?,
    val recurInterval: Int?,
    val recurUnit: String?
)

data class UpdateStatusRequest(
    val status: String
)

data class StopRecurringRequest(
    val recurInterval: Int? = null,
    val recurUnit: String? = null
)

data class Group(
    val id: String,
    val name: String,
    @SerializedName("invite_name") val inviteName: String,
    @SerializedName("shared_key") val sharedKey: String?,
    @SerializedName("created_by") val createdBy: String,
    @SerializedName("member_count") val memberCount: Int?
) : Serializable

data class CreateGroupRequest(
    val name: String? = null
)

data class JoinGroupRequest(
    @SerializedName("invite_name") val inviteName: String,
    @SerializedName("shared_key") val sharedKey: String
)

data class Alert(
    val id: String,
    val message: String,
    @SerializedName("read_at") val readAt: Long?,
    @SerializedName("created_at") val createdAt: Long
)
