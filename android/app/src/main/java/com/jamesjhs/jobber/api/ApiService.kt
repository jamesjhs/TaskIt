package com.jamesjhs.jobber.api

import com.jamesjhs.jobber.models.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

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
}
