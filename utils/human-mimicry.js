/**
 * human-mimicry.js — utilities that simulate natural human interaction patterns.
 *
 * All automation actions must go through these utilities to avoid
 * LinkedIn's bot detection, which monitors:
 *   - Click timing uniformity
 *   - Scroll behaviour
 *   - Action-to-action intervals
 */

/**
 * Returns a promise that resolves after a random delay in [minMs, maxMs].
 * Default range (2s–15s) mirrors natural reading + decision time.
 */
function randomWait(minMs = 2000, maxMs = 15000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Smoothly scrolls the page by a random amount within the given range (px).
 * Uses native smooth scroll to generate realistic scroll events.
 */
function randomScroll(minPx = 300, maxPx = 1200) {
  const amount = Math.floor(Math.random() * (maxPx - minPx + 1)) + minPx;
  window.scrollBy({ top: amount, behavior: 'smooth' });
}

/**
 * Scrolls an element into view with smooth behaviour, then waits briefly.
 * Simulates the natural pause before a human clicks after scrolling to a button.
 */
async function scrollIntoViewAndPause(element) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await randomWait(800, 2500);
}

/**
 * Performs a hover + pause sequence before clicking.
 * LinkedIn uses mouseover timing as a behavioural signal.
 *
 * @param {HTMLElement} element
 */
async function humanClick(element) {
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await randomWait(400, 1200);

  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await randomWait(200, 600);

  element.click();
  await randomWait(500, 1500);
}

/**
 * Simulates human-speed typing into an input field.
 * Each character is dispatched individually with a random inter-key delay.
 *
 * @param {HTMLElement} inputElement
 * @param {string} text
 */
async function humanType(inputElement, text) {
  inputElement.focus();
  for (const char of text) {
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    inputElement.value += char;
    inputElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    await randomWait(60, 220);
  }
}

/**
 * Returns a random integer between min and max (inclusive).
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Simulates a person reading the current feed page.
 * Scrolls in small increments with irregular pauses — mirrors natural reading pace.
 *
 * @param {number} durationMs - total time budget for the reading simulation
 */
async function simulatePageReading(durationMs = 9000) {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const step = randomInt(90, 280);
    window.scrollBy({ top: step, behavior: 'smooth' });

    // Occasionally pause longer as if reading a specific item
    const pauseMs = Math.random() > 0.7
      ? randomInt(3000, 6000)   // longer read pause
      : randomInt(1200, 2800);  // normal scroll pause

    await new Promise((resolve) => setTimeout(resolve, pauseMs));

    // Occasionally scroll back slightly (re-reading)
    if (Math.random() > 0.85) {
      window.scrollBy({ top: -randomInt(40, 120), behavior: 'smooth' });
      await new Promise((resolve) => setTimeout(resolve, randomInt(800, 2000)));
    }
  }
}

/**
 * Scrolls to an element and simulates reading it before acting.
 * Models the natural pause between noticing something and deciding to interact.
 *
 * @param {HTMLElement} element
 * @param {number} minMs
 * @param {number} maxMs
 */
async function readBeforeActing(element, minMs = 3500, maxMs = 9000) {
  await scrollIntoViewAndPause(element);

  // Simulate reading the content near the element
  await new Promise((resolve) =>
    setTimeout(resolve, randomInt(minMs, maxMs))
  );

  // Small drift scroll — person repositions view while reading
  if (Math.random() > 0.45) {
    window.scrollBy({ top: randomInt(-60, 60), behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, randomInt(600, 1600)));
  }
}
