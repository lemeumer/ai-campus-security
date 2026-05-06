# System Architecture & Flow Diagram

## 🏗️ Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CAMPUS SECURITY SYSTEM                            │
│                   AI-Based Gate Security with FYP                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Student  │  │  Parent  │  │ Faculty  │  │ Security │  │  Admin   │ │
│  │  Portal  │  │  Portal  │  │  Portal  │  │  Portal  │  │  Portal  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│       │             │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┴─────────────┘          │
│                                 │                                        │
│                          React/Angular/Vue                               │
│                         Frontend Application                             │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS/REST API
                                  │
┌─────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY LAYER                               │
├─────────────────────────────────────────────────────────────────────────┤
│                    Django REST Framework                                 │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    JWT Authentication                             │  │
│  │              ┌──────────────────────────────┐                     │  │
│  │              │  JWTAuthenticationMiddleware │                     │  │
│  │              └──────────────┬───────────────┘                     │  │
│  │                             │                                     │  │
│  │              ┌──────────────▼───────────────┐                     │  │
│  │              │  SecurityLoggingMiddleware   │                     │  │
│  │              └──────────────┬───────────────┘                     │  │
│  │                             │                                     │  │
│  │              ┌──────────────▼───────────────┐                     │  │
│  │              │   RateLimitMiddleware        │                     │  │
│  │              └──────────────────────────────┘                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────────────────────────────────────────────┐
│                       AUTHENTICATION MODULE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Register   │  │    Login     │  │   Logout     │                 │
│  │   Endpoint   │  │   Endpoint   │  │  Endpoint    │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│         │                  │                  │                          │
│         └──────────────────┼──────────────────┘                          │
│                            │                                             │
│         ┌──────────────────▼──────────────────┐                         │
│         │      User Management Views          │                         │
│         │  - UserRegistrationView             │                         │
│         │  - UserLoginView                    │                         │
│         │  - UserLogoutView                   │                         │
│         │  - UserProfileView                  │                         │
│         │  - PasswordChangeView               │                         │
│         │  - PasswordResetView                │                         │
│         └──────────────────┬──────────────────┘                         │
│                            │                                             │
│         ┌──────────────────▼──────────────────┐                         │
│         │          Serializers                │                         │
│         │  - UserRegistrationSerializer       │                         │
│         │  - UserLoginSerializer              │                         │
│         │  - UserSerializer                   │                         │
│         │  - PasswordChangeSerializer         │                         │
│         └──────────────────┬──────────────────┘                         │
│                            │                                             │
│         ┌──────────────────▼──────────────────┐                         │
│         │     Permission Classes               │                         │
│         │  - IsAdmin                          │                         │
│         │  - IsDirector                       │                         │
│         │  - IsSecurity                       │                         │
│         │  - IsStudent                        │                         │
│         │  - IsParent                         │                         │
│         │  - IsOwnerOrAdmin                   │                         │
│         └──────────────────┬──────────────────┘                         │
│                            │                                             │
└────────────────────────────┼─────────────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────────────┐
│                         DATABASE LAYER                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                        PostgreSQL Database                               │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Users    │  │  Sessions  │  │   Login    │  │   Parent   │       │
│  │   Table    │  │   Table    │  │  Attempts  │  │  Student   │       │
│  │            │  │            │  │   Table    │  │  Relations │       │
│  │ - id       │  │ - token    │  │ - email    │  │ - parent   │       │
│  │ - email    │  │ - user_id  │  │ - ip_addr  │  │ - student  │       │
│  │ - role     │  │ - ip_addr  │  │ - success  │  │ - relation │       │
│  │ - status   │  │ - is_active│  │ - timestamp│  │            │       │
│  │ - face_enc │  │ - expires  │  │            │  │            │       │
│  │ - card_no  │  │            │  │            │  │            │       │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │
│                                                                          │
│  ┌────────────┐  ┌────────────┐                                        │
│  │ Permission │  │   User     │                                        │
│  │   Groups   │  │ Permission │                                        │
│  │            │  │            │                                        │
│  │ - name     │  │ - user_id  │                                        │
│  │ - perms    │  │ - perm_id  │                                        │
│  └────────────┘  └────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────────────┐
│                      INTEGRATION LAYER                                   │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Facial     │  │     Gate     │  │   Visitor    │                  │
│  │ Recognition  │  │    Entry     │  │  Management  │                  │
│  │   Module     │  │   Module     │  │   Module     │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Events     │  │  Attendance  │  │    Email     │                  │
│  │   Module     │  │   Module     │  │    Service   │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 🔄 Authentication Flow

### 1. User Registration Flow

```
┌─────────┐                  ┌─────────────┐                ┌──────────┐
│  User   │                  │   Django    │                │PostgreSQL│
│         │                  │   Backend   │                │          │
└────┬────┘                  └──────┬──────┘                └────┬─────┘
     │                              │                             │
     │ POST /register/              │                             │
     │ {email, password, role, ...} │                             │
     ├─────────────────────────────>│                             │
     │                              │                             │
     │                              │ Validate Data               │
     │                              │ Check Duplicates            │
     │                              │                             │
     │                              │ INSERT User                 │
     │                              ├────────────────────────────>│
     │                              │                             │
     │                              │ User Created                │
     │                              │<────────────────────────────┤
     │                              │                             │
     │                              │ Generate JWT Token          │
     │                              │                             │
     │                              │ Create Session              │
     │                              ├────────────────────────────>│
     │                              │                             │
     │                              │ Session Created             │
     │                              │<────────────────────────────┤
     │                              │                             │
     │ Response: {user, token}      │                             │
     │<─────────────────────────────┤                             │
     │                              │                             │
     │ Store token in localStorage  │                             │
     │                              │                             │
```

### 2. User Login Flow

```
┌─────────┐        ┌─────────────┐        ┌──────────┐       ┌─────────┐
│  User   │        │   Django    │        │PostgreSQL│       │  Email  │
│         │        │   Backend   │        │          │       │ Service │
└────┬────┘        └──────┬──────┘        └────┬─────┘       └────┬────┘
     │                    │                     │                  │
     │ POST /login/       │                     │                  │
     │ {email, password}  │                     │                  │
     ├───────────────────>│                     │                  │
     │                    │                     │                  │
     │                    │ Check Rate Limit    │                  │
     │                    │ (max 5 attempts)    │                  │
     │                    │                     │                  │
     │                    │ Verify Credentials  │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ User Found          │                  │
     │                    │<────────────────────┤                  │
     │                    │                     │                  │
     │                    │ Check Password Hash │                  │
     │                    │                     │                  │
     │                    │ Generate JWT Token  │                  │
     │                    │                     │                  │
     │                    │ Create Session      │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ Log Login Attempt   │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ Update last_login   │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │ Response:          │                     │                  │
     │ {user, token}      │                     │                  │
     │<───────────────────┤                     │                  │
     │                    │                     │                  │
     │                    │ Send Login Email    │                  │
     │                    ├─────────────────────┼─────────────────>│
     │                    │                     │                  │
```

### 3. Authenticated Request Flow

```
┌─────────┐              ┌─────────────┐            ┌──────────┐
│  User   │              │   Django    │            │PostgreSQL│
│         │              │   Backend   │            │          │
└────┬────┘              └──────┬──────┘            └────┬─────┘
     │                          │                        │
     │ GET /profile/            │                        │
     │ Authorization:           │                        │
     │ Bearer <token>           │                        │
     ├─────────────────────────>│                        │
     │                          │                        │
     │                          │ Middleware:            │
     │                          │ Extract Token          │
     │                          │                        │
     │                          │ Decode JWT Token       │
     │                          │                        │
     │                          │ Verify Session         │
     │                          ├───────────────────────>│
     │                          │                        │
     │                          │ Session Valid          │
     │                          │<───────────────────────┤
     │                          │                        │
     │                          │ Attach User to Request │
     │                          │                        │
     │                          │ Check Permissions      │
     │                          │                        │
     │                          │ Get User Data          │
     │                          ├───────────────────────>│
     │                          │                        │
     │                          │ User Data              │
     │                          │<───────────────────────┤
     │                          │                        │
     │                          │ Update last_activity   │
     │                          ├───────────────────────>│
     │                          │                        │
     │ Response: {user data}    │                        │
     │<─────────────────────────┤                        │
     │                          │                        │
```

### 4. Password Reset Flow

```
┌─────────┐        ┌─────────────┐        ┌──────────┐       ┌─────────┐
│  User   │        │   Django    │        │PostgreSQL│       │  Email  │
│         │        │   Backend   │        │          │       │ Service │
└────┬────┘        └──────┬──────┘        └────┬─────┘       └────┬────┘
     │                    │                     │                  │
     │ POST /password-    │                     │                  │
     │       reset/       │                     │                  │
     │ {email}            │                     │                  │
     ├───────────────────>│                     │                  │
     │                    │                     │                  │
     │                    │ Find User by Email  │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ User Found          │                  │
     │                    │<────────────────────┤                  │
     │                    │                     │                  │
     │                    │ Generate Reset Token│                  │
     │                    │                     │                  │
     │                    │ Save Token          │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ Send Reset Email    │                  │
     │                    ├─────────────────────┼─────────────────>│
     │                    │                     │                  │
     │                    │                     │     Email Sent   │
     │                    │                     │<─────────────────┤
     │                    │                     │                  │
     │ Response: Success  │                     │                  │
     │<───────────────────┤                     │                  │
     │                    │                     │                  │
     │ User clicks link   │                     │                  │
     │ in email           │                     │                  │
     │                    │                     │                  │
     │ POST /password-    │                     │                  │
     │   reset-confirm/   │                     │                  │
     │ {token, password}  │                     │                  │
     ├───────────────────>│                     │                  │
     │                    │                     │                  │
     │                    │ Verify Token        │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ Token Valid         │                  │
     │                    │<────────────────────┤                  │
     │                    │                     │                  │
     │                    │ Update Password     │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ Mark Token as Used  │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │                    │ Invalidate Sessions │                  │
     │                    ├────────────────────>│                  │
     │                    │                     │                  │
     │ Response: Success  │                     │                  │
     │<───────────────────┤                     │                  │
     │                    │                     │                  │
```

## 🎯 Role-Based Access Matrix

```
┌──────────────────────┬─────────┬─────────┬──────┬────────┬──────────┬───────┬──────────┬────┐
│     Permission       │ Student │ Faculty │ Staff│ Parent │ Security │ Admin │ Director │ HR │
├──────────────────────┼─────────┼─────────┼──────┼────────┼──────────┼───────┼──────────┼────┤
│ View Own Profile     │    ✓    │    ✓    │  ✓   │   ✓    │    ✓     │   ✓   │    ✓     │ ✓  │
│ Edit Own Profile     │    ✓    │    ✓    │  ✓   │   ✓    │    ✓     │   ✓   │    ✓     │ ✓  │
│ View All Users       │    ✗    │    ✗    │  ✗   │   ✗    │    ✗     │   ✓   │    ✓     │ ✓  │
│ Manage Users         │    ✗    │    ✗    │  ✗   │   ✗    │    ✗     │   ✓   │    ✓     │ ✓  │
│ Gate Access Control  │    ✗    │    ✗    │  ✗   │   ✗    │    ✓     │   ✓   │    ✗     │ ✗  │
│ View Reports         │    ✗    │    ✗    │  ✗   │   ✗    │    ✗     │   ✓   │    ✓     │ ✓  │
│ View Child Info      │    ✗    │    ✗    │  ✗   │   ✓    │    ✗     │   ✓   │    ✓     │ ✗  │
│ Manage Events        │    ✗    │    ✗    │  ✗   │   ✗    │    ✗     │   ✓   │    ✓     │ ✗  │
│ View Attendance      │    ✓    │    ✓    │  ✓   │   ✗    │    ✗     │   ✓   │    ✓     │ ✓  │
│ Mark Attendance      │    ✗    │    ✓    │  ✗   │   ✗    │    ✓     │   ✓   │    ✗     │ ✗  │
│ Visitor Management   │    ✗    │    ✗    │  ✗   │   ✗    │    ✓     │   ✓   │    ✗     │ ✗  │
│ View Events          │    ✓    │    ✓    │  ✓   │   ✗    │    ✗     │   ✓   │    ✓     │ ✗  │
└──────────────────────┴─────────┴─────────┴──────┴────────┴──────────┴───────┴──────────┴────┘
```

## 📊 Data Models Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Model                              │
│  - id (UUID, Primary Key)                                       │
│  - email (Unique)                                               │
│  - username (Unique)                                            │
│  - role (Choice: STUDENT, FACULTY, STAFF, etc.)                │
│  - university_id (Unique, for students/faculty/staff)          │
│  - face_encoding (Binary, for facial recognition)              │
│  - retina_data (Binary, for retina scanning)                   │
│  - card_number (Unique, university card ID)                    │
└───────────┬─────────────────────────────────────────────────────┘
            │
            │ One-to-Many
            │
┌───────────▼─────────────────────────────────────────────────────┐
│                    UserSession Model                            │
│  - id (UUID, Primary Key)                                       │
│  - user (Foreign Key → User)                                    │
│  - token (JWT token)                                            │
│  - ip_address                                                   │
│  - device_info                                                  │
│  - is_active                                                    │
│  - expires_at                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  ParentStudentRelation Model                    │
│  - id (UUID, Primary Key)                                       │
│  - parent (Foreign Key → User, role=PARENT)                     │
│  - student (Foreign Key → User, role=STUDENT)                   │
│  - relationship (Father, Mother, Guardian)                      │
│  - is_primary (Boolean)                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    LoginAttempt Model                           │
│  - id (UUID, Primary Key)                                       │
│  - email                                                        │
│  - ip_address                                                   │
│  - user_agent                                                   │
│  - success (Boolean)                                            │
│  - failure_reason                                               │
│  - timestamp                                                    │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 Security Measures

1. **JWT Token Security**
   - Token expiration (7 days)
   - Secure signing algorithm (HS256)
   - Token invalidation on logout

2. **Password Security**
   - Bcrypt hashing
   - Minimum 8 characters
   - Complexity requirements

3. **Rate Limiting**
   - Max 5 login attempts per 15 minutes
   - IP-based tracking

4. **Session Management**
   - Multi-device support
   - Session expiration
   - Device tracking

5. **Audit Trail**
   - Login attempt logging
   - Security event logging
   - IP address tracking

This completes the comprehensive authentication module for your FYP!
