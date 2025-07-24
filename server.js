// server/server.js
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Servidor de Sinalização LinkYou está a postos.');
});

const wss = new WebSocket.Server({ server });

// Armazenamento em memória para clientes e IDs.
const clients = new Map();
let nextClientId = 0;
let waitingPeer = null;

wss.on('listening', () => {
    console.log(`Servidor de Sinalização iniciado na porta ${PORT}`);
});

wss.on('connection', ws => {
  // Atribui um ID único a cada nova conexão.
  const clientId = nextClientId++;
  ws.id = clientId;
  clients.set(clientId, ws);
  console.log(`[CONEXÃO] Novo cliente conectado: ${clientId}. Total: ${clients.size}`);

  ws.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error(`[ERRO] Mensagem inválida de ${ws.id}:`, message);
      return;
    }

    console.log(`[MENSAGEM] Recebida de ${ws.id}: ${data.type}`);

    switch (data.type) {
      case 'request_new_peer':
        // Limpa o par antigo, se houver.
        if (ws.peer) {
          if (ws.peer.readyState === WebSocket.OPEN) {
            ws.peer.send(JSON.stringify({ type: 'call_ended' }));
          }
          ws.peer.peer = null;
          ws.peer = null;
        }
        
        // Se já houver alguém à espera...
        if (waitingPeer) {
          const peer = waitingPeer;
          waitingPeer = null;

          ws.peer = peer;
          peer.peer = ws;

          console.log(`[PAREAMENTO] Pareando ${peer.id} com ${ws.id}.`);

          // Envia a mensagem 'start_call' com os IDs corretos.
          // A lógica de quem é o iniciador será decidida no frontend.
          peer.send(JSON.stringify({ type: 'start_call', ownId: peer.id, peerId: ws.id }));
          ws.send(JSON.stringify({ type: 'start_call', ownId: ws.id, peerId: peer.id }));
        } else {
          console.log(`[PAREAMENTO] Cliente ${ws.id} colocado na fila de espera.`);
          waitingPeer = ws;
          ws.send(JSON.stringify({ type: 'waiting' }));
        }
        break;

      case 'offer':
      case 'answer':
      case 'candidate':
        if (ws.peer) {
          console.log(`[SINALIZAÇÃO] Reencaminhando '${data.type}' de ${ws.id} para ${ws.peer.id}.`);
          // Adiciona o ID do remetente para depuração no cliente (opcional, mas útil).
          const messageWithSender = { ...data, senderId: ws.id };
          ws.peer.send(JSON.stringify(messageWithSender));
        }
        break;
        
      default:
        console.warn(`[AVISO] Tipo de mensagem desconhecido de ${ws.id}: ${data.type}`);
    }
  });

  ws.on('close', () => {
    console.log(`[CONEXÃO] Cliente ${ws.id} desconectado.`);
    clients.delete(ws.id);
    
    if (waitingPeer === ws) {
      waitingPeer = null;
      console.log('[PAREAMENTO] Cliente que estava na fila desconectou-se.');
    }
    
    if (ws.peer) {
      if (ws.peer.readyState === WebSocket.OPEN) {
        console.log(`[CONEXÃO] Notificando o par ${ws.peer.id} sobre a desconexão.`);
        ws.peer.send(JSON.stringify({ type: 'call_ended' }));
      }
      ws.peer.peer = null;
    }
  });

  ws.on('error', (error) => {
    console.error(`[ERRO] Erro no WebSocket do cliente ${ws.id}:`, error);
  });
});

server.listen(PORT);
