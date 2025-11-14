# Resume Builder Backend API

This repository contains the backend API service for a Resume Builder application. It handles user authentication, resume data management (CRUD), AI-powered prompt analysis for resume generation, and resume template management.

## Features

*   **TypeScript:** Written in TypeScript for type safety and better maintainability.
*   **Node.js & Express:** Built on the Node.js runtime using the Express framework.
*   **MongoDB & Mongoose:** Uses MongoDB as the database with Mongoose ODM for data modeling.
*   **JWT Authentication:** Secure user authentication using JSON Web Tokens.
*   **Resume Management:** Full CRUD operations for user resumes.
*   **AI Prompt Analysis:** Endpoint to analyze a user prompt (via placeholder Llama AI integration) and update resume content.
*   **Template Management:** CRUD operations for user-specific resume templates.
*   **Testing:** Includes integration tests using Jest and Supertest.

## Project Structure

```
.
├── dist/                 # Compiled TypeScript output (after build)
├── node_modules/         # Project dependencies
├── src/                  # Source code directory
│   ├── config/           # Configuration files (db connection, jwt secret)
│   ├── controllers/      # Request handlers (business logic)
│   ├── middleware/       # Custom middleware (e.g., auth)
│   ├── models/           # Mongoose data models/schemas
│   ├── routes/           # API route definitions
│   ├── services/         # Business logic services (e.g., AI interaction)
│   ├── tests/            # Integration tests (Jest/Supertest)
│   │   └── setup.ts      # Test environment setup (DB connection, etc.)
│   ├── types/            # Custom type definitions (e.g., Express Request augmentation)
│   └── app.ts            # Express application setup and entry point
├── .env.example          # Example environment variables file
├── .gitignore            # Git ignore file
├── jest.config.ts        # Jest configuration
├── package.json          # Project metadata and dependencies
├── README.md             # This file
└── tsconfig.json         # TypeScript compiler configuration
```

## Prerequisites

*   [Node.js](https://nodejs.org/) (v16 or later recommended)
*   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
*   [MongoDB](https://www.mongodb.com/try/download/community) instance (local or cloud-based like MongoDB Atlas)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

## Configuration

1.  **Create a `.env` file:** Copy the example file:
    ```bash
    cp .env.example .env
    ```
2.  **Edit the `.env` file:** Fill in the required environment variables:
    *   `MONGO_URI`: Your MongoDB connection string.
    *   `JWT_SECRET`: A strong, unique secret key for signing JWTs.
    *   `LLAMA_API_URL`: The endpoint URL for your Llama AI instance (used for prompt analysis).
    *   `LLAMA_API_KEY`: The API key for your Llama AI instance (if required).

## Running the Application

*   **Development Mode (with hot-reloading):**
    ```bash
    npm run dev
    ```
    This uses `ts-node-dev` to automatically restart the server on file changes.

*   **Production Mode:**
    1.  Build the TypeScript code:
        ```bash
        npm run build
        ```
    2.  Start the server:
        ```bash
        npm run start
        ```
        This runs the compiled JavaScript code from the `dist` directory.

## Running Tests

Execute the integration tests using Jest:

```bash
npm test
```
This will connect to a separate test database (defined in `src/tests/setup.ts`), run all `*.test.ts` files, and report the results.

## API Endpoints

The base URL depends on your running environment (e.g., `http://localhost:PORT` where `PORT` is defined in your environment or defaults).

### Authentication (`/api/users`)

*   **`POST /register`**: Register a new user.
    *   Body: `{ "name": "Your Name", "email": "user@example.com", "password": "yourpassword" }`
    *   Response: `{ user: { id, name, email }, token: "JWT_TOKEN" }`
*   **`POST /login`**: Log in an existing user.
    *   Body: `{ "email": "user@example.com", "password": "yourpassword" }`
    *   Response: `{ user: { id, name, email }, token: "JWT_TOKEN" }`

### Resumes (`/api/resumes`)

*   **Authentication:** Requires JWT Bearer token in `Authorization` header for all endpoints.
*   **`POST /`**: Create a new resume.
    *   Body: `{ "personalInfo": { ... }, "summary": "..." }` (Initial fields)
    *   Response: The created resume object.
*   **`GET /my`**: Get all resumes belonging to the authenticated user.
    *   Response: Array of resume objects.
*   **`GET /:resumeId`**: Get a specific resume by its ID.
    *   Response: The requested resume object.
*   **`PATCH /:resumeId`**: Update specific fields of a resume.
    *   Body: `{ "fieldToUpdate": "newValue", "nested.field": "anotherValue" }`
    *   Response: The updated resume object.
*   **`POST /generate`**: Analyze a prompt using AI and update the user's (first found) resume summary.
    *   Body: `{ "prompt": "Generate a summary for a software engineer..." }`
    *   Response: The updated resume object.
*   **`DELETE /:resumeId`**: (Not implemented, but could be added) Delete a resume.

### Templates (`/api/templates`)

*   **Authentication:** Requires JWT Bearer token in `Authorization` header for all endpoints.
*   **`POST /`**: Create a new template.
    *   Body: `{ "name": "Template Name", "description": "...", "structure": { ... } }`
    *   Response: The created template object.
*   **`GET /my`**: Get all templates belonging to the authenticated user.
    *   Response: Array of template objects.
*   **`GET /:templateId`**: Get a specific template by its ID.
    *   Response: The requested template object.
*   **`PATCH /:templateId`**: Update a template.
    *   Body: `{ "name": "New Name", ... }`
    *   Response: The updated template object.
*   **`DELETE /:templateId`**: Delete a template.
    *   Response: Success message (e.g., 204 No Content or 200 OK with message).

## Frontend Integration Notes

*   **Authentication Flow:**
    1.  Frontend calls `POST /api/users/register` or `POST /api/users/login`.
    2.  On success, the backend returns a JWT `token`.
    3.  Frontend stores this token securely (e.g., in `localStorage`, `sessionStorage`, or memory).
    4.  For subsequent requests to protected API endpoints (Resumes, Templates), the frontend must include the token in the `Authorization` header: `Authorization: Bearer YOUR_JWT_TOKEN`.
    5.  Implement logic to handle token expiration and potentially refresh tokens if using that strategy.
*   **API Interaction:** Use standard HTTP requests (e.g., via `fetch` API or libraries like `axios`) to interact with the documented endpoints. Send request bodies as JSON and handle JSON responses.
*   **Error Handling:** Implement frontend logic to handle API errors based on the status codes returned by the backend (e.g., 401 Unauthorized, 404 Not Found, 400 Bad Request, 500 Internal Server Error).


