const express = require('express');
const router = express.Router();

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { getLatestRobotStatus } = require('./robotService');
const { getOrderStatus } = require('./orderService');
const { getChatSessionStatus } = require('./chatService');

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

// Auth metadata
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

  // Replace static order block with real-time call
  Promise.all([
  stockPromise,
  getLatestRobotStatus(1),
  getOrderStatus(1),
  getChatSessionStatus()
])
  .then(([stockResult, robot, order, chat]) => {
    res.render('index', {
      title: 'Smart Warehouse Dashboard',
      stock: stockResult.data,
      stockError: stockResult.error,
      robot,
      order,
      chatStatus: chat
    });
  })
    .catch((err) => {
      console.error('Error loading dashboard:', err.message);
      res.render('index', {
        title: 'Smart Warehouse Dashboard',
        stock: null,
        stockError: 'Could not load stock info',
        robot: null,
        order: null
      });
    });
});

module.exports = router;
