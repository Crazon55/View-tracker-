import React from "react";
import * as Icons from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";

const STEPS = [
  ["Create a BO idea", "In BO Studio → New BO idea. Add a source, slides, visual-hook notes, choose several IPs and distinct page hooks. Creator & timestamp are captured automatically. Anchor a comment to a slide in the Brief tab."],
  ["Approve & assign", "As Founder, open the idea and Approve. As COA, in Production & Review assign one designer to the whole idea, set a deadline and reviewer. All versions keep the same owner."],
  ["Produce & review", "Add Canva/Drive links inside each version. Submit for review, approve some versions and request changes on one. Partial readiness shows consistently in Production, Bank and the card."],
  ["Replace an asset", "Replace one approved asset — only that version returns to review; unrelated versions and published history stay intact."],
  ["Bulk placement", "As COC, Distribution → Bulk placement. Select a batch, define a multi-day rotation, preview conflicts and counts, adjust, confirm. Inspect in Calendar, Matrix and Today."],
  ["Conflicts & collaboration", "Try placing the same idea on two IPs the same day — you'll get a repetition conflict needing an authorised exception. Collaborations are one publication linked to multiple IPs, counted once in network totals."],
  ["HPN fast flow", "HPN Desk → create a happening (no idea approval). Quick record to log owner/assets/review outcome in one step. Publish and confirm. TAT basis is shown."],
  ["Displace BO with HPN", "When HPN takes a BO slot, the displaced BO version is rescheduled or returned to the unallocated bank — never lost; age & approval preserved."],
  ["Confirm publication", "Today / a card → Confirm publication with URL and actual time. A 24h capture task is created. A collaboration adds only one publication's views to network totals."],
  ["Capture views", "Performance → Capture. Enter views (including an explicit zero, a late measurement, or leave missing). Classifications, age labels, yesterday's cohort and six-day cycles update."],
  ["Floors & reserves", "Command Room & Today show that surplus Reels never cover a Posts shortfall, optional upper ranges aren't failures, and unconfigured BO quotas show 'Not configured' — no fake coverage."],
  ["Add a 9th IP / new editor", "Settings → Add IP appears everywhere instantly with no invented history. Add an editor, assign an idea, verify My Work."],
  ["Pause / deactivate", "Pause an IP or deactivate a teammate — historical work stays intact; future/unfinished work surfaces for reassignment."],
  ["Refresh persists", "Refresh the browser — every edit, assignment, comment, approval, placement, publication and metric persists (local storage). Reset demo from the clock chip bottom-right."],
];

export default function Help() {
  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title="Walkthrough & Help" icon={Icons.HelpCircle} subtitle="A guided tour of the intended end-to-end operating system. This is a local demo — role switching demonstrates workflows, not production authentication." />
      <div className="rounded-lg border border-[#E6E1D8] bg-white p-5 mb-4">
        <h2 className="font-serif text-lg text-stone-900 mb-1">What FSOS is</h2>
        <p className="text-sm text-stone-600 leading-relaxed">Every idea has a visible journey: creation → production → approval → calendar placement → publication → performance. Two streams — <b>BO (Blue Ocean)</b>, researched in batches, and <b>HPN (Happenings)</b>, fast and collaborative — share one connected system. One person sees the work relevant to them; the founder understands the whole network without inspecting every post.</p>
      </div>
      <div className="space-y-2">
        {STEPS.map(([t, d], i) => (
          <div key={i} className="rounded-lg border border-[#E6E1D8] bg-white p-4 flex gap-3">
            <div className="h-7 w-7 shrink-0 rounded-full bg-stone-900 text-white grid place-items-center font-mono text-xs">{i + 1}</div>
            <div><div className="text-sm font-medium text-stone-900">{t}</div><p className="text-xs text-stone-600 mt-0.5 leading-relaxed">{d}</p></div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-stone-400">All sample stories, assets and metrics are illustrative demo data — not verified reporting, and links are placeholders. Add real links anytime.</p>
    </div>
  );
}
