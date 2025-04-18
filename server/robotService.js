// Import core gRPC and path modules
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the .proto file for the robot service
const PROTO_PATH = path.join(__dirname, '../proto/robot.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const robotProto = grpc.loadPackageDefinition(packageDefinition).robot;

// Define a set of possible robot states for simulation
const robotStates = ["IDLE", "MOVING", "LOADING", "UNLOADING", "COMPLETED"];

// Server-streaming RPC implementation: streams robot status updates to the client
const getRobotStatus = (call) => {
  const robotId = call.request.robot_id; // Get the robot ID from the request
  let index = 0; // Start at the first status in the list

  // Send one robot status every second
  const interval = setInterval(() => {
    if (index >= robotStates.length) {
      // Stop streaming once all statuses have been sent
      clearInterval(interval);
      call.end(); // Ends the stream
      return;
    }

    // Send the current status and simulated location
    call.write({
      robot_id: robotId,
      state: robotStates[index],
      current_location: `Zone ${index + 1}`
    });

    index++; // Move to the next status
  }, 1000); // 1000ms = 1 second between updates
};

// Create a new gRPC server
const server = new grpc.Server();

// Register the InventoryRobotService with the gRPC server
server.addService(robotProto.InventoryRobotService.service, {
  GetRobotStatus: getRobotStatus
});

// Start the server on port 50052
server.bindAsync('127.0.0.1:50052', grpc.ServerCredentials.createInsecure(), () => {
  console.log('InventoryRobotService running on port 50052');
  server.start();
});
