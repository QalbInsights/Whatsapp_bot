
import express from 'express';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Keep-alive server running on port ${port}`);
});

export const keepAlive = () => {};
