# stacked-prs-demo

A small notes app built with Express and TypeScript. Notes belong to user accounts: visitors register or sign in with an email and password, get a session cookie, and then create, edit, and delete their own notes through a JSON API at `/api/notes`. A dependency-free frontend in `public/` drives that API. Everything is kept in memory, so restarting the server clears all users and notes. This is a throwaway demo repository created for a short video about GitHub stacked pull requests; the code is intentionally compact and the history is arranged to show one large change being split into a stack of smaller, dependent pull requests.

To run it locally, install dependencies with `npm install`, copy `.env.example` to `.env` if you want a different port, then start the dev server with `npm run dev` and open `http://localhost:3000`. Run the test suite with `npm test` and produce a compiled build in `dist/` with `npm run build`. Node 20 or newer is required.

## Layout

| Directory | What lives there |
| --- | --- |
| `src/auth/` | Password hashing with `node:crypto` scrypt, an in-memory session store with idle and absolute expiry, cookie parsing, and the `attachSession` / `requireUser` middleware. |
| `src/api/` | The JSON API: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me`, and per-user notes CRUD under `/api/notes`. |
| `src/web/` | Static serving for the frontend with cache headers and an `index.html` fallback for app routes. |
| `src/notes/` | The in-memory notes store. |
| `public/` | The frontend: `index.html`, `app.js`, and `styles.css`. |

Tests sit next to the code they cover as `*.test.ts` files and run with Node's built-in test runner.
