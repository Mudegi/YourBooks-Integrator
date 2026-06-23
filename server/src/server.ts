import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes';
import { handleYourBooksWebhook } from './webhooks';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 19092;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:19093';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

// Capture the raw body so the webhook handler can verify the HMAC signature over the
// exact bytes the ERP signed.
app.use(
  express.json({
    limit: '5mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString('utf8');
    },
  })
);

// ERP webhook receiver (server-to-server; signature-verified).
app.post('/webhooks/yourbooks', handleYourBooksWebhook);

// Client REST API.
app.use('/api/v1', router);

app.get('/', (_req, res) => {
  res.json({ message: 'YourBooks Integrator API online', port: PORT });
});

app.listen(PORT, () => {
  console.log(`YourBooks Integrator server listening on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/yourbooks`);
});
