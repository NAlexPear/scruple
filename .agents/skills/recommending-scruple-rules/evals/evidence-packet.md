# Frozen repository evidence

The following excerpts are eval input data. Paths and line numbers identify their original locations
in a fictional consumer repository. No other files or parser capabilities should be assumed.

## AGENTS.md

```text
1 Scope: all packages unless a nested guide says otherwise.
2 Public service errors must preserve a useful cause for diagnosis; explain intentional redaction.
3 Prefer semantic review policies only after lint and type checks pass.
```

## CONTRIBUTING.md

```text
1 Use explicit exported function return types; ESLint enforces this already.
2 Do not add new lint rules to ban constructs that TypeScript already rejects.
```

## docs/security.md

```text
1 Every tenant-scoped write must be authorized for the current tenant.
2 Route-local checks and centrally registered middleware are both accepted.
3 Never expose upstream credential material in an error returned to clients.
```

## docs/architecture.md

```text
1 Each outbound operation owns its retry policy; no repository-wide retry count is prescribed.
2 JavaScript API packages use Express. Python worker packages use asyncio.
```

## packages/api/charge.ts

```ts
1 export async function charge(client: Client, order: Order): Promise<Receipt> {
2   try { return await client.charge(order); }
3   catch (cause) { throw new Error('Charge submission failed', { cause }); }
4 }
```

## packages/api/refund.ts

```ts
1 export async function refund(client: Client, id: string): Promise<void> {
2   try { await client.refund(id); }
3   catch (cause) { throw new Error('Refund submission failed', { cause }); }
4 }
```

## packages/api/public-error.ts

```ts
1 // Credential-bearing upstream messages cannot cross this public boundary.
2 export function publicError(): Error { return new Error('Authentication failed'); }
```

## packages/api/errors.test.ts

```ts
1 test('charge preserves the original cause', async () => {
2   const original = new Error('connection reset');
3   await assert.rejects(charge(failingClient(original), order), error => error.cause === original);
4 });
5 test('public authentication response redacts upstream credentials', () => {
6   assert.equal(publicError().message, 'Authentication failed');
7   assert.equal(publicError().cause, undefined);
8 });
```

## packages/workers/poll.py

```python
1 async def poll(client):
2     for attempt in range(3):
3         if await client.ready():
4             return True
5     return False
```

## packages/api/orders.ts

```ts
1 import { tenantGuard } from './middleware';
2 app.post('/orders', tenantGuard, async (req, res) => {
3   await store.write(req.body);
4   res.sendStatus(201);
5 });
```

## packages/api/cache.ts

```ts
1 export async function warm(cache: Cache, key: string): Promise<void> {
2   const lease = await cache.acquire(key);
3   try { await cache.refresh(key); } finally { await lease.release(); }
4 }
```

## packages/api/export.ts

```ts
1 export async function exportRows(store: Store): Promise<void> {
2   const cursor = await store.openCursor();
3   try { await writeRows(cursor); } finally { await cursor.close(); }
4 }
```

## packages/api/lifetime.test.ts

```ts
1 test('warm releases its lease when refresh fails', async () => {
2   await assert.rejects(warm(failingCache, 'hot-key'));
3   assert.equal(failingCache.lease.releaseCalls, 1);
4 });
```

## parser-contract.md

```text
1 Installed OXC adapter advertises javascript/typescript; it exposes errorHandlers, functions,
2 apiBoundaries (Express/Fastify), calls, control regions, and structured completeness flags.
3 Call names do not prove behavior of imported helpers or middleware; no tenant data-flow is exposed.
4 The Python adapter exposes comments and functions only, not ownership or cancellation facts.
5 There is no Rust adapter installed. No cross-file caller or runtime lock state is available.
```
