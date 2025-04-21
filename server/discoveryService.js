const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs'); // ← Added for logging

// Load the discovery.proto file
const PROTO_PATH = path.join(__dirname, '../proto/discovery.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const discoveryProto = grpc.loadPackageDefinition(packageDefinition).discovery;

// === New: Shared API key constant ===
const API_KEY = "WAREHOUSE_SECRET";

// === New: Utility function to check API key ===
const isValidApiKey = (metadata) => {
  const key = metadata.get('api-key')[0];
  return key === API_KEY;
};

// === New: Ensure logs/ directory exists ===
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// === New: Append security log to file ===
const logSecurityEvent = (message) => {
  const timestamp = new Date().toISOString();
  const entry = `[UNAUTHENTICATED] ${timestamp} - ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'security.log'), entry);
};

// Hardcoded mapping of service names to their running addresses
const services = {
  StockTrackingService: "localhost:50051",
  InventoryRobotService: "localhost:50052",
  OrderFulfillmentService: "localhost:50053",
  ChatService: "localhost:50056"
};

// Unary RPC: return the address for the given service name
const discoverService = (call, callback) => {
  if (!isValidApiKey(call.metadata)) {
    const attemptedService = call.request?.serviceName || "Unknown";
    logSecurityEvent(`Attempted discovery of "${attemptedService}"`);
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      details: "Missing or invalid API key"
    });
  }

  const serviceName = call.request.serviceName;
  const address = services[serviceName];

  if (address) {
    callback(null, { address });
  } else {
    callback({
      code: grpc.status.NOT_FOUND,
      details: "Service not found"
    });
  }
};

// Set up and start the gRPC server
const server = new grpc.Server();
server.addService(discoveryProto.DiscoveryService.service, {
  DiscoverService: discoverService
});

server.bindAsync('127.0.0.1:50054', grpc.ServerCredentials.createInsecure(), () => {
  console.log('DiscoveryService running on port 50054');
  server.start();
});
