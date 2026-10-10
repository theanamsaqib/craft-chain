"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  keccak256,
  toUtf8Bytes,
  isAddress,
} from "ethers";
import cfg from "../contract.json";
import BatchView, { STEP_LABELS, short } from "./BatchView";
import Icon from "./Icons";

const SEPOLIA = "0xaa36a7";
const GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
const FALLBACK_GATEWAY = "https://ipfs.io/ipfs/";
// Public Sepolia node, used so visitors WITHOUT MetaMask can still view a batch
const PUBLIC_RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

const ZERO = "0x0000000000000000000000000000000000000000";

// "ipfs://Qm..." -> a normal web link
const toHttp = (uri, gateway = GATEWAY) => (uri || "").replace("ipfs://", gateway);

// Send JSON to OUR server route, which saves it on IPFS and returns its CID.
async function pin(content, name) {
  const res = await fetch("/api/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("PIN_FAILED");
  return data.cid;
}

// Turn technical errors into plain sentences that say what to do next.
function friendly(err) {
  const text = [err?.reason, err?.shortMessage, err?.message, err?.revert?.name, err?.info?.error?.message]
    .filter(Boolean)
    .join(" ");
  if (err?.code === "ACTION_REJECTED" || /user rejected|user denied|rejected the request/i.test(text))
    return "You cancelled in MetaMask, so nothing was changed.";
  if (/NO_WALLET/.test(text))
    return "This needs the MetaMask extension. Install it from metamask.io, then try again. (Looking at a batch doesn't need it.)";
  if (/PIN_FAILED/.test(text))
    return "We couldn't save the details online. Check your Pinata key in .env.local, restart the site, and try again.";
  if (/Not batch owner/i.test(text))
    return "Only the current holder of this batch can do this. Check that MetaMask is on the right account.";
  if (/AccessControlUnauthorizedAccount|missing role/i.test(text))
    return "This account isn't allowed to create batches. Switch MetaMask to the account that set up the contract.";
  if (/ERC721NonexistentToken|nonexistent token|invalid token/i.test(text))
    return "There's no batch with that number. Check the number and try again.";
  if (/insufficient funds/i.test(text))
    return "This account has no test ETH to pay the network fee. Get some from a Sepolia faucet, then try again.";
  if (/ERC721InvalidReceiver|ERC721IncorrectOwner|ERC721InsufficientApproval/i.test(text))
    return "The hand-over didn't go through. Check that you hold this batch and the address is right.";
  return "Something went wrong. Please try again. (" + (err?.shortMessage || err?.message || "unknown error").slice(0, 140) + ")";
}

/* ------------------------------------------------------------------ */

export default function Home() {
  const [tab, setTab] = useState("make");
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState(null); // { kind: "working" | "success" | "error", title?, text }
  const [trackId, setTrackId] = useState("");

  // Open "Track" straight away when someone arrives from a QR code (/?token=1)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) {
      setTab("track");
      setTrackId(t);
    }
    // Remember a wallet that's already connected, and follow account changes
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((a) => a[0] && setAccount(a[0])).catch(() => {});
      const onChange = (a) => setAccount(a[0] || "");
      window.ethereum.on?.("accountsChanged", onChange);
      return () => window.ethereum.removeListener?.("accountsChanged", onChange);
    }
  }, []);

  function go(nextTab) {
    setStatus(null);
    setTab(nextTab);
  }

  // Connects the wallet (switching to Sepolia) and returns the contract ready to WRITE.
  const getWriteContract = useCallback(async () => {
    if (!window.ethereum) throw new Error("NO_WALLET");
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA }] });
    const provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setAccount(accounts[0]);
    const signer = await provider.getSigner();
    return new Contract(cfg.address, cfg.abi, signer);
  }, []);

  async function connectOnly() {
    try {
      setStatus(null);
      await getWriteContract();
    } catch (e) {
      setStatus({ kind: "error", text: friendly(e) });
    }
  }

  const choices = [
    { key: "make", icon: "package", title: "Create a batch", hint: "For makers" },
    { key: "update", icon: "branch", title: "Add an update", hint: "For whoever holds it" },
    { key: "track", icon: "search", title: "Track a batch", hint: "For everyone" },
  ];

  return (
    <div className="page">
      <header className="top">
        <div className="top-in">
          <span className="logo">
            <span className="logo-mark"><Icon name="hammer" size={18} /></span>
            <span className="brand">Craft-Chain</span>
          </span>
          {account ? (
            <span className="wallet-chip">Wallet: {short(account)}</span>
          ) : (
            <button type="button" className="btn-link" onClick={connectOnly}>Connect wallet</button>
          )}
        </div>
      </header>

      <div className="layout">
        <nav className="choices" aria-label="What would you like to do?">
          {choices.map((c) => (
            <button
              key={c.key}
              type="button"
              className={"choice" + (tab === c.key ? " choice-active" : "")}
              aria-current={tab === c.key ? "page" : undefined}
              onClick={() => go(c.key)}
            >
              <span className="choice-icon"><Icon name={c.icon} size={20} /></span>
              <span>
                <span className="choice-title">{c.title}</span>
                <span className="choice-hint">{c.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <main className="panel">
          {tab === "make" && <Make getWriteContract={getWriteContract} setStatus={setStatus} go={go} />}
          {tab === "update" && <Update getWriteContract={getWriteContract} setStatus={setStatus} go={go} />}
          {tab === "track" && <Track initialId={trackId} setStatus={setStatus} />}
          <Notice status={status} />
        </main>
      </div>

      <footer className="foot">
        This is a test version on the Sepolia test network. No real money or personal details are used.
      </footer>
    </div>
  );
}

function Notice({ status }) {
  if (!status) return null;
  return (
    <div className={"notice notice-" + status.kind} role={status.kind === "error" ? "alert" : "status"} aria-live="polite">
      {status.kind === "working" && <span className="spin" aria-hidden="true" />}
      <div>
        {status.title && <strong>{status.title}</strong>}
        {status.text}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- Create a batch ---------------- */

function Make({ getWriteContract, setStatus, go }) {
  const empty = { name: "", origin: "", material: "", date: "", description: "" };
  const [f, setF] = useState(empty);
  const [created, setCreated] = useState(null); // batch number once done
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      setStatus({ kind: "working", text: "Saving the batch details online…" });
      const metadata = {
        name: f.name,
        description: f.description,
        attributes: [
          { trait_type: "Origin", value: f.origin },
          { trait_type: "Material", value: f.material },
          { trait_type: "Date", value: f.date },
        ],
      };
      const cid = await pin(metadata, `batch-${f.name}`);

      setStatus({ kind: "working", text: "Waiting for your approval in MetaMask…" });
      const contract = await getWriteContract();
      const tx = await contract.mintBatch(`ipfs://${cid}`);

      setStatus({ kind: "working", text: "Almost there. Waiting for the network to confirm…" });
      const receipt = await tx.wait();

      let id = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "BatchMinted") id = parsed.args.tokenId.toString();
        } catch {}
      }
      // The form is NOT cleared. The user decides when to start a new batch.
      setCreated(id);
      setStatus(null);
    } catch (err) {
      setStatus({ kind: "error", text: friendly(err) });
    } finally {
      setBusy(false);
    }
  }

  // Only runs when the user clicks "Create a new batch"
  function newBatch() {
    setF(empty);
    setCreated(null);
    setStatus(null);
  }

  return (
    <div>
      <section className="card">
        <h1 className="card-title">Create a batch</h1>
        <p className="card-sub">
          Describe what you made. You&rsquo;ll get a batch number that follows it everywhere.
          Only approved makers can do this.
        </p>

        <form className="form" onSubmit={submit}>
          <Field label="What is it called?">
            <input className="input" value={f.name} onChange={set("name")} required placeholder="e.g. Handloom saree, indigo, set of 10" />
          </Field>
          <Field label="Where was it made?">
            <input className="input" value={f.origin} onChange={set("origin")} placeholder="Village or town, state" />
          </Field>
          <Field label="What is it made of?">
            <input className="input" value={f.material} onChange={set("material")} placeholder="Cotton, clay, bamboo…" />
          </Field>
          <Field label="Date made">
            <input className="input" type="date" value={f.date} onChange={set("date")} />
          </Field>
          <Field label="Anything else buyers should know? (optional)">
            <textarea className="input" value={f.description} onChange={set("description")} placeholder="Add a short story. No phone numbers or home addresses." />
          </Field>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy || created !== null}>
              {busy ? "Creating…" : created !== null ? "Batch created" : "Create batch"}
            </button>
          </div>
        </form>
      </section>

      {created && (
        <section className="card done">
          <h2>Batch {created} is created.</h2>
          <p>Write this number on the product or its packaging. Anyone can use it to check the journey.</p>
          <div className="actions">
            <button type="button" className="btn" onClick={newBatch}>Create a new batch</button>
            <button type="button" className="btn btn-quiet" onClick={() => go("track")}>View all batches</button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- Add an update / hand over ---------------- */

function Update({ getWriteContract, setStatus, go }) {
  const [id, setId] = useState("");
  const [type, setType] = useState("PROCESSING");
  const [note, setNote] = useState("");
  const [to, setTo] = useState("");
  const [handId, setHandId] = useState("");   // batch number for the hand-over card
  const [busy, setBusy] = useState(false);
  const validId = /^\d+$/.test(id.trim());
  const validHandId = /^\d+$/.test(handId.trim());

  async function addUpdate(e) {
    e.preventDefault();
    if (!validId) return setStatus({ kind: "error", text: "Enter the batch number, for example 1." });
    setBusy(true);
    try {
      const stepJson = { tokenId: id.trim(), type, note, recordedAt: new Date().toISOString() };
      // A fingerprint of the update. If the saved file is ever changed, the fingerprint won't match.
      const hash = keccak256(toUtf8Bytes(JSON.stringify(stepJson)));

      setStatus({ kind: "working", text: "Saving your update online…" });
      const cid = await pin(stepJson, `step-${id.trim()}-${type}`);

      setStatus({ kind: "working", text: "Waiting for your approval in MetaMask…" });
      const contract = await getWriteContract();
      const tx = await contract.recordStep(id.trim(), type, `ipfs://${cid}`, hash);

      setStatus({ kind: "working", text: "Waiting for the network to confirm…" });
      await tx.wait();
      setStatus({
        kind: "success",
        title: "Update added.",
        text: ` It now appears in the journey of batch ${id.trim()}.`,
      });
    } catch (err) {
      setStatus({ kind: "error", text: friendly(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handOver() {
    if (!validHandId) return setStatus({ kind: "error", text: "Enter the batch number, for example 1." });
    if (!isAddress(to.trim()))
      return setStatus({ kind: "error", text: "That doesn't look like a wallet address. It starts with 0x and has 42 characters." });
    setBusy(true);
    try {
      setStatus({ kind: "working", text: "Waiting for your approval in MetaMask…" });
      const contract = await getWriteContract();
      const me = await contract.runner.getAddress();
      const tx = await contract.transferFrom(me, to.trim(), handId.trim());

      setStatus({ kind: "working", text: "Waiting for the network to confirm…" });
      await tx.wait();
      setStatus({
        kind: "success",
        title: "Batch handed over.",
        text: ` ${short(to.trim())} now holds batch ${handId.trim()} and is the only one who can add updates.`,
      });
    } catch (err) {
      setStatus({ kind: "error", text: friendly(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="card">
        <h1 className="card-title">Add an update</h1>
        <p className="card-sub">Record a step in this batch&rsquo;s journey. Only the current holder can do this.</p>

        <form className="form" onSubmit={addUpdate}>
          <Field label="Batch number">
            <input className="input" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} required placeholder="e.g. 1" />
          </Field>
          <Field label="What happened?">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(STEP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Note (optional)">
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a short note" />
          </Field>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>{busy ? "Working…" : "Add update"}</button>
            <button type="button" className="btn btn-quiet" onClick={() => { setId(""); setType("PROCESSING"); setNote(""); setStatus(null); }}>Clear</button>
          </div>
        </form>
      </section>

      <hr className="divider" />

      <section className="card">
        <h2 className="card-title">Hand over the batch</h2>
        <p className="card-sub">Pass the batch to the next person in the chain.</p>

        <div className="form">
          <Field label="Batch number">
            <input className="input" inputMode="numeric" value={handId} onChange={(e) => setHandId(e.target.value)} placeholder="e.g. 1" />
          </Field>
          <Field label="Next holder's wallet address">
            <input className="input input-mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck="false" />
          </Field>
          <div className="actions">
            <button type="button" className="btn" onClick={handOver} disabled={busy}>
              <Icon name="arrow" size={16} /> Hand over
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => { setHandId(""); setTo(""); setStatus(null); }}>
              Clear
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------------- Track a batch ---------------- */

/* ---------------- Track a batch ---------------- */

function Track({ initialId, setStatus }) {
  const [id, setId] = useState("");              // search box (never pre-filled)
  const [selected, setSelected] = useState(null); // which batch is open
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);         // null = not loaded yet
  const [listBusy, setListBusy] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const resultRef = useRef(null);

  // Try the visitor's wallet first, then a public connection.
  async function withProviders(fn) {
    const providers = [];
    if (window.ethereum) providers.push(new BrowserProvider(window.ethereum));
    providers.push(new JsonRpcProvider(PUBLIC_RPC, 11155111, { staticNetwork: true }));
    let lastError = null;
    for (const p of providers) {
      try {
        return await fn(p);
      } catch (e) {
        lastError = e;
        if (/ERC721NonexistentToken|nonexistent|invalid token/i.test(String(e?.message) + String(e?.revert?.name))) break;
      }
    }
    throw lastError;
  }

  // Fetch the saved details file for a batch (tries two gateways)
  async function fetchMeta(uri) {
    for (const gw of [GATEWAY, FALLBACK_GATEWAY]) {
      try {
        return await (await fetch(toHttp(uri, gw))).json();
      } catch {}
    }
    return null;
  }

  // ---- the list of ALL batches, built from the "BatchMinted" records ----
  async function readList(provider) {
    const c = new Contract(cfg.address, cfg.abi, provider);
    const events = await c.queryFilter(c.filters.BatchMinted(), cfg.deployBlock || 0);
    const rows = await Promise.all(
      events.map(async (ev) => {
        const batchId = ev.args[0].toString();
        const meta = await fetchMeta(ev.args[2]);
        const origin = meta?.attributes?.find((a) => a.trait_type === "Origin")?.value || "";
        return { id: batchId, name: meta?.name || `Batch ${batchId}`, origin };
      })
    );
    return rows.sort((a, b) => Number(b.id) - Number(a.id)); // newest first
  }

  async function refreshList() {
    setListBusy(true);
    setListFailed(false);
    try {
      setList(await withProviders(readList));
    } catch (e) {
      setList([]);
      setListFailed(true);
      setStatus({ kind: "error", text: friendly(e) });
    } finally {
      setListBusy(false);
    }
  }

  // ---- one batch: owner, details, and its journey ----
  async function readFrom(provider, batchId) {
    const c = new Contract(cfg.address, cfg.abi, provider);
    const owner = await c.ownerOf(batchId);
    const uri = await c.tokenURI(batchId);
    const meta = await fetchMeta(uri);

    const from = cfg.deployBlock || 0;
    const moves = await c.queryFilter(c.filters.Transfer(null, null, batchId), from);
    const steps = await c.queryFilter(c.filters.StepRecorded(batchId), from);

    const blockTimes = new Map();
    const timeOf = async (n) => {
      if (!blockTimes.has(n)) blockTimes.set(n, (await provider.getBlock(n)).timestamp);
      return blockTimes.get(n);
    };

    const items = [];
    for (const ev of [...moves, ...steps]) {
      const base = {
        time: await timeOf(ev.blockNumber),
        order: ev.blockNumber * 100000 + ev.index,
        tx: ev.transactionHash,
      };
      if (ev.eventName === "Transfer") {
        const isNew = ev.args.from === ZERO;
        items.push({
          ...base,
          kind: isNew ? "created" : "handover",
          label: isNew ? "Batch created" : "Handed over",
          from: ev.args.from,
          to: ev.args.to,
        });
      } else {
        const item = {
          ...base,
          kind: "step",
          label: STEP_LABELS[ev.args.stepType] || ev.args.stepType,
          actor: ev.args.actor,
          cid: ev.args.cid,
          detailsUrl: toHttp(ev.args.cid),
          note: "",
        };
        try {
          const saved = await (await fetch(item.detailsUrl)).json();
          item.note = saved.note || "";
        } catch {}
        items.push(item);
      }
    }
    items.sort((a, b) => a.order - b.order);
    return { id: batchId, owner, meta, items };
  }

  async function load(batchId) {
    const clean = String(batchId).trim();
    if (!/^\d+$/.test(clean)) {
      setData(null);
      return setStatus({ kind: "error", text: "Enter the batch number, for example 1." });
    }
    setBusy(true);
    setSelected(clean);
    setData(null);
    setStatus({ kind: "working", text: "Looking up the journey…" });
    try {
      const result = await withProviders((p) => readFrom(p, clean));
      setData(result);
      setStatus(null);
      // bring the result into view after the user's click
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setStatus({ kind: "error", text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  // On opening: load the list. Only a QR-code link (/?token=1) opens a batch by itself.
  useEffect(() => {
    refreshList();
    if (initialId) load(initialId);
    // eslint-disable-next-line
  }, []);

  const link = typeof window !== "undefined" && data ? `${window.location.origin}/?token=${data.id}` : "";

  return (
    <div>
      <h1 className="page-title">Track a batch</h1>
      <p className="page-sub">
        For everyone &mdash; no wallet or login needed. Pick a batch from the list to see its tag and journey.
      </p>

      <section className="card list-card">
        <div className="list-head">
          <h2 className="card-title">All batches</h2>
          <button type="button" className="btn btn-quiet btn-small" onClick={refreshList} disabled={listBusy}>
            {listBusy ? "Loading…" : "Refresh list"}
          </button>
        </div>

        {list === null && <p className="empty">Loading batches…</p>}
        {list && list.length === 0 && !listBusy && listFailed && (
          <p className="empty">We couldn&rsquo;t load the list. Press Refresh list to try again.</p>
        )}
        {list && list.length === 0 && !listBusy && !listFailed && (
          <p className="empty">No batches yet. Create one first, then press Refresh list.</p>
        )}

        {list && list.length > 0 && (
          <ul className="batch-list">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={"batch-row" + (selected === r.id ? " batch-row-active" : "")}
                  onClick={() => load(r.id)}
                  disabled={busy}
                >
                  <span className="batch-num">{r.id}</span>
                  <span className="batch-text">
                    <span className="batch-name">{r.name}</span>
                    {r.origin && <span className="batch-meta">{r.origin}</span>}
                  </span>
                  <span className="batch-go">View journey</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            load(id);
          }}
        >
          <label className="field">
            <span className="label">Or type a batch number</span>
            <input className="input" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. 1" />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            <Icon name="search" size={16} /> Track
          </button>
        </form>
      </section>

      <div ref={resultRef}>{data && <BatchView data={data} link={link} />}</div>
    </div>
  );
}