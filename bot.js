import { ethers } from "ethers";
import "dotenv/config";

// ═══════════════════════════════════════════════════════════
// NEMESIS.TRADE TESTNET BOT — ETH Sepolia
// Swap, Open Long, Open Short, Add/Remove Liquidity, Close All
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
const TEST2 = "0xbce723dc31a53ea268223220ffabf0bb2f91d80c";
const TEST3 = "0x12a830aed198ef536826512d0fd9ccea98f7567c";

// ── Pool Addresses (from subgraph) ──
const POOLS = {
  "USDC-WETH": "0x42f052f625e28c802f04978909ece3f9d6e5e3a1", // token0=USDC, token1=WETH
  "WETH-DAI": "0x0b6a0a69b7040b2281730cbae6060b3b1b2ed3a9",  // token0=WETH, token1=DAI
  "UNI-WETH": "0x84605fffe96a1961a144e695247029eb3a60c316",  // token0=UNI,  token1=WETH
  "USDC-DAI": "0x337c9fecf78aad05f6ab742609bede3a4f3483cf",  // token0=USDC, token1=DAI
  "WETH-TEST2": "0x9308f73b39dc0041c3353e795fb37ae2251bb94f", // token0=WETH, token1=Test2
  "TEST3-WETH": "0xa4089e7c8b11ddc11d69784689e12f13aa5d7e58", // token0=Test3, token1=WETH
};

// ── Manager/Vault Addresses (from factory.getManager) ──
// openPosition & closePosition are called on the MANAGER, not the pool!
const MANAGERS = {
  "USDC-WETH": "0x93310a56147b1eA7486Ab84F8D850FD0A216429B",
  "WETH-DAI": "0xF467EC26cf1911A0Ff87E3A6D36b3aeC915506a9",
  "UNI-WETH": "0xAF93c5b321757Ca9f37992525c4889Bceef76726",
  "USDC-DAI": "0x6c1581bd9eddec33c8e30e9f1c3d82def2716154",
  "WETH-TEST2": "0x95B53f890F5Cb8c12F95Fc9eA19AE85Ca43eAb55",
  "TEST3-WETH": "0x587a210F9355f04a485f5633e66bF295E2FAaf83",
};

// ── Short Position Config ──
// For SHORT: collateral = the "counter" token (opposite of what you're shorting)
// USDC-WETH pool: short WETH → collateral = USDC (token0)
// WETH-DAI pool:  short WETH → collateral = DAI  (token1)
// UNI-WETH pool:  short UNI  → collateral = WETH (token1)
// WETH-TEST2 pool: short TEST2 → collateral = WETH (token0)
// TEST3-WETH pool: short WETH  → collateral = TEST3 (token0)
const SHORT_CONFIG = {
  "USDC-WETH": { collateral: USDC, symbol: "USDC", decimals: 6 },
  "WETH-DAI": { collateral: DAI, symbol: "DAI", decimals: 18 },
  "UNI-WETH": { collateral: WETH, symbol: "WETH", decimals: 18 },
  "WETH-TEST2": { collateral: WETH, symbol: "WETH", decimals: 18 },
  "TEST3-WETH": { collateral: TEST3, symbol: "Test3", decimals: 18 },
};

// ── Long Position Config ──
// For LONG: collateral = the token you're going long on (or the base token)
// USDC-WETH pool: long WETH → collateral = WETH (token1)
// WETH-DAI pool:  long WETH → collateral = WETH (token0)
// UNI-WETH pool:  long ETH  → collateral = WETH (token1)
// WETH-TEST2 pool: long TEST2 → collateral = TEST2 (token1)
// TEST3-WETH pool: long WETH  → collateral = WETH (token1)
const LONG_CONFIG = {
  "USDC-WETH": { collateral: WETH, symbol: "WETH", decimals: 18 },
  "WETH-DAI": { collateral: WETH, symbol: "WETH", decimals: 18 },
  "UNI-WETH": { collateral: WETH, symbol: "WETH", decimals: 18 },
  "WETH-TEST2": { collateral: TEST2, symbol: "Test2", decimals: 18 },
  "TEST3-WETH": { collateral: WETH, symbol: "WETH", decimals: 18 },
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
  "function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB)",
  "function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) returns (uint amountToken, uint amountETH)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB) view returns (address)",
  "function getManager(address pool) view returns (address)",
];

// Manager ABI (handles positions + vault/liquidity)
const MANAGER_ABI = [
  "function openPosition(bool isLong, address collateralToken, uint256 collateralAmount, uint256 borrowAmount, uint256 leverageX10, uint256 amountOutMin, uint256 deadline) returns (uint256)",
  "function closePosition(uint256 positionId, uint256 amountOutMin, uint256 deadline)",
  "function getAvailableLiquidity() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalBorrowed() view returns (uint256)",
  "function LTV_BPS() view returns (uint256)",
  "function depositWithLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address receiver, uint256 deadline) returns (uint256 shares)",
  "function withdrawWithLiquidity(uint256 shares, address tokenA, address tokenB, uint256 amountAMin, uint256 amountBMin, address receiver, address owner, uint256 deadline)",
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint wad)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// ── Globals ──
let provider, wallet, router, factory;

// ── Helpers ──
const getDeadline = () => BigInt(Math.floor(Date.now() / 1000) + 1200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ETH = (n) => ethers.parseEther(n.toString());
const fmtETH = (n) => ethers.formatEther(n);
const MAX_UINT = ethers.MaxUint256;

let txCount = 0;

// Random amount between 0.00010 and 0.00050 ETH (looks human, not bot)
function randomETH() {
  const min = 0.00010;
  const max = 0.00050;
  const amount = min + Math.random() * (max - min);
  // Round to 5 decimal places to look natural
  return ethers.parseEther(amount.toFixed(5));
}

// Random delay 2-6 seconds between txs (looks human)
function randomDelay() {
  return 2000 + Math.floor(Math.random() * 4000);
}

async function waitTx(tx, label) {
  txCount++;
  console.log(`   ⏳ [TX #${txCount}] ${label} — ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`   ✅ [TX #${txCount}] ${label} — block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  return receipt;
}

async function ensureApproval(tokenAddr, spender, amount, label) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const current = await token.allowance(wallet.address, spender);
  if (current >= amount) {
    console.log(`   🔓 ${label} already approved`);
    return;
  }
  console.log(`   🔓 Approving ${label}...`);
  const tx = await token.approve(spender, MAX_UINT);
  await waitTx(tx, `Approve ${label}`);
}

async function getTokenBalance(tokenAddr) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  return await token.balanceOf(wallet.address);
}

// ═══════════════════════════════════════════
// STEP 1: SWAP ETH → Tokens (via Router)
// ═══════════════════════════════════════════
async function swapETHForToken(tokenAddr, tokenSymbol, repeat) {
  console.log(`\n🔄 SWAP: ETH → ${tokenSymbol} (${repeat}x, random amounts)`);
  const path = [WETH, tokenAddr];

  for (let i = 1; i <= repeat; i++) {
    const amount = randomETH();
    try {
      const tx = await router.swapExactETHForTokens(
        0n, // amountOutMin (testnet, accept any)
        path,
        wallet.address,
        getDeadline(),
        { value: amount }
      );
      await waitTx(tx, `Swap #${i} ${fmtETH(amount)} ETH→${tokenSymbol}`);
    } catch (err) {
      console.error(`   ❌ Swap #${i} ETH→${tokenSymbol} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(randomDelay());
  }
}

// ═══════════════════════════════════════════
// STEP 2: OPEN SHORT positions
// ═══════════════════════════════════════════
async function openShort(poolKey, repeat) {
  const managerAddr = MANAGERS[poolKey];
  const config = SHORT_CONFIG[poolKey];

  console.log(`\n📉 OPEN SHORT on ${poolKey} (${repeat}x, random amounts)`);
  console.log(`   Collateral token: ${config.symbol}`);
  console.log(`   Manager: ${managerAddr}`);

  const manager = new ethers.Contract(managerAddr, MANAGER_ABI, wallet);

  // Check available liquidity
  try {
    const avail = await manager.getAvailableLiquidity();
    console.log(`   Available liquidity: ${fmtETH(avail)}`);
    if (avail === 0n) {
      console.log(`   ⚠️ No liquidity available, skipping ${poolKey}`);
      return;
    }
  } catch {}

  if (config.collateral === WETH) {
    // WETH collateral: wrap enough for max possible (0.00050 * repeat + buffer)
    const wethContract = new ethers.Contract(WETH, WETH_ABI, wallet);
    const maxNeeded = ETH("0.0005") * BigInt(repeat);
    const wethBal = await wethContract.balanceOf(wallet.address);

    if (wethBal < maxNeeded) {
      const toWrap = maxNeeded - wethBal + ETH("0.0002");
      console.log(`   💱 Wrapping ${fmtETH(toWrap)} ETH → WETH...`);
      const wtx = await wethContract.deposit({ value: toWrap });
      await waitTx(wtx, "Wrap ETH→WETH");
    }
    await ensureApproval(WETH, managerAddr, MAX_UINT, `WETH→${poolKey} manager`);

    for (let i = 1; i <= repeat; i++) {
      const amount = randomETH();
      try {
        const tx = await manager.openPosition(
          false, WETH, amount, 0n, 20n, 0n, getDeadline(),
          { gasLimit: 1000000n }
        );
        await waitTx(tx, `Short #${i} ${fmtETH(amount)} WETH on ${poolKey}`);
      } catch (err) {
        console.error(`   ❌ Short #${i} on ${poolKey} failed:`, err.shortMessage || err.message);
        if (i === 1) {
          console.log(`   🔄 Retrying with explicit borrowAmount...`);
          try {
            const tx = await manager.openPosition(
              false, WETH, amount, amount, 20n, 0n, getDeadline(),
              { gasLimit: 1000000n }
            );
            await waitTx(tx, `Short #${i} on ${poolKey} (retry)`);
          } catch (err2) {
            console.error(`   ❌ Retry failed:`, err2.shortMessage || err2.message);
          }
        }
      }
      if (i < repeat) await sleep(randomDelay());
    }
  } else {
    // Non-WETH collateral: swap ETH → collateral token for all repeats
    const path = [WETH, config.collateral];
    const totalETH = ETH("0.0005") * BigInt(repeat); // max budget
    console.log(`   💱 Swapping ${fmtETH(totalETH)} ETH → ${config.symbol} for collateral...`);

    try {
      const swapTx = await router.swapExactETHForTokens(
        0n, path, wallet.address, getDeadline(), { value: totalETH }
      );
      await waitTx(swapTx, `Swap ETH→${config.symbol} for shorts`);
    } catch (err) {
      console.error(`   ❌ Failed to get ${config.symbol}:`, err.shortMessage || err.message);
      return;
    }

    await ensureApproval(config.collateral, managerAddr, MAX_UINT, `${config.symbol}→${poolKey} manager`);

    // Get balance and split into random portions
    const totalBal = await getTokenBalance(config.collateral);
    const avgPortion = totalBal / BigInt(repeat + 1); // reserve some

    for (let i = 1; i <= repeat; i++) {
      // Random portion: 60%-140% of average
      const factor = 600n + BigInt(Math.floor(Math.random() * 800)); // 600-1400
      const collateralAmount = avgPortion * factor / 1000n;

      try {
        const tx = await manager.openPosition(
          false, config.collateral, collateralAmount, 0n, 20n, 0n, getDeadline(),
          { gasLimit: 1000000n }
        );
        await waitTx(tx, `Short #${i} ${ethers.formatUnits(collateralAmount, config.decimals)} ${config.symbol} on ${poolKey}`);
      } catch (err) {
        console.error(`   ❌ Short #${i} on ${poolKey} failed:`, err.shortMessage || err.message);
        if (i === 1) {
          console.log(`   🔄 Retrying with explicit borrowAmount...`);
          try {
            const tx = await manager.openPosition(
              false, config.collateral, collateralAmount, collateralAmount, 20n, 0n, getDeadline(),
              { gasLimit: 1000000n }
            );
            await waitTx(tx, `Short #${i} on ${poolKey} (retry)`);
          } catch (err2) {
            console.error(`   ❌ Retry failed:`, err2.shortMessage || err2.message);
          }
        }
      }
      if (i < repeat) await sleep(randomDelay());
    }
  }
}

// ═══════════════════════════════════════════
// STEP 2b: OPEN LONG positions
// ═══════════════════════════════════════════
async function openLong(poolKey, repeat) {
  const managerAddr = MANAGERS[poolKey];
  const config = LONG_CONFIG[poolKey];

  console.log(`\n📈 OPEN LONG on ${poolKey} (${repeat}x, random amounts)`);
  console.log(`   Collateral: ${config.symbol}`);
  console.log(`   Manager: ${managerAddr}`);

  const manager = new ethers.Contract(managerAddr, MANAGER_ABI, wallet);

  // Check available liquidity
  try {
    const avail = await manager.getAvailableLiquidity();
    console.log(`   Available liquidity: ${fmtETH(avail)}`);
    if (avail === 0n) {
      console.log(`   ⚠️ No liquidity available, skipping ${poolKey}`);
      return;
    }
  } catch {}

  // Wrap enough WETH for max possible
  const wethContract = new ethers.Contract(WETH, WETH_ABI, wallet);
  const maxNeeded = ETH("0.0005") * BigInt(repeat);
  const wethBal = await wethContract.balanceOf(wallet.address);

  if (wethBal < maxNeeded) {
    const toWrap = maxNeeded - wethBal + ETH("0.0002");
    console.log(`   💱 Wrapping ${fmtETH(toWrap)} ETH → WETH...`);
    const wtx = await wethContract.deposit({ value: toWrap });
    await waitTx(wtx, "Wrap ETH→WETH");
  }

  await ensureApproval(WETH, managerAddr, MAX_UINT, `WETH→${poolKey} manager`);

  for (let i = 1; i <= repeat; i++) {
    const amount = randomETH();
    try {
      const tx = await manager.openPosition(
        true, WETH, amount, 0n, 20n, 0n, getDeadline(),
        { gasLimit: 1000000n }
      );
      await waitTx(tx, `Long #${i} ${fmtETH(amount)} WETH on ${poolKey}`);
    } catch (err) {
      console.error(`   ❌ Long #${i} on ${poolKey} failed:`, err.shortMessage || err.message);
      if (i === 1) {
        console.log(`   🔄 Retrying with explicit borrowAmount...`);
        try {
          const tx = await manager.openPosition(
            true, WETH, amount, amount, 20n, 0n, getDeadline(),
            { gasLimit: 1000000n }
          );
          await waitTx(tx, `Long #${i} on ${poolKey} (retry)`);
        } catch (err2) {
          console.error(`   ❌ Retry failed:`, err2.shortMessage || err2.message);
        }
      }
    }
    if (i < repeat) await sleep(randomDelay());
  }
}

// ═══════════════════════════════════════════
// STEP 3: ADD LIQUIDITY
// ═══════════════════════════════════════════
async function addLiquidityETHPair(poolKey, tokenAddr, tokenSymbol, repeat) {
  console.log(`\n💧 ADD LIQUIDITY: ETH to ${poolKey} (${repeat}x, random amounts)`);

  const path = [WETH, tokenAddr];
  const dec = tokenAddr === USDC ? 6 : 18;

  // Pre-swap enough tokens for all repeats (using max amount budget)
  const totalETHBudget = ETH("0.0005") * BigInt(repeat + 2);
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const tokenBal = await token.balanceOf(wallet.address);

  // Estimate how much token we'd get
  let estPerETH = 0n;
  try {
    const amounts = await router.getAmountsOut(ETH("0.0003"), path);
    estPerETH = amounts[1];
  } catch {}

  const estTotalNeeded = estPerETH * BigInt(repeat + 2);
  if (tokenBal < estTotalNeeded) {
    console.log(`   💱 Swapping ETH → ${tokenSymbol} for liquidity...`);
    const swapTx = await router.swapExactETHForTokens(
      0n, path, wallet.address, getDeadline(),
      { value: totalETHBudget }
    );
    await waitTx(swapTx, `Pre-swap ETH→${tokenSymbol}`);
  }

  await ensureApproval(tokenAddr, ROUTER, MAX_UINT, `${tokenSymbol}→Router`);

  for (let i = 1; i <= repeat; i++) {
    const ethAmount = randomETH();
    // Estimate matching token amount for this specific ETH amount
    let tokenAmount = 0n;
    try {
      const amounts = await router.getAmountsOut(ethAmount, path);
      tokenAmount = amounts[1];
    } catch {
      tokenAmount = estPerETH > 0n ? estPerETH : 1n;
    }

    try {
      const tx = await router.addLiquidityETH(
        tokenAddr,
        tokenAmount,
        0n, 0n,
        wallet.address,
        getDeadline(),
        { value: ethAmount, gasLimit: 500000n }
      );
      await waitTx(tx, `AddLiq #${i} ${fmtETH(ethAmount)} ETH to ${poolKey}`);
    } catch (err) {
      console.error(`   ❌ AddLiq #${i} to ${poolKey} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(randomDelay());
  }
}

async function addLiquidityTokenPair(poolKey, tokenA, symA, decA, tokenB, symB, decB, amountAHuman, repeat) {
  const amountA = ethers.parseUnits(amountAHuman.toString(), decA);
  console.log(`\n💧 ADD LIQUIDITY: ${amountAHuman} ${symA} to ${poolKey} (${repeat}x)`);

  // Estimate amountB needed
  let amountBDesired;
  try {
    const amounts = await router.getAmountsOut(amountA, [tokenA, tokenB]);
    amountBDesired = amounts[1];
    console.log(`   Need ~${ethers.formatUnits(amountBDesired, decB)} ${symB} per position`);
  } catch {
    amountBDesired = ethers.parseUnits(amountAHuman.toString(), decB);
  }

  // Check and acquire tokens
  const totalANeeded = amountA * BigInt(repeat);
  const totalBNeeded = amountBDesired * BigInt(repeat);

  let balA = await getTokenBalance(tokenA);
  if (balA < totalANeeded) {
    console.log(`   💱 Need more ${symA}, swapping ETH...`);
    const tx = await router.swapExactETHForTokens(0n, [WETH, tokenA], wallet.address, getDeadline(), { value: ETH("0.005") });
    await waitTx(tx, `Pre-swap ETH→${symA}`);
  }

  let balB = await getTokenBalance(tokenB);
  if (balB < totalBNeeded) {
    console.log(`   💱 Need more ${symB}, swapping ETH...`);
    const tx = await router.swapExactETHForTokens(0n, [WETH, tokenB], wallet.address, getDeadline(), { value: ETH("0.005") });
    await waitTx(tx, `Pre-swap ETH→${symB}`);
  }

  // Approve both to router
  await ensureApproval(tokenA, ROUTER, MAX_UINT, `${symA}→Router`);
  await ensureApproval(tokenB, ROUTER, MAX_UINT, `${symB}→Router`);

  for (let i = 1; i <= repeat; i++) {
    try {
      const tx = await router.addLiquidity(
        tokenA, tokenB,
        amountA, amountBDesired,
        0n, 0n,
        wallet.address,
        getDeadline(),
        { gasLimit: 500000n }
      );
      await waitTx(tx, `AddLiq #${i} to ${poolKey}`);
    } catch (err) {
      console.error(`   ❌ AddLiq #${i} to ${poolKey} failed:`, err.shortMessage || err.message);
    }
    if (i < repeat) await sleep(randomDelay());
  }
}

// ═══════════════════════════════════════════
// STEP 3b: REMOVE LIQUIDITY
// ═══════════════════════════════════════════
async function removeLiquidityETHPair(poolKey, tokenAddr, tokenSymbol) {
  const poolAddr = POOLS[poolKey];
  console.log(`\n🔥 REMOVE LIQUIDITY from ${poolKey}`);

  // LP token = pool address itself
  const lpToken = new ethers.Contract(poolAddr, ERC20_ABI, wallet);
  const lpBalance = await lpToken.balanceOf(wallet.address);

  if (lpBalance === 0n) {
    console.log(`   ℹ️ No LP tokens for ${poolKey}, skipping`);
    return;
  }

  console.log(`   LP balance: ${fmtETH(lpBalance)}`);

  // Approve LP to router
  await ensureApproval(poolAddr, ROUTER, lpBalance, `LP ${poolKey}→Router`);

  try {
    const tx = await router.removeLiquidityETH(
      tokenAddr,
      lpBalance,
      0n, // amountTokenMin
      0n, // amountETHMin
      wallet.address,
      getDeadline(),
      { gasLimit: 500000n }
    );
    await waitTx(tx, `RemoveLiq from ${poolKey}`);
  } catch (err) {
    console.error(`   ❌ RemoveLiq ${poolKey} failed:`, err.shortMessage || err.message);

    // Fallback: try removeLiquidity (non-ETH version with WETH)
    console.log(`   🔄 Retrying with removeLiquidity (WETH)...`);
    try {
      const tx = await router.removeLiquidity(
        tokenAddr, WETH,
        lpBalance,
        0n, 0n,
        wallet.address,
        getDeadline(),
        { gasLimit: 500000n }
      );
      await waitTx(tx, `RemoveLiq from ${poolKey} (retry)`);
    } catch (err2) {
      console.error(`   ❌ Retry also failed:`, err2.shortMessage || err2.message);
    }
  }
}

async function removeLiquidityTokenPair(poolKey, tokenA, symA, tokenB, symB) {
  const poolAddr = POOLS[poolKey];
  console.log(`\n🔥 REMOVE LIQUIDITY from ${poolKey}`);

  const lpToken = new ethers.Contract(poolAddr, ERC20_ABI, wallet);
  const lpBalance = await lpToken.balanceOf(wallet.address);

  if (lpBalance === 0n) {
    console.log(`   ℹ️ No LP tokens for ${poolKey}, skipping`);
    return;
  }

  console.log(`   LP balance: ${fmtETH(lpBalance)}`);

  // Approve LP to router
  await ensureApproval(poolAddr, ROUTER, lpBalance, `LP ${poolKey}→Router`);

  try {
    const tx = await router.removeLiquidity(
      tokenA, tokenB,
      lpBalance,
      0n, 0n,
      wallet.address,
      getDeadline(),
      { gasLimit: 500000n }
    );
    await waitTx(tx, `RemoveLiq from ${poolKey}`);
  } catch (err) {
    console.error(`   ❌ RemoveLiq ${poolKey} failed:`, err.shortMessage || err.message);
  }
}

// ═══════════════════════════════════════════
// STEP 4: CLOSE ALL POSITIONS
// ═══════════════════════════════════════════
async function closeAllPositions() {
  console.log("\n🔴 CLOSING ALL POSITIONS...");

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
    console.error("   ❌ Failed to fetch positions:", err.message);
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

    // Get manager for this pool
    let managerAddr;
    try {
      managerAddr = await factory.getManager(poolAddr);
    } catch {
      managerAddr = null;
    }

    // closePosition is called on the MANAGER
    const targetAddr = managerAddr && managerAddr !== ethers.ZeroAddress ? managerAddr : poolAddr;
    const contract = new ethers.Contract(targetAddr, MANAGER_ABI, wallet);

    console.log(`   📌 Closing #${posId} (${pos.isLong ? "LONG" : "SHORT"} ${pos.collateralToken.symbol}) on ${poolAddr.slice(0, 10)}...`);

    try {
      const tx = await contract.closePosition(
        posId,
        0n, // amountOutMin
        getDeadline(),
        { gasLimit: 1000000n }
      );
      await waitTx(tx, `Close position #${posId}`);
    } catch (err) {
      console.error(`   ❌ Close #${posId} failed:`, err.shortMessage || err.message);
    }
    await sleep(randomDelay());
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  🏴 NEMESIS.TRADE TESTNET BOT v4");
  console.log("  Chain: ETH Sepolia (11155111)");
  console.log("═══════════════════════════════════════════");

  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
  factory = new ethers.Contract(FACTORY, FACTORY_ABI, wallet);

  const balance = await provider.getBalance(wallet.address);
  console.log(`\n👛 Wallet: ${wallet.address}`);
  console.log(`💰 Balance: ${fmtETH(balance)} ETH`);

  // Check token balances
  for (const [sym, addr, dec] of [["USDC", USDC, 6], ["DAI", DAI, 18], ["UNI", UNI, 18], ["Test2", TEST2, 18], ["Test3", TEST3, 18]]) {
    const bal = await getTokenBalance(addr);
    if (bal > 0n) console.log(`   ${sym}: ${ethers.formatUnits(bal, dec)}`);
  }

  const minRequired = ETH("0.04");
  if (balance < minRequired) {
    console.error(`\n❌ Need at least ~0.04 ETH. Get from: https://www.alchemy.com/faucets/ethereum-sepolia`);
    process.exit(1);
  }

  const REPEAT = 5;

  // ── STEP 1: SWAPS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  📊 STEP 1/6: SWAPS (25 transactions)");
  console.log("════════════════════════════════════════");

  await swapETHForToken(USDC, "USDC", REPEAT);
  await swapETHForToken(DAI, "DAI", REPEAT);
  await swapETHForToken(UNI, "UNI", REPEAT);
  await swapETHForToken(TEST2, "Test2", REPEAT);
  await swapETHForToken(TEST3, "Test3", REPEAT);

  // ── STEP 2: OPEN SHORT POSITIONS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  📉 STEP 2/6: OPEN SHORT (20 positions)");
  console.log("════════════════════════════════════════");

  await openShort("USDC-WETH", REPEAT);
  await openShort("WETH-DAI", REPEAT);
  await openShort("UNI-WETH", REPEAT);
  await openShort("WETH-TEST2", REPEAT);

  // ── STEP 3: OPEN LONG POSITIONS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  📈 STEP 3/6: OPEN LONG (20 positions)");
  console.log("════════════════════════════════════════");

  await openLong("USDC-WETH", REPEAT);
  await openLong("WETH-DAI", REPEAT);
  await openLong("UNI-WETH", REPEAT);
  await openLong("TEST3-WETH", REPEAT);

  // ── STEP 4: ADD LIQUIDITY ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  💧 STEP 4/6: ADD LIQUIDITY");
  console.log("════════════════════════════════════════");

  await addLiquidityETHPair("USDC-WETH", USDC, "USDC", REPEAT);
  await addLiquidityETHPair("WETH-DAI", DAI, "DAI", REPEAT);
  await addLiquidityTokenPair("USDC-DAI", USDC, "USDC", 6, DAI, "DAI", 18, "10", REPEAT);
  await addLiquidityETHPair("WETH-TEST2", TEST2, "Test2", REPEAT);
  await addLiquidityETHPair("TEST3-WETH", TEST3, "Test3", REPEAT);

  // ── STEP 5: REMOVE LIQUIDITY ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  🔥 STEP 5/6: REMOVE LIQUIDITY");
  console.log("════════════════════════════════════════");

  await removeLiquidityETHPair("UNI-WETH", UNI, "UNI");
  await removeLiquidityETHPair("WETH-DAI", DAI, "DAI");
  await removeLiquidityTokenPair("USDC-DAI", USDC, "USDC", DAI, "DAI");

  // ── STEP 6: CLOSE ALL POSITIONS ──
  console.log("\n\n════════════════════════════════════════");
  console.log("  🔴 STEP 6/6: CLOSE ALL POSITIONS");
  console.log("════════════════════════════════════════");

  console.log("   ⏳ Waiting 30s for subgraph indexing...");
  await sleep(30000);

  await closeAllPositions();

  // ── DONE ──
  console.log("\n\n═══════════════════════════════════════════");
  console.log(`  ✅ COMPLETED! Total transactions: ${txCount}`);
  console.log("═══════════════════════════════════════════");

  const finalBalance = await provider.getBalance(wallet.address);
  console.log(`💰 Final balance: ${fmtETH(finalBalance)} ETH`);
  console.log(`⛽ Total gas spent: ~${fmtETH(balance - finalBalance)} ETH`);
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
