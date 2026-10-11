# TrustLayer

TrustLayer checks whether an AI response satisfies the request before you send it.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in AI_API_KEY
npm run dev
```

Open http://localhost:3000.

## File ownership

| Owner    | Files                                      |
| -------- | ------------------------------------------ |
| Person 1 | `app/page.tsx`, `components/`              |
| Person 2 | `app/api/`, `lib/` (except `examples.ts`)  |
| Person 3 | `lib/examples.ts`                          |

Shared types live in `lib/types.ts`. `lib/mock.ts` has a sample `EvaluateResult` for building the UI before the API is ready.
