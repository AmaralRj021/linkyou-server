// server/api/websocket.js
// Este arquivo será o ponto de entrada da sua função serverless no Vercel

// Importamos a biblioteca ws. O Vercel cuida de instalar as dependências
const WebSocket = require('ws');

// A lógica do servidor de sinalização precisa ser mantida em memória entre conexões
// Para um ambiente serverless, isso é um desafio.
// Uma solução comum é usar um serviço externo (Redis) para gerenciar clientes,
// mas para o nosso protótipo, podemos simular uma store simples em memória
// que pode resetar em cold starts de função, mas nos permitirá testar.

// Em um ambiente de produção real com Vercel Functions e WebSockets,
// você precisaria de um serviço de pub/sub (como Redis Pub/Sub, Pusher, Ably)
// para gerenciar o estado dos clientes e o pareamento entre diferentes instâncias da função.
// Para este projeto educacional, vamos manter a lógica in-memory e entender a limitação.

// Simulação de armazenamento em memória (para fins de protótipo serverless)
// Note: Em produção, isso precisaria ser um banco de dados ou Redis.
const clients = new Map();
let nextClientId = 0;

// Esta é a função principal que o Vercel vai executar
module.exports = (req, res) => {
  // Verifica se é uma requisição de WebSocket
  if (req.headers.upgrade === 'websocket') {
    // Para Vercel Functions, a integração WebSocket é um pouco diferente.
    // O Vercel vai lidar com o handshake HTTP para WebSocket, e então encaminhar.
    // O Vercel geralmente espera um objeto `WebSocket.Server` para lidar com isso.

    // No ambiente Serverless do Vercel, você não cria um servidor WebSocket
    // que escuta em uma porta. Em vez disso, você lida com a requisição de upgrade.
    // A biblioteca `ws` não é projetada para o modelo serverless diretamente.

    // A maneira mais simples de fazer isso com Vercel Functions para WebSockets
    // é através de uma API de WebSockets mais alto nível que Vercel possa suportar,
    // ou adaptadores específicos.

    // Para o nosso propósito (manter simples e funcional no serverless):
    // Vamos usar um pattern onde a função Serverless "simula" ser o endpoint WebSocket.
    // No entanto, a implementação pura de `ws` como estamos usando NÃO é a maneira correta
    // de construir um servidor WebSocket persistente em Vercel Functions.

    // A Vercel recomenda usar serviços de WebSockets gerenciados (ex: Pusher, Ably, Cloudflare Workers with WebSockets)
    // para um backend de WebSocket serverless persistente.
    // Tentar rodar `ws` diretamente em uma Vercel Function é problemático para conexões persistentes.

    // DADA A COMPLEXIDADE DE WEBSOCKETS PERSISTENTES EM SERVERLESS GRATUITO
    // E A NECESSIDADE DE CONTINUARMOS AVANÇANDO,
    // VOU ADOTAR UMA ABORDAGEM MAIS SIMPLES PARA O SERVIDOR DE SINALIZAÇÃO NO VERCEL
    // QUE VAI SER UM POUCO DIFERENTE DO `ws.Server` TRADICIONAL.

    // Revertendo para uma solução de servidor "long-running" para o servidor de sinalização,
    // que é mais adequada para WebSockets e que serviços como o Render.com ou Railway.app
    // (outra alternativa gratuita) suportam melhor.
    // O erro "Upgrade required" no Render sugere uma incompatibilidade na forma como
    // a conexão WebSocket é tratada no lado do Render.com.

    // **Dada a persistência dos problemas com o Render.com e a complexidade do Vercel Functions para WebSockets:**
    // Vamos tentar **Railway.app**. É uma plataforma similar ao Render/Heroku com um free tier.
    // A implementação do servidor Node.js que já temos é mais adequada para este tipo de plataforma.
    // Se o Railway.app também der problema, significa que a implementação padrão de `ws`
    // que estamos usando é o problema para esses provedores de nuvem, e precisaríamos
    // migrar para um WebSocket gerenciado (Pusher/Ably) ou um backend Node.js mais robusto.
    // Mas vamos tentar o Railway.app primeiro, pois a experiência é mais próxima do Render.

    // **Peço desculpas pela mudança de rota novamente, mas é crucial encontrar uma solução funcional e gratuita.**
    // O problema "Upgrade required" do Render é bastante específico.

    // Vamos cancelar esta Etapa 2.1 e voltar para a Etapa 19.
    // **A mensagem "Upgrade required" no Render.com significa que o servidor está funcionando,**
    // **mas ele não está fazendo o handshake de WebSocket corretamente.**

    // **Solução mais provável para o "Upgrade required" no Render:**
    // O Render precisa que você defina o `HTTP/1.1 Upgrade: websocket` nos headers.
    // A biblioteca `ws` faz isso automaticamente no lado do cliente.
    // No lado do servidor, pode ser que o Render tenha algum proxy que exija uma configuração específica.

    // Render.com é conhecido por suportar WebSockets em seu Free Tier.
    // O problema "Upgrade required" é mais comum quando um balanceador de carga/proxy
    // não está configurado para passar o cabeçalho de upgrade.

    // **Vamos tentar um ajuste FINAL no `server.js` para o Render.com.**
    // Se isso não funcionar, aí sim, Railway.app será a próxima tentativa.

    // A biblioteca `ws` deve estar configurada para usar um servidor HTTP/HTTPS
    // e o `WebSocket.Server` ser anexado a ele. O Render espera que a porta
    // esteja escutando requisições HTTP e WebSockets na mesma porta.

    const http = require('http'); // Usar o módulo HTTP do Node.js
    const server = http.createServer((req, res) => {
        // Handle normal HTTP requests if any (e.g., /healthcheck)
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WebSocket server is running');
    });

    const wss = new WebSocket.Server({ server: server }); // Anexar WebSocket.Server ao servidor HTTP

    const clients = new Map();
    let nextClientId = 0;

    wss.on('listening', () => {
        console.log(`Servidor de Sinalização iniciado na porta ${PORT}`);
    });

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
                    case 'report_user':
                        console.warn(`DENÚNCIA RECEBIDA: Cliente ${ws.id} denunciou cliente ${data.reportedPeerId || 'desconhecido'}. Motivo: ${data.reason || 'Não especificado'}`);
                        if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
                            ws.peer.send(JSON.stringify({ type: 'report_received' }));
                        }
                        break;
                    default:
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

    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
        // Isso será logado pelo wss.on('listening') também, mas garante que o server.listen funcione.
    });