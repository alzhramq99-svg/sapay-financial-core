// Regression test for issue #58: public/app.js wires up several controls
// (the inline transfer form, the service-simulation form) by calling
// document.getElementById on elements that only exist inside detached
// <section> page containers at that point in installMultiPageExperience(),
// before those containers are appended to the document. document.getElementById
// cannot find a detached element, so those lookups returned null and the
// first one to call a method on it (.addEventListener) threw, aborting the
// rest of the installer -- on every real page load, in every browser.
// This is the same defect class fixed once before for the cards tab
// (PR #26, "restore iPhone dashboard broken by detached card lookups"); it
// needs a real DOM (not the stub in helpers/browser-harness.ts, which never
// models detachment and so cannot catch this) to reproduce.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

function loadRealDom() {
  const publicDir = join(__dirname, '..', 'public');
  const html = readFileSync(join(publicDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sapay.test/' });
  dom.window.scrollTo = () => undefined;
  const appJs = readFileSync(join(publicDir, 'app.js'), 'utf8');
  dom.window.eval(appJs);
  return dom;
}

describe('public/app.js multi-page installer on a real DOM (issue #58)', () => {
  it('builds every nav page without throwing (detached DOM lookups)', () => {
    expect(() => loadRealDom()).not.toThrow();
  });

  it('attaches every page under #appView and lets every nav item activate it', () => {
    const dom = loadRealDom();
    const { document } = dom.window;
    const appView = document.getElementById('appView')!;
    const pageKeys = ['home', 'wallets', 'cards', 'transfers', 'services', 'history', 'account', 'support', 'settings'];
    for (const key of pageKeys) {
      const page = appView.querySelector(`[data-view="${key}"]`);
      expect(page).not.toBeNull();
      expect(appView.contains(page)).toBe(true);
    }

    const nav = document.querySelector('.app-nav')!;
    for (const key of pageKeys) {
      const button = nav.querySelector(`[data-page="${key}"]`)!;
      button.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      const page = appView.querySelector(`[data-view="${key}"]`)!;
      expect(page.classList.contains('active')).toBe(true);
    }
  });

  it('wires the inline transfer form and the service-simulation form live in the document', () => {
    const dom = loadRealDom();
    const { document } = dom.window;
    const inlineTransfer = document.getElementById('inlineTransfer');
    const serviceSimulation = document.getElementById('serviceSimulation');
    expect(inlineTransfer).not.toBeNull();
    expect(serviceSimulation).not.toBeNull();
    expect(document.getElementById('simProvider')!.children.length).toBeGreaterThan(0);
  });
});
