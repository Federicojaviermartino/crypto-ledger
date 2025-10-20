# Crypto Ledger - Copilot Instructions

## Tech Stack
- NestJS + TypeScript
- Prisma ORM + PostgreSQL
- BullMQ + Redis
- Ethers.js v6
- DuckDB for analytics
- Argon2 for passwords

## Code Style
- Use strict TypeScript
- Prefer async/await over promises
- Use Prisma transactions for multi-step operations
- Always add JSDoc comments
- Follow NestJS patterns (modules, services, controllers)

## Testing
- Use Jest + Supertest for E2E
- Mock external APIs
- Test double-entry balance invariants

## Security
- Never expose secrets
- Use environment variables
- Implement rate limiting
- Add input validation
