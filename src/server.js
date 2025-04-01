import express from 'express';
import OAuthClient from 'intuit-oauth';
import nodeQuickbooks from 'node-quickbooks';
const QuickBooks = nodeQuickbooks;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Import AI tools and functions
import {
  getCompanyInfo, 
  listCustomers, 
  createCustomer, 
  findCustomerByName,
  listInvoices,
  findInvoiceById,
  findInvoicesByCustomer,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoiceEmail
} from "../ai-tools/aiTools.js";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public/index.html')));
app.use(express.static(path.join(__dirname, '../public/connected.html')));

// Token refresh middleware
app.use(async (req, res, next) => {
  if (qbTokens && qbTokens.access_token) {
    try {
      // Check if access token is expired or about to expire
      const expiryDate = new Date(qbTokens.expires_in);
      const now = new Date();
      const tokenExpired = now >= expiryDate;

      // If token is expired, refresh it
      if (tokenExpired) {
        console.log('Access token expired, refreshing...');
        const authResponse = await oauthClient.refreshUsingToken(qbTokens.refresh_token);
        qbTokens = authResponse.getJson();
        console.log('Tokens refreshed successfully');
      }
    } catch (error) {
      console.error('Error in token refresh middleware:', error);
      // Continue anyway, the API call will fail but we'll see the detailed error
    }
  }
  next();
});

// QuickBooks OAuth client
const oauthClient = new OAuthClient({
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  environment: process.env.QB_ENVIRONMENT,
  redirectUri: process.env.QB_REDIRECT_URI,
});

// Store tokens (in a real app, you would use a database)
let qbTokens = null;
let qbCompanyId = null;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Authorization request - redirect to Intuit authentication page
app.get('/auth', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: 'testState',
  });
  res.redirect(authUri);
});

// OAuth callback - handle the callback from Intuit
app.get('/callback', async (req, res) => {
  try {
    // Extract the realmId from the query parameters
    const realmId = req.query.realmId;

    // Create the OAuth token
    const authResponse = await oauthClient.createToken(req.url);
    qbTokens = authResponse.getJson();

    // Set the company ID from the query parameter, not from the token
    qbCompanyId = realmId;

    // Store tokens (in a real app, save to database)
    console.log('Tokens acquired:', JSON.stringify(qbTokens, null, 2));
    console.log('Company ID:', qbCompanyId);

    res.redirect('/connected');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Connected page - after successful authentication
app.get('/connected', (req, res) => {
  if (!qbTokens) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../public/connected.html'));
});

// API endpoint to get company info
app.get('/api/company', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Making API call to get company info. Tokens:', {
    access_token_exists: !!qbTokens.access_token,
    token_expires: qbTokens.expires_in ? new Date(qbTokens.expires_in).toISOString() : 'unknown',
    company_id: qbCompanyId
  });

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false, // no OAuth 1.0
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox', // sandbox = true, production = false
    true, // debug
    null, // minor version
    '2.0', // OAuth version
    qbTokens.refresh_token
  );

  qbo.getCompanyInfo(qbCompanyId, (err, companyInfo) => {
    if (err) {
      console.error('Error getting company info:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get company information',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!companyInfo) {
      return res.json({
        message: 'No company information found',
        data: {}
      });
    }

    res.json(companyInfo);
  });
});

// API endpoint to get customers
app.get('/api/customers', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Making API call to get customers. Company ID:', qbCompanyId);

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.findCustomers({}, (err, customers) => {
    if (err) {
      console.error('Error getting customers:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get customers',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!customers || (customers.QueryResponse && customers.QueryResponse.Customer && customers.QueryResponse.Customer.length === 0)) {
      return res.json({
        message: 'No customers found in your QuickBooks account',
        data: customers || { QueryResponse: { Customer: [] } }
      });
    }

    res.json(customers);
  });
});

// --------------------------------
// Invoice API Endpoints
// --------------------------------

// Get all invoices
app.get('/api/invoices', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Making API call to get invoices. Company ID:', qbCompanyId);

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.findInvoices({}, (err, invoices) => {
    if (err) {
      console.error('Error getting invoices:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get invoices',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!invoices || (invoices.QueryResponse && invoices.QueryResponse.Invoice && invoices.QueryResponse.Invoice.length === 0)) {
      return res.json({
        message: 'No invoices found in your QuickBooks account',
        data: invoices || { QueryResponse: { Invoice: [] } }
      });
    }

    res.json(invoices);
  });
});

// Get invoice by ID
app.get('/api/invoices/:id', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.getInvoice(req.params.id, (err, invoice) => {
    if (err) {
      console.error('Error getting invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get invoice',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!invoice) {
      return res.status(404).json({
        error: `No invoice found with ID: ${req.params.id}`
      });
    }

    res.json(invoice);
  });
});

// Create invoice
app.post('/api/invoices', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Creating invoice with data:', JSON.stringify(req.body, null, 2));

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.createInvoice(req.body, (err, invoice) => {
    if (err) {
      console.error('Error creating invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to create invoice',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    console.log('Invoice created successfully:', JSON.stringify(invoice, null, 2));
    res.json(invoice);
  });
});

// Update invoice
app.put('/api/invoices/:id', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Updating invoice with data:', JSON.stringify(req.body, null, 2));

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.updateInvoice(req.body, (err, invoice) => {
    if (err) {
      console.error('Error updating invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to update invoice',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    console.log('Invoice updated successfully:', JSON.stringify(invoice, null, 2));
    res.json(invoice);
  });
});

// Delete/void invoice
app.delete('/api/invoices/:id', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  // First get the invoice to get its sync token
  qbo.getInvoice(req.params.id, (err, invoice) => {
    if (err) {
      console.error('Error getting invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get invoice',
        details: err.message || 'Unknown error'
      });
    }

    if (!invoice) {
      return res.status(404).json({
        error: `No invoice found with ID: ${req.params.id}`
      });
    }

    // Now void the invoice
    const voidData = {
      ...invoice,
      Id: req.params.id,
      SyncToken: invoice.SyncToken,
      void: true
    };

    qbo.updateInvoice(voidData, (err, result) => {
      if (err) {
        console.error('Error voiding invoice:', JSON.stringify(err, null, 2));
        return res.status(500).json({
          error: 'Failed to void invoice',
          details: err.message || 'Unknown error'
        });
      }

      res.json({ message: `Invoice ${req.params.id} has been voided successfully` });
    });
  });
});

// Send invoice via email
app.post('/api/invoices/:id/send', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  const emailAddress = req.body.email;
  qbo.sendInvoicePdf(req.params.id, emailAddress, (err, response) => {
    if (err) {
      console.error('Error sending invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to send invoice',
        details: err.message || 'Unknown error'
      });
    }

    res.json({ message: `Invoice ${req.params.id} has been sent successfully` });
  });
});

// --------------------------------
// Customer API Endpoints
// --------------------------------

// Example endpoint to create a customer
app.post('/api/customers', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Creating customer with data:', JSON.stringify(req.body, null, 2));

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.createCustomer(req.body, (err, customer) => {
    if (err) {
      console.error('Error creating customer:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to create customer',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    console.log('Customer created successfully:', JSON.stringify(customer, null, 2));
    res.json(customer);
  });
});

// --------------------------------
// New AI Chat Endpoint
// --------------------------------

// Initialize AI providers
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-openai-api-key-here",
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here",
});

// Store conversation history (in a real app, you would use a database)
const conversationHistory = {};

app.post("/api/ai-chat", async (req, res) => {
  try {
    const { message, provider: requestedProvider = 'openai', model = '' } = req.body;
    const sessionId = req.headers['session-id'] || 'default-session';

    // Initialize conversation history for this session if it doesn't exist
    if (!conversationHistory[sessionId]) {
      conversationHistory[sessionId] = [
        {
          role: "system",
          content: `You are a QuickBooks data assistant that helps users interact with their accounting data directly.

CRITICAL INSTRUCTIONS:
1. ALWAYS use the appropriate tools to access QuickBooks data - NEVER claim to have direct access.
2. When responding to users, provide DIRECT answers:
   - For requests like "list all customers" - call the tool and show the data immediately.
   - DO NOT use phrases like "I'll retrieve", "I'll use", "Certainly!", "Let me", or "Here's the function". 
   - Instead, call the tool and IMMEDIATELY display the data with NO introduction.
   - Start your response with the actual data or confirmation, not with explanations of what you're doing.

EXAMPLES:

User: "list all customers"
[BAD RESPONSE] "Certainly! I'll retrieve the list of customers for you."
[GOOD RESPONSE] "Here are your customers:
1. Acme Corporation (acme@example.com)
2. Sunshine Bakery (info@sunshine.com)"

User: "show company information"
[BAD RESPONSE] "I'll get the company information for you."  
[GOOD RESPONSE] "Your company: Acme Inc.
Address: 123 Main St, Springfield
Phone: (555) 123-4567"

User: "create invoice for John Smith"
[BAD RESPONSE] "I'll create that invoice for you right away."
[GOOD RESPONSE] "Invoice #1001 created for John Smith. Total: $150.00. Due date: 2025-05-15."

Remember to always call the appropriate tool and present the results directly without commentary about what you're doing or going to do.`
        }
      ];
    }

    // Add user message to history
    conversationHistory[sessionId].push({ role: "user", content: message });

    // Determine which provider to use
    let provider;
    let modelId;
    let providerOptions = {};

    if (requestedProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here') {
      // Use Anthropic Claude
      provider = anthropic;

      // Default to Claude 3.5 Sonnet if no specific model requested
      modelId = model || 'claude-3-5-sonnet-20240620';

      // Add options for Claude 3.5 Sonnet
      providerOptions = {
        anthropic: {
          // Add cache control for better performance
          cacheControl: { type: 'ephemeral' }
        }
      };

      console.log(`Using Anthropic Claude model: ${modelId}`);
    } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
      // Use OpenAI
      provider = openai;

      // Default to GPT-4 if no specific model requested
      modelId = model || 'gpt-4';

      console.log(`Using OpenAI model: ${modelId}`);
    } else {
      // If no API keys are configured, return a placeholder response
      const placeholderResponse = `You said: "${message}". I'm a simple echo bot for now. The AI integration will be implemented in a future update.`;
      conversationHistory[sessionId].push({ role: "assistant", content: placeholderResponse });
      return res.json({ response: placeholderResponse });
    }

    // Generate AI response with conversation history
    const { text, toolCalls } = await generateText({
      model: provider(modelId),
      messages: conversationHistory[sessionId],
      tools: [
        // Company tools
        getCompanyInfo,
        // Customer tools
        listCustomers,
        createCustomer,
        findCustomerByName,
        // Invoice tools
        listInvoices,
        findInvoiceById,
        findInvoicesByCustomer,
        createInvoice,
        updateInvoice,
        deleteInvoice,
        sendInvoiceEmail
      ],
      providerOptions,
    });

    console.log("AI generated response text:", text);
    console.log("Tool calls:", toolCalls ? `${toolCalls.length} tool calls` : "none");
    if (toolCalls && toolCalls.length > 0) {
      console.log(`Last tool called: ${toolCalls[toolCalls.length - 1].name}`);
      // Dump the full tool call for debugging
      console.log("Last tool call details:", JSON.stringify(toolCalls[toolCalls.length - 1], null, 2));
    }

    // Process tool calls if any
    let finalResponse = text;
    if (toolCalls && toolCalls.length > 0) {
      // Format the tool results into a more conversational response
      const lastToolCall = toolCalls[toolCalls.length - 1];
      
      // Debug the lastToolCall object
      console.log("Processing tool call:", lastToolCall.name || lastToolCall.toolName || "unnamed tool");
      
      // Check for unwanted phrases in AI response
      const unwantedPhrases = [
        "I'll retrieve", 
        "I will retrieve",
        "I'll use", 
        "I will use", 
        "Here's the function", 
        "I'll get",
        "I will get",
        "Let me get",
        "Let me list",
        "Let me show",
        "I'll show",
        "Here is",
        "To list all customers",
        "To list all invoices",
        "Certainly!"
      ];
      
      const containsUnwantedPhrase = unwantedPhrases.some(phrase => 
        finalResponse && finalResponse.toLowerCase().includes(phrase.toLowerCase())
      );
      
      if (containsUnwantedPhrase) {
        console.log("Found unwanted phrase in AI response, will override with direct data response");
      }
      
      // Special handling for customer list request - direct access to tool result
      if (lastToolCall.toolName === "1" || (lastToolCall.name && lastToolCall.name.includes("listCustomers"))) {
        // This is a customer list request
        console.log("Detected customer list request");
        
        try {
          // Get the raw result
          const rawResult = lastToolCall.result;
          console.log("Raw tool result keys:", Object.keys(rawResult));
          
          // Extract customers using multiple approaches
          let customers = null;
          
          // Method 1: Try QueryResponse.Customer direct access
          if (rawResult.QueryResponse && Array.isArray(rawResult.QueryResponse.Customer)) {
            customers = rawResult.QueryResponse.Customer;
            console.log(`Found ${customers.length} customers using QueryResponse.Customer direct access`);
          }
          // Method 2: Try data array access
          else if (rawResult.data && Array.isArray(rawResult.data)) {
            customers = rawResult.data;
            console.log(`Found ${customers.length} customers using data array access`);
          }
          // Method 3: If rawResult itself is an array
          else if (Array.isArray(rawResult)) {
            customers = rawResult;
            console.log(`Found ${customers.length} customers from direct array result`);
          }
          // Method 4: Check for full response object with time property (QuickBooks API format)
          else if (rawResult.QueryResponse && rawResult.time) {
            customers = rawResult.QueryResponse.Customer || [];
            console.log(`Found ${customers.length} customers using full QB API response format`);
          }
          
          // Generate response based on customers
          if (customers && customers.length > 0) {
            // Format customer list
            finalResponse = `Here are your customers:\n\n${customers.map((c, i) => {
              const email = c.PrimaryEmailAddr ? ` (${c.PrimaryEmailAddr.Address})` : '';
              const phone = c.PrimaryPhone ? ` - ${c.PrimaryPhone.FreeFormNumber}` : '';
              return `${i+1}. ${c.DisplayName}${email}${phone}`;
            }).join('\n')}`;
            console.log("Successfully formatted customer list");
          } else if (customers && customers.length === 0) {
            finalResponse = "You don't have any customers in your QuickBooks account yet.";
            console.log("No customers found");
          } else {
            // Fallback - dump raw result for debugging
            console.log("WARNING: Could not extract customers from tool result");
            console.log("Raw result:", JSON.stringify(rawResult).substring(0, 500) + "...");
            finalResponse = "I tried to retrieve your customer list but couldn't format the data properly.";
          }
        } catch (error) {
          console.error("Error processing customer list:", error);
          finalResponse = "I encountered an error while processing your customer list.";
        }
      } 
      // Process other tool calls using the existing approach
      else if (lastToolCall.result) {
        // If the AI already provided a response, keep it only if it doesn't contain unwanted phrases
        if (finalResponse && finalResponse.trim() !== '' && !containsUnwantedPhrase) {
          // The text response already contains a suitable response
          console.log("Using AI's formatted response:", finalResponse);
        } else {
          // Format the tool result into a readable response
          try {
            const result = lastToolCall.result;
            
            // Log the structure of the result object
            console.log("Tool result structure:", JSON.stringify({
              hasData: !!result.data,
              hasQueryResponse: !!result.QueryResponse,
              hasCustomers: result.QueryResponse ? !!result.QueryResponse.Customer : false,
              customerCount: result.QueryResponse && result.QueryResponse.Customer ? result.QueryResponse.Customer.length : 0,
              resultKeys: Object.keys(result)
            }, null, 2));
            
            // Map toolIndex to toolName - Claude sometimes returns tool index instead of name
            // In our array of tools passed to generateText, listCustomers is at index 1
            const toolMap = {
              "0": "getCompanyInfo",
              "1": "listCustomers",
              "2": "createCustomer", 
              "3": "findCustomerByName",
              "4": "listInvoices",
              "5": "findInvoiceById",
              "6": "findInvoicesByCustomer",
              "7": "createInvoice",
              "8": "updateInvoice",
              "9": "deleteInvoice",
              "10": "sendInvoiceEmail"
            };
            
            // Check for the tool type - support multiple ways to identify the tool
            const toolIndex = lastToolCall.toolName;
            const toolName = toolMap[toolIndex] || 
                           lastToolCall.name || 
                           (lastToolCall.type === 'function' && lastToolCall.function && lastToolCall.function.name) ||
                           "unknown";
            
            console.log("Identified tool name:", toolName, "from index:", toolIndex);
            
            // Handle different tool types for better formatting
            if ((toolName === 'listInvoices' || toolName.includes('listInvoices'))) {
                let invoices = [];
                
                // Try different ways to access invoices
                if (result.QueryResponse && result.QueryResponse.Invoice) {
                    invoices = result.QueryResponse.Invoice;
                } else if (result.data) {
                    invoices = result.data;
                }
                
                if (invoices.length === 0) {
                    finalResponse = "You don't have any invoices in your QuickBooks account yet.";
                } else {
                    finalResponse = `Here are your invoices:\n\n${invoices.map((inv, i) => 
                      `${i+1}. Invoice #${inv.DocNumber || inv.Id} - ${inv.CustomerRef.name} - $${inv.TotalAmt} (${inv.Balance > 0 ? 'Unpaid' : 'Paid'})`
                    ).join('\n')}`;
                }
            } else if (result.error) {
              // Handle errors gracefully
              finalResponse = `I encountered an issue: ${result.error}`;
            } else if (result.data) {
              // Generic data handler for other tools
              finalResponse = `Here's what I found: ${JSON.stringify(result.data, null, 2)}`;
            } else {
              // Fallback if no structured format is detected
              finalResponse = `Result: ${JSON.stringify(result, null, 2)}`;
            }
          } catch (error) {
            console.error("Error formatting tool result:", error);
            finalResponse = "I found some information but had trouble formatting it for display.";
          }
        }
      }
    }
    
    // Add AI response to history
    conversationHistory[sessionId].push({ role: "assistant", content: finalResponse });

    // Limit history size to prevent it from growing too large
    if (conversationHistory[sessionId].length > 20) {
      // Keep system message and last 19 messages
      conversationHistory[sessionId] = [
        conversationHistory[sessionId][0],
        ...conversationHistory[sessionId].slice(-19)
      ];
    }

    // Prepare response with additional metadata
    const response = {
      response: finalResponse,
      provider: requestedProvider,
      model: modelId
    };

    // Add provider metadata if available
    if (providerOptions) {
      response.providerMetadata = providerOptions;
    }

    // Return the AI response with metadata
    res.json(response);
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`QuickBooks OAuth redirect URI: ${process.env.QB_REDIRECT_URI}`);
  console.log(`OpenAI API Key configured: ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here' ? 'Yes' : 'No'}`);
  console.log(`Anthropic API Key configured: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here' ? 'Yes' : 'No'}`);
  console.log(`Default AI provider: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here' ? 'Anthropic Claude' : 'OpenAI'}`);
});
