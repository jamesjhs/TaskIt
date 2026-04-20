# TaskIt!: Developer Onboarding & Workflow Guide

Welcome to the **TaskIt!** team! This document will get you up to speed on our codebase and how we build and roll out new features.

## 1. Core Architecture
We use a modern Android stack with a focus on simplicity and readability:
*   **Language**: Kotlin
*   **Networking**: Retrofit 2 + OkHttp 3
*   **Concurrency**: Kotlin Coroutines (lifecycle-aware scopes)
*   **Local Storage**: Jetpack DataStore (Preferences)
*   **UI**: ViewBinding with XML-based Layouts

## 2. Project Structure
*   `api/`: Contains `ApiClient` (singleton) and `ApiService` (Retrofit interface).
*   `data/`: Persistent storage logic, primarily `TokenManager` for session handling.
*   `models/`: POJOs/Data classes used for JSON serialization (GSON).
*   `ui/`: Organized by feature (e.g., `auth`, `main`).

## 3. The Authentication Flow
We use JWT-based authentication. 
1.  On login, the `AuthResponse` returns a `token`.
2.  `TokenManager` saves this token to DataStore.
3.  Every authenticated request (in `MainActivity`) reads the token using a Coroutine Flow (`token.first()`) and adds it to the `Authorization` header as a `Bearer` token.
4.  If an API call returns a `401 Unauthorized`, we trigger `logout()` to clear the token and return to `AuthActivity`.

## 4. How to Add a New Feature
Suppose you want to add a "Group Detail" screen:
1.  **Define the Model**: Add any new response objects to `Models.kt`.
2.  **Add API Endpoint**: Update `ApiService.kt` with the new `@GET` or `@POST` method.
3.  **Create UI**: Build your XML layout in `res/layout` and create a new Activity/Fragment in the `ui` package.
4.  **Fetch Data**: Use `lifecycleScope.launch` to call the `ApiClient.apiService` and update your UI state.

## 5. Development Tips
*   **Local Backend**: The `ApiClient` points to `10.0.2.2:3000`. This is the alias for `localhost` when running in the Android Emulator.
*   **Logging**: We have `HttpLoggingInterceptor` enabled. Check Logcat (filter by "okhttp") to see the full request/reponse bodies during development.
*   **ViewBinding**: Remember to enable ViewBinding in any new Activities to avoid `findViewById` boilerplate.

Happy coding! Let's get these tasks organized.
