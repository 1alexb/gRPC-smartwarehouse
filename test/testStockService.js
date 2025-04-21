const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/test_stock.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const testStockProto = grpc.loadPackageDefinition(packageDefinition).teststock;

const stock = [
  { item_id: 1, name: "Box of screws", quantity: 100, location: "A1" },
  { item_id: 2, name: "Wooden planks", quantity: 50, location: "B3" }
];

const getStockStatus = (call, callback) => {
  console.log('Incoming request:', call.request);

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

const server = new grpc.Server();
server.addService(testStockProto.TestStockService.service, {
  GetStockStatus: getStockStatus
});

server.bindAsync('127.0.0.1:50061', grpc.ServerCredentials.createInsecure(), () => {
  console.log('TestStockService running on port 50061');
  server.start();
});
