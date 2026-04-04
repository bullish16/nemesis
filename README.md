# 🏴 Nemesis.trade Testnet Bot v4

Bot otomatis untuk testnet [nemesis.trade](https://nemesis.trade) di jaringan **ETH Sepolia**.

## Apa yang dilakukan bot ini?

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Swap** | ETH → USDC (5x), ETH → DAI (5x), ETH → UNI (5x), ETH → Test2 (5x), ETH → Test3 (5x) |
| 2 | **Open Short** | ETH-USDC (5x), ETH-DAI (5x), ETH-UNI (5x), ETH-Test2 (5x) |
| 3 | **Open Long** | ETH-USDC (5x), ETH-DAI (5x), ETH-UNI (5x), ETH-Test3 (5x) |
| 4 | **Add Liquidity** | ETH-USDC (5x), ETH-DAI (5x), USDC-DAI (5x), ETH-Test2 (5x), ETH-Test3 (5x) |
| 5 | **Remove Liquidity** | UNI-WETH, WETH-DAI, USDC-DAI |
| 6 | **Close All Positions** | Tutup semua short & long positions |

**Total: ~90+ transaksi**

## Requirements

- **Node.js** v18+
- **Sepolia ETH** minimal ~0.04 ETH (untuk gas + operasi)
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

## Tokens

| Token | Address |
|-------|---------|
| USDC | `0x10279e63...E61464C` |
| DAI | `0xd67215fd...8871fcb` |
| UNI | `0x7438ea86...b046663` |
| Test2 | `0xbce723dc...f91d80c` |
| Test3 | `0x12a830ae...f7567c` |

## ⚠️ Catatan

- Ini untuk **TESTNET saja** — jangan gunakan di mainnet!
- Bot menggunakan slippage 100% (amountOutMin = 0) karena ini testnet
- Pastikan punya cukup Sepolia ETH sebelum menjalankan
