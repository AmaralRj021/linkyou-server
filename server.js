// server/server.js
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// Cria um servidor HTTP para responder a health checks de plataformas como o Render.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Servidor de Sinalização LinkYou está a postos.');
});

// Anexa o servidor WebSocket ao servidor HTTP.
const wss = new WebSocket.Server({ server });

// Armazenamento em memória para clientes.
// Em produção, isto seria substituído por uma solução mais robusta como Redis.
let waitingPeer = null; // Armazena um único cliente que está à espera de um par.

console.log(`Servidor de Sinalização iniciado na porta ${PORT}`);

wss.on('connection', ws => {
  console.log('[CONEXÃO] Novo cliente conectado.');

  // Lógica de tratamento de mensagens.
  ws.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('[ERRO] Mensagem inválida (não é JSON):', message);
      return;
    }

    console.log(`[MENSAGEM] Recebida de um cliente: ${data.type}`);

    switch (data.type) {
      // Quando um cliente clica em "Iniciar"
      case 'request_new_peer':
        // Limpa qualquer par antigo que este cliente possa ter.
        if (ws.peer) {
          ws.peer.peer = null;
          ws.peer = null;
        }
        
        // Se já houver alguém à espera...
        if (waitingPeer) {
          console.log('[PAREAMENTO] Encontrado um par. Iniciando chamada.');
          const peer = waitingPeer;
          waitingPeer = null; // Limpa a fila de espera.

          // Liga os dois clientes um ao outro.
          ws.peer = peer;
          peer.peer = ws;

          // Envia a mensagem 'start_call' para ambos.
          // O primeiro a ser pareado (peer) será o iniciador.
          peer.send(JSON.stringify({ type: 'start_call', isInitiator: true }));
          ws.send(JSON.stringify({ type: 'start_call', isInitiator: false }));
        } else {
          // Se não houver ninguém à espera, este cliente fica na fila.
          console.log('[PAREAMENTO] Nenhum par encontrado. Cliente colocado na fila de espera.');
          waitingPeer = ws;
          ws.send(JSON.stringify({ type: 'waiting' }));
        }
        break;

      // Para mensagens WebRTC (offer, answer, candidate), simplesmente reencaminha para o par.
      case 'offer':
      case 'answer':
      case 'candidate':
        if (ws.peer) {
          console.log(`[SINALIZAÇÃO] Reencaminhando '${data.type}' para o par.`);
          ws.peer.send(JSON.stringify(data));
        } else {
          console.warn(`[AVISO] Mensagem '${data.type}' recebida, mas o cliente não tem um par.`);
        }
        break;

      default:
        console.warn(`[AVISO] Tipo de mensagem desconhecido: ${data.type}`);
    }
  });

  // Lógica de tratamento de desconexão.
  ws.on('close', () => {
    console.log('[CONEXÃO] Cliente desconectado.');
    
    // Se o cliente que se desconectou era o que estava à espera.
    if (waitingPeer === ws) {
      waitingPeer = null;
      console.log('[PAREAMENTO] Cliente que estava na fila desconectou-se.');
    }
    
    // Se o cliente estava numa chamada, notifica o outro.
    if (ws.peer) {
      console.log('[CONEXÃO] Notificando o par sobre a desconexão.');
      ws.peer.send(JSON.stringify({ type: 'call_ended' }));
      ws.peer.peer = null; // Limpa a referência do par.
    }
  });

  ws.on('error', (error) => {
    console.error('[ERRO] Erro no WebSocket:', error);
  });
});

// Inicia o servidor.
server.listen(PORT);
