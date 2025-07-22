// server/server.js
const http = require('http'); // Módulo HTTP do Node.js
const WebSocket = require('ws'); // Biblioteca WebSocket

const PORT = process.env.PORT || 8080; // Porta do ambiente de hospedagem

// Cria um servidor HTTP
const server = http.createServer((req, res) => {
    // Responde a requisições HTTP normais (ex: health checks do Render)
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Servidor de Sinalização LinkYou está rodando.');
});

// Cria um servidor WebSocket e o anexa ao servidor HTTP
const wss = new WebSocket.Server({ server: server });

// Evento de "listening" para quando o servidor estiver pronto
wss.on('listening', () => {
    console.log(`Servidor de Sinalização LinkYou iniciado na porta ${PORT}`);
});

// Armazenamento em memória para clientes (para protótipo)
const clients = new Map();
let nextClientId = 0;

// Lógica de Conexão WebSocket
wss.on('connection', ws => {
    const id = nextClientId++;
    ws.id = id;
    clients.set(id, ws);
    console.log(`Novo cliente conectado: ${id}. Total de clientes: ${clients.size}`);

    // Função auxiliar para encontrar e parear um peer
    function findAndPairPeer(currentWs) {
        let peerId = null;
        let peerWs = null;

        for (const [otherId, otherWs] of clients.entries()) {
            // Procura por outro cliente que não seja o próprio, não tenha um peer e esteja aberto
            if (otherId !== currentWs.id && !otherWs.peer && otherWs.readyState === WebSocket.OPEN) {
                peerId = otherId;
                peerWs = otherWs;
                break;
            }
        }

        if (peerId !== null) {
            currentWs.peer = peerWs;
            peerWs.peer = currentWs; // Conecta o peer de volta

            console.log(`Pareando cliente ${currentWs.id} com cliente ${peerId}`);

            currentWs.send(JSON.stringify({ type: 'start_call', ownId: currentWs.id, peerId: peerId }));
            peerWs.send(JSON.stringify({ type: 'start_call', ownId: peerId, peerId: currentWs.id }));
            return true; // Retorna true se encontrou e pareou
        }
        return false; // Retorna false se não encontrou um par
    }

    // Tenta parear o novo cliente imediatamente
    if (!findAndPairPeer(ws)) {
        console.log(`Cliente ${id} aguardando por um par.`);
        ws.send(JSON.stringify({ type: 'waiting' }));
    }

    // Lida com mensagens recebidas do cliente
    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            console.log(`Mensagem de ${ws.id}:`, data.type);

            switch (data.type) {
                case 'request_new_peer':
                    console.log(`Cliente ${ws.id} solicitou novo peer.`);
                    // Desconecta do peer atual (se existir)
                    if (ws.peer) {
                        if (ws.peer.readyState === WebSocket.OPEN) {
                            ws.peer.send(JSON.stringify({ type: 'call_ended' }));
                            ws.peer.peer = null; // Desassocia o peer do cliente restante
                        }
                        ws.peer = null; // Remove o peer deste cliente
                    }
                    
                    // Tenta encontrar um novo par para este cliente
                    if (!findAndPairPeer(ws)) {
                        console.log(`Cliente ${ws.id} agora aguardando por um novo par.`);
                        ws.send(JSON.stringify({ type: 'waiting' }));
                    }
                    break;
                case 'report_user':
                    console.warn(`DENÚNCIA RECEBIDA: Cliente ${ws.id} denunciou cliente ${data.reportedPeerId || 'desconhecido'}. Motivo: ${data.reason || 'Não especificado'}`);
                    // Em um app real, aqui você faria:
                    // 1. Salvar no banco de dados
                    // 2. Notificar moderadores
                    // 3. Potencialmente desconectar os usuários ou banir
                    if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
                        ws.peer.send(JSON.stringify({ type: 'report_received' }));
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

    // Lida com a desconexão do cliente
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

    // Lida com erros na conexão WebSocket
    ws.on('error', error => {
        console.error(`Erro no cliente ${ws.id}:`, error);
    });
});

// Inicia o servidor HTTP e o faz escutar na porta
server.listen(PORT, () => {
    // Este console.log já está coberto pelo wss.on('listening'), mas é redundante e seguro.
});