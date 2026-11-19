/* Set apiBaseUrl to the deployed HTTPS API origin for native iOS builds. Never put secrets here. */
window.SAPAY_CONFIG = Object.freeze({
  apiBaseUrl: 'https://sapay-api.onrender.com',
  // The API deployed on Render (deploy/render-staging) has no
  // POST /api/transfers/external yet, so the web build hides that action.
  // Set to true once a backend with external transfers and its migration is deployed.
  features: Object.freeze({ externalTransfers: false }),
});
