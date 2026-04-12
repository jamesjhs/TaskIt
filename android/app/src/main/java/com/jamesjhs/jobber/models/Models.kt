package com.jamesjhs.jobber.models

import com.google.gson.annotations.SerializedName

data class User(
    val id: String,
    val username: String,
    val email: String
)

data class AuthResponse(
    val token: String,
    val user: User
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
    val typeName: String?,
    val status: String,
    @SerializedName("created_by") val createdBy: String,
    @SerializedName("group_id") val groupId: String?,
    val archived: Boolean,
    val assignees: List<User>?,
    @SerializedName("created_at") val createdAt: Long,
    @SerializedName("updated_at") val updatedAt: Long
)

data class CreateTaskRequest(
    val title: String,
    val details: String?,
    val typeId: String,
    val groupId: String?,
    val assigneeIds: List<String>?
)

data class UpdateStatusRequest(
    val status: String
)

data class Group(
    val id: String,
    val name: String,
    @SerializedName("invite_name") val inviteName: String,
    @SerializedName("shared_key") val sharedKey: String?,
    @SerializedName("created_by") val createdBy: String,
    @SerializedName("member_count") val memberCount: Int?
)

data class CreateGroupRequest(
    val name: String
)

data class JoinGroupRequest(
    @SerializedName("invite_name") val inviteName: String,
    @SerializedName("shared_key") val sharedKey: String
)
