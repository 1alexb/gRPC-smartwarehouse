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

// Unary: Place a new order
const placeOrder = (call, callback) => {
  const newOrderId = orders.length + 1;
  const newOrder = {
    order_id: newOrderId,
    status: "Received",
    items: call.request.items
  };

  // Reduce stock for each item ordered
  newOrder.items.forEach(item => {
    // First, get current stock to calculate new quantity
    stockClient.GetStockStatus({ item_id: item.item_id }, (err, res) => {
      if (!err && res.quantity >= item.quantity) {
        const updatedQty = res.quantity - item.quantity;

        stockClient.UpdateStock({ item_id: item.item_id, new_quantity: updatedQty }, (err2, res2) => {
          if (err2) {
            console.log(`Error updating stock for item ${item.item_id}:`, err2.details);
          } else {
            console.log(`Stock updated for item ${item.item_id}: new quantity = ${updatedQty}`);
          }
        });
      } else {
        console.log(`Insufficient or missing stock for item ${item.item_id}`);
      }
    });
  });

  orders.push(newOrder);
  callback(null, { order_id: newOrderId, status: "Received" });
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
