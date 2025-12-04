// thbc-kjc.js - THBC → KJC Auto-Stake (หลายก้อนสะสมได้)

let injected;
let provider;
let signer;
let currentAccount = null;

let thbcContract;
let stakeContract;

let thbcDecimals = 18;

// ค่าจากสัญญา
let rateBN = null;         // KJC per THBC (18 decimals)
let apyBpsNum = 0;         // APY เป็น basis points (1500 = 15%)
let lockSecNum = 0;        // ระยะเวลา lock (วินาที)
let rateNum = 0;           // rate แบบ float ใช้คำนวณ preview

function $(id) {
  return document.getElementById(id);
}

function shortAddress(addr) {
  if (!addr) return "–";
  return addr.slice(0, 6) + "..." + addr.slice(addr.length - 4);
}

function getInjectedProvider() {
  if (window.ethereum) return window.ethereum;
  if (window.BinanceChain) return window.BinanceChain;
  if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
  if (window.bitget && window.bitget.ethereum) return window.bitget.ethereum;
  return null;
}

// -------------------- INIT --------------------

function init() {
  const amtInput = $("thbcAmount");
  if (amtInput) amtInput.addEventListener("input", updatePreview);

  if ($("btnConnect")) $("btnConnect").onclick = connectWallet;
  if ($("btnApprove")) $("btnApprove").onclick = onApproveTHBC;
  if ($("btnStake")) $("btnStake").onclick = onSwapAndStake;
  if ($("btnClaim")) $("btnClaim").onclick = onClaimAll;

  updatePreview();
}

window.addEventListener("load", init);

// ---------------- CONNECT WALLET ---------------

async function connectWallet() {
  try {
    clearMsg($("txMessage"));
    clearMsg($("claimMessage"));

    injected = getInjectedProvider();
    if (!injected) {
      alert("ไม่พบ Wallet (MetaMask / Binance / Bitget) ในเบราว์เซอร์");
      return;
    }

    provider = new ethers.providers.Web3Provider(injected, "any");

    const accounts = await provider.send("eth_requestAccounts", []);
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found in wallet");
    }
    currentAccount = accounts[0];

    const network = await provider.getNetwork();
    const cfg = window.THBC_KJC_CONFIG;

    if (network.chainId !== cfg.chainId) {
      alert(
        `ตอนนี้คุณอยู่บน chainId ${network.chainId}\n` +
          `กรุณาเปลี่ยนเครือข่ายใน Wallet เป็น BNB Smart Chain (chainId ${cfg.chainId}) แล้วเชื่อมต่อใหม่อีกครั้ง`
      );
      currentAccount = null;
      return;
    }

    signer = provider.getSigner();

    thbcContract = new ethers.Contract(cfg.thbc.address, cfg.thbc.abi, signer);
    stakeContract = new ethers.Contract(
      cfg.stake.address,
      cfg.stake.abi,
      signer
    );

    // อ่าน decimals ของ THBC
    thbcDecimals = await thbcContract.decimals();

    if ($("btnConnect")) $("btnConnect").textContent = shortAddress(currentAccount);
    if ($("addrShort")) $("addrShort").textContent = shortAddress(currentAccount);

    // โหลดข้อมูลจากสัญญา
    await Promise.all([loadOnchainParams(), refreshPosition()]);

    if (injected && injected.on) {
      injected.on("accountsChanged", () => window.location.reload());
      injected.on("chainChanged", () => window.location.reload());
    }
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("เชื่อมต่อกระเป๋าไม่สำเร็จ: " + (err.message || err));
  }
}

// -------------- LOAD PARAMS (rate / APY / lock) --------------

async function loadOnchainParams() {
  try {
    if (!stakeContract) return;

    const [rate, apyBpsBN, lockDurationBN] = await Promise.all([
      stakeContract.rateKjcPerThbc(),
      stakeContract.apyBps(),
      stakeContract.lockDuration()
    ]);

    rateBN = rate;
    rateNum = parseFloat(ethers.utils.formatUnits(rateBN, 18)); // 1 THBC = rateNum KJC

    apyBpsNum = apyBpsBN.toNumber();
    lockSecNum = lockDurationBN.toNumber();

    if ($("rateText")) {
      $("rateText").textContent = `1 THBC = ${rateNum.toFixed(4)} KJC`;
    }
    if ($("apyText")) {
      $("apyText").textContent = `${(apyBpsNum / 100).toFixed(2)} %`;
    }
    if ($("lockText")) {
      const days = lockSecNum / (24 * 60 * 60);
      $("lockText").textContent = `${days.toFixed(0)} days`;
    }

    updatePreview();
  } catch (err) {
    console.error("loadOnchainParams error:", err);
    if ($("rateText")) $("rateText").textContent = "–";
    if ($("apyText")) $("apyText").textContent = "–";
    if ($("lockText")) $("lockText").textContent = "–";
  }
}

// ----------------- PREVIEW OUTPUT -----------------

function updatePreview() {
  const amtStr = $("thbcAmount")?.value || "0";
  const amt = parseFloat(amtStr) || 0;

  if (!rateNum || !apyBpsNum || !lockSecNum) {
    if ($("kjcOut")) $("kjcOut").textContent = "0";
    if ($("kjcReward")) $("kjcReward").textContent = "0";
    if ($("kjcTotal")) $("kjcTotal").textContent = "0";
    return;
  }

  const principal = amt * rateNum; // KJC ที่ stake
  const apy = apyBpsNum / 10000; // bps → %
  const yearSec = 365 * 24 * 60 * 60;
  const reward = principal * apy * (lockSecNum / yearSec);
  const total = principal + reward;

  if ($("kjcOut")) $("kjcOut").textContent = principal.toFixed(4);
  if ($("kjcReward")) $("kjcReward").textContent = reward.toFixed(4);
  if ($("kjcTotal")) $("kjcTotal").textContent = total.toFixed(4);
}

// ----------------- APPROVE THBC -----------------

function clearMsg(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.remove("msg-success");
  el.classList.remove("msg-error");
}

function setMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("msg-success", "msg-error");
  if (ok === true) el.classList.add("msg-success");
  else if (ok === false) el.classList.add("msg-error");
}

async function ensureConnected() {
  if (!signer || !currentAccount) {
    await connectWallet();
  }
  if (!signer || !currentAccount) {
    throw new Error("Wallet not connected");
  }
}

async function onApproveTHBC() {
  const msgEl = $("txMessage");
  clearMsg(msgEl);

  try {
    await ensureConnected();

    const cfg = window.THBC_KJC_CONFIG;

    if (!thbcContract) {
      thbcContract = new ethers.Contract(
        cfg.thbc.address,
        cfg.thbc.abi,
        signer
      );
    }

    setMsg(msgEl, "Sending approve transaction...", null);

    const max = ethers.constants.MaxUint256;
    const tx = await thbcContract.approve(cfg.stake.address, max);
    await tx.wait();

    setMsg(msgEl, "Unlimited THBC approval successful.", true);
    if ($("btnApprove")) $("btnApprove").textContent = "Approved ✓";
  } catch (err) {
    console.error("Approve error:", err);
    setMsg(
      msgEl,
      "Approve failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err),
      false
    );
  }
}

// --------------- SWAP & STAKE ----------------

async function onSwapAndStake() {
  const msgEl = $("txMessage");
  clearMsg(msgEl);

  try {
    await ensureConnected();

    const amountStr = $("thbcAmount").value.trim();
    if (!amountStr || Number(amountStr) <= 0) {
      alert("กรุณาใส่จำนวน THBC ที่ต้องการใช้ stake");
      return;
    }

    if (!stakeContract) {
      const cfg = window.THBC_KJC_CONFIG;
      stakeContract = new ethers.Contract(
        cfg.stake.address,
        cfg.stake.abi,
        signer
      );
    }

    const thbcAmount = ethers.utils.parseUnits(amountStr, thbcDecimals);

    setMsg(msgEl, "Sending swap & stake transaction...", null);

    const tx = await stakeContract.swapAndStake(thbcAmount);
    await tx.wait();

    setMsg(msgEl, "Stake success!", true);

    // รีเฟรชข้อมูล
    await refreshPosition();
  } catch (err) {
    console.error("Swap&Stake error:", err);
    setMsg(
      msgEl,
      "Stake failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err),
      false
    );
  }
}

// --------------- REFRESH POSITION (รวมทุกก้อน) ---------------

function formatUnitsSafe(bn, decimals) {
  try {
    const s = ethers.utils.formatUnits(bn, decimals);
    // ตัด .0 ท้าย ๆ ออกให้สวย
    return s.replace(/\.0+$/, "");
  } catch (e) {
    return "0";
  }
}

async function refreshPosition() {
  try {
    if (!stakeContract || !currentAccount || !rateBN) return;

    const count = await stakeContract.getStakeCount(currentAccount);
    const now = Math.floor(Date.now() / 1000);

    let totalPrincipal = ethers.BigNumber.from(0); // KJC
    let totalReward = ethers.BigNumber.from(0);    // KJC
    let totalThbc = ethers.BigNumber.from(0);      // THBC (คำนวณกลับจาก principal)
    let latestUnlock = 0;
    let hasActive = false;
    let allClaimed = true;

    for (let i = 0; i < count; i++) {
      const s = await stakeContract.getStake(currentAccount, i);
      const principal = s.principal ?? s[0];
      const reward = s.reward ?? s[1];
      const start = (s.startTime ?? s[2]).toNumber();
      const claimed = s.claimed ?? s[3];

      totalPrincipal = totalPrincipal.add(principal);
      totalReward = totalReward.add(reward);

      // thbc = principal / rateKjcPerThbc  (ทั้งสองเป็น 18 decimals)
      let thbcSpentBN = ethers.BigNumber.from(0);
      if (rateBN && !rateBN.isZero()) {
        thbcSpentBN = principal.mul(ethers.constants.WeiPerEther).div(rateBN);
      }
      totalThbc = totalThbc.add(thbcSpentBN);

      const unlock = start + lockSecNum;
      if (unlock > latestUnlock) latestUnlock = unlock;

      if (!claimed) {
        hasActive = true;
        allClaimed = false;
      }
    }

    if ($("posThbc")) $("posThbc").textContent = formatUnitsSafe(totalThbc, thbcDecimals);
    if ($("posKjc")) $("posKjc").textContent = formatUnitsSafe(totalPrincipal, 18);
    if ($("posReward")) $("posReward").textContent = formatUnitsSafe(totalReward, 18);

    if (latestUnlock === 0) {
      if ($("posUnlock")) $("posUnlock").textContent = "–";
      if ($("posStatus"))
        $("posStatus").textContent =
          count === 0 ? "No position" : allClaimed ? "Claimed" : "–";
    } else {
      if ($("posUnlock")) {
        $("posUnlock").textContent = new Date(
          latestUnlock * 1000
        ).toLocaleString();
      }
      if ($("posStatus")) {
        const status =
          hasActive && now < latestUnlock
            ? "Locked"
            : hasActive
            ? "Unlockable"
            : "Claimed";
        $("posStatus").textContent = status;
      }
    }
  } catch (err) {
    console.error("refreshPosition error:", err);
  }
}

// --------------- CLAIM (ALL) ----------------

async function onClaimAll() {
  const msgEl = $("claimMessage");
  clearMsg(msgEl);

  try {
    await ensureConnected();

    if (!stakeContract) {
      const cfg = window.THBC_KJC_CONFIG;
      stakeContract = new ethers.Contract(
        cfg.stake.address,
        cfg.stake.abi,
        signer
      );
    }

    setMsg(msgEl, "Sending claim transaction...", null);

    // สมมติใช้ claimAll (ตามที่สัญญารองรับ)
    const tx = await stakeContract.claimAll();
    await tx.wait();

    setMsg(msgEl, "Claim success!", true);
    await refreshPosition();
  } catch (err) {
    console.error("Claim error:", err);
    setMsg(
      msgEl,
      "Claim failed: " +
        (err.data?.message ||
          err.error?.message ||
          err.reason ||
          err.message ||
          err),
      false
    );
  }
}
