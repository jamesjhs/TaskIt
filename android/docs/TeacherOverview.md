# Crystallise: A Teacher's Guide to the Project

Hello! Welcome to the **Crystallise** project. Think of this app like a digital "To-Do" list for groups. It helps people stay organized by sharing tasks and working together. 

Here is how the project is organized, explained in a way that shows how all the pieces of the puzzle fit together.

## 1. The "Control Center" (UI Layer)
These files decide what the user actually sees on their phone screen.
*   **MainActivity.kt**: This is the heart of the app. It's like the teacher's desk where everything is coordinated. It asks for the list of tasks and makes sure they are displayed.
*   **AuthActivity.kt**: This handles "Hall Pass" duties—making sure users are logged in or helping them sign up for the first time.
*   **TaskAdapter.kt**: Imagine you have a big pile of index cards (tasks). The Adapter is the person who takes those cards and neatly arranges them on a bulletin board so they look good.

## 2. The "Messenger" (API Layer)
An app is often just a window to information stored somewhere else (the internet).
*   **ApiService.kt**: This is a list of "requests" the app can make to the server. For example: "Give me the tasks," "Update this task," or "Let me join this group."
*   **ApiClient.kt**: This is the actual phone line. It sets up the connection to the server so the messages in `ApiService` can be sent back and forth.

## 3. The "Memory" (Data Layer)
Apps need to remember things even when they are turned off.
*   **TokenManager.kt**: Think of this as the app's "Locker." It safely stores a "Digital Key" (called a Token) so that the user doesn't have to type their password every single time they open the app.

## 4. The "Blueprints" (Models)
Before we can talk about a "Task" or a "User," we have to define what they are.
*   **Models.kt**: This file defines the shapes of our data. It says, "A Task must have a Title, a Status, and an Owner." It's like a template for every piece of information in the system.

## 5. The "Art Studio" (Resources)
While the Kotlin files are the "brain," these files are the "beauty."
*   **Layout files (XML)**: These are the drawings of the screens. They define where the buttons go, how big the text is, and what colors to use.

---
**Summary for the Students:**
When you click a button, the **Control Center** hears you, the **Messenger** sends a note to the server, the server sends back data shaped like our **Blueprints**, and the **Artist** draws it on the screen!
