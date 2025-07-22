// server/server.js
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });

wss.on('listening', () => {
    console.log(`Servidor de Sinalização iniciado na porta ${PORT}`);
});

const clients = new Map();
let nextClientId = 0;

wss.on('connection', ws => {
    const id = nextClientId++;
    ws.id = id;
    clients.set(id, ws);
    console.log(`Novo cliente conectado: ${id}. Total de clientes: ${clients.size}`);

    function findAndPairPeer(currentWs) {
        let peerId = null;
        let peerWs = null;

        for (const [otherId, otherWs] of clients.entries()) {
            if (otherId !== currentWs.id && !otherWs.peer && otherWs.readyState === WebSocket.OPEN) {
                peerId = otherId;
                peerWs = otherWs;
                break;
            }
        }

        if (peerId !== null) {
            currentWs.peer = peerWs;
            peerWs.peer = currentWs;

            console.log(`Pareando cliente ${currentWs.id} com cliente ${peerId}`);

            currentWs.send(JSON.stringify({ type: 'start_call', ownId: currentWs.id, peerId: peerId }));
            peerWs.send(JSON.stringify({ type: 'start_call', ownId: peerId, peerId: currentWs.id }));
            return true;
        }
        return false;
    }

    if (!findAndPairPeer(ws)) {
        console.log(`Cliente ${id} aguardando por um par.`);
        ws.send(JSON.stringify({ type: 'waiting' }));
    }

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            console.log(`Mensagem de ${ws.id}:`, data.type);

            switch (data.type) {
                case 'request_new_peer':
                    console.log(`Cliente ${ws.id} solicitou novo peer.`);
                    if (ws.peer) {
                        if (ws.peer.readyState === WebSocket.OPEN) {
                            ws.peer.send(JSON.stringify({ type: 'call_ended' }));
                            ws.peer.peer = null;
                        }
                        ws.peer = null;
                    }
                    
                    if (!findAndPairPeer(ws)) {
                        console.log(`Cliente ${ws.id} agora aguardando por um novo par.`);
                        ws.send(JSON.stringify({ type: 'waiting' }));
                    }
                    break;
                case 'report_user': // NOVO: Lidar com a denúncia
                    console.warn(`DENÚNCIA RECEBIDA: Cliente ${ws.id} denunciou cliente ${data.reportedPeerId || 'desconhecido'}. Motivo: ${data.reason || 'Não especificado'}`);
                    // Em um app real, aqui você faria:
                    // 1. Salvar no banco de dados
                    // 2. Notificar moderadores
                    // 3. Potencialmente desconectar os usuários ou banir
                    // Por agora, apenas logamos no console do servidor.
                    if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
                        ws.peer.send(JSON.stringify({ type: 'report_received' })); // Opcional: avisar o outro lado
                    }
                    break;
                default: // Mensagens WebRTC comuns (offer, answer, candidate)
                    if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
                        ws.peer.send(JSON.stringify(data));
                    } else {
                        console.log(`Peer de ${ws.id} não está conectado ou pronto. Mensagem "${data.type}" não entregue.`);
                    }
                    break;
            }
        } catch (err) {
            console.error(`Erro ao processar mensagem JSON de ${ws.id}:`, err);
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