# Quick Commands

Essential copy-paste commands organized by category.

## Development

```bash
# Install dependencies
pnpm install

# Setup environment
pnpm run vercel:env

# Apply database migrations
pnpm run db:migrate

# Start dev server
pnpm dev

# Start dev + warm cache
pnpm run dev:warmup
```

## Testing

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run E2E tests (Playwright)
pnpm test:e2e

# Run E2E tests in headed mode
pnpm test:e2e:headed

# Run linter
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format
```

## Build

```bash
# Build for production
pnpm build

# Start production server
pnpm start

# Build + test + lint (prepush checklist)
pnpm run prepush
```

## Database

```bash
# Run migrations
pnpm run db:migrate

# Open Drizzle Studio
pnpm run db:studio

# Reset database (dev only)
pnpm run db:reset

# Seed initial data
pnpm run _db:seed
```

## Deployment

```bash
# Deploy to Vercel (preview)
pnpm run vercel:deploy

# Deploy to Vercel (production)
pnpm run vercel:deploy:prod

# Sync environment variables to Vercel
pnpm run vercel:env

# Check environment variables
pnpm run config:check
```

## Scripts & Utilities

```bash
# Verify all documentation links are valid
pnpm run verify-doc-links

# Check LLM connection health
pnpm run _health:ai

# Benchmark LLM latency
pnpm run _benchmark:llm

# List all available scripts
pnpm run --list
```

## Common Workflows

### Add a new feature
```bash
pnpm dev                    # Start dev
# Make changes...
pnpm lint:fix              # Fix issues
pnpm test                  # Run tests
pnpm run prepush           # Final check before commit
```

### Create a database migration
```bash
# Edit lib/db/schema.ts
# Run studio to verify
pnpm run db:studio
# Create migration file
# Apply
pnpm run db:migrate
```

### Deploy to production
```bash
pnpm run prepush           # Ensure tests pass
git push origin main       # Trigger CI/CD
# Or manually:
pnpm run vercel:deploy:prod
```
