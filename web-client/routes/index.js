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
        chatStatus: chat,
        stockUpdateMessage: null,
        orderMessage: null,
        bulkUpdateMessage: null

      });
    })
    .catch((err) => {
      console.error('Error loading dashboard:', err.message);
      res.render('index', {
        title: 'Smart Warehouse Dashboard',
        stock: null,
        stockError: 'Could not load stock info',
        robot: null,
        order: null,
        chatStatus: null,
        stockUpdateMessage: null,
        orderMessage: null
      });
    });
});

// Get stock

router.post('/get-stock', (req, res) => {
  const { item_id } = req.body;
  const metadata = getAuthMetadata();

  const id = parseInt(item_id);
  if (isNaN(id)) {
    return res.render('index', {
      title: 'Smart Warehouse Dashboard',
      stock: null,
      stockError: "Invalid item ID",
      robot: null,
      order: null,
      chatStatus: null,
      stockUpdateMessage: null,
      orderMessage: null
    });
  }

  stockClient.GetStockStatus({ item_id: id }, metadata, (err, data) => {
    const stockResult = err ? null : data;
    const stockError = err ? err.details : null;

    Promise.all([
      getLatestRobotStatus(1),
      getOrderStatus(1),
      getChatSessionStatus()
    ])
      .then(([robot, order, chat]) => {
        res.render('index', {
          title: 'Smart Warehouse Dashboard',
          stock: stockResult,
          stockError,
          robot,
          order,
          chatStatus: chat,
          stockUpdateMessage: null,
          orderMessage: null
        });
      });
  });
});

// Update stock
router.post('/update-stock', (req, res) => {
  const { item_id, new_quantity } = req.body;
  const metadata = getAuthMetadata();

  stockClient.UpdateStock(
    {
      item_id: parseInt(item_id),
      new_quantity: parseInt(new_quantity)
    },
    metadata,
    (err, response) => {
      const message = err
        ? `Update failed: ${err.details}`
        : response.message;

      const stockPromise = new Promise((resolve) => {
        stockClient.GetStockStatus({ item_id: 1 }, metadata, (err, data) => {
          resolve({ data, error: err?.details });
        });
      });

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
            chatStatus: chat,
            stockUpdateMessage: message,
            orderMessage: null
          });
        })
        .catch(() => {
          res.render('index', {
            title: 'Smart Warehouse Dashboard',
            stock: null,
            stockError: 'Error loading data',
            robot: null,
            order: null,
            chatStatus: null,
            stockUpdateMessage: message,
            orderMessage: null
          });
        });
    }
  );
});

// Place order
router.post('/place-order', (req, res) => {
  const { item_id, quantity } = req.body;
  const metadata = getAuthMetadata();

  const order = {
    items: [
      {
        item_id: parseInt(item_id),
        quantity: parseInt(quantity)
      }
    ]
  };

  const orderProto = grpc.loadPackageDefinition(
    protoLoader.loadSync(path.join(__dirname, '../../proto/order.proto'), {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    })
  ).order;

  const orderClient = new orderProto.OrderFulfillmentService(
    'localhost:50053',
    grpc.credentials.createInsecure()
  );

  orderClient.PlaceOrder(order, metadata, (err, response) => {
    const message = err
      ? `Order failed: ${err.details}`
      : `Order placed: ID ${response.order_id}, Status: ${response.status}`;

    const stockPromise = new Promise((resolve) => {
      stockClient.GetStockStatus({ item_id: 1 }, metadata, (err, data) => {
        resolve({ data, error: err?.details });
      });
    });

    Promise.all([
      stockPromise,
      getLatestRobotStatus(1),
      getOrderStatus(response?.order_id || 1),
      getChatSessionStatus()
    ])
      .then(([stockResult, robot, orderStatus, chat]) => {
        res.render('index', {
          title: 'Smart Warehouse Dashboard',
          stock: stockResult.data,
          stockError: stockResult.error,
          robot,
          order: orderStatus,
          chatStatus: chat,
          stockUpdateMessage: null,
          orderMessage: message
        });
      })
      .catch(() => {
        res.render('index', {
          title: 'Smart Warehouse Dashboard',
          stock: null,
          stockError: 'Could not load stock info',
          robot: null,
          order: null,
          chatStatus: null,
          stockUpdateMessage: null,
          orderMessage: message
        });
      });
  });
});
// bulk POST

router.post('/bulk-update-stock', (req, res) => {
  const { updates } = req.body;
  const metadata = getAuthMetadata();

  // Expecting updates as JSON stringified array of { item_id, new_quantity }
  let parsed;
  try {
    parsed = JSON.parse(updates);
  } catch (err) {
    return res.render('index', {
      title: 'Smart Warehouse Dashboard',
      stock: null,
      stockError: 'Invalid bulk update format',
      robot: null,
      order: null,
      chatStatus: null,
      stockUpdateMessage: null,
      orderMessage: null,
      bulkUpdateMessage: 'Invalid format for bulk updates'
    });
  }

  const stockProto = grpc.loadPackageDefinition(
    protoLoader.loadSync(path.join(__dirname, '../../proto/stock.proto'), {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    })
  ).stock;

  const client = new stockProto.StockTrackingService(
    'localhost:50051',
    grpc.credentials.createInsecure()
  );

  const call = client.BulkUpdateStock(metadata, (err, response) => {
    const message = err
      ? `Bulk update failed: ${err.details}`
      : response.message;

    const stockPromise = new Promise((resolve) => {
      client.GetStockStatus({ item_id: 1 }, metadata, (err, data) => {
        resolve({ data, error: err?.details });
      });
    });

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
          chatStatus: chat,
          stockUpdateMessage: null,
          orderMessage: null,
          bulkUpdateMessage: message
        });
      });
  });

  parsed.forEach(({ item_id, new_quantity }) => {
    call.write({ item_id: parseInt(item_id), new_quantity: parseInt(new_quantity) });
  });

  call.end();
});

// Track robot
router.post('/track-robot', (req, res) => {
  const { robot_id } = req.body;
  const metadata = getAuthMetadata();

  const stockPromise = new Promise((resolve) => {
    stockClient.GetStockStatus({ item_id: 1 }, metadata, (err, data) => {
      resolve({ data, error: err?.details });
    });
  });

  Promise.all([
    stockPromise,
    getLatestRobotStatus(parseInt(robot_id)),
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
        chatStatus: chat,
        stockUpdateMessage: null,
        orderMessage: null
      });
    })
    .catch(() => {
      res.render('index', {
        title: 'Smart Warehouse Dashboard',
        stock: null,
        stockError: 'Error loading data',
        robot: null,
        order: null,
        chatStatus: null,
        stockUpdateMessage: null,
        orderMessage: null
      });
    });
});

module.exports = router;
