// Dev-server proxy so the News Feed can read Inshorts pages (inshorts.com sends no CORS headers).
// Only active under `craco start`; a production deploy needs an equivalent server route.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/inshorts-proxy",
    createProxyMiddleware({
      target: "https://inshorts.com",
      changeOrigin: true,
      pathRewrite: { "^/inshorts-proxy": "" },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }),
  );
};
