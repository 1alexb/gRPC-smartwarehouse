const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load chat.proto
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../../proto/chat.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

// Auth metadata
const getAuthMetadata = () => {
  const metadata = new grpc.Metadata();
  metadata.set('api-key', 'WAREHOUSE_SECRET');
  return metadata;
};

// Open a bidirectional stream, send test message, and return session status
function getChatSessionStatus() {
  return new Promise((resolve) => {
    const client = new chatProto.ChatService(
      'localhost:50056',
      grpc.credentials.createInsecure()
    );

    const call = client.Chat(getAuthMetadata());

    let receivedIntro = false;

    call.on('data', (msg) => {
      if (msg.message.includes("Initiated session")) {
        receivedIntro = true;
        call.end();
      }
    });

    call.on('end', () => {
      resolve(receivedIntro ? "Connected" : "No session");
    });

    call.on('error', () => {
      resolve("Disconnected");
    });

    // Send dummy to trigger server init
    call.write({ user: "WebClient", message: "ping" });
  });
}

module.exports = { getChatSessionStatus };
