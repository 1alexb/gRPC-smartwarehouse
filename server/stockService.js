const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/stock.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const stockProto = grpc.loadPackageDefinition(packageDefinition).stock;

let stock = [
  { item_id: 1, name: "Box of screws", quantity: 100, location: "A1" },
  { item_id: 2, name: "Wooden planks", quantity: 50, location: "B3" }
];

// Unary: Update stock quantity
const updateStock = (call, callback) => {
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
  const item = stock.find(i => i.item_id === call.request.item_id);
  if (item) {
    callback(null, item);
  } else {
    callback({
      code: grpc.status.NOT_FOUND,
      details: "Item not found"
    });
  }
};

// Client Streaming: Bulk update
const bulkUpdateStock = (call, callback) => {
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
