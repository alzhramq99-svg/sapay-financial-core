import { readFileSync } from 'fs';
import { join } from 'path';

// Guards against publishing the demo API or database beyond the local machine
// from docker-compose. Render (render.yaml) is the only intended public host.
describe('docker-compose exposure', () => {
  const compose = readFileSync(join(__dirname, '..', 'docker-compose.yml'), 'utf8');

  it('does not use host networking, which would bind the API to every host interface', () => {
    expect(compose).not.toMatch(/network_mode:\s*["']?host/);
  });

  it('publishes every port on the loopback interface only', () => {
    const published = [...compose.matchAll(/^\s*-\s*["']?([^"'\s]+:\d+(?::\d+)?)["']?\s*$/gm)].map((m) => m[1]);
    expect(published).toEqual(['127.0.0.1:5432:5432', '127.0.0.1:3000:3000']);
  });

  it('connects the API to PostgreSQL by service name on the compose network', () => {
    expect(compose).toMatch(/PGHOST:\s*postgres\b/);
  });
});
