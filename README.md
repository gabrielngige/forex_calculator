# OPP Forex Calculator

A comprehensive currency exchange application with real-time rates, volatility tracking, digital assets, and in-app transactions.

## Features

- **Real-Time Rates**: Fetches from Fixer.io, OANDA, CoinGecko with retry/backoff.
- **Fee Transparency**: Calculates hidden fees in spreads.
- **Volatility Alerts**: Monitors market swings and slippage.
- **Transaction Simulation**: Supports Airwallex, Currencycloud, Revolut providers.
- **KYC/AML Stubs**: Risk scoring and compliance checks.
- **Offline Mode**: Cached rates for 24-48 hours.
- **Web UI**: React-based interface.

## Setup

1. Install dependencies: `npm install`
2. Set environment variables:
   - `FIXER_API_KEY`
   - `OANDA_API_KEY`
   - `JWT_SECRET`
   - `MONGO_URI` (e.g., mongodb://localhost:27017/opp_calculator)
3. Start MongoDB locally or use cloud (e.g., MongoDB Atlas)
4. Run server: `npm start`
5. Open http://localhost:3000

## Database

- Uses MongoDB for persistent user storage.
- User model includes subscriptions for push notifications.

## Push Notifications

- Web: Uses web-push library with VAPID keys. Service worker handles notifications.
- Mobile: Integrate Firebase Cloud Messaging (FCM) in React Native app.
  - Install: `npm install @react-native-firebase/messaging`
  - Follow Firebase setup for RN.

## Mobile App

1. Cd to mobile: `cd mobile`
2. Install RN deps: `npm install`
3. For Android: `npm run android` (requires Android Studio)
4. For iOS: `npm run ios` (macOS only)
5. Update API_BASE in App.js to your server URL.
6. For push: Add Firebase config and handle messages in App.js.

## API Endpoints

- `POST /api/register` - Register user
- `POST /api/login` - Login, returns JWT
- `GET /api/rate/:base/:quote` - Get mid-market rate (auth required)
- `POST /api/calculate-fee` - Fee transparency calculation (auth)
- `POST /api/simulate-exchange` - Simulate transaction (auth)
- `POST /api/kyc` - KYC check (auth)

## Tests

Run `npm test` for Jest tests.

## Next Steps

- Integrate real liquidity providers
- Add user authentication
- Implement full KYC flow
- Deploy to cloud