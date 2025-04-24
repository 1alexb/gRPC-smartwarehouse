const express = require('express');
const router = express.Router();
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../../proto/stock.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const stockProto = grpc.loadPackageDefinition(packageDefinition).stock;

const stockClient = new stockProto.StockTrackingService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// Add API key for security
const getAuthMetadata = () => {
  const metadata = new grpc.Metadata();
  metadata.set('api-key', 'WAREHOUSE_SECRET');
  return metadata;
};

router.post('/bulk-update', (req, res) => {
  const { updates } = req.body; // Expecting updates to be an array of { item_id, new_quantity }

  const call = stockClient.BulkUpdateStock(getAuthMetadata(), (err, response) => {
    if (err) {
      console.error('Bulk update error:', err.details);
      return res.redirect('/?stockUpdateMessage=' + encodeURIComponent('Bulk update failed: ' + err.details));
    }
    return res.redirect('/?stockUpdateMessage=' + encodeURIComponent(response.message));
  });

  updates.forEach(update => {
    if (update.item_id && update.new_quantity) {
      call.write({
        item_id: parseInt(update.item_id),
        new_quantity: parseInt(update.new_quantity)
      });
    }
  });

  call.end();
});

module.exports = router;
