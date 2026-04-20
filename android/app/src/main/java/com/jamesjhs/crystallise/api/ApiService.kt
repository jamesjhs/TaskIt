package com.jamesjhs.crystallise.api

import com.jamesjhs.crystallise.models.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @POST("api/auth/verify-otp")
    suspend fun verifyOtp(@Body request: VerifyOtpRequest): Response<AuthResponse>

    @GET("api/tasks")
    suspend fun getTasks(
        @Header("Authorization") token: String,
        @Query("groupId") groupId: String? = null,
        @Query("status") status: String? = null,
        @Query("archived") archived: Boolean? = null
    ): Response<List<Task>>

    @POST("api/tasks")
    suspend fun createTask(
        @Header("Authorization") token: String,
        @Body request: CreateTaskRequest
    ): Response<Task>

    @PATCH("api/tasks/{id}")
    suspend fun updateTask(
        @Header("Authorization") token: String,
        @Path("id") id: String,
        @Body request: CreateTaskRequest
    ): Response<Task>

    @PATCH("api/tasks/{id}")
    suspend fun stopRecurringTask(
        @Header("Authorization") token: String,
        @Path("id") id: String,
        @Body request: StopRecurringRequest
    ): Response<Task>

    @PATCH("api/tasks/{id}/status")
    suspend fun updateTaskStatus(
        @Header("Authorization") token: String,
        @Path("id") id: String,
        @Body request: UpdateStatusRequest
    ): Response<Task>

    @PATCH("api/tasks/{id}/archive")
    suspend fun archiveTask(
        @Header("Authorization") token: String,
        @Path("id") id: String
    ): Response<Task>

    @DELETE("api/tasks/{id}")
    suspend fun deleteTask(
        @Header("Authorization") token: String,
        @Path("id") id: String
    ): Response<Unit>

    @GET("api/groups")
    suspend fun getGroups(@Header("Authorization") token: String): Response<List<Group>>

    @GET("api/groups/{id}/members")
    suspend fun getGroupMembers(
        @Header("Authorization") token: String,
        @Path("id") groupId: String
    ): Response<List<User>>

    @POST("api/groups/{groupId}/members/{userId}/promote")
    suspend fun promoteMember(
        @Header("Authorization") token: String,
        @Path("groupId") groupId: String,
        @Path("userId") userId: String
    ): Response<Unit>

    @POST("api/groups/{groupId}/members/{userId}/demote")
    suspend fun demoteMember(
        @Header("Authorization") token: String,
        @Path("groupId") groupId: String,
        @Path("userId") userId: String
    ): Response<Unit>

    @POST("api/users/{id}/report")
    suspend fun reportUser(
        @Header("Authorization") token: String,
        @Path("id") userId: String,
        @Body body: Map<String, String>
    ): Response<Unit>

    @POST("api/users/{id}/block")
    suspend fun blockUser(
        @Header("Authorization") token: String,
        @Path("id") userId: String
    ): Response<Unit>

    @POST("api/groups")
    suspend fun createGroup(
        @Header("Authorization") token: String,
        @Body request: CreateGroupRequest
    ): Response<Group>

    @POST("api/groups/join")
    suspend fun joinGroup(
        @Header("Authorization") token: String,
        @Body request: JoinGroupRequest
    ): Response<Group>

    @GET("api/task-types")
    suspend fun getTaskTypes(@Header("Authorization") token: String): Response<List<TaskType>>

    @POST("api/task-types")
    suspend fun createTaskType(
        @Header("Authorization") token: String,
        @Body body: Map<String, String>
    ): Response<TaskType>

    @PATCH("api/tasks/{id}/fast-forward")
    suspend fun fastForwardTask(
        @Header("Authorization") token: String,
        @Path("id") taskId: String
    ): Response<Task>

    @PATCH("api/tasks/{id}/defer")
    suspend fun deferTask(
        @Header("Authorization") token: String,
        @Path("id") taskId: String,
        @Body body: Map<String, Long?>
    ): Response<Task>

    @POST("api/tasks/{id}/notes")
    suspend fun addTaskNote(
        @Header("Authorization") token: String,
        @Path("id") taskId: String,
        @Body body: Map<String, String>
    ): Response<TaskNote>

    @GET("api/tasks/{id}/notes")
    suspend fun getTaskNotes(
        @Header("Authorization") token: String,
        @Path("id") taskId: String
    ): Response<List<TaskNote>>

    @GET("api/users/me/alerts")
    suspend fun getAlerts(@Header("Authorization") token: String): Response<List<Alert>>

    @PATCH("api/users/me/alerts/{id}/read")
    suspend fun markAlertRead(
        @Header("Authorization") token: String,
        @Path("id") alertId: String
    ): Response<Unit>
}

data class TaskNote(
    val id: String,
    val note: String,
    @com.google.gson.annotations.SerializedName("created_at") val createdAt: Long,
    val username: String
)
