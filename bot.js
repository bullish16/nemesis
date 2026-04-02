import { ethers } from "ethers";
import "dotenv/config";

// ═══════════════════════════════════════════════════════════
// NEMESIS.TRADE TESTNET BOT — ETH Sepolia
// Swap, Open Short, Add Liquidity, Close All Positions
// ═══════════════════════════════════════════════════════════

const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("❌ Set PRIVATE_KEY in .env file");
  process.exit(1);
}

// ── Contracts ──
const ROUTER = "0xa1f78bed1a79b9aec972e373e0e7f63d8cace4a8";
const FACTORY = "0xbf301098692a47cf6861877e9acef55c9653ae50";
const WETH = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";

// ── Tokens ──
const USDC = "0x10279e6333f9d0ee103f4715b8aaea75be61464c";
const DAI = "0xd67215fd6c0890493f34af3c5e4231ce98871fcb";
const UNI = "0x7438ea86a89b7d53af5264fb3abae1172b046663";

// ── Pool Addresses ──
const POOLS = {
  "USDC-WETH": "0x42f052f625e28c802f04978909ece3f9d6e5e3a1",
  "WETH-DAI": "0x0b6a0a69b7040b2281730cbae6060b3b1b2ed3a9",
  "UNI-WETH": "0x84605fffe96a1961a144e695247029eb3a60c316",
  "USDC-DAI": "0x337c9fecf78aad05f6ab742609bede3a4f3483cf",
};

// ── Vault Addresses (for liquidity) ──
const VAULTS = {
  "USDC-WETH": "0x93310a56147b1ea7486ab84f8d850fd0a216429b",
  "WETH-DAI": "0xf467ec26cf1911a0ff87e3a6d36b3aec915506a9",
  "UNI-WETH": "0xaf93c5b321757ca9f37992525c4889bceef76726",
  "USDC-DAI": "0x6c1581bd9eddec33c8e30e9f1c3d82def2716154",
};

// ── Subgraph ──
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmma0sxdrnwdx01ym126h3z8q/subgraphs/nemesis-eth-sepolia/prod/gn";

// ── ABIs ──
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB, uint liquidity)",
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB) view returns (address)",
  "function getManager(address pool) view returns (address)",
];

// Pool/NLP/Manager ABI (shared across pool and manager contracts)
const POOL_ABI = [
  "function openPosition(bool isLong, address collateralToken, uint256 collateralAmount, uint256 borrowAmount, uint256 leverageX10, uint256 amountOutMin, uint256 deadline) returns (uint256)",
  "function closePosition(uint256 positionId, uint256 amountOutMin, uint256 deadline)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function getPosition(uint256 positionId) view returns (tuple(bool isLong, address collateralToken, uint256 collateralAmount, uint256 borrowAmount, uint256 leverageX10))",
  "function swapFeeBps() view returns (uint256)",
  "function depositWithLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address receiver, uint256 deadline) returns (uint256 shares)",
  "function withdrawWithLiquidity(uint256 shares, address tokenA, address tokenB, uint256 amountAMin, uint256 amountBMin, address receiver, address owner, uint256 deadline)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint wad)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// ── Globals ──
let provider, wallet, router, factory;

// ── Helpers ──
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ETH = (n) => ethers.parseEther(n.toString());
const fmtETH = (n) => ethers.formatEther(n);
const MAX_UINT = ethers.MaxUint256;

async function waitTx(tx, label) {
  console.log(`   ⏳ ${label} — tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `   ✅ ${label} — confirmed block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`
  );
  return receipt;
}

async function ensureApproval(tokenAddr, spender, amount, label) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const current = await token.allowance(wallet.address, spender);
  if (current >= amount) return;
  console.log(`   🔓 Approving ${label}...`);
  const tx = await token.approve(spender, MAX_UINT);
  await waitTx(tx, `Approve ${label}`);
}

// ═══════════════════════════════════════════
// STEP 1: SWAP ETH → Tokens (via Router)
// ═══════════════════════════════════════════
async function swapETHForToken(tokenAddr, tokenSymbol, amountETH, repeat) {
  console.log(
    `\n🔄 SWAP: ${fmtETH(amountETH)} ETH → ${tokenSymbol} (${repeat}x)`
  );
  const path = [WETH, tokenAddr];

  for (let i = 1; i <= repeat; i++) {
    try {
      const tx = await router.swapExactETHForTokens(
        0n, // amountOutMin (testnet, accept any)
        path,
        wallet.address,
        deadline(),
        { value: amountETH }
      );
      await waitTx(tx, `Swap #${i} ETH→${tokenSymbol}`);
    } catch (err) {
      console.error(`   ❌ Swap #${i} ETH→${tokenSymbol} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(2000);
  }
}

// ═══════════════════════════════════════════
// STEP 2: OPEN SHORT positions
// ═══════════════════════════════════════════
async function openShort(poolKey, collateralETH, repeat) {
  const poolAddr = POOLS[poolKey];
  console.log(
    `\n📉 OPEN SHORT: ${fmtETH(collateralETH)} ETH on ${poolKey} (${repeat}x)`
  );

  // First, wrap ETH to WETH for collateral
  const wethContract = new ethers.Contract(WETH, WETH_ABI, wallet);
  const totalWETHNeeded = collateralETH * BigInt(repeat);

  // Check WETH balance
  const wethBal = await wethContract.balanceOf(wallet.address);
  if (wethBal < totalWETHNeeded) {
    const toWrap = totalWETHNeeded - wethBal;
    console.log(`   💱 Wrapping ${fmtETH(toWrap)} ETH → WETH...`);
    const wtx = await wethContract.deposit({ value: toWrap });
    await waitTx(wtx, "Wrap ETH→WETH");
  }

  // Approve WETH to pool
  await ensureApproval(WETH, poolAddr, totalWETHNeeded, `WETH→${poolKey} pool`);

  const pool = new ethers.Contract(poolAddr, POOL_ABI, wallet);

  for (let i = 1; i <= repeat; i++) {
    try {
      // openPosition(isLong, collateralToken, collateralAmount, borrowAmount, leverageX10, amountOutMin, deadline)
      // isLong = false (short)
      // collateralToken = WETH
      // borrowAmount = 0 (auto-calculated from leverage)
      // leverageX10 = 20 (2x leverage — safe default for testnet)
      const tx = await pool.openPosition(
        false, // isLong = false (SHORT)
        WETH,
        collateralETH,
        0n, // borrowAmount (0 = auto)
        20n, // leverageX10 = 2x
        0n, // amountOutMin
        deadline(),
        { gasLimit: 800000n }
      );
      await waitTx(tx, `Short #${i} on ${poolKey}`);
    } catch (err) {
      console.error(`   ❌ Short #${i} on ${poolKey} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(2000);
  }
}

// ═══════════════════════════════════════════
// STEP 3: ADD LIQUIDITY
// ═══════════════════════════════════════════
async function addLiquidityETHPair(poolKey, tokenAddr, tokenSymbol, amountETH, repeat) {
  console.log(
    `\n💧 ADD LIQUIDITY: ${fmtETH(amountETH)} ETH to ${poolKey} (${repeat}x)`
  );

  // Get expected token amount from router
  const path = [WETH, tokenAddr];
  let expectedTokenOut;
  try {
    const amounts = await router.getAmountsOut(amountETH, path);
    expectedTokenOut = amounts[1];
  } catch {
    console.log("   ⚠️ Could not estimate token amount, using 0 as min");
    expectedTokenOut = 0n;
  }

  // Check if we have enough tokens, if not swap some
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const tokenBal = await token.balanceOf(wallet.address);
  const totalTokenNeeded = expectedTokenOut * BigInt(repeat);

  if (tokenBal < totalTokenNeeded && expectedTokenOut > 0n) {
    console.log(`   💱 Need more ${tokenSymbol}, swapping...`);
    const swapTx = await router.swapExactETHForTokens(
      0n,
      path,
      wallet.address,
      deadline(),
      { value: amountETH * BigInt(repeat) }
    );
    await waitTx(swapTx, `Pre-swap ETH→${tokenSymbol} for liquidity`);
  }

  // Approve token to router
  await ensureApproval(tokenAddr, ROUTER, MAX_UINT, `${tokenSymbol}→Router`);

  for (let i = 1; i <= repeat; i++) {
    try {
      const tx = await router.addLiquidityETH(
        tokenAddr,
        expectedTokenOut > 0n ? expectedTokenOut : 1n,
        0n, // amountTokenMin
        0n, // amountETHMin
        wallet.address,
        deadline(),
        { value: amountETH, gasLimit: 500000n }
      );
      await waitTx(tx, `AddLiq #${i} to ${poolKey}`);
    } catch (err) {
      console.error(`   ❌ AddLiq #${i} to ${poolKey} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(2000);
  }
}

async function addLiquidityTokenPair(poolKey, tokenA, tokenASymbol, decA, tokenB, tokenBSymbol, decB, amountAHuman, repeat) {
  const amountA = ethers.parseUnits(amountAHuman.toString(), decA);
  console.log(
    `\n💧 ADD LIQUIDITY: ${amountAHuman} ${tokenASymbol} to ${poolKey} (${repeat}x)`
  );

  // Estimate amountB needed
  const path = [tokenA, tokenB];
  let amountBDesired;
  try {
    const amounts = await router.getAmountsOut(amountA, path);
    amountBDesired = amounts[1];
  } catch {
    // Use 1:1 ratio for stablecoins
    amountBDesired = ethers.parseUnits(amountAHuman.toString(), decB);
  }

  // Check balances
  const tA = new ethers.Contract(tokenA, ERC20_ABI, wallet);
  const tB = new ethers.Contract(tokenB, ERC20_ABI, wallet);
  const balA = await tA.balanceOf(wallet.address);
  const balB = await tB.balanceOf(wallet.address);

  if (balA < amountA * BigInt(repeat)) {
    console.log(`   ⚠️ Not enough ${tokenASymbol}. Balance: ${ethers.formatUnits(balA, decA)}. Need: ${ethers.formatUnits(amountA * BigInt(repeat), decA)}`);
    console.log(`   💱 Swapping ETH for ${tokenASymbol}...`);
    const swapTx = await router.swapExactETHForTokens(
      0n,
      [WETH, tokenA],
      wallet.address,
      deadline(),
      { value: ETH("0.005") }
    );
    await waitTx(swapTx, `Pre-swap ETH→${tokenASymbol}`);
  }

  if (balB < amountBDesired * BigInt(repeat)) {
    console.log(`   💱 Swapping ETH for ${tokenBSymbol}...`);
    const swapTx = await router.swapExactETHForTokens(
      0n,
      [WETH, tokenB],
      wallet.address,
      deadline(),
      { value: ETH("0.005") }
    );
    await waitTx(swapTx, `Pre-swap ETH→${tokenBSymbol}`);
  }

  // Approve both tokens to router
  await ensureApproval(tokenA, ROUTER, MAX_UINT, `${tokenASymbol}→Router`);
  await ensureApproval(tokenB, ROUTER, MAX_UINT, `${tokenBSymbol}→Router`);

  for (let i = 1; i <= repeat; i++) {
    try {
      const tx = await router.addLiquidity(
        tokenA,
        tokenB,
        amountA,
        amountBDesired,
        0n, // amountAMin
        0n, // amountBMin
        wallet.address,
        deadline(),
        { gasLimit: 500000n }
      );
      await waitTx(tx, `AddLiq #${i} to ${poolKey}`);
    } catch (err) {
      console.error(`   ❌ AddLiq #${i} to ${poolKey} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(2000);
  }
}

// ═══════════════════════════════════════════
// STEP 4: CLOSE ALL POSITIONS
// ═══════════════════════════════════════════
async function closeAllPositions() {
  console.log("\n🔴 CLOSING ALL POSITIONS...");

  // Query subgraph for open positions
  const query = `{
    positions(
      where: { user: "${wallet.address.toLowerCase()}", status_in: ["OPEN", "PARTIAL"] }
      first: 100
    ) {
      id
      positionIndex
      pool { address }
      collateralToken { id symbol }
      collateralAmount
      borrowAmount
      isLong
      leverageX10
      status
    }
  }`;

  let positions = [];
  try {
    const resp = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await resp.json();
    positions = data?.data?.positions || [];
  } catch (err) {
    console.error("   ❌ Failed to fetch positions from subgraph:", err.message);
    return;
  }

  if (positions.length === 0) {
    console.log("   ℹ️ No open positions found");
    return;
  }

  console.log(`   📋 Found ${positions.length} open position(s)`);

  for (const pos of positions) {
    const poolAddr = pos.pool.address;
    const posId = BigInt(pos.positionIndex);

    // Get the manager address for this pool
    let managerAddr;
    try {
      managerAddr = await factory.getManager(poolAddr);
    } catch {
      managerAddr = poolAddr; // fallback to pool address
    }

    // Use pool address for close (matching frontend behavior for closePosition on nlp)
    const target = managerAddr && managerAddr !== ethers.ZeroAddress ? managerAddr : poolAddr;
    const contract = new ethers.Contract(target, POOL_ABI, wallet);

    console.log(
      `   📌 Closing position #${posId} (${pos.isLong ? "LONG" : "SHORT"} ${pos.collateralToken.symbol}) on pool ${poolAddr.slice(0, 10)}...`
    );

    try {
      const tx = await contract.closePosition(
        posId,
        0n, // amountOutMin (accept any for testnet)
        deadline(),
        { gasLimit: 800000n }
      );
      await waitTx(tx, `Close position #${posId}`);
    } catch (err) {
      console.error(`   ❌ Close position #${posId} failed:`, err.shortMessage || err.message);
      
      // Retry with pool address if manager failed
      if (target !== poolAddr) {
        console.log(`   🔄 Retrying with pool address...`);
        try {
          const poolContract = new ethers.Contract(poolAddr, POOL_ABI, wallet);
          const tx = await poolContract.closePosition(posId, 0n, deadline(), { gasLimit: 800000n });
          await waitTx(tx, `Close position #${posId} (retry)`);
        } catch (err2) {
          console.error(`   ❌ Retry also failed:`, err2.shortMessage || err2.message);
        }
      }
    }
    await sleep(2000);
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  🏴 NEMESIS.TRADE TESTNET BOT");
  console.log("  Chain: ETH Sepolia (11155111)");
  console.log("═══════════════════════════════════════════");

  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
  factory = new ethers.Contract(FACTORY, FACTORY_ABI, wallet);

  const balance = await provider.getBalance(wallet.address);
  console.log(`\n👛 Wallet: ${wallet.address}`);
  console.log(`💰 Balance: ${fmtETH(balance)} ETH`);

  const minRequired = ETH("0.02"); // rough estimate for all operations + gas
  if (balance < minRequired) {
    console.error(
      `\n❌ Insufficient ETH balance. Need at least ~0.02 ETH for all operations + gas.`
    );
    console.error(`   Get Sepolia ETH from: https://www.alchemy.com/faucets/ethereum-sepolia`);
    process.exit(1);
  }

  const AMOUNT_ETH = ETH("0.0002");
  const REPEAT = 5;

  // ── STEP 1: SWAPS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  STEP 1/4: SWAPS");
  console.log("════════════════════════════════════════");

  await swapETHForToken(USDC, "USDC", AMOUNT_ETH, REPEAT);
  await swapETHForToken(DAI, "DAI", AMOUNT_ETH, REPEAT);
  await swapETHForToken(UNI, "UNI", AMOUNT_ETH, REPEAT);

  // ── STEP 2: OPEN SHORT POSITIONS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  STEP 2/4: OPEN SHORT POSITIONS");
  console.log("════════════════════════════════════════");

  await openShort("USDC-WETH", AMOUNT_ETH, REPEAT);
  await openShort("WETH-DAI", AMOUNT_ETH, REPEAT);
  await openShort("UNI-WETH", AMOUNT_ETH, REPEAT);

  // ── STEP 3: ADD LIQUIDITY ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  STEP 3/4: ADD LIQUIDITY");
  console.log("════════════════════════════════════════");

  // ETH-USDC: 0.0002 ETH × 5
  // Pool is USDC(token0)-WETH(token1), so use addLiquidityETH with USDC as token
  await addLiquidityETHPair("USDC-WETH", USDC, "USDC", AMOUNT_ETH, REPEAT);

  // ETH-DAI: 0.0002 ETH × 5
  // Pool is WETH(token0)-DAI(token1)
  await addLiquidityETHPair("WETH-DAI", DAI, "DAI", AMOUNT_ETH, REPEAT);

  // USDC-DAI: $10 USDC × 5
  await addLiquidityTokenPair("USDC-DAI", USDC, "USDC", 6, DAI, "DAI", 18, "10", REPEAT);

  // ── STEP 4: CLOSE ALL POSITIONS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  STEP 4/4: CLOSE ALL POSITIONS");
  console.log("════════════════════════════════════════");

  // Wait a bit for subgraph to index
  console.log("   ⏳ Waiting 30s for subgraph to index positions...");
  await sleep(30000);

  await closeAllPositions();

  // ── DONE ──
  console.log("\n\n═══════════════════════════════════════════");
  console.log("  ✅ ALL TASKS COMPLETED!");
  console.log("═══════════════════════════════════════════");

  const finalBalance = await provider.getBalance(wallet.address);
  console.log(`💰 Final balance: ${fmtETH(finalBalance)} ETH`);
  console.log(`⛽ Gas spent: ${fmtETH(balance - finalBalance)} ETH`);
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
