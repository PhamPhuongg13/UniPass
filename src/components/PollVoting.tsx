"use client";
import { useState } from "react";
import Link from "next/link";
import { useUniPassWallet } from "@/components/WalletProvider";
type Poll = { id:string; slug:string; options:string[]; results:number[]; totalVotes:number; hasVoted:boolean; voteTx:string|null; eligible:boolean; open:boolean; eligibility:string };
export function PollVoting({ poll: initial, passportReady = true }: { poll: Poll; passportReady?: boolean }) {
  const { address, login } = useUniPassWallet();
  const [poll,setPoll] = useState(initial);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [rejectedTx,setRejectedTx] = useState("");
  async function vote(option:number, attemptOnChain=false) {
    setBusy(true);setError("");
    try {
      const response = await fetch(`/api/polls/${poll.id}/vote${attemptOnChain?"?attemptOnChain=1":""}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({option}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Vote failed.");
      if (result.rejected) setRejectedTx(result.txHash);
      else { const latest = await fetch(`/api/polls/${poll.id}`,{cache:"no-store"}); const data = await latest.json(); setPoll(data.poll); }
    } catch(cause) { setError(cause instanceof Error?cause.message:"Vote failed."); }
    finally { setBusy(false); }
  }
  const resultsOnly = poll.hasVoted || !poll.open;
  return <div className="tool-panel"><h2>{resultsOnly?"Results":"Choose one option"}</h2><p className="seed-note">{poll.totalVotes} {poll.totalVotes===1?"vote":"votes"} counted on Avalanche</p>{!address&&poll.open&&<p className="notice warning">Sign in to vote. <button className="text-link" type="button" onClick={login}>Sign in</button></p>}{address&&!passportReady&&poll.open&&<p className="notice warning">This needs a verified passport. <Link href="/verify-student">Get your UniPass →</Link></p>}{address&&passportReady&&!poll.eligible&&poll.eligibility!=="OPEN"&&poll.open&&<p className="notice warning">Your school is not eligible for this poll.</p>}{poll.options.map((option,index)=><div className="result-row" key={index}><div><b>{option}</b><span>{poll.results[index]||0} {(poll.results[index]||0)===1?"vote":"votes"} · {poll.totalVotes?Math.round((poll.results[index]||0)/poll.totalVotes*100):0}%</span></div><div className="result-track"><span style={{width:`${poll.totalVotes?(poll.results[index]||0)/poll.totalVotes*100:0}%`}}/></div>{!resultsOnly&&<button className="button button-light poll-vote-option" disabled={busy||!address||!passportReady||!poll.eligible} onClick={()=>void vote(index)}>Vote for {option}</button>}</div>)}{poll.hasVoted&&<><p className="notice">Your vote is recorded on Avalanche. {poll.voteTx&&<a href={`https://testnet.snowtrace.io/tx/${poll.voteTx}`} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}</p><p>Recorded without your wallet address.</p>{poll.open&&<button className="button button-light" disabled={busy} onClick={()=>void vote(0,true)}>Try voting again</button>}</>}{rejectedTx&&<div className="rejected-panel"><b>Rejected by the contract — this passport already voted.</b><a href={`https://testnet.snowtrace.io/tx/${rejectedTx}`} target="_blank" rel="noopener noreferrer">View rejected transaction ↗</a></div>}{error&&<p className="notice warning" role="alert">{error}</p>}</div>;
}
