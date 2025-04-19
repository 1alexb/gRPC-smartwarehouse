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

const client = new testStockProto.TestStockService('localhost:50061', grpc.credentials.createInsecure());

client.GetStockStatus({ item_id: 1 }, (err, res) => {
  if (err) {
    console.error("Error:", err.details);
  } else {
    console.log("Response:", res);
  }
});
