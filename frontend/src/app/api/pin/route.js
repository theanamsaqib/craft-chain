// SERVER-SIDE code: runs on the server, not in the browser.
// The browser sends us some JSON, we upload it to IPFS via Pinata, and return the CID.
// The secret PINATA_JWT stays here and never reaches the user's browser.

export async function POST(req) {
  try {
    // 1. Read what the browser sent: { content: {...}, name: "..." }
    const { content, name } = await req.json();

    // 2. Send it to Pinata, using our secret key
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: content,                       // the JSON to store
        pinataMetadata: { name: name || "craft-chain" }, // a label shown in your Pinata dashboard
      }),
    });

    const data = await res.json();
    if (!res.ok) return Response.json({ error: data }, { status: 500 });

    // 3. Return the CID (the file's IPFS address)
    return Response.json({ cid: data.IpfsHash });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}