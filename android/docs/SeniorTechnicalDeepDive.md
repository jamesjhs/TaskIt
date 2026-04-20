# TaskIt!: Senior Technical Deep-Dive

This document provides a technical overview of the **TaskIt!** Android project for senior engineers. It details the architectural decisions, dependency stack, and deployment workflows.

## 1. Technical Architecture
The application follows a **Clean Architecture** approach with clear separation of concerns, although simplified for the current scale.

### Core Stack
*   **Networking**: **Retrofit 2.11.0** over **OkHttp 4.12.0**. We use the `GsonConverterFactory` for JSON serialization/deserialization.
*   **Persistence**: **Jetpack DataStore (Preferences)** 1.1.2. This replaces the deprecated SharedPreferences with a thread-safe, coroutine-powered solution for storing JWTs and user metadata.
*   **Concurrency**: **Kotlin Coroutines** 1.9.0. We utilize `lifecycleScope` for UI-bound operations to prevent memory leaks and ensure automatic cancellation of network requests.
*   **UI Framework**: **Android ViewBinding** and **Material Components** 1.12.0.

## 2. Dependency Analysis
The `app/build.gradle` defines a modern baseline:
*   **minSdk 26 (Android 8.0)**: Ensures access to modern Java 8+ APIs and notification channels.
*   **targetSdk 35**: Compliant with the latest Google Play Store requirements.
*   **Kotlin 1.1**: Using `jvmTarget = '11'`.

Key external libraries include:
*   `androidx.lifecycle:lifecycle-viewmodel-ktx`: Standard MVVM support (though currently logic is in Activities, it is ready for ViewModel migration).
*   `com.squareup.okhttp3:logging-interceptor`: Crucial for debugging network traffic in non-release builds.

## 3. Network & Security
*   **Protocol**: RESTful API communication.
*   **Auth**: Bearer Token (JWT) implementation. The `TokenManager` provides a reactive `Flow<String?>` for the auth token, which is injected into headers at the call-site in `MainActivity`.
*   **Dev Environment**: `ApiClient` uses `10.0.2.2` to loop back to the host machine's `localhost` on port `3000`.

## 4. Build and Shipping
The project is managed via the **Gradle** build system.

### Build Commands (CLI)
*   **Assemble Debug**: `./gradlew :app:assembleDebug`
*   **Assemble Release**: `./gradlew :app:assembleRelease`
*   **Clean Project**: `./gradlew clean`

### Release Configuration
*   **Minification**: `minifyEnabled` is currently set to `false` in `build.gradle`. For production, this should be enabled to trigger **R8/ProGuard** for code shrinking and obfuscation.
*   **ProGuard Rules**: Standard Android optimize rules are referenced (`proguard-android-optimize.txt`).

## 5. Potential Improvements & Technical Debt
*   **State Management**: Transition from `lifecycleScope` in Activities to **ViewModels** with `StateFlow` or `LiveData` for better configuration change handling.
*   **Dependency Injection**: Consider **Hilt** or **Koin** to manage the `ApiClient` and `TokenManager` singletons more cleanly.
*   **Error Handling**: Implement a more robust `Result<T>` wrapper for API calls to handle network exceptions globally.

---
**Deployment Note:** Ensure that the `BASE_URL` in `ApiClient.kt` is swapped to a production URL via BuildConfig or a CI/CD environment variable before shipping the Release APK.
