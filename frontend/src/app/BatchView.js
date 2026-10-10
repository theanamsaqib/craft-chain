"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// Friendly names for the step types stored on the blockchain
export const STEP_LABELS = {
  PROCESSING: "Processed",
  TRANSPORT: "Moved",
  QUALITY_CHECK: "Quality checked",
  RETAIL_RECEIVED: "Received by retailer",
};

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

const when = (unixSeconds) =>
  new Date(unixSeconds * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

// A wallet address, shortened, with a Copy button
export function Addr({ value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <span className="addr">
      <code title={value}>{short(value)}</code>
      <button type="button" className="copy" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

// Shows one batch as a hang tag, followed by its journey.
export default function BatchView({ data, link }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const attr = (name) => data.meta?.attributes?.find((a) => a.trait_type === name)?.value;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {}
  }

  return (
    <div>
      <article className="tag" aria-label={`Batch ${data.id}`}>
        <p className="tag-number">Batch number {data.id}</p>
        <h3>{data.meta?.name || "Unnamed batch"}</h3>
        {data.meta?.description && <p className="tag-story">{data.meta.description}</p>}

        <dl className="facts">
          {attr("Origin") && (<><dt>Made in</dt><dd>{attr("Origin")}</dd></>)}
          {attr("Material") && (<><dt>Made of</dt><dd>{attr("Material")}</dd></>)}
          {attr("Date") && (<><dt>Made on</dt><dd>{attr("Date")}</dd></>)}
          <dt>Held by</dt>
          <dd><Addr value={data.owner} /></dd>
        </dl>

        <div className="tag-foot">
          <div className="qr">
            <QRCodeSVG value={link || "https://example.com"} size={104} />
          </div>
          <div>
            <p>Scan to see this journey on any phone. No wallet needed.</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={copyLink}>
              {linkCopied ? "Link copied" : "Copy link"}
            </button>
          </div>
        </div>
      </article>

      <h3 className="journey-title">The journey so far</h3>
      <p className="journey-lead">Every stop below was recorded publicly and can&rsquo;t be edited later.</p>

      <ol className="journey">
        {data.items.map((it, i) => (
          <li key={i} className="stop">
            <div className="stop-head">
              <span className="stamp">{it.label}</span>
              <time className="stop-time">{when(it.time)}</time>
            </div>

            <p className="stop-who">
              {it.kind === "handover" ? (
                <>From <Addr value={it.from} /> to <Addr value={it.to} /></>
              ) : it.kind === "created" ? (
                <>Created by <Addr value={it.to} /></>
              ) : (
                <>Recorded by <Addr value={it.actor} /></>
              )}
            </p>

            {it.note && <p className="stop-note">&ldquo;{it.note}&rdquo;</p>}

            <p className="stop-links">
              {it.cid && (
                <a href={it.detailsUrl} target="_blank" rel="noreferrer">Saved details</a>
              )}
              <a href={`https://sepolia.etherscan.io/tx/${it.tx}`} target="_blank" rel="noreferrer">
                Proof on Etherscan
              </a>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}