const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const RPC_URL = "https://0x4e454228.rpc.aurora-cloud.dev"; // Omega RPC
const relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY);
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const relayerSigner = relayerWallet.connect(provider);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const GECKO_HEADERS = { Accept: 'application/json;version=20230302' };

// Alpha Vantage API proxy endpoints
const ALPHA_VANTAGE_API_KEY = 'Y4N6LC9U5OH8Q4MQ';
// Use existing fetch if present, otherwise require node-fetch
let fetch = global.fetch;
try {
  if (!fetch) {
    fetch = require('node-fetch');
  }
} catch (e) {
  // For Node 18+, fetch is global
}

app.post('/fund', async (req, res) => {
    const { address, amount } = req.body;
    if (!address || !ethers.utils.isAddress(address)) {
        return res.status(400).json({ error: 'Invalid address' });
    }
    const fundAmount = amount ? ethers.utils.parseEther(amount) : ethers.utils.parseEther('0.1'); // Default to 0.1 OMEGA
    try {
        const tx = await relayerSigner.sendTransaction({
            to: address,
            value: fundAmount
        });
        await tx.wait();
        console.log(`Funded ${address} with ${ethers.utils.formatEther(fundAmount)} OMEGA. Tx: ${tx.hash}`);
        res.json({ success: true, txHash: tx.hash });
    } catch (error) {
        console.error('Funding error:', error);
        res.status(500).json({ error: 'Funding failed', details: error.message });
    }
});

app.get('/status', async (req, res) => {
    try {
        const balance = await provider.getBalance(relayerWallet.address);
        res.json({
            relayerAddress: relayerWallet.address,
            balance: ethers.utils.formatEther(balance)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
    }
});

app.post('/ai', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Gemini API error', details: err.message });
  }
});

// DexScreener trending
app.get('/dex/trending', async (req, res) => {
  try {
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('DexScreener trending error:', err);
    res.status(500).json({ error: 'Failed to fetch trending tokens' });
  }
});

// DexScreener pair by chain and pairId
app.get('/dex/pair/:chainId/:pairId', async (req, res) => {
  try {
    const { chainId, pairId } = req.params;
    const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairId}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pair info' });
  }
});

// DexScreener pools
app.get('/dex/pools', async (req, res) => {
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/pools');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
});

// DexScreener search
app.get('/dex/search', async (req, res) => {
  try {
    const q = req.query.q;
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search token' });
  }
});

app.get('/dex/pools/:chainId/:tokenAddress', async (req, res) => {
  try {
    const { chainId, tokenAddress } = req.params;
    const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chainId}/${tokenAddress}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
});

app.get('/gecko/search', async (req, res) => {
  try {
    const q = req.query.q;
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/search/pairs?query=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json;version=20230302' } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search GeckoTerminal' });
  }
});

app.get('/gecko/networks', async (req, res) => {
  try {
    const page = req.query.page ? `?page=${req.query.page}` : '';
    const response = await fetch(`${GECKO_API}/networks${page}`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch networks' });
  }
});

app.get('/gecko/networks/:network/dexes', async (req, res) => {
  try {
    const { network } = req.params;
    const response = await fetch(`${GECKO_API}/networks/${network}/dexes`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dexes' });
  }
});

app.get('/gecko/networks/:network/pools', async (req, res) => {
  try {
    const { network } = req.params;
    const response = await fetch(`${GECKO_API}/networks/${network}/pools`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
});

app.get('/gecko/networks/:network/tokens/:address', async (req, res) => {
  try {
    const { network, address } = req.params;
    const response = await fetch(`${GECKO_API}/networks/${network}/tokens/${address}`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

app.get('/gecko/networks/:network/tokens/:token_address/pools', async (req, res) => {
  try {
    const { network, token_address } = req.params;
    const response = await fetch(`${GECKO_API}/networks/${network}/tokens/${token_address}/pools`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch token pools' });
  }
});

app.get('/gecko/networks/:network/pools/:pool_address/info', async (req, res) => {
  try {
    const { network, pool_address } = req.params;
    const response = await fetch(`${GECKO_API}/networks/${network}/pools/${pool_address}/info`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pool info' });
  }
});

app.get('/gecko/networks/:network/pools/:pool_address/ohlcv/:timeframe', async (req, res) => {
  try {
    const { network, pool_address, timeframe } = req.params;
    const response = await fetch(`${GECKO_API}/networks/${network}/pools/${pool_address}/ohlcv/${timeframe}`, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pool ohlcv' });
  }
});

app.get('/gecko/networks/:network/pools/:pool_address/trades', async (req, res) => {
  try {
    const { network, pool_address } = req.params;
    const params = new URLSearchParams(req.query).toString();
    const url = `${GECKO_API}/networks/${network}/pools/${pool_address}/trades${params ? '?' + params : ''}`;
    const response = await fetch(url, { headers: GECKO_HEADERS });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pool trades' });
  }
});

// Stock Quote
app.get('/stock/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data["Global Quote"]) {
      const q = data["Global Quote"];
      res.json({
        price: q["05. price"],
        change: q["09. change"],
        changePercent: q["10. change percent"],
        ...q
      });
    } else {
      res.status(404).json({ error: 'No quote found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

// Stock Search
app.get('/stock/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

// Stock Daily
app.get('/stock/daily/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

// Stock Overview
app.get('/stock/overview/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

// Alpha Vantage US Inflation endpoint
app.get('/stock/inflation', async (req, res) => {
  try {
    const url = `https://www.alphavantage.co/query?function=INFLATION&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

// Alpha Vantage US CPI endpoint
app.get('/stock/cpi', async (req, res) => {
  try {
    const url = `https://www.alphavantage.co/query?function=CPI&interval=monthly&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

// Alpha Vantage US Real GDP endpoint
app.get('/stock/gdp', async (req, res) => {
  try {
    const url = `https://www.alphavantage.co/query?function=REAL_GDP&interval=annual&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Alpha Vantage error', details: err.message });
  }
});

app.listen(PORT, () => {
    console.log(`Relayer faucet listening on port ${PORT}`);
    console.log(`Relayer address: ${relayerWallet.address}`);
}); 
