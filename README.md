# Jobber – Task Management App

A cross-platform task management application with a Node.js/TypeScript server, web frontend, and Android app.

## Features

- User registration and authentication (JWT)
- Create and manage tasks with types, notes, and status tracking
- Task statuses: Not Started → Started → Complete
- Archive and delete tasks
- Group collaboration with shared invite keys
- Assign tasks to group members
- Custom task types per group

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Server   | Node.js, TypeScript, Express        |
| Database | SQLite via `better-sqlite3`         |
| Auth     | JWT + bcryptjs                      |
| Frontend | Vanilla JS/TS, Tailwind CSS (CDN)   |
| Android  | Kotlin, Retrofit, DataStore         |

## Setup

### Server

```bash
cd server
npm install
npm run dev       # development (ts-node-dev)
npm run build     # compile TypeScript
npm start         # run compiled output
```

The server runs on **port 3000** by default (set `PORT` env var to override).  
The web frontend is served from the `public/` directory at the root URL.

### Web Frontend

Open `http://localhost:3000` after starting the server. No separate build step needed.

### Android

1. Open the `android/` folder in Android Studio.
2. Sync Gradle.
3. Run on an emulator (the app points to `http://10.0.2.2:3000` — the host machine's localhost).
4. To use a physical device, update `BASE_URL` in `ApiClient.kt` to your machine's LAN IP.

## API Endpoints

### Auth
| Method | Path                | Description        |
|--------|---------------------|--------------------|
| POST   | /api/auth/register  | Register new user  |
| POST   | /api/auth/login     | Login → JWT token  |

### Tasks
| Method | Path                      | Description          |
|--------|---------------------------|----------------------|
| GET    | /api/tasks                | List tasks (filters) |
| POST   | /api/tasks                | Create task          |
| PATCH  | /api/tasks/:id            | Update task          |
| PATCH  | /api/tasks/:id/status     | Update status only   |
| PATCH  | /api/tasks/:id/archive    | Toggle archive       |
| DELETE | /api/tasks/:id            | Delete task          |

### Groups
| Method | Path                    | Description          |
|--------|-------------------------|----------------------|
| GET    | /api/groups             | List my groups       |
| POST   | /api/groups             | Create group         |
| POST   | /api/groups/join        | Join with shared key |
| GET    | /api/groups/:id/members | List members         |

### Task Types
| Method | Path            | Description              |
|--------|-----------------|--------------------------|
| GET    | /api/task-types | List available types     |
| POST   | /api/task-types | Create custom type       |

## Default Task Types

Urgent · Routine · Hobby · Household · Kids · Financial · Vehicle · Leisure
