const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load order.proto
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../../proto/order.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);
const orderProto = grpc.loadPackageDefinition(packageDefinition).order;

// Auth metadata
const getAuthMetadata = () => {
  const metadata = new grpc.Metadata();
  metadata.set('api-key', 'WAREHOUSE_SECRET');
  return metadata;
};

// Fetch order status by ID
function getOrderStatus(order_id = 1) {
  return new Promise((resolve, reject) => {
    const client = new orderProto.OrderFulfillmentService(
      'localhost:50053',
      grpc.credentials.createInsecure()
    );

    client.GetOrderStatus({ order_id }, getAuthMetadata(), (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

module.exports = { getOrderStatus };
