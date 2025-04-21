const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/chat.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

// === New: Define the shared API key ===
const API_KEY = "WAREHOUSE_SECRET";

// === New: Authentication utility ===
const isValidApiKey = (metadata) => {
  const key = metadata.get('api-key')[0];
  return key === API_KEY;
};

// Global user counter
let userCount = 1;

// Bidirectional chat handler
const chat = (call) => {
  // === New: Reject unauthenticated connections immediately ===
  if (!isValidApiKey(call.metadata)) {
    console.log(`[UNAUTHENTICATED] ${new Date().toISOString()} - Chat session rejected`);
    call.write({ user: "Server", message: "Authentication failed. Chat not allowed." });
    call.end();
    return;
  }

  const username = `User ${userCount++}`;

  // Session intro messages
  call.write({ user: "Server", message: `Initiated session as ${username}` });
  call.write({ user: "Server", message: `Type 'exit chat' to return to the main menu.` });

  call.on('data', (message) => {
    console.log(`[${username}]: ${message.message}`);

    // If user types 'exit chat', close the stream from the server side
    if (message.message.trim().toLowerCase() === 'exit chat') {
      call.write({ user: "Server", message: `Goodbye ${username}. Chat session closed.` });
      call.end();
      return;
    }

    // Standard echo
    call.write({ user: "Server", message: `Received: "${message.message}"` });
  });

  call.on('end', () => {
    console.log(`${username} has ended the chat session.`);
    call.end();
  });
};

const server = new grpc.Server();
server.addService(chatProto.ChatService.service, {
  Chat: chat
});

server.bindAsync('127.0.0.1:50056', grpc.ServerCredentials.createInsecure(), () => {
  console.log('ChatService running on port 50056');
  server.start();
});
