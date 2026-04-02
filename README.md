# 🏴 Nemesis.trade Testnet Bot

Bot otomatis untuk testnet [nemesis.trade](https://nemesis.trade) di jaringan **ETH Sepolia**.

## Apa yang dilakukan bot ini?

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Swap** | 0.0002 ETH → USDC (5x), ETH → DAI (5x), ETH → UNI (5x) |
| 2 | **Open Short** | 0.0002 ETH collateral: ETH-USDC (5x), ETH-DAI (5x), ETH-UNI (5x) |
| 3 | **Add Liquidity** | 0.0002 ETH: ETH-USDC (5x), ETH-DAI (5x) + $10 USDC-DAI (5x) |
| 4 | **Close All Positions** | Tutup semua short positions yang terbuka |

**Total: 60 transaksi** (15 swap + 15 short + 15 add liq + close positions)

## Requirements

- **Node.js** v18+
- **Sepolia ETH** minimal ~0.02 ETH (untuk gas + operasi)
- **Private key** wallet kamu

## Setup

```bash
cd nemesis-bot
npm install

# Copy dan isi .env
cp .env.example .env
nano .env   # masukkan PRIVATE_KEY kamu
```

## Jalankan

```bash
node bot.js
```

## Dapatkan Sepolia ETH

- https://www.alchemy.com/faucets/ethereum-sepolia
- https://cloud.google.com/application/web3/faucet/ethereum/sepolia
- https://sepolia-faucet.pk910.de/ (PoW faucet)

## Contracts yang digunakan

| Contract | Address |
|----------|---------|
| Router | `0xa1f78bed...cace4a8` |
| Factory | `0xbf301098...9653ae50` |
| WETH | `0x7b79995e...098E7f9` |
| USDC | `0x10279e63...E61464C` |
| DAI | `0xd67215fd...8871fcb` |
| UNI | `0x7438ea86...b046663` |

## ⚠️ Catatan

- Ini untuk **TESTNET saja** — jangan gunakan di mainnet!
- Bot menggunakan slippage 100% (amountOutMin = 0) karena ini testnet
- Pastikan punya cukup Sepolia ETH sebelum menjalankan
