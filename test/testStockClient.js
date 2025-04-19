const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/stock.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const stockProto = grpc.loadPackageDefinition(packageDefinition).stock;

// Create client that bypasses discovery
const client = new stockProto.StockTrackingService('localhost:50051', grpc.credentials.createInsecure());

// Send request with item_id (must match the proto field name)
const request = { item_id: 1 };

console.log("Sending request:", request);

client.GetStockStatus(request, (err, res) => {
  if (err) {
    console.error("Error from service:", err.details);
  } else {
    console.log("Response from service:", res);
  }
});
