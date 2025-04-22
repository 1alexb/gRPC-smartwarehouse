const express = require('express');
const router = express.Router();

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load stock.proto
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../../proto/stock.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);

const stockProto = grpc.loadPackageDefinition(packageDefinition).stock;

const stockClient = new stockProto.StockTrackingService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Inject auth metadata
const getAuthMetadata = () => {
  const metadata = new grpc.Metadata();
  metadata.set('api-key', 'WAREHOUSE_SECRET');
  return metadata;
};

// Homepage route
router.get('/', (req, res) => {
  const metadata = getAuthMetadata();

  const stockPromise = new Promise((resolve) => {
    stockClient.GetStockStatus({ item_id: 1 }, metadata, (err, data) => {
      resolve({ data, error: err?.details });
    });
  });

  const robotStatus = {
    robot_id: 1,
    state: 'IDLE',
    current_location: 'Dock A'
  }; // Static placeholder

  const orderStatus = {
    order_id: 99,
    status: 'Received'
  }; // Simulated response

  stockPromise.then((stockResult) => {
    res.render('index', {
      title: 'Smart Warehouse Dashboard',
      stock: stockResult.data,
      stockError: stockResult.error,
      robot: robotStatus,
      order: orderStatus
    });
  });
});

module.exports = router;
