// server/server.js
const WebSocket = require('ws');

// A porta será definida pelo ambiente de hospedagem (Render)
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`Servidor de Sinalização iniciado na porta ${PORT}`);
});

const clients = new Map();
let nextClientId = 0;

wss.on('connection', ws => {
    const id = nextClientId++;
    ws.id = id;
    clients.set(id, ws);
    console.log(`Novo cliente conectado: ${id}. Total de clientes: ${clients.size}`);

    let peerId = null;
    let peerWs = null;

    for (const [otherId, otherWs] of clients.entries()) {
        if (otherId !== id && !otherWs.peer && otherWs.readyState === WebSocket.OPEN) {
            peerId = otherId;
            peerWs = otherWs;
            break;
        }
    }

    if (peerId !== null) {
        ws.peer = peerWs;
        peerWs.peer = ws;

        console.log(`Pareando cliente ${id} com cliente ${peerId}`);

        ws.send(JSON.stringify({ type: 'start_call', ownId: id, peerId: peerId }));
        peerWs.send(JSON.stringify({ type: 'start_call', ownId: peerId, peerId: id }));

    } else {
        console.log(`Cliente ${id} aguardando por um par.`);
        ws.send(JSON.stringify({ type: 'waiting' }));
    }

    ws.on('message', message => {
        const data = JSON.parse(message);
        console.log(`Mensagem de ${ws.id}:`, data.type);

        if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
            ws.peer.send(JSON.stringify(data));
        } else {
            console.log(`Peer de ${ws.id} não está conectado ou pronto. Mensagem "${data.type}" não entregue.`);
        }
    });

    ws.on('close', () => {
        console.log(`Cliente ${ws.id} desconectado.`);
        clients.delete(ws.id);

        if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
             ws.peer.send(JSON.stringify({ type: 'call_ended' }));
             ws.peer.peer = null;
             console.log(`Peer de ${ws.id} (${ws.peer.id}) notificado sobre desconexão.`);
        }
        console.log(`Total de clientes restantes: ${clients.size}`);
    });

    ws.on('error', error => {
        console.error(`Erro no cliente ${ws.id}:`, error);
    });
});