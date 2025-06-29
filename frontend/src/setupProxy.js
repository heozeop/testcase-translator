const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy API requests to backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_BACKEND_PROXY || 'http://backend:3000',
      changeOrigin: true,
      ws: true,
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
      }
    })
  );

  // Proxy WebSocket connections
  app.use(
    '/ws',
    createProxyMiddleware({
      target: process.env.REACT_APP_BACKEND_PROXY || 'http://backend:3000',
      changeOrigin: true,
      ws: true
    })
  );
};