// Minimal, dependency-free browser stand-in for exercising public/app.js in
// Jest's node environment. It models only what app.js touches; it is not a DOM.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

type Listener = (event: any) => unknown;

export class FakeElement {
  id = '';
  className = '';
  innerHTML = '';
  textContent = '';
  value = '';
  type = '';
  hidden = false;
  disabled = false;
  open = false;
  minLength = 0;
  autocomplete = '';
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, Listener[]> = {};
  private readonly selectorCache = new Map<string, FakeElement>();
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (...names: string[]) => names.forEach((n) => this.classes.add(n)),
    remove: (...names: string[]) => names.forEach((n) => this.classes.delete(n)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const on = force === undefined ? !this.classes.has(name) : force;
      if (on) this.classes.add(name); else this.classes.delete(name);
      return on;
    },
  };
  constructor(readonly tagName = 'div') {}
  addEventListener(type: string, listener: Listener): void {
    (this.listeners[type] ??= []).push(listener);
  }
  async dispatch(type: string, event: any = {}): Promise<void> {
    const full = { preventDefault: () => undefined, target: this, ...event };
    for (const listener of this.listeners[type] ?? []) await listener(full);
  }
  setAttribute(name: string, value: string): void { this.attributes[name] = String(value); }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  removeAttribute(name: string): void { delete this.attributes[name]; }
  querySelector(selector: string): FakeElement {
    let found = this.selectorCache.get(selector);
    if (!found) { found = new FakeElement(); this.selectorCache.set(selector, found); }
    return found;
  }
  querySelectorAll(): FakeElement[] { return []; }
  closest(): FakeElement { return new FakeElement(); }
  append(): void { /* structure is not modelled */ }
  prepend(): void { /* structure is not modelled */ }
  after(): void { /* structure is not modelled */ }
  replaceChildren(): void { this.innerHTML = ''; this.textContent = ''; }
  showModal(): void { this.open = true; }
  close(): void { this.open = false; }
  reset(): void { /* form fields are addressed by id in app.js */ }
}

export type FakeResponse = { status: number; body: unknown };
export type FetchCall = { url: string; init: any; resolve: (r: FakeResponse) => void; reject: (e: unknown) => void };

export function loadApp(options: { biometric?: unknown } = {}) {
  const elements = new Map<string, FakeElement>();
  const created: FakeElement[] = [];
  const storage = new Map<string, string>();
  const pending: FetchCall[] = [];
  let uuidCounter = 0;

  const byId = (id: string): FakeElement => {
    let el = elements.get(id);
    if (!el) { el = new FakeElement(); el.id = id; elements.set(id, el); }
    return el;
  };

  const context: any = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    BigInt,
    Promise,
    JSON,
    Option: function Option(this: any, text: string, value: string) { this.text = text; this.value = value; },
    location: { protocol: 'https:', origin: 'https://sapay.test' },
    navigator: { clipboard: { writeText: async () => undefined } },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}` },
    sessionStorage: {
      getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
      setItem: (k: string, v: string) => { storage.set(k, String(v)); },
      removeItem: (k: string) => { storage.delete(k); },
    },
    confirm: () => false,
    prompt: () => null,
    scrollTo: () => undefined,
    SApayBiometric: options.biometric,
    document: {
      getElementById: byId,
      createElement: (tag: string) => { const el = new FakeElement(tag); created.push(el); return el; },
    },
    fetch: (url: string, init: any) => new Promise<any>((resolve, reject) => {
      pending.push({
        url,
        init,
        resolve: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }),
        reject,
      });
    }),
  };
  context.window = context;
  // <select> elements that app.js reads during start-up default to their first option.
  byId('simType').value = 'bank';
  createContext(context);
  const source = readFileSync(join(__dirname, '..', '..', 'public', 'app.js'), 'utf8');
  runInContext(source, context, { filename: 'public/app.js' });

  const flush = async (rounds = 25) => { for (let i = 0; i < rounds; i += 1) await new Promise((r) => setImmediate(r)); };

  /** Takes the oldest pending request whose path and bearer token match. */
  const take = (path: string, token?: string): FetchCall => {
    const index = pending.findIndex((c) => c.url.endsWith('/api' + path) &&
      (token === undefined || c.init?.headers?.Authorization === 'Bearer ' + token));
    if (index < 0) {
      throw new Error(`No pending request for ${path} (${token ?? 'any token'}); pending: ` +
        pending.map((c) => `${c.url} ${c.init?.headers?.Authorization ?? '-'}`).join(', '));
    }
    return pending.splice(index, 1)[0]!;
  };

  /** Submits the login form and answers the login request; leaves dashboard loads pending. */
  const login = async (email: string, token: string, userId: string) => {
    byId('email').value = email;
    byId('password').value = 'correct horse battery';
    void byId('authForm').dispatch('submit');
    await flush();
    take('/auth/login').resolve({ status: 200, body: { accessToken: token, user: { id: userId, email } } });
    await flush();
  };

  /** Answers the full dashboard load (wallet list, each wallet, journals) for one token. */
  const serveDashboard = async (token: string, wallets: Array<{ id: string; currency: string; balanceMinor: string }>) => {
    take('/demo/wallets', token).resolve({ status: 200, body: wallets.map(({ id, currency }) => ({ id, currency })) });
    await flush();
    for (const w of wallets) take('/demo/wallets/' + encodeURIComponent(w.id), token).resolve({ status: 200, body: w });
    await flush();
    take('/ledger/journals', token).resolve({ status: 200, body: [] });
    await flush();
  };

  const nav = () => created.find((el) => el.className === 'app-nav');

  return { byId, created, storage, pending, take, flush, login, serveDashboard, nav, context };
}
