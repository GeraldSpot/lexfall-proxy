const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createServer } = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;
const FIVEM_URL = process.env.FIVEM_URL || 'http://localhost:30120';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';

app.use((req, res, next) => {
    const secret = req.headers['x-bridge-secret'];
    if (BRIDGE_SECRET && secret !== BRIDGE_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
});

// For non-WebSocket requests: strip query string from path, inject params into body
app.use('/', (req, res, next) => {
    if (req.url.includes('?')) {
        const [path, queryStr] = req.url.split('?');
        const params = {};
        queryStr.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
        });
        // Rewrite URL without query string
        req.url = path;
        // Inject params as JSON body
        const bodyStr = JSON.stringify(params);
        req.headers['content-type'] = 'application/json';
        req.headers['content-length'] = Buffer.byteLength(bodyStr);
        const { Readable } = require('stream');
        req._body = bodyStr;
        // Override the stream
        const readable = new Readable();
        readable.push(bodyStr);
        readable.push(null);
        Object.assign(req, readable);
        readable.pipe = readable.pipe.bind(readable);
        req.pipe = readable.pipe.bind(readable);
        req.on = readable.on.bind(readable);
    }
    next();
}, createProxyMiddleware({
    target: FIVEM_URL,
    changeOrigin: true,
    logLevel: 'silent',
}));

const server = createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL('http://localhost' + req.url);
    const targetUrl = reqUrl.searchParams.get('url');

    if (!targetUrl || !targetUrl.startsWith('wss://api.elevenlabs.io')) {
        socket.destroy();
        return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
        console.log('Client connected');

        const elevenWs = new WebSocket(targetUrl, {
            headers: { 'Origin': 'https://elevenlabs.io' }
        });

        elevenWs.on('open', () => console.log('ElevenLabs WS connected'));

        clientWs.on('message', (data) => {
            if (elevenWs.readyState === WebSocket.OPEN) {
                elevenWs.send(data.toString(), { binary: false });
            }
        });

        elevenWs.on('message', (data, isBinary) => {
            try {
                const str = isBinary ? data.toString('utf8') : data.toString();
                const msg = JSON.parse(str);
                console.log('ElevenLabs -> client:', msg.type);
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(str);
            } catch(e) {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
            }
        });

        elevenWs.on('close', (code, reason) => {
            console.log('ElevenLabs WS closed:', code, reason.toString());
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code);
        });

        elevenWs.on('error', (err) => {
            console.error('ElevenLabs WS error:', err.message);
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011);
        });

        clientWs.on('close', () => elevenWs.close());
        clientWs.on('error', () => elevenWs.close());
    });
});

server.listen(PORT, () => console.log('Lexfall proxy running on port ' + PORT));
