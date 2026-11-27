// Regression tests for issue #58: client-side session isolation and async
// logout races in public/app.js. Each test drives the real app.js through a
// small fake browser (test/helpers/browser-harness.ts); no app code is mocked.
import { loadApp } from './helpers/browser-harness';

const WALLET_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WALLET_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECIPIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('public/app.js session isolation (issue #58)', () => {
  it('does not render the previous user\'s wallets when their in-flight refresh resolves after logout', async () => {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    // Alice's wallet list request is still in flight when she signs out.
    const aliceWallets = app.take('/demo/wallets', 'token-alice');
    await app.byId('logoutBtn').dispatch('click');
    expect(app.byId('wallets').innerHTML).toBe('');

    aliceWallets.resolve({ status: 200, body: [{ id: WALLET_A, currency: 'SDG' }] });
    await app.flush();
    const late = app.pending.find((c) => c.url.includes(WALLET_A));
    late?.resolve({ status: 200, body: { id: WALLET_A, currency: 'SDG', balanceMinor: '5000' } });
    await app.flush();
    app.pending.find((c) => c.url.endsWith('/ledger/journals'))?.resolve({ status: 200, body: [] });
    await app.flush();

    expect(app.byId('wallets').innerHTML).not.toContain(WALLET_A);
    expect(app.byId('totalBalance').innerHTML).not.toContain('5,000');
  });

  it('does not show the previous user\'s balances to the next user who signs in on the same device', async () => {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    const aliceWallets = app.take('/demo/wallets', 'token-alice');
    await app.byId('logoutBtn').dispatch('click');

    await app.login('bob@example.test', 'token-bob', 'user-b');
    await app.serveDashboard('token-bob', [{ id: WALLET_B, currency: 'SDG', balanceMinor: '10' }]);
    expect(app.byId('wallets').innerHTML).toContain(WALLET_B);

    // Alice's stale response arrives last.
    aliceWallets.resolve({ status: 200, body: [{ id: WALLET_A, currency: 'SDG' }] });
    await app.flush();
    app.pending.find((c) => c.url.includes(WALLET_A))
      ?.resolve({ status: 200, body: { id: WALLET_A, currency: 'SDG', balanceMinor: '5000' } });
    await app.flush();
    app.pending.find((c) => c.url.endsWith('/ledger/journals'))?.resolve({ status: 200, body: [] });
    await app.flush();

    expect(app.byId('wallets').innerHTML).not.toContain(WALLET_A);
    expect(app.byId('wallets').innerHTML).toContain(WALLET_B);
  });

  it('does not sign out the current user when a 401 arrives for the previous user\'s token', async () => {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    const aliceWallets = app.take('/demo/wallets', 'token-alice');
    await app.byId('logoutBtn').dispatch('click');

    await app.login('bob@example.test', 'token-bob', 'user-b');
    await app.serveDashboard('token-bob', [{ id: WALLET_B, currency: 'SDG', balanceMinor: '10' }]);
    expect(app.storage.get('sapay_access_token')).toBe('token-bob');

    aliceWallets.resolve({ status: 401, body: { message: 'Invalid or expired access token' } });
    await app.flush();

    expect(app.storage.get('sapay_access_token')).toBe('token-bob');
    expect(app.byId('appView').hidden).toBe(false);
  });

  it('clears the account page e-mail on logout so the next user never sees it', async () => {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    await app.serveDashboard('token-alice', []);
    const nav = app.nav();
    expect(nav).toBeDefined();
    await nav!.dispatch('click', { target: { closest: () => ({ dataset: { page: 'account' } }) } });
    expect(app.byId('accountEmail').textContent).toBe('alice@example.test');

    await app.byId('logoutBtn').dispatch('click');
    await app.login('bob@example.test', 'token-bob', 'user-b');
    await app.serveDashboard('token-bob', []);

    expect(app.byId('accountEmail').textContent).not.toBe('alice@example.test');
  });

  it('removes the bearer token from sessionStorage and hides the app on logout', async () => {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    await app.serveDashboard('token-alice', [{ id: WALLET_A, currency: 'SDG', balanceMinor: '5000' }]);
    await app.byId('logoutBtn').dispatch('click');

    expect(app.storage.has('sapay_access_token')).toBe(false);
    expect(app.byId('appView').hidden).toBe(true);
    expect(app.byId('authView').hidden).toBe(false);
    expect(app.byId('password').value).toBe('');
    expect(app.byId('wallets').innerHTML).toBe('');
    expect(app.byId('totalBalance').textContent).toBe('—');
  });

  it('fails closed when a wallet balance cannot be loaded (no fake zero balance)', async () => {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    app.take('/demo/wallets', 'token-alice').resolve({ status: 200, body: [{ id: WALLET_A, currency: 'SDG' }] });
    await app.flush();
    app.take('/demo/wallets/' + WALLET_A, 'token-alice').resolve({ status: 503, body: { message: 'down' } });
    await app.flush();

    expect(app.byId('totalBalance').textContent).toBe('الرصيد غير متاح حاليًا');
    expect(app.byId('wallets').innerHTML).not.toContain(WALLET_A);
  });
});

describe('public/app.js transfer idempotency (issue #58)', () => {
  async function readyForTransfer() {
    const app = loadApp();
    await app.login('alice@example.test', 'token-alice', 'user-a');
    await app.serveDashboard('token-alice', [{ id: WALLET_A, currency: 'SDG', balanceMinor: '5000' }]);
    app.byId('actionType').value = 'transfer';
    app.byId('sourceWallet').value = WALLET_A;
    app.byId('destinationWallet').value = 'ID: ' + RECIPIENT;
    app.byId('actionAmount').value = '25';
    return app;
  }

  it('sends an Idempotency-Key and the authenticated user\'s source wallet', async () => {
    const app = await readyForTransfer();
    void app.byId('actionForm').dispatch('submit');
    await app.flush();
    const call = app.take('/transfers', 'token-alice');
    const body = JSON.parse(call.init.body);
    expect(call.init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({ fromWalletId: WALLET_A, toWalletId: RECIPIENT, amountMinor: '25', currency: 'SDG' });
  });

  it('reuses the same Idempotency-Key when the user retries the same transfer after a network failure', async () => {
    const app = await readyForTransfer();
    void app.byId('actionForm').dispatch('submit');
    await app.flush();
    const first = app.take('/transfers', 'token-alice');
    // The server may have committed the transfer before the connection dropped.
    first.reject(new TypeError('Network request failed'));
    await app.flush();

    void app.byId('actionForm').dispatch('submit');
    await app.flush();
    const retry = app.take('/transfers', 'token-alice');

    expect(retry.init.headers['Idempotency-Key']).toBe(first.init.headers['Idempotency-Key']);
  });
});
