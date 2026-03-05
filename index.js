const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const FIVEM_URL = process.env.FIVEM_URL || '';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';

// Validate secret on every request
app.use((req, res, next) => {
    const secret = req.headers['x-bridge-secret'];
    if (secret !== BRIDGE_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Forward everything to FiveM
app.use('/', createProxyMiddleware({
    target: FIVEM_URL,
    changeOrigin: true,
}));

app.listen(PORT, () => {
    console.log(`Lexfall proxy running on port ${PORT}`);
    console.log(`Forwarding to: ${FIVEM_URL}`);
});
