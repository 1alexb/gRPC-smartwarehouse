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
