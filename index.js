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

app.use('/', createProxyMiddleware({
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

        elevenWs.on('open', () => {
            console.log('ElevenLabs WS connected');
        });

        var msgCount = 0;
        clientWs.on('message', (data, isBinary) => {
            msgCount++;
            if (msgCount <= 5) {
                const str = data.toString();
                console.log('Client msg #' + msgCount + ' isBinary:' + isBinary + ' len:' + str.length + ' preview:' + str.substring(0, 120));
            }
            if (elevenWs.readyState === WebSocket.OPEN) {
                elevenWs.send(data);
            }
        });

        elevenWs.on('message', (data, isBinary) => {
            try {
                const str = isBinary ? data.toString('utf8') : data.toString();
                const msg = JSON.parse(str);
                console.log('ElevenLabs -> client:', msg.type);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(str);
                }
            } catch(e) {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                }
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

        clientWs.on('close', () => { elevenWs.close(); });
        clientWs.on('error', () => { elevenWs.close(); });
    });
});

server.listen(PORT, () => {
    console.log('Lexfall proxy running on port ' + PORT);
});
