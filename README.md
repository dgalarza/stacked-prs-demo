# stacked-prs-demo

A small notes API built with Express and TypeScript. It keeps notes in memory and exposes them over a JSON API at `/api/notes`. This is a throwaway demo repository created for a short video about GitHub stacked pull requests, so the code is intentionally compact and the history is arranged to show one large change being split into a stack of smaller, dependent pull requests.

To run it locally, install dependencies with `npm install`, copy `.env.example` to `.env` if you want a different port, then start the dev server with `npm run dev`. Run the test suite with `npm test` and produce a compiled build in `dist/` with `npm run build`. Node 20 or newer is required.
