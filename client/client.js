const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const readline = require('readline');
const path = require('path');
const fs = require('fs'); // Added for logging

// === Shared API key constant ===
const API_KEY = "WAREHOUSE_SECRET";

// === Ensure logs/ directory exists ===
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// === Client-side logging function ===
const logClientEvent = (message) => {
  const entry = `[CLIENT] ${new Date().toISOString()} - ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'client.log'), entry);
};

// === Attach metadata to all secure requests ===
const getAuthMetadata = () => {
  const metadata = new grpc.Metadata();
  metadata.set('api-key', API_KEY);
  return metadata;
};

// Helper to load any proto file and return the requested package
const loadProto = (filename, packageName) => {
  const packageDefinition = protoLoader.loadSync(
    path.join(__dirname, `../proto/${filename}`),
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    }
  );
  return grpc.loadPackageDefinition(packageDefinition)[packageName];
};

// Load all required proto files and packages
const discoveryProto = loadProto('discovery.proto', 'discovery');
const stockProto = loadProto('stock.proto', 'stock');
const robotProto = loadProto('robot.proto', 'robot');
const orderProto = loadProto('order.proto', 'order');
const chatProto = loadProto('chat.proto', 'chat');

// Create the DiscoveryService client (fixed port)
const discoveryClient = new discoveryProto.DiscoveryService('localhost:50054', grpc.credentials.createInsecure());

// Setup CLI input/output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility to handle gRPC errors uniformly
function handleGrpcError(err) {
  console.error("Error:", err.details || err.message || "Unknown error");
  logClientEvent(`gRPC error: ${err.details || err.message}`);
}

// Dynamically resolve the address of a service and return a ready gRPC client
const getClient = (serviceName, proto, serviceKey) => {
  return new Promise((resolve, reject) => {
    discoveryClient.DiscoverService({ serviceName }, getAuthMetadata(), (err, res) => {
      if (err || !res.address) {
        console.log(`Could not resolve ${serviceName}`);
        logClientEvent(`Service resolution failed for ${serviceName}`);
        reject(err);
      } else {
        logClientEvent(`Resolved ${serviceName} to ${res.address}`);
        const client = new proto[serviceKey](res.address, grpc.credentials.createInsecure());
        resolve(client);
      }
    });
  });
};

// ===============================
// STOCK SERVICE METHODS
// ===============================

const getStockStatus = async () => {
  try {
    const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
    rl.question("Enter item ID: ", input => {
      const itemId = parseInt(input);
      if (isNaN(itemId)) {
        console.error("Invalid input: Item ID must be a number.");
        logClientEvent("Invalid input for item ID");
        return showMenu();
      }

      logClientEvent(`Calling GetStockStatus with item ID ${itemId}`);
      client.GetStockStatus({ item_id: itemId }, getAuthMetadata(), (err, res) => {
        if (err) handleGrpcError(err);
        else {
          console.log("Stock Info:", res);
          logClientEvent(`Received stock info: ${JSON.stringify(res)}`);
        }
        showMenu();
      });
    });
  } catch (error) {
    console.error("Failed to resolve service:", error.message);
    logClientEvent(`Failed to resolve StockTrackingService: ${error.message}`);
    showMenu();
  }
};

const updateStock = async () => {
  try {
    const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
    rl.question("Item ID: ", idInput => {
      const itemId = parseInt(idInput);
      if (isNaN(itemId)) {
        console.error("Invalid input: Item ID must be a number.");
        logClientEvent("Invalid input for updateStock item ID");
        return showMenu();
      }

      rl.question("New Quantity: ", qtyInput => {
        const qty = parseInt(qtyInput);
        if (isNaN(qty)) {
          console.error("Invalid input: Quantity must be a number.");
          logClientEvent("Invalid input for updateStock quantity");
          return showMenu();
        }

        logClientEvent(`Calling UpdateStock for item ${itemId} with qty ${qty}`);
        client.UpdateStock({ item_id: itemId, new_quantity: qty }, getAuthMetadata(), (err, res) => {
          if (err) handleGrpcError(err);
          else {
            console.log(res.message);
            logClientEvent(`UpdateStock response: ${res.message}`);
          }
          showMenu();
        });
      });
    });
  } catch (error) {
    console.error("Failed to resolve service:", error.message);
    logClientEvent(`Failed to resolve StockTrackingService: ${error.message}`);
    showMenu();
  }
};

const bulkUpdateStock = async () => {
  try {
    const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
    logClientEvent("Started bulkUpdateStock stream");
    const call = client.BulkUpdateStock(getAuthMetadata(), (err, res) => {
      if (err) handleGrpcError(err);
      else {
        console.log(res.message);
        logClientEvent(`Bulk update completed: ${res.message}`);
      }
      showMenu();
    });

    const ask = () => {
      rl.question("Enter item ID (or 'done'): ", idInput => {
        if (idInput.toLowerCase() === 'done') {
          call.end();
          logClientEvent("Ended bulkUpdateStock stream");
          return;
        }

        const itemId = parseInt(idInput);
        if (isNaN(itemId)) {
          console.error("Invalid input: Item ID must be a number.");
          logClientEvent("Invalid item ID during bulk update");
          return ask();
        }

        rl.question("New quantity: ", qtyInput => {
          const qty = parseInt(qtyInput);
          if (isNaN(qty)) {
            console.error("Invalid input: Quantity must be a number.");
            logClientEvent("Invalid quantity during bulk update");
            return ask();
          }

          try {
            call.write({ item_id: itemId, new_quantity: qty });
            logClientEvent(`Streamed bulk item: ${itemId}, qty: ${qty}`);
          } catch (writeErr) {
            console.error("Streaming error:", writeErr.message);
            logClientEvent(`Error streaming bulk update: ${writeErr.message}`);
            call.end();
            showMenu();
            return;
          }

          ask();
        });
      });
    };

    ask();
  } catch (error) {
    console.error("Bulk update failed:", error.message);
    logClientEvent(`Failed to resolve StockTrackingService for bulk update: ${error.message}`);
    showMenu();
  }
};

// ===============================
// ROBOT SERVICE METHOD
// ===============================

const streamRobotStatus = async () => {
  try {
    const client = await getClient('InventoryRobotService', robotProto, 'InventoryRobotService');
    rl.question("Enter robot ID to track: ", input => {
      const robotId = parseInt(input);
      if (isNaN(robotId)) {
        console.error("Invalid input: Robot ID must be a number.");
        logClientEvent("Invalid input for robot tracking");
        return showMenu();
      }

      logClientEvent(`Started robot tracking for ID ${robotId}`);
      const call = client.GetRobotStatus({ robot_id: robotId }, getAuthMetadata());

      call.on('data', res => {
        console.log(`[Robot ${res.robot_id}] ${res.state} at ${res.current_location}`);
        logClientEvent(`Robot stream: ${JSON.stringify(res)}`);
      });

      call.on('end', () => {
        console.log("Robot status stream ended.");
        logClientEvent(`Robot stream ended`);
        showMenu();
      });
    });
  } catch (error) {
    console.error("Failed to stream robot status:", error.message);
    logClientEvent(`Failed to resolve InventoryRobotService: ${error.message}`);
    showMenu();
  }
};

// ===============================
// ORDER SERVICE METHODS
// ===============================

const placeOrder = async () => {
  try {
    const client = await getClient('OrderFulfillmentService', orderProto, 'OrderFulfillmentService');
    rl.question("Enter item ID: ", itemInput => {
      const itemId = parseInt(itemInput);
      if (isNaN(itemId)) {
        console.error("Invalid input: Item ID must be a number.");
        logClientEvent("Invalid item ID for order");
        return showMenu();
      }

      rl.question("Enter quantity: ", qtyInput => {
        const qty = parseInt(qtyInput);
        if (isNaN(qty)) {
          console.error("Invalid input: Quantity must be a number.");
          logClientEvent("Invalid quantity for order");
          return showMenu();
        }

        const order = { items: [{ item_id: itemId, quantity: qty }] };

        logClientEvent(`Placing order: ${JSON.stringify(order)}`);
        client.PlaceOrder(order, getAuthMetadata(), (err, res) => {
          if (err) handleGrpcError(err);
          else {
            console.log("Order placed:", res);
            logClientEvent(`Order placed successfully: ${JSON.stringify(res)}`);
          }
          showMenu();
        });
      });
    });
  } catch (error) {
    console.error("Failed to place order:", error.message);
    logClientEvent(`Failed to resolve OrderFulfillmentService: ${error.message}`);
    showMenu();
  }
};

const getOrderStatus = async () => {
  try {
    const client = await getClient('OrderFulfillmentService', orderProto, 'OrderFulfillmentService');
    rl.question("Enter order ID: ", input => {
      const orderId = parseInt(input);
      if (isNaN(orderId)) {
        console.error("Invalid input: Order ID must be a number.");
        logClientEvent("Invalid order ID for status check");
        return showMenu();
      }

      logClientEvent(`Checking status of order ${orderId}`);
      client.GetOrderStatus({ order_id: orderId }, getAuthMetadata(), (err, res) => {
        if (err) handleGrpcError(err);
        else {
          console.log("Order Info:", res);
          logClientEvent(`Order status received: ${JSON.stringify(res)}`);
        }
        showMenu();
      });
    });
  } catch (error) {
    console.error("Failed to get order status:", error.message);
    logClientEvent(`Failed to resolve OrderFulfillmentService: ${error.message}`);
    showMenu();
  }
};

// ===============================
// CHAT METHOD
// ===============================

const startChat = async () => {
  try {
    const client = await getClient('ChatService', chatProto, 'ChatService');
    const call = client.Chat(getAuthMetadata());
    logClientEvent("Started chat session");

    rl.on('line', input => {
      try {
        call.write({ user: "Client", message: input });
        logClientEvent(`Sent chat message: ${input}`);
      } catch (err) {
        console.error("Failed to send message:", err.message);
        logClientEvent(`Chat error: ${err.message}`);
      }
    });

    call.on('data', msg => {
      console.log(`[${msg.user}]: ${msg.message}`);
      logClientEvent(`Received chat message: ${msg.user}: ${msg.message}`);
    });

    call.on('end', () => {
      console.log("Chat ended.");
      logClientEvent("Chat session ended");
      showMenu();
    });
  } catch (error) {
    console.error("Failed to start chat:", error.message);
    logClientEvent(`Failed to resolve ChatService: ${error.message}`);
    showMenu();
  }
};

// ===============================
// CLI MENU
// ===============================

const showMenu = () => {
  console.log("\nSMART WAREHOUSE CLIENT");
  console.log("1. Get Stock Status");
  console.log("2. Update Stock");
  console.log("3. Bulk Update Stock");
  console.log("4. Track Robot Status");
  console.log("5. Place Order");
  console.log("6. Get Order Status");
  console.log("7. Start Chat");
  console.log("0. Exit");

  rl.question("Choose an option: ", async choice => {
    try {
      logClientEvent(`User selected menu option: ${choice}`);
      switch (choice.trim()) {
        case "1": await getStockStatus(); break;
        case "2": await updateStock(); break;
        case "3": await bulkUpdateStock(); break;
        case "4": await streamRobotStatus(); break;
        case "5": await placeOrder(); break;
        case "6": await getOrderStatus(); break;
        case "7": await startChat(); break;
        case "0":
          logClientEvent("User exited the application");
          rl.close();
          process.exit();
        default:
          console.error("Invalid option. Please choose between 0 and 7.");
          logClientEvent("Invalid menu selection");
          showMenu();
      }
    } catch (err) {
      console.error("Unexpected error:", err.message);
      logClientEvent(`Unexpected menu error: ${err.message}`);
      showMenu();
    }
  });
};

// Start the menu loop
logClientEvent("=== SMART WAREHOUSE CLIENT STARTED ===");
showMenu();
