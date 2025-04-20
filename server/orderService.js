const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the order.proto file
const PROTO_PATH = path.join(__dirname, '../proto/order.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const orderProto = grpc.loadPackageDefinition(packageDefinition).order;

// Load the stock.proto file for internal calls
const stockProtoPath = path.join(__dirname, '../proto/stock.proto');
const stockDefinition = protoLoader.loadSync(stockProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const stockProto = grpc.loadPackageDefinition(stockDefinition).stock;

// Create direct client to StockTrackingService
const stockClient = new stockProto.StockTrackingService('localhost:50051', grpc.credentials.createInsecure());

// In-memory mock order list
let orders = [
  { order_id: 1, status: "Shipped", items: [{ item_id: 1, quantity: 2 }] },
  { order_id: 2, status: "Pending", items: [{ item_id: 2, quantity: 1 }] }
];

// Unary: Place a new order with stock validation
const placeOrder = async (call, callback) => {
  const requestedItems = call.request.items;

  try {
    // Validate and update stock for all items
    await Promise.all(requestedItems.map(async (item) => {
      const stockStatus = await new Promise((resolve, reject) => {
        stockClient.GetStockStatus({ item_id: item.item_id }, (err, res) => {
          if (err) return reject(`Failed to fetch stock for item ${item.item_id}`);
          if (res.quantity < item.quantity) return reject(`Not enough stock for item ${item.item_id}`);
          resolve(res);
        });
      });

      const newQty = stockStatus.quantity - item.quantity;

      await new Promise((resolve, reject) => {
        stockClient.UpdateStock({ item_id: item.item_id, new_quantity: newQty }, (err) => {
          if (err) return reject(`Failed to update stock for item ${item.item_id}`);
          resolve();
        });
      });
    }));

    // If all stock validated and updated, save the order
    const newOrderId = orders.length + 1;
    const newOrder = {
      order_id: newOrderId,
      status: "Received",
      items: requestedItems
    };

    orders.push(newOrder);
    callback(null, { order_id: newOrderId, status: "Received" });

  } catch (error) {
    // Handle stock error or update failure
    console.error("Order rejected:", error);
    callback({
      code: grpc.status.FAILED_PRECONDITION,
      details: error
    });
  }
};

// Unary: Get order status
const getOrderStatus = (call, callback) => {
  const order = orders.find(o => o.order_id === call.request.order_id);
  if (order) {
    callback(null, {
      order_id: order.order_id,
      status: order.status,
      items: order.items
    });
  } else {
    callback({
      code: grpc.status.NOT_FOUND,
      details: "Order not found"
    });
  }
};

// Bidirectional Streaming: Chat service between warehouse users
const chat = (call) => {
  call.on('data', (message) => {
    console.log(`[${message.user}]: ${message.message}`);
    call.write({ user: "Server", message: `Received: "${message.message}"` });
  });

  call.on('end', () => {
    call.end();
  });
};

const server = new grpc.Server();
server.addService(orderProto.OrderFulfillmentService.service, {
  PlaceOrder: placeOrder,
  GetOrderStatus: getOrderStatus,
  Chat: chat
});

server.bindAsync('127.0.0.1:50053', grpc.ServerCredentials.createInsecure(), () => {
  console.log('OrderFulfillmentService running on port 50053');
  server.start();
});
