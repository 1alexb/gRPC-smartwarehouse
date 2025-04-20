const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const readline = require('readline');
const path = require('path');

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
}

// Dynamically resolve the address of a service and return a ready gRPC client
const getClient = (serviceName, proto, serviceKey) => {
  return new Promise((resolve, reject) => {
    discoveryClient.DiscoverService({ serviceName }, (err, res) => {
      if (err || !res.address) {
        console.log(`Could not resolve ${serviceName}`);
        reject(err);
      } else {
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
        return showMenu();
      }

      client.GetStockStatus({ item_id: itemId }, (err, res) => {
        if (err) handleGrpcError(err);
        else console.log("Stock Info:", res);
        showMenu();
      });
    });
  } catch (error) {
    console.error("Failed to resolve service:", error.message);
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
        return showMenu();
      }

      rl.question("New Quantity: ", qtyInput => {
        const qty = parseInt(qtyInput);
        if (isNaN(qty)) {
          console.error("Invalid input: Quantity must be a number.");
          return showMenu();
        }

        client.UpdateStock({ item_id: itemId, new_quantity: qty }, (err, res) => {
          if (err) handleGrpcError(err);
          else console.log(res.message);
          showMenu();
        });
      });
    });
  } catch (error) {
    console.error("Failed to resolve service:", error.message);
    showMenu();
  }
};

const bulkUpdateStock = async () => {
  try {
    const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
    const call = client.BulkUpdateStock((err, res) => {
      if (err) handleGrpcError(err);
      else console.log(res.message);
      showMenu();
    });

    const ask = () => {
      rl.question("Enter item ID (or 'done'): ", idInput => {
        if (idInput.toLowerCase() === 'done') {
          call.end();
          return;
        }

        const itemId = parseInt(idInput);
        if (isNaN(itemId)) {
          console.error("Invalid input: Item ID must be a number.");
          return ask();
        }

        rl.question("New quantity: ", qtyInput => {
          const qty = parseInt(qtyInput);
          if (isNaN(qty)) {
            console.error("Invalid input: Quantity must be a number.");
            return ask();
          }

          try {
            call.write({ item_id: itemId, new_quantity: qty }); // Stream write wrapped
          } catch (writeErr) {
            console.error("Streaming error:", writeErr.message);
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
        return showMenu();
      }

      const call = client.GetRobotStatus({ robot_id: robotId });

      call.on('data', res => {
        console.log(`[Robot ${res.robot_id}] ${res.state} at ${res.current_location}`);
      });

      call.on('end', () => {
        console.log("Robot status stream ended.");
        showMenu();
      });
    });
  } catch (error) {
    console.error("Failed to stream robot status:", error.message);
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
        return showMenu();
      }

      rl.question("Enter quantity: ", qtyInput => {
        const qty = parseInt(qtyInput);
        if (isNaN(qty)) {
          console.error("Invalid input: Quantity must be a number.");
          return showMenu();
        }

        const order = { items: [{ item_id: itemId, quantity: qty }] };

        client.PlaceOrder(order, (err, res) => {
          if (err) handleGrpcError(err);
          else console.log("Order placed:", res);
          showMenu();
        });
      });
    });
  } catch (error) {
    console.error("Failed to place order:", error.message);
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
        return showMenu();
      }

      client.GetOrderStatus({ order_id: orderId }, (err, res) => {
        if (err) handleGrpcError(err);
        else console.log("Order Info:", res);
        showMenu();
      });
    });
  } catch (error) {
    console.error("Failed to get order status:", error.message);
    showMenu();
  }
};

// ===============================
// CHAT METHOD
// ===============================

const startChat = async () => {
  try {
    const client = await getClient('ChatService', chatProto, 'ChatService');
    const call = client.Chat();

    rl.on('line', input => {
      try {
        call.write({ user: "Client", message: input });
      } catch (err) {
        console.error("Failed to send message:", err.message);
      }
    });

    call.on('data', msg => {
      console.log(`[${msg.user}]: ${msg.message}`);
    });

    call.on('end', () => {
      console.log("Chat ended.");
      showMenu();
    });
  } catch (error) {
    console.error("Failed to start chat:", error.message);
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
      switch (choice.trim()) {
        case "1":
          await getStockStatus();
          break;
        case "2":
          await updateStock();
          break;
        case "3":
          await bulkUpdateStock();
          break;
        case "4":
          await streamRobotStatus();
          break;
        case "5":
          await placeOrder();
          break;
        case "6":
          await getOrderStatus();
          break;
        case "7":
          await startChat();
          break;
        case "0":
          rl.close();
          process.exit();
          break;
        default:
          console.error("Invalid option. Please choose between 0 and 7.");
          showMenu();
      }
    } catch (err) {
      // Catch unexpected exceptions during user input handling
      console.error("Unexpected error while processing your selection:", err.message);
      showMenu();
    }
  });
};

// Start the menu loop
showMenu();
