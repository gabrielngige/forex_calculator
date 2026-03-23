const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const mongoose = require('mongoose');
const webPush = require('web-push');
const { getMidMarketRate, calculateFeeTransparentTrade, generateHiddenFeeReport, simulateExchange, performKYC } = require('./OPP_Calculator');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/opp_calculator';

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  subscriptions: [{ type: Object }], // For push notifications
});
const User = mongoose.model('User', userSchema);

// Web Push setup
const vapidKeys = webPush.generateVAPIDKeys();
webPush.setVapidDetails('mailto:your-email@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Auth endpoints
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User registered' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ username, id: user._id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Push notification endpoints
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  try {
    const user = await User.findById(req.user.id);
    user.subscriptions.push(subscription);
    await user.save();
    res.json({ message: 'Subscribed to notifications' });
  } catch (error) {
    res.status(500).json({ error: 'Subscription failed' });
  }
});

app.post('/api/send-notification', authenticateToken, async (req, res) => {
  const { title, body } = req.body;
  try {
    const user = await User.findById(req.user.id);
    const promises = user.subscriptions.map(sub =>
      webPush.sendNotification(sub, JSON.stringify({ title, body }))
    );
    await Promise.all(promises);
    res.json({ message: 'Notification sent' });
  } catch (error) {
    res.status(500).json({ error: 'Notification failed' });
  }
});
app.get('/api/rate/:base/:quote', authenticateToken, async (req, res) => {
  try {
    const { base, quote } = req.params;
    const rate = await getMidMarketRate(base, quote);
    res.json({ rate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calculate-fee', authenticateToken, (req, res) => {
  try {
    const { amount, midRate, offeredRate, fixedFee } = req.body;
    const result = calculateFeeTransparentTrade(amount, midRate, offeredRate, fixedFee);
    const report = generateHiddenFeeReport(result);
    res.json({ result, report });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/simulate-exchange', authenticateToken, async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    const result = await simulateExchange(amount, fromCurrency, toCurrency);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/kyc', authenticateToken, (req, res) => {
  try {
    const user = req.body;
    const result = performKYC(user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});