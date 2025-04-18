const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

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

// Hardcoded mapping of service names to their running addresses
const services = {
  StockTrackingService: "localhost:50051",
  InventoryRobotService: "localhost:50052",
  OrderFulfillmentService: "localhost:50053"
};

// Unary RPC: return the address for the given service name
const discoverService = (call, callback) => {
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
