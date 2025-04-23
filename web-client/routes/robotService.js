const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../../proto/robot.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);
const robotProto = grpc.loadPackageDefinition(packageDefinition).robot;

// Auth metadata
const getAuthMetadata = () => {
  const metadata = new grpc.Metadata();
  metadata.set('api-key', 'WAREHOUSE_SECRET');
  return metadata;
};

// Stream robot status (only first message for now)
function getLatestRobotStatus(robot_id = 1) {
  return new Promise((resolve, reject) => {
    const client = new robotProto.InventoryRobotService(
      'localhost:50052',
      grpc.credentials.createInsecure()
    );

    const call = client.GetRobotStatus({ robot_id }, getAuthMetadata());

    call.on('data', (data) => {
      resolve(data); // Take only the first status
      call.cancel(); // Cancel stream after first message
    });

    call.on('error', (err) => reject(err));
  });
}

module.exports = { getLatestRobotStatus };
