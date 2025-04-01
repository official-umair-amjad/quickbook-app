# QuickBooks Online Sandbox Integration

This application demonstrates how to integrate with QuickBooks Online Sandbox API.

## Setup Instructions

1. Create a [QuickBooks Developer Account](https://developer.intuit.com/)
2. Create a new app in the Developer Dashboard
3. Configure your app to use the Sandbox environment
4. Get your Client ID and Client Secret from the app's keys tab
5. Copy `.env.example` to `.env` and add your credentials:
   ```
   QB_CLIENT_ID=your_client_id
   QB_CLIENT_SECRET=your_client_secret
   QB_ENVIRONMENT=sandbox
   QB_REDIRECT_URI=http://localhost:3000/callback
   ```

## Running the Application

1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Navigate to `http://localhost:3000` in your browser
4. Click "Connect to QuickBooks" to authorize the application
5. Use the application features to interact with your QuickBooks Sandbox account

## Available Features

- OAuth 2.0 Authentication with QuickBooks
- View company information
- List customers
- List invoices
- Create new customers
- Create new invoices

## Development

This application uses:
- Express.js for the web server
- intuit-oauth for OAuth authentication
- node-quickbooks for API interactions 