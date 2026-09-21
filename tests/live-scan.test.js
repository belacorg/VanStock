import { describe, it, expect, vi } from 'vitest';
import { bootApp, seedState } from './helpers/app-harness.js';

// A camera that says yes. getUserMedia hands back a stream whose tracks record
// whether they were stopped — which is the thing these tests are about. The
// OCR engine never loads in JSDOM, so a scan here stays at "setting up", which
// is exactly the state an engineer is most likely to back out of.
function withCamera(app) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(app.window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(() => Promise.resolve(stream)) },
  });
  app.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  return { track, getUserMedia: app.window.navigator.mediaDevices.getUserMedia };
}
const tick = () => new Promise(r => setTimeout(r, 0));

// Tapping Scan redraws #app, which replaces the photo input with a new one —
// so a listener on the old element would never hear the click. Listen on the
// document for whichever #scan-file is current.
function watchPhotoRoute(app) {
  const clicked = vi.fn();
  app.doc.addEventListener('click', e => { if (e.target && e.target.id === 'scan-file') clicked(); }, true);
  return clicked;
}
const boot = () => bootApp({ storage: { vs_state: seedState() } });

describe('scanning live', () => {
  it('asks for the back camera, and no microphone', async () => {
    const app = boot();
    const cam = withCamera(app);
    app.click('[data-live-scan]');
    await tick();
    const ask = cam.getUserMedia.mock.calls[0][0];
    expect(ask.audio).toBe(false);
    expect(ask.video.facingMode.ideal).toBe('environment');
  });

  // The app redraws #app wholesale on every change. A <video> inside it would
  // lose its stream on the first redraw, mid-scan.
  it('lives outside the part of the page that gets redrawn', async () => {
    const app = boot();
    withCamera(app);
    app.click('[data-live-scan]');
    await tick();
    const view = app.$('.live-scan');
    expect(view).toBeTruthy();
    expect(app.$('#app').contains(view)).toBe(false);
  });

  it('releases the camera on Cancel', async () => {
    const app = boot();
    const cam = withCamera(app);
    app.click('[data-live-scan]');
    await tick(); await tick();
    app.click('[data-live-cancel]');
    expect(cam.track.stop).toHaveBeenCalled();
    expect(app.$('.live-scan')).toBe(null);
  });

  // A phone locked, or switched to another app, with the camera still live is
  // a privacy problem and a battery one.
  it('releases the camera when the app is hidden', async () => {
    const app = boot();
    const cam = withCamera(app);
    app.click('[data-live-scan]');
    await tick(); await tick();
    Object.defineProperty(app.doc, 'hidden', { configurable: true, get: () => true });
    app.doc.dispatchEvent(new app.window.Event('visibilitychange'));
    expect(cam.track.stop).toHaveBeenCalled();
    expect(app.$('.live-scan')).toBe(null);
  });

  // Cancelled while the permission prompt was still up: when the camera
  // arrives there is nobody to give it to, and it must not be left running.
  it('stops a camera that arrives after the scan was cancelled', async () => {
    const app = boot();
    const track = { stop: vi.fn() };
    let grant;
    Object.defineProperty(app.window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => new Promise(r => { grant = () => r({ getTracks: () => [track] }); }) },
    });
    app.click('[data-live-scan]');
    app.click('[data-live-cancel]');
    grant();
    await tick(); await tick();
    expect(track.stop).toHaveBeenCalled();
  });

  it('offers the photo route from the live view', async () => {
    const app = boot();
    const cam = withCamera(app);
    const clicked = watchPhotoRoute(app);
    app.click('[data-live-scan]');
    await tick(); await tick();
    app.click('[data-live-photo]');
    expect(cam.track.stop).toHaveBeenCalled();
    expect(clicked).toHaveBeenCalled();
  });

  it('says so, and offers the photo, when the camera is refused', async () => {
    const app = boot();
    Object.defineProperty(app.window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })) },
    });
    app.click('[data-live-scan]');
    await tick(); await tick();
    expect(app.$('.live-status').textContent).toContain("wasn't allowed");
    expect(app.$('[data-live-photo]')).toBeTruthy();
  });

  // No camera API at all (an old browser, a non-secure page): straight to the
  // photo, rather than a live view that can never start.
  it('goes straight to the photo route on a phone with no camera feed', () => {
    const app = boot();
    Object.defineProperty(app.window.navigator, 'mediaDevices', { configurable: true, value: undefined });
    const clicked = watchPhotoRoute(app);
    app.click('[data-live-scan]');
    expect(clicked).toHaveBeenCalled();
    expect(app.$('.live-scan')).toBe(null);
  });
});
