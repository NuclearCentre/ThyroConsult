// Full path: thyroconsult-frontend\src\utils\loadRazorpay.js
//
// Loads the Razorpay checkout.js SDK on demand, instead of unconditionally
// in public/index.html on every single page (including /login, admin, and
// doctor portals where it's never used). checkout.js does its own
// background chatter (fraud-detection pre-warming, postMessage handshakes)
// the moment it's loaded, even before .open() is ever called — no reason
// to pay that cost on pages that will never touch payment.
//
// Safe to call multiple times / from multiple components — resolves
// immediately if already loaded.

let loadPromise = null;

export function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loadPromise = null; reject(new Error('Failed to load Razorpay SDK')); };
    document.body.appendChild(script);
  });

  return loadPromise;
}
