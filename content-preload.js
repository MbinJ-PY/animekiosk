'use strict';

// Must match CHROME_* constants in main.js and the installed Electron Chromium version.
const CHROME_MAJOR = '130';
const CHROME_FULL  = '130.0.6723.118';

const chromeBrands = [
  { brand: 'Chromium', version: CHROME_MAJOR },
  { brand: 'Google Chrome', version: CHROME_MAJOR },
  { brand: 'Not?A_Brand', version: '99' }
];

try {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true
  });
} catch (_) {}

try {
  Object.defineProperty(navigator, 'languages', {
    get: () => Object.freeze(['en-US', 'en']),
    configurable: true
  });
} catch (_) {}

try {
  if (navigator.userAgentData) {
    const fake = {
      brands: chromeBrands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: async (hints) => {
        const out = {
          brands: chromeBrands,
          mobile: false,
          platform: 'Windows',
          platformVersion: '10.0.0',
          architecture: 'x86',
          bitness: '64',
          model: '',
          wow64: false
        };
        if (hints.includes('uaFullVersion')) out.uaFullVersion = CHROME_FULL;
        if (hints.includes('fullVersionList')) {
          out.fullVersionList = chromeBrands.map(b => ({
            brand: b.brand,
            version: b.version + '.0.0.0'
          }));
        }
        return out;
      },
      toJSON: () => ({ brands: chromeBrands, mobile: false, platform: 'Windows' })
    };
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => fake,
      configurable: true
    });
  }
} catch (_) {}

try {
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
  };
  window.chrome.loadTimes = window.chrome.loadTimes || function () {
    return {
      commitLoadTime: Date.now() / 1000 - 0.4,
      connectionInfo: 'h2',
      finishDocumentLoadTime: Date.now() / 1000 - 0.2,
      finishLoadTime: Date.now() / 1000 - 0.1,
      firstPaintAfterLoadTime: 0,
      firstPaintTime: Date.now() / 1000 - 0.3,
      navigationType: 'Other',
      npnNegotiatedProtocol: 'h2',
      requestTime: Date.now() / 1000 - 0.5,
      startLoadTime: Date.now() / 1000 - 0.5,
      wasAlternateProtocolAvailable: false,
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true
    };
  };
  window.chrome.csi = window.chrome.csi || function () {
    return { onloadT: Date.now(), pageT: Date.now(), startE: Date.now(), tran: 15 };
  };
} catch (_) {}

// Electron exposes this in some builds — hide it from page scripts.
try {
  if ('electron' in window) delete window.electron;
} catch (_) {}
