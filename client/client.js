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

// Create the DiscoveryService client (fixed port)
const discoveryClient = new discoveryProto.DiscoveryService('localhost:50054', grpc.credentials.createInsecure());

// Setup CLI input/output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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
  const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
  rl.question("Enter item ID: ", id => {
    client.GetStockStatus({ item_id: parseInt(id) }, (err, res) => {
      if (err) console.error("Error:", err.details);
      else console.log("Stock Info:", res);
      showMenu();
    });
  });
};

const updateStock = async () => {
  const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
  rl.question("Item ID: ", id => {
    rl.question("New Quantity: ", qty => {
      client.UpdateStock({ item_id: parseInt(id), new_quantity: parseInt(qty) }, (err, res) => {
        if (err) console.error("Error:", err.details);
        else console.log(res.message);
        showMenu();
      });
    });
  });
};

const bulkUpdateStock = async () => {
  const client = await getClient('StockTrackingService', stockProto, 'StockTrackingService');
  const call = client.BulkUpdateStock((err, res) => {
    if (err) console.error("Error:", err.details);
    else console.log(res.message);
    showMenu();
  });

  const ask = () => {
    rl.question("Enter item ID (or 'done'): ", id => {
      if (id.toLowerCase() === 'done') {
        call.end();
      } else {
        rl.question("New quantity: ", qty => {
          call.write({ item_id: parseInt(id), new_quantity: parseInt(qty) });
          ask();
        });
      }
    });
  };

  ask();
};

// ===============================
// ROBOT SERVICE METHOD
// ===============================

const streamRobotStatus = async () => {
  const client = await getClient('InventoryRobotService', robotProto, 'InventoryRobotService');
  rl.question("Enter robot ID to track: ", id => {
    const call = client.GetRobotStatus({ robot_id: parseInt(id) });

    call.on('data', res => {
      console.log(`[Robot ${res.robot_id}] ${res.state} at ${res.current_location}`);
    });

    call.on('end', () => {
      console.log("Robot status stream ended.");
      showMenu();
    });
  });
};

// ===============================
// ORDER SERVICE METHODS
// ===============================

const placeOrder = async () => {
  const client = await getClient('OrderFulfillmentService', orderProto, 'OrderFulfillmentService');
  rl.question("Enter item ID: ", itemId => {
    rl.question("Enter quantity: ", qty => {
      const order = {
        items: [{ item_id: parseInt(itemId), quantity: parseInt(qty) }]
      };
      client.PlaceOrder(order, (err, res) => {
        if (err) console.error("Error:", err.details);
        else console.log("Order placed:", res);
        showMenu();
      });
    });
  });
};

const getOrderStatus = async () => {
  const client = await getClient('OrderFulfillmentService', orderProto, 'OrderFulfillmentService');
  rl.question("Enter order ID: ", id => {
    client.GetOrderStatus({ order_id: parseInt(id) }, (err, res) => {
      if (err) console.error("Error:", err.details);
      else console.log("Order Info:", res);
      showMenu();
    });
  });
};

// ===============================
// CHAT METHOD
// ===============================

const startChat = async () => {
  const client = await getClient('OrderFulfillmentService', orderProto, 'OrderFulfillmentService');
  const call = client.Chat();

  rl.on('line', input => {
    call.write({ user: "Client", message: input });
  });

  call.on('data', msg => {
    console.log(`[${msg.user}]: ${msg.message}`);
  });

  call.on('end', () => {
    console.log("Chat ended.");
    showMenu();
  });
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
    switch (choice) {
      case "1": await getStockStatus(); break;
      case "2": await updateStock(); break;
      case "3": await bulkUpdateStock(); break;
      case "4": await streamRobotStatus(); break;
      case "5": await placeOrder(); break;
      case "6": await getOrderStatus(); break;
      case "7": await startChat(); break;
      case "0": default: rl.close(); process.exit();
    }
  });
};

// Start the menu loop
showMenu();

// === DIRECT TEST FOR GetStockStatus (NO DISCOVERY) ===
// Run this block ONCE to verify service is reachable directly

/* const stockClient = new stockProto.StockTrackingService('localhost:50051', grpc.credentials.createInsecure());

stockClient.GetStockStatus({ item_id: 1 }, (err, res) => {
  if (err) {
    console.error("Direct call error:", err.details);
  } else {
    console.log("Direct call result:", res);
  }
}); */
