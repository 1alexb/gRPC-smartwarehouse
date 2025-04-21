const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto
const PROTO_PATH = path.join(__dirname, '../proto/stock.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const stockProto = grpc.loadPackageDefinition(packageDefinition).stock;

// Hardcoded stock (mock DB)
let stock = [
  { item_id: 1, name: "Box of screws", quantity: 100, location: "A1" },
  { item_id: 2, name: "Wooden planks", quantity: 50, location: "B3" },
  { item_id: 3, name: "Metal frames", quantity: 20, location: "C1" }
];

// === Added: API key constant ===
const API_KEY = "WAREHOUSE_SECRET";

// === Added: Authentication utility ===
const isValidApiKey = (metadata) => {
  const key = metadata.get('api-key')[0];
  return key === API_KEY;
};

// Unary: Update stock quantity
const updateStock = (call, callback) => {
  // === Added: API key check ===
  if (!isValidApiKey(call.metadata)) {
    console.log(`[UNAUTHENTICATED] ${new Date().toISOString()} - UpdateStock`);
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      details: "Missing or invalid API key"
    });
  }

  const item = stock.find(i => i.item_id === call.request.item_id);
  if (item) {
    item.quantity = call.request.new_quantity;
    callback(null, { success: true, message: "Stock updated." });
  } else {
    callback(null, { success: false, message: "Item not found." });
  }
};

// Unary: Get stock status
const getStockStatus = (call, callback) => {
  // === Added: API key check ===
  if (!isValidApiKey(call.metadata)) {
    console.log(`[UNAUTHENTICATED] ${new Date().toISOString()} - GetStockStatus`);
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      details: "Missing or invalid API key"
    });
  }

  console.log('Incoming GetStockStatus request:', call.request);

  const item = stock.find(i => {
    console.log('Checking against:', i.item_id);
    return i.item_id === call.request.item_id;
  });

  if (item) {
    console.log('Match found:', item);
    callback(null, item);
  } else {
    console.log('No match found');
    callback({
      code: grpc.status.NOT_FOUND,
      details: "Item not found"
    });
  }
};

// Client Streaming: Bulk update
const bulkUpdateStock = (call, callback) => {
  // === Added: API key check at stream start ===
  if (!isValidApiKey(call.metadata)) {
    console.log(`[UNAUTHENTICATED] ${new Date().toISOString()} - BulkUpdateStock`);
    call.end(); // immediately terminate stream
    return;
  }

  call.on('data', request => {
    const item = stock.find(i => i.item_id === request.item_id);
    if (item) {
      item.quantity = request.new_quantity;
    }
  });

  call.on('end', () => {
    callback(null, { success: true, message: "Bulk update complete." });
  });
};

// Server startup
const server = new grpc.Server();
server.addService(stockProto.StockTrackingService.service, {
  UpdateStock: updateStock,
  GetStockStatus: getStockStatus,
  BulkUpdateStock: bulkUpdateStock
});

server.bindAsync('127.0.0.1:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('StockTrackingService running on port 50051');
  server.start();
});
